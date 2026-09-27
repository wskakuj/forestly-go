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
  async function pcloudUpload(cfg, nazwa, blob) {
    const sciezka = cfg.path || "/Taksator";
    const autor = await sciezkaAutor();
    const url = "https://api.pcloud.com/uploadfile?access_token=" + encodeURIComponent(cfg.token) +
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
    const resp = await fetch("https://api.pcloud.com/userinfo?access_token=" + encodeURIComponent(cfg.token));
    const dane = await resp.json().catch(() => ({}));
    if (dane.result !== 0) throw new Error("pCloud: " + (dane.error || "błąd " + dane.result));
    return { ok: true, email: dane.email };
  }

  /* ---------- DYSK GOOGLE (konto serwisowe, JWT RS256) ---------- */
  async function gdriveToken(sa) {
    const teraz = Math.floor(Date.now() / 1000);
    const naglowek = b64u.enc(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64u.enc(JSON.stringify({
      iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token", iat: teraz, exp: teraz + 3600
    }));
    const pem = (sa.private_key || "").replace(/-----[\w ]+-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    const klucz = await crypto.subtle.importKey("pkcs8", der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sygn = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", klucz,
      new TextEncoder().encode(naglowek + "." + claims));
    const jwt = naglowek + "." + claims + "." +
      btoa(String.fromCharCode(...new Uint8Array(sygn))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const odp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt
    });
    const dane = await odp.json();
    if (!dane.access_token) throw new Error("Google: nie udało się pobrać tokenu (" + (dane.error_description || dane.error) + ")");
    return dane.access_token;
  }

  const _folderIdCache = {};
  async function gdriveZnajdzFolder(token, nazwa) {
    const q = "mimeType='application/vnd.google-apps.folder' and name='" +
      String(nazwa).replace(/'/g, "\\'") + "' and trashed=false";
    const r = await fetch("https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(q) + "&fields=files(id,name)&pageSize=5",
      { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("Dysk Google: nie mogę szukać folderu (HTTP " + r.status + ")");
    const d = await r.json();
    return (d.files || [])[0] || null;
  }
  async function gdriveUpload(cfg, nazwa, blob) {
    const token = await gdriveToken(cfg.sa);
    const meta = { name: nazwa };
    const nazwaFolderu = (cfg.folder || "FORESTLY BAZA").trim();
    let folderId = _folderIdCache[nazwaFolderu];
    if (!folderId) {
      const f = await gdriveZnajdzFolder(token, nazwaFolderu);
      if (!f) throw new Error('Dysk Google: nie widzę folderu "' + nazwaFolderu +
        '" — udostępnij go (Edytowanie) dla ' + (cfg.sa && cfg.sa.client_email || "konta serwisowego"));
      folderId = _folderIdCache[nazwaFolderu] = f.id;
    }
    meta.parents = [folderId];
    const granica = "taksator" + Date.now();
    const czesci = [];
    czesci.push("--" + granica + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n");
    czesci.push("--" + granica + "\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n");
    const cialo = new Blob([...czesci, blob, "\r\n--" + granica + "--"]);
    const resp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + granica },
      body: cialo
    });
    if (!resp.ok) throw new Error("Dysk Google: HTTP " + resp.status);
    return true;
  }

  async function gdriveTest(cfg) {
    const token = await gdriveToken(cfg.sa);
    const resp = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: "Bearer " + token } });
    if (!resp.ok) throw new Error("Dysk Google: HTTP " + resp.status);
    const dane = await resp.json();
    const nazwaFolderu = (cfg.folder || "FORESTLY BAZA").trim();
    const f = await gdriveZnajdzFolder(token, nazwaFolderu);
    if (!f) throw new Error('Konto działa, ale folder "' + nazwaFolderu +
      '" nie jest mu udostępniony — w Dysku Google kliknij folder → Udostępnij → wklej ' +
      (cfg.sa && cfg.sa.client_email || "adres konta serwisowego") + " (Edytowanie)");
    _folderIdCache[nazwaFolderu] = f.id;
    return { ok: true, email: dane.user && dane.user.emailAddress, folder: nazwaFolderu };
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
    if (gd && gd.sa) zadania.push(["gdrive", gdriveUpload(gd, nazwa, blob)]);
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
    nextcloudTest, pcloudTest, gdriveTest,
    wyslijPlik, synchronizujWies, kolejkaInfo, log
  };
})();
