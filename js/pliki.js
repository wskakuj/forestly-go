/* ForestlyGO — pomost do aplikacji natywnej (Capacitor).
   W przeglądarce (PWA na stronie) niczego nie zmienia — wszystkie
   funkcje mają zwykłą przeglądarkową ścieżkę zapasową.
   W APK (pliki wbudowane w aplikację) przejmuje zapis plików
   przez natywne API i udostępnia wersję aplikacji. */
"use strict";

const NATYWNIE = !!(window.Capacitor && window.Capacitor.isNativePlatform &&
  window.Capacitor.isNativePlatform());

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
