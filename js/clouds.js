/* ===================== CHMURY =====================
   Model B — dane lądują na chmurach użytkownika:
   - Nextcloud (WebDAV, fizycznie QNAP) — główna lokalizacja,
   - pCloud i Dysk Google — niezależne kopie.
   Dane logowania trzymamy w IndexedDB na urządzeniu leśnika. */

const CLOUDS = (() => {

  /* ---------- pomocnicze ---------- */
  const b64u = {
    enc: s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    dec: s => atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  };

  function log(msg, ok) {
    const el = document.getElementById("s-log");
    if (!el) return;
    const czas = new Date().toLocaleTimeString("pl-PL");
    el.innerHTML += `<div>${czas} · ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
  }

  async function sciezkaAutor() {
    const autor = await DB.metaGet("autor") || "nieznany";
    return autor.replace(/[\\/:*?"<>|]/g, "_").trim() || "nieznany";
  }

  /* ---------- NEXTCLOUD (WebDAV) ---------- */
  /* sciezka bazowa z konfiguracji; domyślnie "Dysk QNAP WD/FORESTLY BAZA" — stara domyślna "Taksator" też jest wymieniana */
  function segmentySciezki(cfg, autor) {
    const surowo = (cfg.sciezka && cfg.sciezka !== "Taksator" ? cfg.sciezka : "Dysk QNAP WD/FORESTLY BAZA").replace(/^[\/\\]+|[\/\\]+$/g, "");
    const czesci = surowo.split(/[\/\\]+/).filter(Boolean);
    czesci.push(autor);
    return czesci; // np. ["Dysk QNAP WD", "FORESTLY BAZA", "Artur Pi"]
  }

  async function nextcloudPut(cfg, nazwa, blob) {
    const autor = await sciezkaAutor();
    const baza = cfg.url.replace(/\/+$/, "") + "/remote.php/dav/files/" + encodeURIComponent(cfg.user);
    const auth = "Basic " + btoa(cfg.user + ":" + cfg.pass);
    // PUT nie tworzy folderów po drodze — całą ścieżkę zakładamy sami (MKCOL po kolei).
    // 201 = utworzony, 405 = już istnieje — oba nas cieszą.
    let narosla = "";
    for (const seg of segmentySciezki(cfg, autor)) {
      narosla += "/" + encodeURIComponent(seg);
      const r = await fetch(baza + narosla, { method: "MKCOL", headers: { Authorization: auth } });
      if (r.status !== 201 && r.status !== 405)
        throw new Error("Nextcloud: nie mogę utworzyć folderu " + seg + " (HTTP " + r.status + ")");
    }
    const url = baza + narosla + "/" + encodeURIComponent(nazwa);
    const resp = await fetch(url, { method: "PUT", headers: { Authorization: auth }, body: blob });
    if (!resp.ok) throw new Error("Nextcloud: HTTP " + resp.status +
      (resp.status === 401 ? " (zły login/hasło aplikacji)" : resp.status === 404 ? " (folder nie istnieje?)" : ""));
    return url;
  }

  const HINT_POLACZENIA = "Nie mogę się połączyć — sprawdź, w tej kolejności: " +
    "1) czy na serwerze Nextcloud ustawiono CORS: occ config:system:set cors.allowed-domains 0 --value=https://wskakuj.github.io " +
    "(bez tego przeglądarka blokuje WebDAV, choć login jest dobry); " +
    "2) czy adres zaczyna się od https:// (nie http://); 3) czy certyfikat jest ważny.";

  async function nextcloudTest(cfg) {
    const url = cfg.url.replace(/\/+$/, "") + "/remote.php/dav/files/" + encodeURIComponent(cfg.user) + "/";
    let resp;
    try {
      resp = await fetch(url, { method: "PROPFIND", headers: {
        Authorization: "Basic " + btoa(cfg.user + ":" + cfg.pass), Depth: "0" } });
    } catch (e) {
      throw new Error("Nextcloud: " + (e.name === "TypeError" ? HINT_POLACZENIA : e.message));
    }
    if (resp.status === 207) return { ok: true };
    throw new Error("Nextcloud: HTTP " + resp.status + (resp.status === 401 ? " (zły login/hasło aplikacji)" : ""));
  }

  /* ---------- PCLOUD ---------- */
  /* logowanie hasłem. pCloud ma DWA serwery API: amerykański
     (api.pcloud.com) i europejski (eapi.pcloud.com) — konto działa tylko
     na jednym z nich, a zły serwer odpowiada "Log in failed" nawet przy
     dobrym haśle. Aplikacja próbuje oba po kolei i zapamiętuje swój. */
  /* POST na API pCloud z parametrami w ciele żądania (hasło NIE ląduje
     w adresie URL — tak jak w oficjalnych bibliotekach pCloud z 2026) */
  async function pcPOST(host, metoda, parametry) {
    const cialo = new URLSearchParams();
    for (const [k, v] of Object.entries(parametry)) cialo.append(k, v);
    const r = await fetch("https://" + host + "/" + metoda, {
      method: "POST", body: cialo.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    return r.json().catch(() => ({}));
  }
  async function pcloudZaloguj(email, haslo, kod) {
    if (!email || !haslo) throw new Error("podaj e-mail i hasło pCloud");
    const login = email.trim().toLowerCase();
    const kod2fa = (kod || "").replace(/\s+/g, "");
    /* pCloud (od zmian w 2026): przy logowaniu hasłem wymagany jest kod
       weryfikacyjny (aplikacja 2FA / e-mail / SMS), dopóki urządzenie
       nie jest rozpoznane. UWAGA: endpoint /login NIE przyjmuje kodu —
       trzeba go wymienić przez tfa_login (na tokenie wyzwania) albo
       podać w /userinfo. Po udanym logowaniu z kodem urządzenie
       oznaczamy jako zaufane i kolejne logowania idą bez kodu. */
    let devId = localStorage.getItem("fg_pc_deviceid");
    if (!devId) {
      devId = "forestlygo-" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      localStorage.setItem("fg_pc_deviceid", devId);
    }
    const urzadzenie = { deviceid: devId, device: "ForestlyGO", os: 4 };
    const wspolne = { getauth: 1, logout: 1, authexpire: 63072000, authinactiveexpire: 63072000 };
    const proby = [];   /* diagnostyka: co odpowiedział każdy serwer */
    let ostatniBlad = null, byloWyzwanie = false;

    /* wymiana kodu na token sesji przez tfa_login (bez logout!) */
    const wymianaTfa = async (host, token) => {
      const dane = await pcPOST(host, "tfa_login", Object.assign({
        token: token, code: kod2fa, trustdevice: 1,
        getauth: 1, authexpire: 63072000, authinactiveexpire: 63072000 }, urzadzenie));
      if (dane.result === 0 && dane.auth) {
        localStorage.removeItem("fg_pc_tfatoken"); localStorage.removeItem("fg_pc_tfahost");
        return dane;
      }
      if (dane.result === 2012) throw Object.assign(
        new Error("pCloud: nieprawidłowy kod — wpisz ŚWIEŻY kod z aplikacji i zaloguj się ponownie"),
        { szczegoly: proby });
      proby.push(host + " (tfa_login): odpowiedź " + dane.result + (dane.error ? " (" + dane.error + ")" : ""));
      return null;
    };

    /* wyzwanie kodem: token w odpowiedzi, kod 1022, NOWY kod 2297 (2FA),
       albo komunikat o kodzie w treści błędu */
    const czyWyzwanie = dane => !!(dane && (dane.token || dane.result === 1022 || dane.result === 2297 ||
      /provide 'code'/i.test(dane.error || "") || /2fa/i.test(dane.error || "")));

    /* zapamiętany token wyzwania + podany kod → od razu wymiana */
    const tfaTok = localStorage.getItem("fg_pc_tfatoken");
    const tfaHost = localStorage.getItem("fg_pc_tfahost");
    if (kod2fa && tfaTok && tfaHost) {
      try {
        const dane = await wymianaTfa(tfaHost, tfaTok);
        if (dane) return { token: dane.auth, email: dane.email, host: tfaHost };
      } catch (e) { if (e.szczegoly) throw e; proby.push("tfa_login: brak połączenia"); }
      localStorage.removeItem("fg_pc_tfatoken"); localStorage.removeItem("fg_pc_tfahost");
    }

    for (const host of ["api.pcloud.com", "eapi.pcloud.com"]) {
      /* 1) /login BEZ kodu — sprawdza hasło i zbiera wyzwanie (z tokenem) */
      let dane = null;
      try {
        dane = await pcPOST(host, "login", Object.assign({
          username: login, password: haslo }, wspolne, urzadzenie));
      } catch (e) {
        /* TypeError = żądanie w ogóle nie doszło (sieć / blokada przeglądarki) */
        proby.push(host + " (login): brak połączenia (" + (e.name === "TypeError" ? "sieć/CORS" : e.message) + ")");
        continue;
      }
      if (dane.result === 0 && dane.auth) return { token: dane.auth, email: dane.email, host };
      proby.push(host + " (login): odpowiedź " + dane.result + (dane.error ? " (" + dane.error + ")" : "") +
        (dane.token ? " [token wyzwania]" : ""));
      if (dane.result === 4000) throw new Error("pCloud: zbyt wiele prób logowania — " +
        "odczekaj około godzinę i spróbuj jeszcze raz (raz)");
      if (czyWyzwanie(dane)) {
        byloWyzwanie = true;
        if (dane.token) {
          localStorage.setItem("fg_pc_tfatoken", dane.token);
          localStorage.setItem("fg_pc_tfahost", host);
        }
        if (!kod2fa) {
          const blad = new Error("pCloud wymaga kodu weryfikacyjnego — wpisz aktualny kod " +
            "z APLIKACJI 2FA (albo z e-maila/SMS, jeśli takie przyszło) w pole „kod” i dotknij " +
            "„Zaloguj” ponownie. Przy pierwszym razem wystarczy — urządzenie zostanie zapamiętane");
          blad.potrzebujeKodu = true;
          blad.szczegoly = proby;
          throw blad;
        }
        /* kod podany: z tokenem → wymiana, bez tokenu → /userinfo z kodem */
        if (dane.token) {
          try {
            const tfa = await wymianaTfa(host, dane.token);
            if (tfa) return { token: tfa.auth, email: tfa.email, host };
          } catch (e) { if (e.szczegoly) throw e; proby.push(host + " (tfa_login): brak połączenia"); }
        } else {
          let d2 = null;
          try {
            d2 = await pcPOST(host, "userinfo", Object.assign({
              username: login, password: haslo, code: kod2fa }, wspolne, urzadzenie));
          } catch (e) { proby.push(host + " (userinfo+kod): brak połączenia"); continue; }
          if (d2.result === 0 && d2.auth) return { token: d2.auth, email: d2.email, host };
          proby.push(host + " (userinfo+kod): odpowiedź " + d2.result + (d2.error ? " (" + d2.error + ")" : ""));
          if (d2.result === 2012) throw Object.assign(
            new Error("pCloud: nieprawidłowy kod — wpisz ŚWIEŻY kod z aplikacji i zaloguj się ponownie"),
            { szczegoly: proby });
        }
        continue;
      }
      ostatniBlad = dane;
    }
    const blad = new Error(byloWyzwanie
      ? "pCloud nie przyjął kodu — upewnij się, że kod z aplikacji jest AKTUALNY " +
        "(zmienia się co 30 sekund), wpisz świeży i zaloguj się ponownie"
      : "pCloud: " + ((ostatniBlad && ostatniBlad.error) || "logowanie nie udało się") +
        " — sprawdź, czy te dane działają na my.pcloud.com");
    blad.szczegoly = proby;   /* trafia do logu Sync */
    throw blad;
  }
  async function pcloudUpload(cfg, nazwa, blob) {
    const sciezka = cfg.path || "/Taksator";
    const autor = await sciezkaAutor();
    const url = "https://" + (cfg.host || "api.pcloud.com") + "/uploadfile?auth=" + encodeURIComponent(cfg.token) +
      "&path=" + encodeURIComponent(ukosnik(sciezka) + autor) + "&filename=" + encodeURIComponent(nazwa) +
      "&nopartial=1";
    const fd = new FormData();
    fd.append("file", blob, nazwa);
    const resp = await fetch(url, { method: "POST", body: fd });
    const dane = await resp.json().catch(() => ({}));
    if (dane.result !== 0) throw new Error("pCloud: " + (dane.error || "błąd " + dane.result));
    return true;
  }
  function ukosnik(p) { return p.endsWith("/") ? p : p + "/"; }

  async function pcloudTest(cfg) {
    const resp = await fetch("https://" + (cfg.host || "api.pcloud.com") + "/userinfo?auth=" + encodeURIComponent(cfg.token));
    const dane = await resp.json().catch(() => ({}));
    if (dane.result !== 0) throw new Error("pCloud: " + (dane.error || "błąd " + dane.result));
    return { ok: true, email: dane.email };
  }

  /* ---------- DYSK GOOGLE (OAuth — konto użytkownika, PKCE) ----------
     Konta serwisowe nie mają miejsca na dane (storageQuotaExceeded),
     więc logujemy się kontem użytkownika: pliki należą do niego,
     a aplikacja sama tworzy swój folder na jego Dysku. */
  const GD_REDIRECT = "https://wskakuj.github.io/forestly-go/oauth.html";
  const GD_SCOPE = "https://www.googleapis.com/auth/drive.file";

  /* base64url z SUROWYCH BAJTÓW (b64u.enc koduje tekst przez UTF-8 — to nie to) */
  function gdB64u(bajty) {
    return btoa(String.fromCharCode(...bajty))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function gdLos(n) {
    const b = new Uint8Array(n); crypto.getRandomValues(b);
    return gdB64u(b);
  }
  async function gdSha256b64u(txt) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return gdB64u(new Uint8Array(d));
  }

  /* krok 1: otwiera w przeglądarce stronę logowania Google */
  async function gdriveLoginUrl(clientId) {
    const verifier = gdLos(64);
    localStorage.setItem("gd_pkce", JSON.stringify({ clientId, verifier, t: Date.now() }));
    const challenge = await gdSha256b64u(verifier);
    return "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + encodeURIComponent(clientId) +
      "&redirect_uri=" + encodeURIComponent(GD_REDIRECT) +
      "&response_type=code&scope=" + encodeURIComponent(GD_SCOPE) +
      "&access_type=offline&prompt=consent" +
      "&code_challenge=" + encodeURIComponent(challenge) + "&code_challenge_method=S256";
  }

  function gdOpisBledu(dane) {
    return dane.error_description ||
      (typeof dane.error === "string" ? dane.error : (dane.error && dane.error.message)) || "?";
  }

  /* sekret klienta Google — wstrzykiwany do APK przy budowie (w repo go nie ma) */
  function gdSekret() {
    try { return (window.GD_SECRET || "").trim(); } catch (_) { return ""; }
  }

  /* krok 2: kod z przeglądarki wymieniamy na trwały refresh token */
  async function gdriveDolaczKod(kod) {
    const pkce = JSON.parse(localStorage.getItem("gd_pkce") || "null");
    if (!pkce) throw new Error("najpierw kliknij „Zaloguj z Google” — sesja logowania wygasła");
    let cialo = "code=" + encodeURIComponent(kod.trim()) +
      "&client_id=" + encodeURIComponent(pkce.clientId) +
      "&code_verifier=" + encodeURIComponent(pkce.verifier) +
      "&grant_type=authorization_code&redirect_uri=" + encodeURIComponent(GD_REDIRECT);
    const sek = gdSekret();
    if (sek) cialo += "&client_secret=" + encodeURIComponent(sek);
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cialo
    });
    const dane = await resp.json();
    if (!dane.refresh_token) throw new Error("Google nie wydał tokenu (" +
      gdOpisBledu(dane) + ") — spróbuj zalogować się ponownie");
    localStorage.removeItem("gd_pkce");
    return { clientId: pkce.clientId, refreshToken: dane.refresh_token };
  }

  /* token dostępu (odświeżany z refresh tokenu) */
  async function gdriveToken(cfg) {
    let cialo = "grant_type=refresh_token&client_id=" + encodeURIComponent(cfg.clientId) +
      "&refresh_token=" + encodeURIComponent(cfg.refreshToken);
    const sek = gdSekret();
    if (sek) cialo += "&client_secret=" + encodeURIComponent(sek);
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cialo
    });
    const dane = await resp.json();
    if (!dane.access_token) throw new Error("Dysk Google: wygasło logowanie — zaloguj się z Google ponownie (" +
      gdOpisBledu(dane) + ")");
    return dane.access_token;
  }

  const _folderIdCache = {};
  /* Google w odpowiedzi błędu przesyła konkretny powód (reason) — pokazujemy go userowi */
  async function gdriveBlad(r, kontekst) {
    let dlaczego = "";
    try {
      const d = await r.json();
      const e = (d.error && d.error.errors || [])[0];
      dlaczego = e && e.reason ? " — " + e.reason + ": " + (e.message || "") :
        d.error && d.error.message ? " — " + d.error.message : "";
    } catch (_) {}
    return new Error(kontekst + " (HTTP " + r.status + ")" + dlaczego);
  }

  /* szuka folderu (opcjonalnie wewnątrz innego folderu); jak nie ma — tworzy */
  async function gdriveFolderId(token, nazwa, rodzic) {
    const klucz = (rodzic || "") + "/" + nazwa;
    if (_folderIdCache[klucz]) return _folderIdCache[klucz];
    let q = "mimeType='application/vnd.google-apps.folder' and name='" +
      String(nazwa).replace(/'/g, "\\'") + "' and trashed=false";
    if (rodzic) q += " and '" + rodzic + "' in parents";
    const r = await fetch("https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(q) + "&fields=files(id,name)&pageSize=5" +
      "&supportsAllDrives=true&includeItemsFromDrives=true",
      { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw await gdriveBlad(r, "Dysk Google: nie mogę szukać folderu");
    const f = ((await r.json()).files || [])[0];
    if (f) return _folderIdCache[klucz] = f.id;
    const meta = { name: nazwa, mimeType: "application/vnd.google-apps.folder" };
    if (rodzic) meta.parents = [rodzic];
    const tw = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(meta)
    });
    if (!tw.ok) throw await gdriveBlad(tw, "Dysk Google: nie mogę utworzyć folderu");
    return _folderIdCache[klucz] = (await tw.json()).id;
  }

  async function gdriveUpload(cfg, nazwa, blob) {
    const token = await gdriveToken(cfg);
    const nazwaFolderu = (cfg.folder || "FORESTLY GO").trim();
    const idGlownego = await gdriveFolderId(token, nazwaFolderu);
    /* folder leśnika wewnątrz głównego — jak w Nextcloud */
    const autor = await sciezkaAutor();
    const idAutora = (autor && autor !== "nieznany") ? await gdriveFolderId(token, autor, idGlownego) : idGlownego;
    /* istniejący plik o tej nazwie nadpisujemy zamiast dublować */
    const qs = "name='" + String(nazwa).replace(/'/g, "\\'") +
      "' and trashed=false and '" + idAutora + "' in parents";
    const sz = await fetch("https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(qs) + "&fields=files(id)&pageSize=2" +
      "&supportsAllDrives=true&includeItemsFromDrives=true",
      { headers: { Authorization: "Bearer " + token } });
    if (!sz.ok) throw await gdriveBlad(sz, "Dysk Google: nie mogę szukać pliku");
    const stary = (((await sz.json()).files) || [])[0];
    if (stary) {
      const resp = await fetch("https://www.googleapis.com/upload/drive/v3/files/" +
        stary.id + "?uploadType=media&supportsAllDrives=true", {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        body: blob
      });
      if (!resp.ok) throw await gdriveBlad(resp, "Dysk Google: nadpisywanie nieudane");
      return true;
    }
    const meta = { name: nazwa, parents: [idAutora] };
    const granica = "taksator" + Date.now();
    const czesci = [];
    czesci.push("--" + granica + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n");
    czesci.push("--" + granica + "\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n");
    const cialo = new Blob([...czesci, blob, "\r\n--" + granica + "--"]);
    const resp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + granica },
      body: cialo
    });
    if (!resp.ok) throw await gdriveBlad(resp, "Dysk Google: wysyłka nieudana");
    return true;
  }

  async function gdriveTest(cfg) {
    const token = await gdriveToken(cfg);
    const nazwaFolderu = (cfg.folder || "FORESTLY GO").trim();
    const folderId = await gdriveFolderId(token, nazwaFolderu);
    return { ok: true, folder: nazwaFolderu, folderId };
  }


  /* ---------- SYNCHRONIZACJA ---------- */
  /* Wysyła plik jednej wsi na wszystkie skonfigurowane chmury.
     Zwraca raport: { nextcloud: "ok"|blad, pcloud: ..., gdrive: ... } */
  async function wyslijPlik(wies, blob, nazwa) {
    const raport = {};
    const [nc, pc, gd] = await Promise.all([
      DB.metaGet("nextcloud"), DB.metaGet("pcloud"), DB.metaGet("gdrive")
    ]);
    const zadania = [];
    if (nc && nc.url && nc.user && nc.pass) {
      zadania.push(["nextcloud", nextcloudPut(nc, nazwa, blob)]);
    }
    if (pc && pc.token) zadania.push(["pcloud", pcloudUpload(pc, nazwa, blob)]);
    if (gd && gd.refreshToken) zadania.push(["gdrive", gdriveUpload(gd, nazwa, blob)]);
    if (!zadania.length) throw new Error("brak skonfigurowanych chmur — dodaj je w zakładce Sync");

    const wyniki = await Promise.allSettled(zadania.map(z => z[1]));
    wyniki.forEach((w, i) => {
      const nazwaChmury = zadania[i][0];
      raport[nazwaChmury] = w.status === "fulfilled" ? "ok" : String(w.reason && w.reason.message || w.reason);
    });
    return raport;
  }

  /* Pełny cykl: zbierz wpisy wsi → zbuduj XLSX → wyślij → oznacz wpisy */
  async function synchronizujWies(app, wies) {
    const autor = await DB.metaGet("autor") || "nieznany";
    const wpisy = (await DB.wpisyByWies(wies)).sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
    if (!wpisy.length) throw new Error("brak wpisów dla „" + wies + "”");
    const blob = await XLSXIO.blobZwpisow(wpisy);
    const nazwa = XLSXIO.nazwaPliku(wies, autor);
    const raport = await wyslijPlik(wies, blob, nazwa);

    const teraz = new Date().toISOString();
    for (const w of wpisy) {
      w.status = "wyslany";
      w.ostatniaWysylka = teraz;
      w.wersja = (w.wersja || 1) + (w.poprawionyPoWyslce ? 1 : 0);
      await DB.wpisyPut(w);
    }
    return { raport, nazwa, ile: wpisy.length };
  }

  /* automatyczna kolejka: wpisy z „w kolejce” + zapis pliku na telefon */
  async function kolejkaInfo() {
    const wszystkie = await DB.wpisyAll();
    return {
      doWyslania: wszystkie.filter(w => w.status !== "wyslany").length,
      wszystkie: wszystkie.length
    };
  }

  return {
    nextcloudTest, pcloudTest, gdriveTest, pcloudZaloguj,
    gdriveLoginUrl, gdriveDolaczKod,
    wyslijPlik, synchronizujWies, kolejkaInfo, log
  };
})();
