/* ===================== TAKSATOR TERENOWY — LOGIKA ===================== */

/* ---------- słowniki ---------- */
const GATUNKI = ["Ak", "Brz", "Brzb", "Brzom", "Bk", "Czm", "Czr", "Dg", "Db", "Dbs", "Dbc", "Dbb",
  "Gb", "Gr", "Jb", "Jrz", "Jw", "Jd", "Js", "Jkl", "Kl", "Ksz", "Lp", "Md", "Ol", "Olsz", "Orz",
  "Os", "So", "Sob", "Socz", "Sosm", "Sowm", "Św", "Tp", "Wz", "Wb"];
const SLOWNIKI = {
  /* pełne zestawy wg WYKAZU SKRÓTÓW I SYMBOLI (Symbole nazw drzew) */
  siedlisko: ["Bs", "Bśw", "Bw", "Bb", "BMśw", "BMw", "BMb", "LMśw", "LMw", "LMb", "Lśw", "Lw", "Lł", "Ol", "OlJ"],
  panujacy:  GATUNKI,
  drugi:     GATUNKI,
  pjd:       GATUNKI,
  zwarcie:   ["pełne", "duże", "umiark.", "przeryw.", "rzadkie", "luźne"],
  podsz:     ["krusz", "jrz", "leszcz", "suchodr", "malina", "jeżyna", "bez czarny", "trzmielina",
              "czeremcha", "grusza", "jabłoń", "klon", "lipa", "wierzba"]
};
const GRUPY_POJEDYNCZE = new Set(["siedlisko", "panujacy", "drugi", "zwarcie"]);
const GRUPY_WIELOKROTNE = new Set(["pjd", "podsz"]);

/* ---------- stan formularza ---------- */
let stan = nowyStan();
let trybEdycji = null; // id wpisu, który edytujemy

function oddzPelne(w) {
  w = w || stan;
  if (w.oddz === undefined && w.oddzPelne !== undefined) return w.oddzPelne;
  return (w.oddz || "") + (w.poddz || "");
}
function nowyStan() {
  return {
    wies: "", dzialki: [],
    siedlisko: null, panujacy: null, drugi: null, udzialPanujacy: 10, udzialDrugi: 0,
    wiekPrzec: 90, pjd: [], pjdWiekPrzec: 70,
    zwarcie: null, podsz: [], podszProc: 0,
    elWys: "", elPier: "", elBon: "", elZad: "", elMiaz: "",
    wskTyp: "", wskPow: "", wskMiaz: "",
    lat: null, lon: null, locZrodlo: null
  };
}

/* ---------- narzędzia UI ---------- */
const $ = s => document.querySelector(s);
function toast(msg, ms) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove("on"), ms || 2600);
}
function przelaczTab(nazwa) {
  document.querySelectorAll(".bn").forEach(b => b.classList.toggle("on", b.dataset.tab === nazwa));
  document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id === "pane-" + nazwa));
  if (nazwa === "mapa") setTimeout(() => { satInit(); odswiezPinezki(); }, 60);
  if (nazwa === "wykaz") rysujWykaz();
  if (nazwa === "sync") rysujSync();
  if (nazwa === "wsie") rysujPulpitWsi();
}

/* ---------- pulpit wsi ---------- */
let aktywnaWies = localStorage.getItem("aktywnaWies") || "";
async function rysujPulpitWsi() {
  const wsie = await DB.wpisyWsie();
  const wszystkie = await DB.wpisyAll();
  const box = $("#wies-grid");
  const karty = wsie.map(w => {
    const ile = wszystkie.filter(x => x.wies === w).length;
    const wyslane = wszystkie.filter(x => x.wies === w && x.status === "wyslany").length;
    return `<div class="wies-card" data-wies="${w}">
      <div class="wc-gora"><span class="wc-ikona">🌲</span><span class="wc-ile">${ile}</span></div>
      <b>${w}</b>
      <small>${wyslane === ile ? "wszystko wysłane ✓" : "do wysłania: " + (ile - wyslane)}</small>
    </div>`;
  }).join("");
  box.innerHTML = (wsie.length ? karty : '<div class="pulpit-info" style="text-align:center;margin-top:24vh">— jeszcze nic nie zebrane —</div>') +
    `<div class="wies-card wies-nowa" id="wies-nowa">
      <div class="wc-gora"><span class="wc-ikona">＋</span></div>
      <b>Nowa wieś</b><small>nazwę wpiszesz przy pierwszym opisie</small>
    </div>`;
  box.querySelectorAll(".wies-card[data-wies]").forEach(k =>
    k.addEventListener("click", () => przejdzDoWsi(k.dataset.wies)));
  const n = $("#wies-nowa");
  if (n) n.addEventListener("click", () => {
    aktywnaWies = ""; localStorage.removeItem("aktywnaWies");
    trybEdycji = null; stan = nowyStan(); uzupelnijForm(); rysuj(); przelaczTab("form");
  });
  odswiezAppbar();
}
function przejdzDoWsi(w) {
  aktywnaWies = w; localStorage.setItem("aktywnaWies", w);
  trybEdycji = null; stan = nowyStan(); stan.wies = w || "";
  uzupelnijForm(); rysuj();
  przelaczTab("wykaz");
}

/* ---------- kreator startowy ---------- */
let onbKrok = 0;
/* na telefonie (Android/iOS — w tym w Brave) File System Access nie działa
   w karcie aplikacji — od razu pokazujemy tryb pobierania plików */
const MOBILNY = /Android|iPhone|iPad/i.test(navigator.userAgent);
const FOLDER_MOZLIWY = !!window.showDirectoryPicker && !MOBILNY && !NATYWNIE;
/* natywny wybór folderu (Android, wtyczka Pliki) — działa też bez File System Access API */
function jestFolderNatywny() {
  try {
    return czyNatywnie() && window.Capacitor.Plugins && !!window.Capacitor.Plugins.Pliki;
  } catch (e) { return false; }
}
const FOLDER_NATYWNY = jestFolderNatywny();   /* tylko do warunków na starcie */
async function wybierzFolder() {
  if (jestFolderNatywny()) {
    const r = await window.Capacitor.Plugins.Pliki.wybierzFolder();
    return { uri: r.uri, nazwa: r.nazwa, natywny: true };
  }
  if (window.showDirectoryPicker) {
    try {
      return await pokazDialogFolderu();
    } catch (e) {
      /* „The user aborted a request” — na telefonie Chrome wystawia to API,
         ale wybieracz się nie otwiera (PWA/TWA); na komputerze to zwykle
         własne anulowanie. Anulowanie nie jest błędem do naprawiania. */
      const anulowano = e && (e.name === "AbortError" || /abort/i.test(String(e.message)));
      if (anulowano) {
        if (MOBILNY) toast("Na telefonie folder wskażesz w aplikacji natywnej (APK ForestlyGO) — " +
          "to ona otwiera systemowy wybór folderu. W przeglądarce Excel pobierasz przyciskiem, " +
          "folder nie jest potrzebny.", 8000);
        return null;
      }
      throw e;
    }
  }
  /* telefon w przeglądarce bez tego API (PWA): tłumaczymy zamiast rzucać błędem */
  toast("Wybór folderu działa w aplikacji natywnej (APK ForestlyGO) i na komputerze " +
        "w Chrome/Edge. Tutaj pliki Excel i tak pobierzesz przyciskiem — folder nie jest potrzebny.", 6000);
  return null;
}

function renderOnb() {
  const kroki = ["Leśnik", "Folder na telefonie", "Chmury"];
  const html = [];
  html.push('<div class="onb-kroki">' + kroki.map((_, i) => `<i class="${i <= onbKrok ? "on" : ""}"></i>`).join("") + "</div>");
  if (onbKrok === 0) {
    html.push(`<h3>Kto zbiera dane?</h3>
      <p>Imię i nazwisko staje się nazwą folderu na serwerze i podpisuje każdy wpis.</p>
      <input class="f-input" id="onb-autor" placeholder="np. Mietek Kowalski" autocomplete="name">
      <button type="button" class="fab" id="onb-dalej" style="margin-top:10px">Dalej →</button>
      <button type="button" class="fab szary" id="onb-przywroc" style="margin-top:8px">Mam backup — przywróć sesję</button>`);
  } else if (onbKrok === 1) {
    if (FOLDER_MOZLIWY || jestFolderNatywny()) {
      html.push(`<h3>Gdzie zapisywać pliki?</h3>
        <p>Wskaż folder na tym urządzeniu — Excel z opisami będzie tam widoczny także dla innych aplikacji.</p>
        <button type="button" class="fab" id="onb-folder">Wybierz folder</button>
        <button type="button" class="fab szary" id="onb-folder-pomin">Pomiń (będę pobierał pliki ręcznie)</button>`);
    } else {
      html.push(`<h3>Gdzie zapisywać pliki?</h3>
        <p>Na telefonie i w niektórych przeglądarkach (Firefox, Safari, Brave) nie da się
        wskazać folderu na stałe. Nie szkodzi — Excel i backup pobierzesz przyciskiem,
        a sesja i tak zapisuje się automatycznie w pamięci aplikacji oraz na chmurach po wysyłce.</p>
        <button type="button" class="fab" id="onb-folder-pomin">OK — dalej</button>
        <button type="button" class="fab szary" id="onb-przywroc-plik">Mam plik backupu — przywróć</button>`);
    }
  } else {
    html.push(`<h3>Kopia zapasowa w chmurach</h3>
      <p>Główne dane lądują na Twoim Nextcloud (QNAP), a w tej samej chwili kopia na Dysku Google i pCloud.
      Możesz to teraz pominąć i skonfigurować później w zakładce <b>Sync</b>.</p>
      <button type="button" class="fab" id="onb-gotowe">Zaczynajmy</button>
      <button type="button" class="fab szary" id="onb-chmury">Skonfiguruj chmury teraz</button>`);
  }
  const box = $("#onb");
  box.innerHTML = html.join("");

  if (onbKrok === 0) {
    const inp = $("#onb-autor");
    inp.value = "";
    setTimeout(() => inp.focus(), 100);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") onbDalej(); });
    $("#onb-dalej").addEventListener("click", onbDalej);
    $("#onb-przywroc").addEventListener("click", async () => {
      if (!FOLDER_MOZLIWY) {
        window.__celPrzywrocenia = "onboarding";
        $("#plik-backup").click();
        return;
      }
      try {
        const dir = await pokazDialogFolderu();
        const r = await SESJA.przywroc(dir);
        if (!r.ok) { toast("W tym folderze nie ma pliku backupu"); return; }
        await DB.metaSet("folder", dir);
        toast("Sesja przywrócona: " + r.ile + " wpisów ✓");
        CLOUDS.log("<b>przywrócono sesję</b> — " + r.ile + " wpisów");
        await zakonczOnboarding(false);
        await odswiezStart();
      } catch (e) { toast("Nie udało się wybrać folderu"); }
    });
  } else if (onbKrok === 1) {
    const pw = $("#onb-przywroc-plik");
    if (pw) pw.addEventListener("click", () => {
      window.__celPrzywrocenia = "onboarding";
      $("#plik-backup").click();
    });
    if (!$("#onb-folder")) { $("#onb-folder-pomin").addEventListener("click", () => { onbKrok = 2; renderOnb(); }); return; }
    $("#onb-folder").addEventListener("click", async () => {
      try {
        const dir = await wybierzFolder();
        await DB.metaSet("folder", dir);
        const r = await SESJA.przywroc(dir);
        if (r.ok) {
          toast("Sesja przywrócona: " + r.ile + " wpisów ✓");
          CLOUDS.log("<b>przywrócono sesję</b> — " + r.ile + " wpisów (" + String(r.zapisano || "").slice(0, 16).replace("T", " ") + ")");
          await zakonczOnboarding(false);
          await odswiezStart();
          return;
        }
        toast("Folder zapisany: " + dir.name);
        onbKrok = 2; renderOnb();
      } catch (e) { toast("Nie udało się wybrać folderu — spróbuj ponownie"); }
    });
    $("#onb-folder-pomin").addEventListener("click", () => { onbKrok = 2; renderOnb(); });
  } else {
    $("#onb-gotowe").addEventListener("click", () => zakonczOnboarding(false));
    $("#onb-chmury").addEventListener("click", () => zakonczOnboarding(true));
  }
}
async function onbDalej() {
  if (onbKrok === 0) {
    const v = $("#onb-autor").value.trim();
    if (!v) { toast("Podaj imię i nazwisko"); return; }
    await DB.metaSet("autor", v);
    onbKrok = 1; renderOnb();
  }
}
async function zakonczOnboarding(doChmur) {
  const autor = await DB.metaGet("autor");
  if (!autor) { onbKrok = 0; renderOnb(); toast("Najpierw podaj imię i nazwisko"); return; }
  $("#onboarding").classList.remove("on");
  odswiezAppbar();
  przelaczTab(doChmur ? "sync" : "wsie");
}
async function pokazDialogFolderu() {
  if (window.showDirectoryPicker) return await window.showDirectoryPicker({ mode: "readwrite" });
  throw new Error("brak File System Access API");
}

/* ---------- status połączenia z chmurami (online / lokalnie) ---------- */
let STATUS_POLACZENIA = null;      /* null = sprawdzanie w toku */
let __probeWLocie = false;
function htmlStatusu() {
  if (STATUS_POLACZENIA === null)
    return '<span class="st-off" style="text-decoration:none">sprawdzam…</span>';
  if (STATUS_POLACZENIA)
    return '<span class="st-on">online</span>';
  return '<span class="st-off">online</span> <span class="st-lok">lokalnie</span>';
}
function probeAdresu(url) {
  /* zapytanie bez CORS: odpowiedź sieciowa = serwer żyje, nawet bez nagłówków CORS */
  return new Promise(wynik => {
    const t = setTimeout(() => wynik(false), 6000);
    fetch(url, { mode: "no-cors", cache: "no-store" })
      .then(() => { clearTimeout(t); wynik(true); })
      .catch(() => { clearTimeout(t); wynik(false); });
  });
}
async function sprawdzPolaczenie() {
  if (__probeWLocie) return;
  __probeWLocie = true;
  try {
    const ncC = await DB.metaGet("nextcloud") || {};
    const pcC = await DB.metaGet("pcloud") || {};
    const gdC = await DB.metaGet("gdrive") || {};
    const cele = [];
    if (ncC.url && ncC.pass) cele.push(String(ncC.url));
    if (pcC.token) cele.push("https://" + (pcC.host || "api.pcloud.com"));
    if (gdC.refreshToken) cele.push("https://www.googleapis.com");
    if (!cele.length || !navigator.onLine) {
      STATUS_POLACZENIA = false;
    } else {
      STATUS_POLACZENIA = (await Promise.all(cele.map(probeAdresu))).some(Boolean);
    }
  } catch (e) { STATUS_POLACZENIA = false; }
  __probeWLocie = false;
  const sub = $("#ab-sub");
  if (sub) sub.innerHTML = htmlStatusu();
}
function resetujStatusPolaczenia() {
  STATUS_POLACZENIA = null;
  const sub = $("#ab-sub");
  if (sub) sub.innerHTML = htmlStatusu();
  sprawdzPolaczenie();
}
window.addEventListener("online", resetujStatusPolaczenia);
window.addEventListener("offline", () => {
  STATUS_POLACZENIA = false;
  const sub = $("#ab-sub");
  if (sub) sub.innerHTML = htmlStatusu();
});

/* ---------- pasek górny ---------- */
async function odswiezAppbar() {
  const autor = await DB.metaGet("autor");
  const sub = $("#ab-sub"), chip = $("#ab-user"), k = $("#ab-kolejka");
  sub.innerHTML = htmlStatusu();
  const wAb = $("#ab-wersja");
  if (wAb) wAb.textContent = (typeof WERSJA_APLIKACJI !== "undefined" ? WERSJA_APLIKACJI : "?");
  if (STATUS_POLACZENIA === null) sprawdzPolaczenie();
  chip.style.display = autor ? "flex" : "none";
  chip.textContent = autor ? autor.split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase() : "?";
  const kol = await CLOUDS.kolejkaInfo();
  k.style.display = kol.doWyslania > 0 ? "inline-block" : "none";
  k.textContent = "kolejka: " + kol.doWyslania;
  const abObr = $("#ab-obreb");
  if (stan.wies || aktywnaWies) { abObr.style.display = "inline-block"; abObr.textContent = aktywnaWies || stan.wies; }
  else abObr.style.display = "none";
}

/* ---------- chips ---------- */
function renderChips() {
  document.querySelectorAll(".chips[data-group]").forEach(box => {
    const g = box.dataset.group;
    box.innerHTML = SLOWNIKI[g].map(v =>
      `<span class="chip ${jestAktywny(g, v) ? "on" : ""}" data-v="${v}">${v}</span>`).join("");
  });
}
function jestAktywny(g, v) {
  if (GRUPY_POJEDYNCZE.has(g)) return stan[g] === v;
  return stan[g].includes(v);
}
document.addEventListener("click", e => {
  const chip = e.target.closest(".chip[data-v]");
  if (!chip) return;
  const box = chip.closest(".chips[data-group]");
  const g = box.dataset.group, v = chip.dataset.v;
  if (GRUPY_POJEDYNCZE.has(g)) {
    stan[g] = stan[g] === v ? null : v;
    if (g === "drugi" && !stan.drugi) stan.udzialDrugi = 0;
  } else {
    const i = stan[g].indexOf(v);
    if (i >= 0) stan[g].splice(i, 1); else stan[g].push(v);
  }
  renderChips(); rysuj();
});

/* ---------- steppery ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-step]");
  if (!b) return;
  const krok = parseInt(b.dataset.dir, 10);
  switch (b.dataset.step) {
    case "udzialpan": stan.udzialPanujacy = Math.min(10, Math.max(0, udzialPan(stan) + krok)); break;
    case "udzial": stan.udzialDrugi = Math.min(10, Math.max(0, stan.udzialDrugi + krok)); break;
    case "wiek": stan.wiekPrzec = Math.max(10, stan.wiekPrzec + krok); break;
    case "pjdwiek": stan.pjdWiekPrzec = Math.max(10, stan.pjdWiekPrzec + krok); break;
    case "podszproc": stan.podszProc = Math.min(100, Math.max(0, stan.podszProc + krok)); break;
  }
  rysuj();
});

/* klik w wartość stepperów — ręczne wpisanie liczby */
const udzialPan = w => (w.udzialPanujacy != null ? w.udzialPanujacy : 10 - (w.udzialDrugi || 0));
const EDYTOWALNE = {
  udzialpan: { val: () => udzialPan(stan), set: n => stan.udzialPanujacy = Math.min(10, Math.max(0, n)) },
  udzial:    { val: () => stan.udzialDrugi, set: n => stan.udzialDrugi = Math.min(10, Math.max(0, n)) },
  wiek:      { val: () => stan.wiekPrzec, set: n => stan.wiekPrzec = Math.min(300, Math.max(1, n)) },
  pjdwiek:   { val: () => stan.pjdWiekPrzec, set: n => stan.pjdWiekPrzec = Math.min(300, Math.max(1, n)) },
  podszproc: { val: () => stan.podszProc, set: n => stan.podszProc = Math.min(100, Math.max(0, n)) }
};
document.addEventListener("click", e => {
  const v = e.target.closest("[data-edit]");
  if (!v || v.querySelector("input")) return;
  const tryb = v.dataset.edit, def = EDYTOWALNE[tryb];
  if (!def) return;
  const span = v.querySelector("span");
  const inp = document.createElement("input");
  inp.type = "text"; inp.inputMode = "numeric";
  inp.value = def.val();
  inp.style.cssText = "width:4.5em;font:inherit;padding:1px 4px;border:1px solid #3a5c33;" +
    "border-radius:6px;background:#fff;color:#1b2b17;text-align:center";
  v.insertBefore(inp, span);
  span.style.display = "none";
  inp.focus(); inp.select();
  let zakonczono = false;
  const zakoncz = zapis => {
    if (zakonczono) return; zakonczono = true;
    if (zapis) {
      const n = parseInt(inp.value.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(n)) def.set(n);
    }
    inp.remove(); span.style.display = ""; rysuj();
  };
  inp.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); zakoncz(true); }
    else if (ev.key === "Escape") { ev.preventDefault(); zakoncz(false); }
  });
  inp.addEventListener("blur", () => zakoncz(true));
});

/* ---------- podgląd OPTAX ---------- */
function pvToggle() {
  const pv = $("#pv");
  pv.classList.toggle("min");
  $("#pv-chev").textContent = pv.classList.contains("min") ? "rozwiń ▾" : "zwiń ▴";
}
$("#pv-chev").addEventListener("click", pvToggle);

/* pasek zapisu: podsumowanie na żywo + postęp pól obowiązkowych */
function odswiezPasekZapisu() {
  const suma = $("#zp-suma"), sub = $("#zp-suma-sub"), postep = $("#zp-postep");
  if (!suma) return;
  suma.textContent = (stan.wies || "— wybierz wieś") + " · " +
    (stan.dzialki.length ? stan.dzialki.join(", ") : "— nr wydz.");
  const drzewa = [stan.panujacy, stan.drugi].filter(Boolean).join(" + ") || "—";
  sub.textContent = (stan.siedlisko || "—") + " · " + drzewa +
    (stan.zwarcie ? " · " + stan.zwarcie : "");
  /* kompletność CAŁEGO opisu — pasek napełnia się w miarę wypełniania
     kolejnych sekcji, nie całości po samym drzewostanie */
  const spelnione = [
    !!stan.wies,             // 1. wieś
    stan.dzialki.length > 0, // 2. numery wydzieleń
    !!stan.siedlisko,        // 3. siedlisko
    !!stan.panujacy,         // 4. gatunek panujący
    !!stan.zwarcie,          // 5. zwarcie
    stan.podsz.length > 0,   // 6. podszyt
    stan.lat != null         // 7. lokalizacja
  ];
  const ile = spelnione.filter(Boolean).length;
  if (postep) {
    postep.innerHTML = spelnione.map(ok => '<i class="' + (ok ? "on" : "") + '"></i>').join("");
    postep.title = "kompletność opisu: " + ile + " / 7";
  }
}
function rysuj() {
  $("#wiek-linia").textContent = (stan.wiekPrzec - OPTAX.KROK) + "–" + (stan.wiekPrzec + OPTAX.KROK) + " / " + stan.wiekPrzec + " l";
  $("#wiek-klasa").textContent = "klasa wieku " + OPTAX.klasaWieku(stan.wiekPrzec);
  $("#pjd-wiek-linia").textContent = (stan.pjdWiekPrzec - OPTAX.KROK) + "–" + (stan.pjdWiekPrzec + OPTAX.KROK) + " / " + stan.pjdWiekPrzec + " l";
  $("#podsz-proc").textContent = stan.podszProc + "%";
  $("#e-kl").textContent = "kl. " + OPTAX.klasaWieku(stan.wiekPrzec);
  $("#udzial-pan-linia").textContent = stan.panujacy
    ? udzialPan(stan) + " " + stan.panujacy
    : "wybierz gatunek";
  $("#udzial-linia").textContent = stan.drugi
    ? stan.udzialDrugi + " " + stan.drugi
    : "—";
  $("#pv-line").textContent = OPTAX.linie(stan).join("\n");
  $("#pv-line").classList.remove("pv-flash"); void $("#pv-line").offsetWidth; $("#pv-line").classList.add("pv-flash");
  $("#pv-stamp").textContent = oddzPelne() || "—";
  const loc = $("#loc-info");
  loc.textContent = stan.lat != null
    ? stan.lat.toFixed(5) + "° N · " + stan.lon.toFixed(5) + "° E · " + (stan.locZrodlo || "")
    : "brak lokalizacji";
  odswiezPasekZapisu();
  odswiezAppbar();
}

/* ---------- pola tekstowe ---------- */
function bindInput(id, klucz, transform) {
  const el = $(id);
  el.addEventListener("input", () => {
    stan[klucz] = transform ? transform(el.value) : el.value;
    if (klucz === "wies") odswiezAppbar();
    rysuj();
  });
}
bindInput("#in-wies", "wies");
/* działki: numer dodaje się sam (Enter albo przejście do kolejnego pola);
   można wpisać kilka naraz po przecinku */
function dzialkiDodaj(trzymajFokus) {
  const inp = $("#in-dzialka");
  const czesci = inp.value.split(/[,;]+/).map(x => x.replace(/\s+/g, "")).filter(Boolean);
  for (const v of czesci) if (!stan.dzialki.includes(v)) stan.dzialki.push(v);
  if (czesci.length) { renderDzialki(); rysuj(); }
  inp.value = "";
  if (trzymajFokus) inp.focus();
}
function dzialkiUsun(v) {
  stan.dzialki = stan.dzialki.filter(x => x !== v);
  renderDzialki(); rysuj();
}
let dzialkiRozwinięte = false;
function renderDzialki() {
  const box = $("#dzialki-chips");
  const ile = stan.dzialki.length;
  const LIMIT = 6;
  const pokaz = dzialkiRozwinięte ? stan.dzialki : stan.dzialki.slice(0, LIMIT);
  box.innerHTML = pokaz.map(v =>
    `<span class="chip-x">${v}<i data-dzialka-usun="${v}">×</i></span>`).join("") +
    (ile > LIMIT && !dzialkiRozwinięte ? `<span class="chips-more" id="dzialki-more">… +${ile - LIMIT} — pokaż</span>` : "") +
    (ile > LIMIT && dzialkiRozwinięte ? `<span class="chips-more" id="dzialki-more">zwiń ▴</span>` : "");
}
document.addEventListener("click", e => {
  const usun = e.target.closest("[data-dzialka-usun]");
  if (usun) { dzialkiUsun(usun.dataset.dzialkaUsun); return; }
  if (e.target.id === "dzialki-more") { dzialkiRozwinięte = !dzialkiRozwinięte; renderDzialki(); }
});
/* numer wydzielenia: akceptuje się dopiero, gdy dotkniesz czegokolwiek
   innego (przejście do kolejnego pola, zapis itd.) — bez Enter */
$("#in-dzialka").addEventListener("blur", () => dzialkiDodaj(false));
bindInput("#e-wys", "elWys");
bindInput("#e-pier", "elPier");
bindInput("#e-bon", "elBon");
bindInput("#e-zad", "elZad");
bindInput("#e-miaz", "elMiaz");
bindInput("#w-typ", "wskTyp");
bindInput("#w-pow", "wskPow");
bindInput("#w-miaz", "wskMiaz");

/* ---------- lokalizacja ---------- */
function gpsZlapuj() {
  if (!navigator.geolocation) { toast("To urządzenie nie ma GPS"); return; }
  toast("Szukam sygnału GPS…");
  navigator.geolocation.getCurrentPosition(p => {
    stan.lat = p.coords.latitude; stan.lon = p.coords.longitude;
    stan.locZrodlo = "GPS";
    rysuj(); toast("Lokalizacja zapisana (" + stan.lat.toFixed(5) + ", " + stan.lon.toFixed(5) + ")");
  }, err => toast("GPS niedostępny: " + err.message), { enableHighAccuracy: true, timeout: 15000 });
}
$("#btn-gps").addEventListener("click", gpsZlapuj);
$("#btn-gps2").addEventListener("click", gpsZlapuj);
$("#btn-mapa").addEventListener("click", () => przelaczTab("mapa"));

/* ---------- mapa ---------- */
let mapa = null, pinezka = null, satInitDone = false, warstwaDrog = null, warstwaWpisow = null;
let podstawaMapy = null, trybMapy = "sat";
const MAPA_SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MAPA_OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/* kafelki: kazdy dostaje druga szanse; gdy satelita pada - automatycznie zwykla mapa */
function warstwaPlytek(url, opcje) {
  const w = L.tileLayer(url, opcje);
  let bledy = 0, przelaczono = false;
  w.on("tileerror", e => {
    const t = e.tile;
    /* druga szansa dla pojedynczego kafelka */
    if (t && !t.__sprobowano) {
      t.__sprobowano = 1;
      const src = t.src;
      if (src) t.src = src + (src.includes("?") ? "&" : "?") + "s=" + Date.now();
    }
    /* gdy kafelków sypie się dużo — przełączamy na zwykłą mapę */
    if (!przelaczono && trybMapy === "sat" && ++bledy >= 12) {
      przelaczono = true;
      toast("Mapa satelitarna chwilowo niedostępna — włączam zwykłą mapę");
      przelaczTrybMapy("osm", true);
    }
  });
  return w;
}
function przelaczTrybMapy(tryb, cicho) {
  trybMapy = tryb;
  if (podstawaMapy) mapa.removeLayer(podstawaMapy);
  if (tryb === "osm") {
    podstawaMapy = warstwaPlytek(MAPA_OSM, { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
    if (!cicho) toast("Zwykła mapa (OpenStreetMap)");
  } else {
    podstawaMapy = warstwaPlytek(MAPA_SAT, { maxZoom: 19, attribution: "Esri World Imagery" }).addTo(mapa);
    if (!cicho) toast("Mapa satelitarna");
  }
  const btn = $("#mapa-tryb");
  if (btn) btn.textContent = tryb === "sat" ? "🗺 OpenStreet" : "🛰 Satelita";
}
let znacznikPozycji = null, ostatniaPozycja = null;
/* nasza pozycja z GPS — niebieska kropka na mapie */
function pokazPozycje(lat, lng) {
  ostatniaPozycja = [lat, lng];
  if (!mapa) return;
  if (!znacznikPozycji) {
    znacznikPozycji = L.circleMarker([lat, lng],
      { radius: 9, color: "#ffffff", weight: 3, fillColor: "#2A468B", fillOpacity: 1 }).addTo(mapa);
  } else znacznikPozycji.setLatLng([lat, lng]);
}
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(p => pokazPozycje(p.coords.latitude, p.coords.longitude),
    () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
}
$("#btn-pozycja").addEventListener("click", () => {
  if (!mapa) return;
  const najedz = () => mapa.setView(ostatniaPozycja, Math.max(mapa.getZoom(), 16));
  if (ostatniaPozycja) { najedz(); return; }
  if (!navigator.geolocation) { toast("Brak GPS na tym urządzeniu"); return; }
  toast("Ustalam pozycję…");
  navigator.geolocation.getCurrentPosition(p => {
    pokazPozycje(p.coords.latitude, p.coords.longitude);
    najedz();
  }, () => toast("Nie mogę ustalić pozycji — sprawdź, czy GPS jest włączony"),
    { enableHighAccuracy: true, timeout: 10000 });
});
function przelaczDrogi(on) {
  if (!mapa) return;
  if (on && !warstwaDrog) {
    warstwaDrog = L.layerGroup([
      warstwaPlytek("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
      warstwaPlytek("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 })
    ]).addTo(mapa);
  } else if (!on && warstwaDrog) { mapa.removeLayer(warstwaDrog); warstwaDrog = null; }
}
$("#mapa-drogi").addEventListener("change", e => przelaczDrogi(e.target.checked));
$("#mapa-tryb").addEventListener("click", () => przelaczTrybMapy(trybMapy === "sat" ? "osm" : "sat"));
/* ---------- okienko OPTAX po kliknięciu pinezki ---------- */
function otworzOptaxOkno(w) {
  const esc = t => String(t).replace(/[<>&]/g, zn => ({ "<": "\u003C", ">": "\u003E", "&": "\u0026" }[zn]));
  const nr = (Array.isArray(w.dzialki) && w.dzialki.length ? w.dzialki.join(", ") : "") || oddzPelne(w) || "—";
  const linie = OPTAX.linie(w);
  const el = [];
  if (w.elWys) el.push("wys. " + w.elWys + " m");
  if (w.elPier) el.push("pierś. " + w.elPier + " cm");
  if (w.elBon) el.push("bon. " + w.elBon);
  if (w.elZad) el.push("zad. " + w.elZad + "%");
  if (w.elMiaz) el.push("miąż. " + w.elMiaz + " m³/ha");
  const wsk = [];
  if (w.wskTyp) wsk.push(w.wskTyp);
  if (w.wskPow) wsk.push(w.wskPow + " ha");
  if (w.wskMiaz) wsk.push(w.wskMiaz + " m³");
  const box = document.createElement("div");
  box.className = "oo-karta";
  box.innerHTML =
    '<div class="oo-nag">' + esc(w.wies || "?") + ' · wydz. ' + esc(nr) + '</div>' +
    '<div class="oo-optax">' + (linie.length ? linie.map(l => '<div>' + esc(l) + '</div>').join("")
      : '<div class="oo-brak">— brak danych —</div>') + '</div>' +
    (el.length ? '<div class="oo-dane">' + esc(el.join(" · ")) + '</div>' : "") +
    (wsk.length ? '<div class="oo-dane">' + esc(wsk.join(" · ")) + '</div>' : "") +
    '<button type="button" class="oo-btn">✎ Edytuj opis</button>';
  box.querySelector(".oo-btn").addEventListener("click", () => {
    if (mapa) mapa.closePopup();
    trybEdycji = w.id;
    stan = Object.assign(nowyStan(), w);
    if (!Array.isArray(stan.pjd)) stan.pjd = [];
    if (!Array.isArray(stan.podsz)) stan.podsz = [];
    uzupelnijForm(); rysuj(); przelaczTab("form");
  });
  L.popup({ maxWidth: 300, className: "optax-pop", autoPan: true })
    .setLatLng([w.lat, w.lon])
    .setContent(box)
    .openOn(mapa);
}
async function odswiezPinezki() {
  if (!mapa) return;
  if (warstwaWpisow) mapa.removeLayer(warstwaWpisow);
  warstwaWpisow = L.layerGroup().addTo(mapa);
  const wszystkie = (await DB.wpisyAll()).filter(w => w.lat != null && w.lon != null);
  /* zielone pole wsi — okrąg obejmujący wszystkie jej pinezki, z nazwą */
  const grupy = {};
  for (const w of wszystkie) {
    const k = w.wies || "?";
    (grupy[k] = grupy[k] || []).push(w);
  }
  const bezt = t => String(t).replace(/[<>&]/g, zn => ({ "<": "\u003C", ">": "\u003E", "&": "\u0026" }[zn]));
  const dystansM = (lat1, lon1, lat2, lon2) => {
    const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };
  for (const wies in grupy) {
    const g = grupy[wies];
    const laty = g.map(w => w.lat), lony = g.map(w => w.lon);
    const cLat = (Math.min(...laty) + Math.max(...laty)) / 2;
    const cLon = (Math.min(...lony) + Math.max(...lony)) / 2;
    let r = 0;
    for (const w of g) r = Math.max(r, dystansM(cLat, cLon, w.lat, w.lon));
    r = Math.max(r * 1.3, 120); // margines na etykiete i pojedyncze pinezki
    L.circle([cLat, cLon], {
      radius: r, color: "#2dd4a7", weight: 1.5, opacity: .65,
      fillColor: "#2dd4a7", fillOpacity: .12
    }).addTo(warstwaWpisow)
      .bindTooltip(bezt(wies), { permanent: true, direction: "center", className: "wies-etykieta" });
  }
  for (const w of wszystkie) {
    const nr = (Array.isArray(w.dzialki) && w.dzialki.length ? w.dzialki.join(", ") : "") || oddzPelne(w) || "—";
    const tekst = String(nr).replace(/[<>&]/g, zn => ({ "<": "\u003C", ">": "\u003E", "&": "\u0026" }[zn]));
    const ik = L.divIcon({ className: "pin-wpis",
      html: '<span class="pin-punkt">📍</span><span class="pin-nr">' + tekst + '</span>',
      iconSize: [46, 44], iconAnchor: [23, 40] });
    const m = L.marker([w.lat, w.lon], { icon: ik }).addTo(warstwaWpisow);
    m.on("click", () => otworzOptaxOkno(w));
  }
}
function satInit() {
  if (satInitDone || typeof L === "undefined") return;
  const el = $("#mapa-leaflet");
  if (!el || el.clientWidth === 0) return;
  mapa = L.map(el, { zoomControl: true }).setView([52.4226, 21.0558], 15);
  przelaczTrybMapy("sat", true);
  const cb = document.getElementById("mapa-drogi");
  if (cb && cb.checked) przelaczDrogi(true);
  mapa.on("click", e => {
    const ikona = L.divIcon({ className: "pin-emoji", html: "📍", iconSize: [30, 30], iconAnchor: [15, 27] });
    if (pinezka) pinezka.setLatLng(e.latlng);
    else pinezka = L.marker(e.latlng, { icon: ikona }).addTo(mapa);
    $("#mapa-info").textContent = e.latlng.lat.toFixed(5) + "° N · " + e.latlng.lng.toFixed(5) + "° E";
    $("#btn-pin-do-opisu").disabled = false;
  });
  satInitDone = true;
}
$("#btn-pin-do-opisu").addEventListener("click", () => {
  if (!pinezka) return;
  const ll = pinezka.getLatLng();
  stan.lat = ll.lat; stan.lon = ll.lng; stan.locZrodlo = "mapa";
  rysuj(); przelaczTab("form");
  toast("Pinezka wpięta do opisu");
});

/* ---------- zapis wpisu ---------- */
async function zapiszWpis(pominWalidacje) {
  const autor = await DB.metaGet("autor");
  if (!autor) { toast("Najpierw podaj, kto zbiera dane (kreator)"); return; }
  if (!stan.wies.trim()) { toast("Podaj obręb / wieś — po tym grupuje się plik Excel"); return; }
  if (!pominWalidacje) {
    const braki = brakujacePola();
    if (braki.length) { pokazOstrzezenieBraki(braki); return; }
  }
  const wpis = Object.assign({}, stan, {
    id: trybEdycji || ("w" + Date.now() + "-" + Math.random().toString(36).slice(2, 7)),
    autor,
    timestamp: new Date().toISOString(),
    wersja: 1,
    status: trybEdycji ? "wkolejce" : "lokalny",
    poprawionyPoWyslce: undefined
  });
  await DB.wpisyPut(wpis);
  CLOUDS.log("<b>zapisano wpis</b> " + oddzPelne(wpis) + " (" + wpis.wies + ") — " + (trybEdycji ? "poprawka, plik w kolejce" : "lokalny"));
  toast(trybEdycji ? "Poprawka zapisana — plik wróci do kolejki wysyłki" : "Opis zapisany ✓");
  trybEdycji = null;
  SESJA.zapiszZLogiem();
  const zapisanaWies = wpis.wies;
  /* formularz od razu ustawiony na tę samą wieś — kolejny opis bez klikania */
  stan = nowyStan(); stan.wies = zapisanaWies; uzupelnijForm(); rysuj();
  // wracamy do widoku opisów wsi, do której należy zapisany opis
  aktywnaWies = zapisanaWies;
  localStorage.setItem("aktywnaWies", aktywnaWies);
  odswiezListeWsi();
  odswiezAppbar();
  przelaczTab("wykaz");
  rysujWykaz();
}
/* braki w opisie: pola, które powinny być wypełnione
   (opcjonalne — pjd, drugi gatunek, elementy taksacyjne, wskazania —
   oraz lokalizacja NIE są sprawdzane; wieś blokuje zapis osobno) */
function brakujacePola() {
  const braki = [];
  if (!stan.dzialki.length) braki.push("numer wydzielenia");
  if (!stan.siedlisko) braki.push("siedlisko");
  if (!stan.panujacy) braki.push("gatunek panujący");
  if (!stan.zwarcie) braki.push("zwarcie");
  if (!stan.podsz.length) braki.push("podszyt");
  return braki;
}
function pokazOstrzezenieBraki(braki) {
  /* zabezpieczenie: przy aktualizacji w tle service worker może podać
     starszy index.html i okno braków jeszcze nie istnieje — wtedy po prostu
     nie pokazujemy pytania (zapis pójdzie bez ostrzeżenia) */
  const okno = $("#okno-braki");
  if (!okno || !$("#braki-lista")) return;
  $("#braki-lista").innerHTML = braki.map(b => "<li>" + b + "</li>").join("");
  okno.classList.add("on");
}
if (document.getElementById("okno-braki")) {
  $("#braki-zamknij").addEventListener("click", () => $("#okno-braki").classList.remove("on"));
  $("#braki-wroc").addEventListener("click", () => $("#okno-braki").classList.remove("on"));
  $("#okno-braki").addEventListener("click", e => {
    if (e.target.id === "okno-braki") $("#okno-braki").classList.remove("on");
  });
  $("#braki-zapisz").addEventListener("click", () => {
    $("#okno-braki").classList.remove("on");
    zapiszWpis(true);
  });
}
$("#btn-zapisz").addEventListener("click", () => zapiszWpis(false));

function uzupelnijForm() {
  if (stan.siedlisko === "OJ") stan.siedlisko = "OlJ"; // stare wpisy
  $("#in-wies").value = stan.wies || "";
  if (typeof stan.dzialki === "string")
    stan.dzialki = stan.dzialki.split(",").map(x => x.replace(/\s+/g, "")).filter(Boolean);
  $("#in-dzialka").value = "";
  renderDzialki();
  $("#e-wys").value = stan.elWys || ""; $("#e-pier").value = stan.elPier || "";
  $("#e-bon").value = stan.elBon || ""; $("#e-zad").value = stan.elZad || "";
  $("#e-miaz").value = stan.elMiaz || "";
  $("#w-typ").value = stan.wskTyp || ""; $("#w-pow").value = stan.wskPow || "";
  $("#w-miaz").value = stan.wskMiaz || "";
  renderChips();
}

/* ---------- wykaz ---------- */
function identyfikatorWpisu(x) {
  const d = Array.isArray(x.dzialki) ? x.dzialki.join(", ") : (x.dzialki || "");
  const o = oddzPelne(x);
  return o && d ? o + " · " + d : (o || d || "—");
}
async function rysujWykaz() {
  const wsie = await DB.wpisyWsie();
  const wszystkie = await DB.wpisyAll();
  const box = $("#wykaz-lista");
  const naglowek = aktywnaWies ? '<span class="powrot-link" id="powrot-wsie">← wszystkie wsie</span>' : "";
  if (aktywnaWies) {
    const wpisy = wszystkie.filter(x => x.wies === aktywnaWies);
    box.innerHTML = naglowek + `<div class="wies-naglowek">${aktywnaWies} · ${wpisy.length}</div>` +
      wpisy.map(x => `<div class="row-item" data-id="${x.id}">
        <div class="ri-oddz">${identyfikatorWpisu(x)}</div>
        <div class="ri-main"><b>${OPTAX.jednaLinia(x).slice(0, 60)}</b><small>${x.timestamp.slice(0, 10)} · v${x.wersja || 1}</small></div>
        ${x.status === "wyslany" ? '<span class="st ok">wysłany</span>' : '<span class="st local">lokalny</span>'}
        <button class="ri-del" data-del="${x.id}" title="usuń">×</button>
      </div>`).join("");
  } else if (!wsie.length) {
    box.innerHTML = '<div class="wies-naglowek" style="text-align:center;margin-top:30vh">— jeszcze nic nie zebrane —</div>';
  } else {
    box.innerHTML = wsie.map(w => {
      const wpisy = wszystkie.filter(x => x.wies === w);
      return `<div class="wies-naglowek">${w} · ${wpisy.length}</div>` +
        wpisy.map(x => `<div class="row-item" data-id="${x.id}">
          <div class="ri-oddz">${identyfikatorWpisu(x)}</div>
          <div class="ri-main"><b>${OPTAX.jednaLinia(x).slice(0, 60)}</b><small>${x.timestamp.slice(0, 10)} · v${x.wersja || 1}</small></div>
          ${x.status === "wyslany" ? '<span class="st ok">wysłany</span>' : '<span class="st local">lokalny</span>'}
          <button class="ri-del" data-del="${x.id}" title="usuń">×</button>
        </div>`).join("");
    }).join("");
  }
  odswiezAppbar();
}
$("#wykaz-lista").addEventListener("click", async e => {
  if (e.target.closest("#powrot-wsie")) { przelaczTab("wsie"); return; }
  const del = e.target.closest("[data-del]");
  if (del) {
    e.stopPropagation();
    await DB.wpisyDelete(del.dataset.del);
    SESJA.zapiszZLogiem();
    rysujWykaz(); toast("Wpis usunięty");
    return;
  }
  const item = e.target.closest(".row-item");
  if (item) {
    const w = (await DB.wpisyAll()).find(x => x.id === item.dataset.id);
    if (!w) return;
    trybEdycji = w.id;
    stan = Object.assign(nowyStan(), w);
    if (!Array.isArray(stan.pjd)) stan.pjd = [];
    if (!Array.isArray(stan.podsz)) stan.podsz = [];
    uzupelnijForm(); rysuj();
    przelaczTab("form");
  }
});
$("#btn-nowy").addEventListener("click", () => { trybEdycji = null; stan = nowyStan(); stan.wies = aktywnaWies || ""; uzupelnijForm(); rysuj(); przelaczTab("form"); });
$("#ab-obreb").addEventListener("click", () => przelaczTab("wsie"));

/* ---------- aktualizacja APK (działa tylko w aplikacji Android) ---------- */
function apkWersja() {
  return czyNatywnie()
    ? String(typeof WERSJA_APLIKACJI !== "undefined" ? WERSJA_APLIKACJI : "").replace(/^v/, "")
    : (new URLSearchParams(location.search).get("apk_wersja") || "");
}
const APK_WERSJA = apkWersja();
function porownajWersje(a, b) {
  const A = String(a).split(".").map(Number), B = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
function banerAktualizacji(wersja, url) {
  if (document.getElementById("baner-apk")) return;
  const el = document.createElement("div");
  el.id = "baner-apk";
  el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#3a5c33;color:#fff;" +
    "padding:10px 14px;display:flex;gap:12px;align-items:center;justify-content:center;font-size:14px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.35)";
  const t = document.createElement("span");
  t.textContent = "↻ Nowa wersja aplikacji: " + wersja;
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener";
  a.textContent = "Pobierz aktualizację";
  if (czyNatywnie()) a.addEventListener("click", e => {
    e.preventDefault();
    pobierzIZainstalujApk(url, wersja);
  });
  a.style.cssText = "color:#fff;font-weight:700;text-decoration:underline;white-space:nowrap";
  const x = document.createElement("button");
  x.textContent = "×"; x.title = "nie teraz";
  x.style.cssText = "background:none;border:0;color:#fff;font-size:18px;cursor:pointer;padding:0 4px";
  x.onclick = () => { localStorage.setItem("apk_omin", wersja); el.remove(); };
  el.append(t, a, x);
  document.body.appendChild(el);
}
async function sprawdzAktualizacjeApk() {
  const mojaApk = apkWersja();
  if (!mojaApk) return; // zwykła przeglądarka — nic do sprawdzania
  try {
    // zapamiętana dostępna wersja pokazuje baner od razu, bez odpytywania API
    const pamietana = localStorage.getItem("apk_dostepna") || "";
    if (pamietana && porownajWersje(pamietana, mojaApk) > 0 &&
        pamietana !== localStorage.getItem("apk_omin")) {
      const u = localStorage.getItem("apk_url") || "https://github.com/wskakuj/forestly-go/releases/latest";
      banerAktualizacji(pamietana, u);
    }
    // GitHub odpytywany najwyżej raz na 6 h (limit 60 zapytań/h)
    const teraz = Date.now(), ostatni = +(localStorage.getItem("apk_check") || 0);
    if (teraz - ostatni < 6 * 60 * 60 * 1000) return;
    localStorage.setItem("apk_check", String(teraz));
    const r = await fetch("https://api.github.com/repos/wskakuj/forestly-go/releases/latest");
    if (!r.ok) return;
    const rel = await r.json();
    const najnowsza = (rel.tag_name || "").replace(/^v/, "");
    if (!najnowsza || porownajWersje(najnowsza, mojaApk) <= 0) {
      localStorage.removeItem("apk_dostepna"); return;
    }
    const apk = (rel.assets || []).find(a => a.name === "ForestlyGO.apk");
    const url = apk ? apk.browser_download_url : (rel.html_url || "");
    localStorage.setItem("apk_dostepna", najnowsza);
    localStorage.setItem("apk_url", url);
    if (najnowsza !== localStorage.getItem("apk_omin")) banerAktualizacji(najnowsza, url);
  } catch (e) { /* offline albo limit GitHuba — po cichu */ }
}

/* ---------- sync ---------- */
async function rysujSync() {
  const autor = await DB.metaGet("autor");
  $("#s-autor").textContent = autor || "—";
  const dir = await DB.metaGet("folder");
  $("#s-folder").textContent = dir ? (dir.nazwa || dir.name) : "nie wybrano";
  $("#btn-folder").textContent = dir ? "Zmień folder" : "Wybierz folder";
  $("#btn-folder").style.display = "";   /* zawsze widoczny — klik sam wyjaśnia ograniczenia */
  $("#s-wersja").textContent = (typeof WERSJA_APLIKACJI !== "undefined" ? WERSJA_APLIKACJI : "?");
  const sTryb = $("#s-tryb");
  if (sTryb) {
    /* APK serwuje stronę z korzenia (np. /index.html); strona w przeglądarce
       zawsze ma w ścieżce /forestly-go/ — po tym rozpoznajemy kontekst
       nawet wtedy, gdy mostek nie odpowiedział */
    const naStronie = location.pathname.indexOf("/forestly-go") === 0;
    const trybTekst = czyNatywnie()
      ? "APK (natywna)"
      : (naStronie ? "przeglądarka / PWA" : "APK — brak mostka!");
    sTryb.textContent = trybTekst;
    let nota = document.getElementById("s-tryb-nota");
    if (!czyNatywnie() && MOBILNY) {
      if (!nota) {
        nota = document.createElement("div");
        nota.id = "s-tryb-nota";
        nota.className = "s-notka";
        sTryb.parentElement.insertBefore(nota, sTryb.nextSibling);
      }
      nota.textContent = naStronie
        ? "Ten skrót strony działa w przeglądarce — dlatego folderu nie da się wskazać. " +
          "Zamknij i otwórz ikonę „ForestlyGO (APK)” z listy aplikacji: to zainstalowana aplikacja, " +
          "w niej wybór folderu i aktualizacje działają w aplikacji."
        : "Wygląda na to, że działa aplikacja natywna, ale jej mostek nie odpowiedział — " +
          "napisz mi o tym, poprowadzę przez naprawę.";
    } else if (nota) nota.remove();
  }
  const wsie = await DB.wpisyWsie();
  const wszystkie = await DB.wpisyAll();
  odswiezBackupKarte();
  const ncC = await DB.metaGet("nextcloud") || {};
  const pcC = await DB.metaGet("pcloud") || {};
  const gdC = await DB.metaGet("gdrive") || {};
  $("#s-chmury-status").innerHTML =
    '<div class="chm-w">' + (ncC.url && ncC.pass ? '<span class="chm-tak">✓</span>' : '<span class="chm-nie">✗</span>') + ' Nextcloud</div>' +
    '<div class="chm-w">' + (pcC.token ? '<span class="chm-tak">✓</span>' : '<span class="chm-nie">✗</span>') + ' pCloud</div>' +
    '<div class="chm-w">' + (gdC.refreshToken ? '<span class="chm-tak">✓</span>' : '<span class="chm-nie">✗</span>') + ' Dysk Google</div>';
  $("#s-pliki").innerHTML = wsie.length ? wsie.map(w => {
    const ile = wszystkie.filter(x => x.wies === w).length;
    const nazwa = XLSXIO.nazwaPliku(w, autor || "x");
    return `<div class="s-plik">
      <div class="ri-main"><b>${nazwa}</b><small>${ile} wpisów</small></div>
    </div>`;
  }).join("") : '<div class="s-notka">Brak wpisów — zacznij od zakładki „Nowy opis”.</div>';
  odswiezAppbar();
}
async function wczytajKonfigChmur() {
  const nc = await DB.metaGet("nextcloud") || {};
  $("#nc-url").value = nc.url || "https://agcezar.duckdns.org";
  $("#nc-user").value = nc.user || "retardino";
  $("#nc-pass").value = nc.pass || "";
  $("#nc-path").value = (nc.sciezka && nc.sciezka !== "Taksator") ? nc.sciezka : "Dysk QNAP WD/FORESTLY BAZA";
  const pc = await DB.metaGet("pcloud") || {};
  /* #pc-token nie istnieje od porządków w Sync (v1.0.20) — ten zapis
     wywalał całe wczytywanie konfiguracji chmur przy starcie */
  const pcToken = $("#pc-token"); if (pcToken) pcToken.value = pc.token || "";
  $("#pc-path").value = pc.path || "/Taksator";
  const pcStat = $("#pc-status");
  if (pcStat) pcStat.innerHTML = pc.token
    ? '<span class="chm-tak">✓</span> zalogowany jako <b>' + (pc.email || "?") + '</b> — serwer ' +
      (pc.host === "eapi.pcloud.com" ? "europejski (eapi)" : "amerykański (api)") +
      ', folder: ' + (pc.path || "/Taksator")
    : 'niezalogowany — wpisz e-mail i hasło pCloud i dotknij „Zaloguj”';
  const gd = await DB.metaGet("gdrive") || {};
  $("#gd-folder").value = gd.folder || "FORESTLY GO";
}
/* instalacja jako aplikacja: Chrome podpowiada, łapiemy i pokazujemy przycisk */
let odroczonaInstalacja = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  odroczonaInstalacja = e;
  const btn = document.getElementById("btn-instaluj");
  if (btn) btn.style.display = "inline-block";
});
window.addEventListener("appinstalled", () => {
  const btn = document.getElementById("btn-instaluj");
  if (btn) btn.style.display = "none";
  toast("Forestly GO zainstalowane ✓");
});
document.addEventListener("click", async e => {
  if (e.target.closest("#btn-instaluj") && odroczonaInstalacja) {
    odroczonaInstalacja.prompt();
    const w = await odroczonaInstalacja.userChoice;
    if (w && w.outcome === "accepted") CLOUDS.log("<b>zainstalowano</b> aplikację na urządzeniu");
    odroczonaInstalacja = null;
  }
});
$("#btn-folder").addEventListener("click", async () => {
  try {
    const dir = await wybierzFolder();
    if (!dir) return;   /* PWA na telefonie — komunikat już pokazany wyżej */
    await DB.metaSet("folder", dir);
    toast("Folder zapisany: " + (dir.nazwa || dir.name));
    rysujSync();
  } catch (e) {
    /* w APK podajemy powód, żeby wiedzieć co naprawić */
    toast("Nie udało się wybrać folderu" +
      (e && e.message ? " (" + String(e.message).slice(0, 80) + ")" : ""));
  }
});
$("#btn-nc-save").addEventListener("click", async () => {
  await DB.metaSet("nextcloud", { url: $("#nc-url").value.trim(), user: $("#nc-user").value.trim(),
    pass: $("#nc-pass").value, sciezka: $("#nc-path").value.trim() });
  toast("Nextcloud zapisany"); CLOUDS.log("<b>zapisano</b> konfigurację Nextcloud" +
    ($("#nc-path").value.trim() ? " — folder: " + $("#nc-path").value.trim() : ""));
  rysujSync(); resetujStatusPolaczenia();
});
$("#btn-pc-zaloguj").addEventListener("click", async () => {
  try {
    const r = await CLOUDS.pcloudZaloguj($("#pc-email").value.trim(), $("#pc-pass").value,
      $("#pc-kod") ? $("#pc-kod").value : "");
    await DB.metaSet("pcloud", { token: r.token, email: r.email, host: r.host,
      path: $("#pc-path").value.trim() || "/FORESTLY BAZA" });
    $("#pc-pass").value = "";
    if ($("#pc-kod")) $("#pc-kod").value = "";
    toast("Zalogowano do pCloud ✓ (" + r.email + ")");
    CLOUDS.log("<b>zalogowano</b> do pCloud — " + r.email +
      ", folder: " + ($("#pc-path").value.trim() || "/FORESTLY BAZA"));
    rysujSync(); resetujStatusPolaczenia();
  } catch (e) {
    toast(String(e.message || e));
    /* szczegóły (po jakim serwerze, jaki kod błędu) — do logu Sync,
       żeby przy następnym podejściu wiedzieć dokładnie co się stało */
    CLOUDS.log("pCloud <b>logowanie nie wyszło</b>: " + (e.message || e) +
      (e.szczegoly && e.szczegoly.length ? " — próby: " + e.szczegoly.join("; ") : ""));
  }
});
$("#btn-pc-save").addEventListener("click", async () => {
  const stara = await DB.metaGet("pcloud") || {};
  if (!stara.token) { toast("Najpierw zaloguj się do pCloud"); return; }
  await DB.metaSet("pcloud", { token: stara.token, email: stara.email, host: stara.host,
    path: $("#pc-path").value.trim() || "/FORESTLY BAZA" });
  toast("Folder zapisany"); CLOUDS.log("<b>zapisano</b> folder pCloud: " +
    ($("#pc-path").value.trim() || "/FORESTLY BAZA"));
  rysujSync(); resetujStatusPolaczenia();
});
/* Dysk Google: logowanie kontem użytkownika (OAuth + PKCE) */
/* Identyfikator klienta aplikacji ForestlyGO w Google Cloud — wpisany na stałe,
   pole w ustawieniach wypełnia się samo (można nadpisać własnym). */
const GD_CLIENT_ID = "1088294990937-jdpqjfio6mqfr3qf47t6iinrpq26camo.apps.googleusercontent.com";

/* Powrót z logowania Google: strona oauth.html otwiera forestlygo://oauth?code=...
   — Android przywraca aplikację, kod wymieniamy automatycznie, bez wklejania. */
if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
  Capacitor.Plugins.App.addListener("appUrlOpen", async (dane) => {
    try {
      const url = new URL(dane.url);
      const kod = url.searchParams.get("code");
      if (kod) {
        toast("Wróciłem z logowania Google — łączę…");
        await gdPolaczKod(kod);
      }
    } catch (e) { /* to nie był link logowania — ignorujemy */ }
  });
}

$("#btn-gd-login").addEventListener("click", async () => {
  const clientId = GD_CLIENT_ID;
  try {
    const url = await CLOUDS.gdriveLoginUrl(clientId);
    window.open(url, "_blank");
    toast("Otworzyłem Google — zaloguj się, aplikacja wróci sama");
  } catch (e) { toast("Nie mogę otworzyć logowania: " + e.message); }
});
async function gdPolaczKod(kod) {
  toast("Łączę z Google…");
  try {
    const r = await CLOUDS.gdriveDolaczKod(kod);
    await DB.metaSet("gdrive", { clientId: r.clientId, refreshToken: r.refreshToken,
      folder: $("#gd-folder").value.trim() || "FORESTLY GO" });
    rysujSync(); resetujStatusPolaczenia();   // ptaszek na zielono od razu
    toast("Połączono z Dyskiem Google ✓");
    CLOUDS.log("<b>Dysk Google</b> — zalogowano kontem Google");
    /* od razu sprawdzamy, czy wszystko działa — user widzi efekt bez klikania */
    try {
      const t = await CLOUDS.gdriveTest({ clientId: r.clientId, refreshToken: r.refreshToken,
        folder: $("#gd-folder").value.trim() || "FORESTLY GO" });
      toast("Dysk Google: zalogowany ✓ — folder: " + t.folder);
      CLOUDS.log("<b>Dysk Google OK</b> — folder: " + t.folder);
    } catch (e) { toast("Połączono, ale test: " + e.message); }
    return true;
  } catch (e) { toast(e.message); CLOUDS.log("Google błąd: " + e.message); return false; }
}

$("#btn-gd-save").addEventListener("click", async () => {
  const stary = await DB.metaGet("gdrive") || {};
  await DB.metaSet("gdrive", { clientId: stary.clientId || GD_CLIENT_ID,
    refreshToken: stary.refreshToken, folder: $("#gd-folder").value.trim() || "FORESTLY GO" });
  toast("Dysk Google zapisany"); CLOUDS.log("<b>zapisano</b> konfigurację Dysku Google — folder: " +
    ($("#gd-folder").value.trim() || "FORESTLY GO"));
  rysujSync(); resetujStatusPolaczenia();
});
$("#btn-nc-test").addEventListener("click", async () => {
  const cfg = { url: $("#nc-url").value.trim(), user: $("#nc-user").value.trim(), pass: $("#nc-pass").value };
  if (!cfg.url || !cfg.user || !cfg.pass) { toast("Wypełnij adres, login i hasło"); return; }
  toast("Łączę z Nextcloud…");
  try { await CLOUDS.nextcloudTest(cfg); toast("Nextcloud: połączenie OK ✓"); CLOUDS.log("<b>Nextcloud OK</b> — " + cfg.user + "@" + cfg.url); }
  catch (e) { toast(e.message); CLOUDS.log("Nextcloud błąd: " + e.message); }
});
$("#btn-pc-test").addEventListener("click", async () => {
  const cfg = { token: $("#pc-token").value.trim() };
  if (!cfg.token) { toast("Wklej token pCloud"); return; }
  toast("Łączę z pCloud…");
  try { const r = await CLOUDS.pcloudTest(cfg); toast("pCloud: OK ✓ (" + (r.email || "konto") + ")"); CLOUDS.log("<b>pCloud OK</b> — " + (r.email || "")); }
  catch (e) { toast(e.message); CLOUDS.log("pCloud błąd: " + e.message); }
});
$("#btn-gd-test").addEventListener("click", async () => {
  const stary = await DB.metaGet("gdrive") || {};
  const cfg = { clientId: stary.clientId || GD_CLIENT_ID,
    refreshToken: stary.refreshToken, folder: $("#gd-folder").value.trim() || "FORESTLY GO" };
  if (!cfg.clientId || !cfg.refreshToken) { toast("Najpierw zaloguj się z Google"); return; }
  toast("Łączę z Dyskiem Google…");
  try {
    const r = await CLOUDS.gdriveTest(cfg);
    toast("Dysk Google: OK ✓ — folder: " + r.folder);
    CLOUDS.log("<b>Dysk Google OK</b> — folder: " + r.folder);
  } catch (e) { toast(e.message); CLOUDS.log("Google błąd: " + e.message); }
});
async function odswiezBackupKarte() {
  const dir = await DB.metaGet("folder");
  let dane = await SESJA.odczytaj(dir).catch(() => null);
  let zrodlo = dir ? "folder" : "";
  if (!dane) { dane = await SESJA.odczytajOpfs(); zrodlo = dane ? "pamięć appki" : ""; }
  $("#s-backup").textContent = dane
    ? String(dane.zapisano || "").slice(0, 16).replace("T", " ") + " · " + (dane.wpisy || []).length + " wpisów · " + zrodlo
    : (dir ? "brak pliku w folderze" : "brak — zapisz teraz");
}
$("#btn-backup-teraz").addEventListener("click", async () => {
  const r = await SESJA.zapiszZLogiem();
  toast(r.ok ? "Backup zapisany ✓ (" + r.ile + " wpisów)" : "Najpierw wybierz folder (Urządzenie)");
  odswiezBackupKarte();
});
if (!window.showDirectoryPicker) {
  $("#btn-backup-plik").style.display = "inline-block";
  $("#btn-backup-teraz").textContent = "Zapisz teraz (pamięć appki)";
}
$("#btn-backup-plik").addEventListener("click", async () => {
  const ok = await SESJA.pobierz();
  if (!ok) toast("Najpierw podaj leśnika (kreator)");
});
/* jedno przywracanie: na komputerze wskazujesz folder, na telefonie
   od razu plik backupu (Android nie umie wskazywać folderów) */
$("#btn-backup-przywroc").addEventListener("click", async () => {
  if (window.showDirectoryPicker || jestFolderNatywny()) {
    try {
      const dir = await wybierzFolder();
      await DB.metaSet("folder", dir);
      const r = await SESJA.przywroc(dir);
      if (!r.ok) { toast("W tym folderze nie ma pliku backupu"); return; }
      toast("Sesja przywrócona: " + r.ile + " wpisów ✓");
      rysujWykaz(); odswiezAppbar();
    } catch (e) { toast("Nie udało się wybrać folderu"); }
  } else {
    window.__celPrzywrocenia = "sync";
    $("#plik-backup").click();
  }
});
$("#plik-backup").addEventListener("change", async e => {
  const plik = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!plik) return;
  const r = await SESJA.przywrocZPliku(plik);
  if (!r.ok) { toast(r.powod); return; }
  toast("Sesja przywrócona: " + r.ile + " wpisów ✓");
  CLOUDS.log("<b>przywrócono sesję</b> z pliku backupu — " + r.ile + " wpisów");
  if (window.__celPrzywrocenia === "onboarding") {
    window.__celPrzywrocenia = null;
    await zakonczOnboarding(false);
    await odswiezStart();
  } else {
    rysujWykaz(); odswiezAppbar();
  }
});
window.addEventListener("pagehide", () => { SESJA.zapisz(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) SESJA.zapisz(); });
$("#s-pliki").addEventListener("click", async e => {
  const bw = e.target.closest("[data-wyslij-wies]");
  if (bw) { await wyslijWies(bw.dataset.wyslijWies); return; }
  const bz = e.target.closest("[data-zapisz-wies]");
  if (bz) {
    const wies = bz.dataset.zapiszWies;
    const autor = await DB.metaGet("autor") || "x";
    const wpisy = await DB.wpisyByWies(wies);
    const r = await XLSXIO.zapiszDoFolderu(wies, autor, wpisy);
    toast(r.folder ? "Zapisano do folderu: " + r.nazwa :
        r.tryb === "dokumenty" ? "Zapisano w Dokumentach: " + r.nazwa :
        r.tryb === "udostepnij" ? "Plik gotowy — wybierz, gdzie zapisać" :
        r.tryb === "blad" ? "Nie udało się zapisać: " + (r.powod || "?") :
        "Plik pobrany: " + r.nazwa);
    CLOUDS.log("<b>zapisano lokalnie</b> " + r.nazwa + (r.folder ? " (folder)" : " (pobieranie)"));
  }
});
$("#btn-wyslij-wszystko").addEventListener("click", async () => {
  const btn = $("#btn-wyslij-wszystko");
  if (btn) { btn.disabled = true; btn.textContent = "Synchronizuję…"; }
  try {
    const wsie = await DB.wpisyWsie();
    if (!wsie.length) { toast("Brak wpisów do wysłania"); return; }
    const autor = await DB.metaGet("autor") || "x";
    let lokalnie = 0;
    for (const w of wsie) {
      /* kopia na telefonie (jeśli wybrany folder / pobieranie) */
      try {
        const wpisy = await DB.wpisyByWies(w);
        const r = await XLSXIO.zapiszDoFolderu(w, autor, wpisy);
        if (r.tryb !== "blad") { lokalnie++; CLOUDS.log("<b>zapisano lokalnie</b> " + r.nazwa + (r.folder ? " (folder)" : " (pobieranie)")); }
        else CLOUDS.log("⚠ zapis lokalny nieudany: " + (r.powod || "?"));
      } catch (e) { /* brak folderu — pomijamy kopię lokalną */ }
      /* chmury */
      await wyslijWies(w, true);
    }
    if (lokalnie) toast("Kopie na telefonie: " + lokalnie + " · szczegóły w dzienniku");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Synchronizuj"; }
  }
});
async function wyslijWies(wies, cicho) {
  const btn = document.querySelector(`[data-wyslij-wies="${wies}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    const r = await CLOUDS.synchronizujWies(null, wies);
    const ok = Object.values(r.raport).filter(v => v === "ok").length;
    const bledy = Object.entries(r.raport).filter(([k, v]) => v !== "ok");
    CLOUDS.log(`<b>wysłano ${r.nazwa}</b> — ${r.ile} wpisów, chmury OK: ${ok}/${ok + bledy.length}`);
    bledy.forEach(([k, v]) => CLOUDS.log("⚠ " + k + ": " + v));
    toast(ok ? "Wysłano ✓ (" + ok + " chmur" + (ok > 1 ? "y" : "") + ", " + r.ile + " wpisów)" : "Błąd wysyłki — szczegóły w dzienniku");
    SESJA.zapiszZLogiem();
  } catch (e) {
    CLOUDS.log("⚠ wysyłka nieudana: " + e.message);
    toast("Wysyłka nie udała się: " + e.message);
  }
  rysujSync();
}

/* ---------- nawigacja ---------- */
$("#bnav").addEventListener("click", e => {
  const bn = e.target.closest(".bn");
  if (!bn) return;
  if (bn.id === "bn-wies") { otworzWyborWsi(); return; }
  if (bn.dataset.tab === "form" && !trybEdycji && !stan.wies && aktywnaWies) {
    /* „Nowy opis” otwiera formularz z ostatnio wpisywaną wsią */
    stan.wies = aktywnaWies;
    uzupelnijForm(); rysuj();
  }
  przelaczTab(bn.dataset.tab);
});

/* ---------- wybór wsi (przycisk „Wieś” w nawigacji) ---------- */
async function otworzWyborWsi() {
  const box = $("#wies-wyb");
  const wsie = await DB.wpisyWsie();
  const wszystkie = await DB.wpisyAll();
  let html = wsie.map(w => {
    const ile = wszystkie.filter(x => x.wies === w).length;
    return '<button type="button" class="wies-poz' + (aktywnaWies === w ? " wybrana" : "") + '" data-wies="' + w + '">' +
      "<b>" + w + (aktywnaWies === w ? " ✓" : "") + "</b><small>" + ile + " wpis" + (ile === 1 ? "" : "ów") + "</small></button>";
  }).join("");
  if (!wsie.length) html = '<div class="s-notka">Jeszcze nie ma żadnej wsi — pierwszą nazwiesz przy pierwszym opisie.</div>';
  html += '<button type="button" class="wies-poz nowa" id="wies-nowa2"><b>+ Nowa wieś</b><small>nazwę wpiszesz przy pierwszym opisie</small></button>';
  box.innerHTML = html;
  box.querySelectorAll(".wies-poz[data-wies]").forEach(p =>
    p.addEventListener("click", () => wybierzWies(p.dataset.wies)));
  const n2 = box.querySelector("#wies-nowa2");
  if (n2) n2.addEventListener("click", () => {
    aktywnaWies = ""; localStorage.removeItem("aktywnaWies");
    trybEdycji = null; stan = nowyStan(); uzupelnijForm(); rysuj();
    $("#okno-wies").classList.remove("on");
    odswiezListeWsi(); odswiezAppbar(); przelaczTab("form");
    toast("Nowa wieś — wpisz nazwę w pierwszym polu");
  });
  $("#okno-wies").classList.add("on");
}
function wybierzWies(w) {
  aktywnaWies = w;
  localStorage.setItem("aktywnaWies", w);
  trybEdycji = null;
  stan = nowyStan();
  stan.wies = w;
  uzupelnijForm(); rysuj();
  $("#okno-wies").classList.remove("on");
  odswiezListeWsi(); odswiezAppbar();
  przelaczTab("form");
  toast("Wieś: " + w + " — nowe opisy będą tu wpisywane");
}
/* zabezpieczone jak okno braków — przy zmieszanych wersjach plików
   po aktualizacji w tle elementy mogą jeszcze nie istnieć */
if (document.getElementById("okno-wies")) {
  $("#wies-zamknij").addEventListener("click", () => $("#okno-wies").classList.remove("on"));
  $("#okno-wies").addEventListener("click", e => {
    if (e.target.id === "okno-wies") $("#okno-wies").classList.remove("on");
  });
}

/* ---------- podpowiedzi wsi (własna rozwijana lista) ---------- */
let znaneWsie = [];
async function odswiezListeWsi() { znaneWsie = await DB.wpisyWsie(); }
function bindAutoWsie() {
  const inp = $("#in-wies"), lista = $("#auto-wsie");
  if (!inp || !lista) return;
  const pokaz = () => {
    const q = inp.value.trim().toLowerCase();
    const traf = znaneWsie.filter(w => w.toLowerCase().includes(q)).slice(0, 6);
    if (!q || !traf.length || (traf.length === 1 && traf[0].toLowerCase() === q)) { lista.classList.remove("on"); return; }
    lista.innerHTML = traf.map(w => `<div class="auto-poz" data-w="${w}">${w}</div>`).join("");
    lista.classList.add("on");
  };
  const schowaj = () => setTimeout(() => lista.classList.remove("on"), 140);
  inp.addEventListener("input", pokaz);
  inp.addEventListener("focus", pokaz);
  inp.addEventListener("blur", schowaj);
  inp.addEventListener("keydown", e => {
    if (e.key === "Escape") { lista.classList.remove("on"); e.preventDefault(); }
  });
  lista.addEventListener("mousedown", e => {
    const poz = e.target.closest(".auto-poz");
    if (!poz) return;
    e.preventDefault(); // nie gub fokusu zanim wybierzemy
    inp.value = poz.dataset.w;
    lista.classList.remove("on");
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".auto-box")) lista.classList.remove("on");
  });
}
bindAutoWsie();

/* ---------- sprawdzanie aktualizacji (ręczny przycisk w Sync) ---------- */
async function sprawdzAktualizacjeRecznie() {
  const btn = $("#btn-sprawdz-aktualizacje");
  const bylTekst = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Sprawdzam…"; }
  const wroc = () => { if (btn) { btn.disabled = false; btn.textContent = bylTekst; } };
  const moja = apkWersja() || (typeof WERSJA_APLIKACJI !== "undefined" ? String(WERSJA_APLIKACJI).replace(/^v/, "") : "");
  if (!moja) { toast("Nie znam wersji aplikacji"); wroc(); return; }
  try {
    // wymuszamy świeże sprawdzenie — pomijamy 6-godzinny limit
    localStorage.setItem("apk_check", "0");
    const r = await fetch("https://api.github.com/repos/wskakuj/forestly-go/releases/latest");
    if (!r.ok) { toast("GitHub nie odpowiedział (" + r.status + ")"); wroc(); return; }
    const rel = await r.json();
    const najnowsza = (rel.tag_name || "").replace(/^v/, "");
    if (!najnowsza) { toast("Nie znalazłem wydań na GitHubie"); wroc(); return; }
    if (porownajWersje(najnowsza, moja) <= 0) {
      localStorage.removeItem("apk_dostepna");
      const baner = document.getElementById("baner-apk"); if (baner) baner.remove();
      toast("Masz najnowszą wersję: " + moja + " ✓");
      CLOUDS.log("sprawdzono aktualizacje — bieżąca " + moja + " jest najnowsza");
      wroc(); return;
    }
    // jest nowsza wersja
    localStorage.setItem("apk_dostepna", najnowsza);
    const apk = (rel.assets || []).find(a => a.name === "ForestlyGO.apk");
    const url = apk ? apk.browser_download_url : (rel.html_url || "");
    localStorage.setItem("apk_url", url);
    CLOUDS.log("<b>dostępna nowa wersja</b> " + najnowsza + " (masz " + moja + ")");
    if (!apkWersja()) {
      // przeglądarka / PWA — aktualizuje się sama przez service workera
      if ("serviceWorker" in navigator && !NATYWNIE) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
      }
      toast("Nowa wersja " + najnowsza + " — zamknij i otwórz aplikację, sama się podmieni");
      wroc(); return;
    }
    // APK — pytamy, pobieramy, podpowiadamy instalację
    if (!confirm("Jest nowa wersja: " + najnowsza + " (masz " + moja + ").\n\nPobrać i zainstalować?")) {
      localStorage.setItem("apk_omin", najnowsza); wroc(); return;
    }
    if (!url || !apk) { window.open(rel.html_url || "https://github.com/wskakuj/forestly-go/releases/latest", "_blank"); wroc(); return; }
    if (NATYWNIE) {
      localStorage.removeItem("apk_omin");
      const baner = document.getElementById("baner-apk"); if (baner) baner.remove();
      CLOUDS.log("pobieram aktualizację " + najnowsza + " w aplikacji");
      await pobierzIZainstalujApk(url, najnowsza);
      wroc(); return;
    }
    if (btn) btn.textContent = "Pobieram " + najnowsza + "…";
    const rr = await fetch(url);
    if (!rr.ok) { toast("Nie udało się pobrać (" + rr.status + ")"); wroc(); return; }
    const blob = await rr.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ForestlyGO-" + najnowsza + ".apk";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    localStorage.removeItem("apk_omin");
    const baner = document.getElementById("baner-apk"); if (baner) baner.remove();
    CLOUDS.log("pobrano instalator " + najnowsza + " — otwórz go z powiadomienia (lub z Pobranych), żeby zainstalować");
    toast("Pobrano ✓ — dotknij powiadomienia (albo plik w Pobranych), żeby zainstalować", 6000);
  } catch (e) {
    toast("Nie udało się sprawdzić: " + (e && e.message ? e.message : "błąd sieci"));
  }
  wroc();
}
$("#btn-sprawdz-aktualizacje").addEventListener("click", sprawdzAktualizacjeRecznie);

/* ---------- start ---------- */
async function start() {
  renderChips();
  const autor = await DB.metaGet("autor");
  if (!autor) { onbKrok = 0; renderOnb(); }
  else {
    $("#onboarding").classList.remove("on");
    const ostatniaWies = await DB.metaGet("ostatniaWies");
    if (ostatniaWies) stan.wies = ostatniaWies;
    przelaczTab("wsie");
  }
  await odswiezListeWsi();
  // dokończenie instalacji, jeśli była pobrana, a brakowało zgody systemowej
  const apkCache = localStorage.getItem("apk_cache_uri");
  if (czyNatywnie() && apkCache) {
    const Akt = window.Capacitor.Plugins.Aktualizacje;
    const wersjaApk = localStorage.getItem("apk_cache_wersja") || "";
    if (Akt) {
      const wyn = await Akt.zainstaluj({ uri: apkCache }).catch(() => null);
      if (wyn && wyn.wymagaZgody) {
        /* nadal brak zgody — czekamy na użytkownika */
      } else {
        localStorage.removeItem("apk_cache_uri");
        CLOUDS.log("instalator aktualizacji " + wersjaApk + " gotowy");
      }
    }
  }
  bindOnbKeys();
  odswiezAppbar(); rysuj(); rysujWykaz(); wczytajKonfigChmur(); sprawdzAktualizacjeApk();
  setTimeout(() => {
  if (!("serviceWorker" in navigator) || czyNatywnie()) return;
    // przeładuj od razu, gdy NOWA wersja aplikacji przejmuje kontrolę
    // (ale nie przy pierwszej instalacji — wtedy przejmowanie jest normalne)
    const mialKontrolera = !!navigator.serviceWorker.controller;
    let przeladowano = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!mialKontrolera || przeladowano) return;
      przeladowano = true; location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
    // Chrome sam sprawdza aktualizacje SW najwyżej raz na 24 h —
    // wymuszamy sprawdzanie przy KAŻDYM otwarciu aplikacji.
    navigator.serviceWorker.ready.then(r => r.update()).catch(() => {});
  }, 1500);

  $("#in-wies").addEventListener("change", async e => {
    await DB.metaSet("ostatniaWies", e.target.value);
  });
}
async function odswiezStart() {
  await odswiezListeWsi();
  odswiezAppbar(); rysuj(); rysujWykaz(); wczytajKonfigChmur();
}
function bindOnbKeys() {
  // obsługa Enter w kreatorze — delegowana
  $("#onb").addEventListener("keydown", e => {
    if (e.key === "Enter" && onbKrok === 0) onbDalej();
  });
}
start();

/* ---------- autotest (uruchamiany z ?test=1) ---------- */
if (new URLSearchParams(location.search).get("test")) {
  window.__TEST__ = async function () {
    const wyniki = [];
    const sprawdz = (nazwa, warunek, extra) => {
      wyniki.push((warunek ? "OK  " : "FAIL") + " " + nazwa + (extra ? " | " + extra : ""));
    };
    try {
      // 1. onboarding
      $("#onb-autor").value = "Mietek Kowalski";
      await onbDalej();
      sprawdz("onboarding krok 1 -> 2", onbKrok === 1);
      // 2. formularz
      stan.wies = "Lasków";
      stan.siedlisko = "LMśw"; stan.panujacy = "So"; stan.drugi = "Db"; stan.udzialPanujacy = 8; stan.udzialDrugi = 2;
      stan.dzialki = "5/501, 8/254";
      stan.zwarcie = "umiark."; stan.podsz = ["krusz", "jrz"]; stan.podszProc = 50;
      rysuj();
      sprawdz("skład z rozprzęgniętymi gatunkami", OPTAX.sklad(stan) === "8So;2Db", OPTAX.sklad(stan));
      const stary = { panujacy: "So", drugi: "Db", udzialDrugi: 3 };
      sprawdz("stare wpisy (bez udzialPanujacy) bez zmian", OPTAX.sklad(stary) === "7So;3Db", OPTAX.sklad(stary));
      sprawdz("podglad OPTAX", $("#pv-line").textContent.includes("LMśw") &&
        $("#pv-line").textContent.includes("nr-y.Rej. 5/501"), $("#pv-line").textContent.replace(/\n/g, " / "));
      // 3. zapis wpisu
      await zapiszWpis();
      const po = await DB.wpisyAll();
      sprawdz("wpis zapisany w IndexedDB", po.length === 1 && po[0].wies === "Lasków" && po[0].udzialPanujacy === 8);
      // 4. XLSX
      const blob = await XLSXIO.blobZwpisow(po);
      sprawdz("XLSX zbudowany", blob.size > 3000, blob.size + " B");
      // 5. edycja wpisu (poprawka)
      const zapisany = po[0];
      trybEdycji = zapisany.id;
      stan = Object.assign(nowyStan(), zapisany); stan.udzialDrugi = 3;
      await zapiszWpis();
      const po2 = await DB.wpisyAll();
      sprawdz("poprawka nadpisuje wpis", po2.length === 1 && po2[0].udzialDrugi === 3);
      // 6. WebDAV mock (serwer na :8123)
      await DB.metaSet("nextcloud", { url: "http://localhost:8123", user: "mietek", pass: "tokensekret" });
      const wynik = await CLOUDS.synchronizujWies(null, "Lasków");
      sprawdz("synchronizacja WebDAV", wynik.raport.nextcloud === "ok", JSON.stringify(wynik.raport));
      const po3 = await DB.wpisyAll();
      sprawdz("wpisy oznaczone jako wyslane", po3.every(w => w.status === "wyslany"));
      // 7. wykluczenie XLSX z folderu (bez uchwytu) — tylko rozmiar
      const nazwa = XLSXIO.nazwaPliku("Lasków", "Mietek Kowalski");
      sprawdz("nazwa pliku", nazwa === "Taksator_Mietek_Kowalski_Laskow.xlsx", nazwa);
    } catch (e) {
      wyniki.push("FAIL wyjatek: " + (e && e.message));
    }
    $("#testout").textContent = wyniki.join("\n");
    document.title = wyniki.some(w => w.startsWith("FAIL")) ? "TESTY-FAIL" : "TESTY-OK";
  };
  window.addEventListener("load", () => setTimeout(window.__TEST__, 300));
}

/* ---------- zakładki chmur: otwarta jedna naraz ---------- */
document.querySelectorAll(".chmura").forEach(d => {
  d.addEventListener("toggle", () => {
    if (d.open) document.querySelectorAll(".chmura").forEach(x => { if (x !== d) x.open = false; });
  });
});

/* ---------- okno ustawień chmur ---------- */
$("#btn-chmury-ustawienia").addEventListener("click", () => {
  $("#okno-chmur").classList.add("on");
});
$("#chmury-zamknij").addEventListener("click", () => {
  $("#okno-chmur").classList.remove("on");
});
$("#okno-chmur").addEventListener("click", e => {
  if (e.target.id === "okno-chmur") $("#okno-chmur").classList.remove("on");
});

/* ---------- samonaprawa wersji ----------
   Przy aktualizacji w tle service worker potrafi podać pliki z DWÓCH wersji
   naraz (np. nowy app.js + stary index.html). Każdy nasłuch jest już
   zabezpieczony na brak elementu, więc aplikacja wystartuje — ale żeby nie
   pracować na miksie, porównujemy wersję HTML ze wersją skryptów i przy
   niezgodności przeładowujemy stronę RAZ (service worker poda wtedy już
   komplet plików z jednej wersji). */
(function samonaprawaWersji() {
  try {
    const html = window.__htmlWersja;
    const js = (typeof WERSJA_APLIKACJI !== "undefined" ? String(WERSJA_APLIKACJI) : "").replace(/^v/, "");
    if (html && js && html !== js && !sessionStorage.getItem("fg_przeladowanie")) {
      sessionStorage.setItem("fg_przeladowanie", "1");
      location.replace(location.href);
    }
  } catch (e) { /* nic — to tylko zabezpieczenie */ }
})();
