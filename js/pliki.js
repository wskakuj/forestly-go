/* ForestlyGO — pomost do aplikacji natywnej (Capacitor).
   W przeglądarce (PWA na stronie) niczego nie zmienia — wszystkie
   funkcje mają zwykłą przeglądarkową ścieżkę zapasową.
   W APK (pliki wbudowane w aplikację) przejmuje zapis plików
   przez natywne API i udostępnia wersję aplikacji. */
"use strict";

function czyNatywnie() {
  /* mostek Capacitora bywa wstrzykiwany dopiero w chwilę po starcie strony —
     dlatego sprawdzamy zawsze na żywo, nie tylko raz przy ładowaniu */
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform());
  } catch (e) { return false; }
}
const NATYWNIE = czyNatywnie();

/* Wersja APK: w wydaniu workflow ustawia js/wersja.js = tag, więc w natywnej
   aplikacji WERSJA_APLIKACJI to zawsze wersja zainstalowanego APK. */
if (NATYWNIE) {
  try { window.APK_WERSJA_NATYWNA = String(WERSJA_APLIKACJI || "").replace(/^v/, ""); }
  catch (e) { window.APK_WERSJA_NATYWNA = ""; }
}

/* blob -> base64 (bez limitów długości argumentu) */
function blobNaB64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("nie udało się odczytać pliku"));
    r.readAsDataURL(blob);
  });
}

/* Jedyny punkt zapisu plików na urządzenie.
   - przeglądarka: pobieranie (jak dotychczas)
   - APK: najpierw folder Dokumenty (publiczny); jeśli system odmówi —
     zapis w pamięci aplikacji + arkusz udostępniania (Zapisz do Plików,
     Dysk, WhatsApp…). */
async function zapiszPlik(nazwa, blob) {
  if (!NATYWNIE) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nazwa;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return { ok: true, tryb: "pobieranie" };
  }
  const b64 = await blobNaB64(blob);
  const FS = window.Capacitor.Plugins.Filesystem;
  try {
    const w = await FS.writeFile({ path: nazwa, directory: "DOCUMENTS", data: b64 });
    return { ok: true, tryb: "dokumenty", uri: w && w.uri };
  } catch (e1) {
    try {
      const w = await FS.writeFile({ path: nazwa, directory: "CACHE", data: b64 });
      const SH = window.Capacitor.Plugins.Share;
      if (SH) {
        await SH.share({
          title: nazwa,
          text: "Zapisz lub wyślij plik",
          url: w.uri,
          dialogTitle: "Zapisz plik"
        });
        return { ok: true, tryb: "udostepnij" };
      }
      return { ok: true, tryb: "cache", uri: w && w.uri };
    } catch (e2) {
      return { ok: false, tryb: "blad", powod: (e2 && e2.message) || (e1 && e1.message) || "?" };
    }
  }
}

/* Aktualizacja w aplikacji: natywne pobieranie APK (od v1.0.41 — pobieranie
   w JS padało na CORS GitHuba i wyrzucało do przeglądarki), pasek postępu
   zdarzeniami z wtyczki, po pobraniu od razu systemowy instalator.
   W przeglądarce (PWA) po prostu otwiera stronę pobierania. */
async function pobierzIZainstalujApk(url, wersja) {
  if (!czyNatywnie()) { window.open(url, "_blank"); return; }
  const Akt = window.Capacitor.Plugins.Aktualizacje;
  if (Akt && Akt.pobierz) {
    const nak = document.createElement("div");
    nak.id = "apk-nakladka";
    nak.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);" +
      "display:flex;align-items:center;justify-content:center;";
    nak.innerHTML = '<div style="background:#141a22;border:1px solid rgba(45,212,167,.45);' +
      'border-radius:14px;padding:22px;width:min(85vw,340px);font:600 14px system-ui,sans-serif;' +
      'color:#eef2f6;text-align:center">Pobieram ForestlyGO ' + wersja +
      '…<div style="height:8px;background:#0b0f14;border-radius:4px;margin-top:14px;overflow:hidden">' +
      '<i id="apk-pasek" style="display:block;height:100%;width:0;' +
      'background:linear-gradient(135deg,#2dd4a7,#38a3f8);transition:width .15s"></i></div>' +
      '<small style="display:block;margin-top:10px;color:#aeb9c6" id="apk-info">łączę z GitHubem…</small></div>';
    document.body.appendChild(nak);
    const pasek = () => nak.querySelector("#apk-pasek");
    const info = () => nak.querySelector("#apk-info");
    try {
      let sluchacz = null;
      try {
        sluchacz = await Akt.addListener("postep", d => {
          if (d && d.procent !== undefined && pasek()) pasek().style.width = d.procent + "%";
          if (info()) info().textContent =
            ((d && d.pobrano ? d.pobrano : 0) / 1048576).toFixed(1) + " MB" +
            (d && d.calkowite ? " / " + (d.calkowite / 1048576).toFixed(1) + " MB" : "") +
            (d && d.procent !== undefined ? " · " + d.procent + "%" : "");
        });
      } catch (e) { /* starszy bridge — pobierze bez paska, ale pobierze */ }
      const w = await Akt.pobierz({ url: url, wersja: wersja });
      if (sluchacz && sluchacz.remove) { try { await sluchacz.remove(); } catch (e) {} }
      if (pasek()) pasek().style.width = "100%";
      if (info()) info().textContent = "pobrano — otwieram instalację…";
      const wyn = await Akt.zainstaluj({ uri: w.uri });
      nak.remove();
      localStorage.setItem("apk_cache_uri", w.uri);
      localStorage.setItem("apk_cache_wersja", wersja);
      if (wyn && wyn.wymagaZgody) {
        toast("Włącz „Zezwalaj z tego źródła” (raz) i wróć — dokończę instalację", 7000);
      } else {
        localStorage.removeItem("apk_cache_uri");
      }
    } catch (e) {
      nak.remove();
      toast("Pobieranie nie wyszło (" + ((e && e.message) || "?") + ") — otwieram w przeglądarce", 5000);
      window.open(url, "_blank");
    }
    return;
  }
  /* starsza budowa APK: pobieranie w JS (może paść na CORS) — zostaje jako zapas */
  const nak = document.createElement("div");
  nak.id = "apk-nakladka";
  nak.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);" +
    "display:flex;align-items:center;justify-content:center;";
  nak.innerHTML = '<div style="background:#141a22;border:1px solid rgba(45,212,167,.45);' +
    'border-radius:14px;padding:22px;width:min(85vw,340px);font:600 14px system-ui,sans-serif;' +
    'color:#eef2f6;text-align:center">Pobieram ForestlyGO ' + wersja +
    '…<div style="height:8px;background:#0b0f14;border-radius:4px;margin-top:14px;overflow:hidden">' +
    '<i id="apk-pasek" style="display:block;height:100%;width:0;' +
    'background:linear-gradient(135deg,#2dd4a7,#38a3f8);transition:width .15s"></i></div>' +
    '<small style="display:block;margin-top:10px;color:#aeb9c6" id="apk-info">łączenie…</small></div>';
  document.body.appendChild(nak);
  const pasekEl = () => nak.querySelector("#apk-pasek");
  const infoEl = () => nak.querySelector("#apk-info");
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const calosc = +(r.headers.get("Content-Length") || 0);
    const czytnik = r.body.getReader();
    const czesci = [];
    let pobrano = 0;
    while (true) {
      const { done, value } = await czytnik.read();
      if (done) break;
      czesci.push(value); pobrano += value.length;
      if (calosc) {
        if (pasekEl()) pasekEl().style.width = Math.round(pobrano / calosc * 100) + "%";
        if (infoEl()) infoEl().textContent =
          (pobrano / 1048576).toFixed(1) + " / " + (calosc / 1048576).toFixed(1) + " MB";
      } else if (infoEl()) infoEl().textContent = (pobrano / 1048576).toFixed(1) + " MB";
    }
    const blob = new Blob(czesci);
    const b64 = await blobNaB64(blob);
    const FS = window.Capacitor.Plugins.Filesystem;
    const w = await FS.writeFile({ path: "ForestlyGO-" + wersja + ".apk", directory: "CACHE", data: b64 });
    if (pasekEl()) pasekEl().style.width = "100%";
    const wyn = await Akt.zainstaluj({ uri: w.uri });
    nak.remove();
    localStorage.setItem("apk_cache_uri", w.uri);
    localStorage.setItem("apk_cache_wersja", wersja);
    if (wyn && wyn.wymagaZgody) {
      toast("Włącz „Zezwalaj z tego źródła” (raz) i wróć — dokończę instalację", 7000);
    } else {
      localStorage.removeItem("apk_cache_uri");
    }
  } catch (e) {
    nak.remove();
    toast("Pobieranie w aplikacji nie wyszło (" + (e.message || "?") + ") — otwieram w przeglądarce", 5000);
    window.open(url, "_blank");
  }
}
