/* ===================== EKSPORT XLSX =====================
   Z wpisów budujemy skoroszyt (SheetJS) per obręb/wieś i zapisujemy:
   1) do folderu wskazanego na telefonie (File System Access API),
   2) a przy braku folderu — zwykłe pobieranie pliku. */

const XLSXIO = (() => {

  const KOLUMNY = [
    ["obreb", w => w.wies || ""],
    ["autor", w => w.autor || ""],
    ["siedlisko", w => w.siedlisko || ""],
    ["sklad", w => OPTAX.sklad(w)],
    ["wiek_min", w => w.wiekPrzec ? w.wiekPrzec - OPTAX.krok(w.wiekPrzec) : ""],
    ["wiek_maks", w => w.wiekPrzec ? w.wiekPrzec + OPTAX.krok(w.wiekPrzec) : ""],
    ["wiek_przec", w => w.wiekPrzec || ""],
    ["pjd_gatunki", w => (w.pjd || []).join(", ")],
    ["pjd_wiek_przec", w => w.pjdWiekPrzec || ""],
    ["zwarcie", w => w.zwarcie || ""],
    ["podszyt", w => (w.podsz || []).join(", ")],
    ["podszyt_proc", w => w.podszProc != null ? w.podszProc : ""],
    ["nr_obrebow", w => w.obreby || ""],
    ["nr_wydzielenia", w => Array.isArray(w.dzialki) ? w.dzialki.join(", ") : (w.dzialki || "")],
    ["lat", w => w.lat != null ? w.lat : ""],
    ["lon", w => w.lon != null ? w.lon : ""],
    ["loc_zrodlo", w => w.locZrodlo || ""],
    ["wys_m", w => w.elWys || ""],
    ["pier_cm", w => w.elPier || ""],
    ["kl_wieku", w => w.wiekPrzec ? OPTAX.klasaWieku(w.wiekPrzec) : ""],
    ["bon", w => w.elBon || ""],
    ["zad", w => w.elZad || ""],
    ["miaz_m3ha", w => w.elMiaz || ""],
    ["wskazanie", w => w.wskTyp || ""],
    ["wsk_pow_ha", w => w.wskPow || ""],
    ["wsk_miaz_m3", w => w.wskMiaz || ""],
    ["opis_gotowy", w => OPTAX.linie(w).join("\n")],
    ["timestamp", w => w.timestamp || ""],
    ["wersja", w => w.wersja || 1],
    /* v1.0.60: wpisy usunięte w aplikacji zostają w Excelu (w chmurze)
       z dopiskiem, kiedy je usunięto — historia się nie gubi */
    ["usuniety", w => w.usuniety ? "USUNIĘTY " + String(w.usuniety).slice(0, 10) : ""]
  ];

  function nazwaPliku(wies, autor) {
    const czysc = s => String(s || "").trim()
      .replace(/[ąćęłńóśźż]/g, c => ({ "ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z" }[c]))
      .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "wpisy";
    return czysc(wies) + ".xlsx";
  }

  async function blobZwpisow(wpisy) {
    const aoa = [KOLUMNY.map(k => k[0])];
    for (const w of wpisy) aoa.push(KOLUMNY.map(k => k[1](w)));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Taksacja");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* zapis do folderu (jeśli wybrany) — true jeśli zapisano do folderu */
  async function zapiszDoFolderu(wies, autor, wpisy) {
    const blob = await blobZwpisow(wpisy);
    const nazwa = nazwaPliku(wies, autor);
    const dir = await DB.metaGet("folder");
    if (dir && dir.uri && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Pliki) {
      /* natywny zapis przez SAF (wtyczka Pliki) */
      try {
        const dane = await new Promise((ok, blad) => {
          const fr = new FileReader();
          fr.onload = () => ok(String(fr.result).split(",")[1] || "");
          fr.onerror = blad;
          fr.readAsDataURL(blob);
        });
        await Capacitor.Plugins.Pliki.zapisz({
          uri: dir.uri, nazwa,
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", dane });
        return { ok: true, folder: true, nazwa };
      } catch (e) { /* odmowa/błąd — spadamy do zapiszPlik */ }
    }
    if (dir && dir.queryPermission) {
      try {
        let perm = await dir.queryPermission({ mode: "readwrite" });
        if (perm !== "granted" && dir.requestPermission) perm = await dir.requestPermission({ mode: "readwrite" });
        if (perm === "granted") {
          const fh = await dir.getFileHandle(nazwa, { create: true });
          const w = await fh.createWritable();
          await w.write(blob); await w.close();
          return { ok: true, folder: true, nazwa };
        }
      } catch (e) { /* brak gestu / odrzucone — spadamy do pobierania */ }
    }
    const r = await zapiszPlik(nazwa, blob);
    return { ok: r.ok, folder: false, tryb: r.tryb, nazwa };
  }

  return { KOLUMNY, nazwaPliku, blobZwpisow, zapiszDoFolderu };
})();