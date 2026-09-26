/* ===================== BACKUP SESJI =====================
   Cała sesja (autor + wszystkie wpisy + ustawienia, BEZ haseł)
   zapisuje się jako plik JSON w wybranym folderze na telefonie.
   Po wyczyszczeniu danych przeglądarki (np. iOS po tygodniu)
   aplikacja podnosi się z tego pliku: wskazujesz folder raz,
   a wszystkie wpisy wracają na miejsce. */

const SESJA = (() => {
  const WERSJA = 1;
  const PREFIKS = "ForestlyGO_sesja_";
  let _zapisWToku = false;

  function czysc(s) {
    return String(s || "").trim()
      .replace(/[ąćęłńóśźż]/g, c => ({ "ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z" }[c]))
      .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  }

  async function zbudujDane() {
    const autor = await DB.metaGet("autor") || "";
    const wpisy = await DB.wpisyAll();
    const ostatniaWies = await DB.metaGet("ostatniaWies") || "";
    return {
      wersja: WERSJA,
      aplikacja: "Forestly GO",
      zapisano: new Date().toISOString(),
      autor, ostatniaWies, wpisy
    };
  }

  /* zapis: do folderu (jeśli wybrany) + ZAWSZE do OPFS (prywatna pamięć
     przeglądarki — przeżywa restarty i zamknięcie aplikacji) */
  async function zapisz(handle) {
    if (_zapisWToku) return { ok: false, powod: "zapis w toku" };
    _zapisWToku = true;
    try {
      const dane = await zbudujDane();
      if (!dane.autor) return { ok: false, powod: "brak autora" };
      let wynik = { ok: false, powod: "brak folderu", ile: dane.wpisy.length };
      handle = handle || await DB.metaGet("folder");
      if (handle && handle.getFileHandle) {
        try {
          const fh = await handle.getFileHandle(PREFIKS + czysc(dane.autor) + ".json", { create: true });
          const w = await fh.createWritable();
          await w.write(JSON.stringify(dane, null, 1));
          await w.close();
          wynik = { ok: true, ile: dane.wpisy.length, nazwa: fh.name, folder: true };
        } catch (e) { /* brak zgody / gestu — zostaje OPFS */ }
      }
      // OPFS — działa wszędzie (także Firefox, Safari, Samsung Internet)
      try {
        const root = await navigator.storage.getDirectory();
        const fh = await root.getFileHandle("sesja.json", { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(dane));
        await w.close();
        if (!wynik.ok) wynik = { ok: true, ile: dane.wpisy.length, nazwa: fh.name, opfs: true };
      } catch (e) { /* może być zablokowane — trudno */ }
      return wynik;
    } finally {
      _zapisWToku = false;
    }
  }

  /* odczyt z OPFS (gdy nie ma folderu) */
  async function odczytajOpfs() {
    try {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle("sesja.json");
      const dane = JSON.parse(await (await fh.getFile()).text());
      if (!dane || !Array.isArray(dane.wpisy)) return null;
      return dane;
    } catch (e) { return null; }
  }

  /* pobranie pliku backupu (przeglądarki bez Folder API) */
  async function pobierz() {
    const dane = await zbudujDane();
    if (!dane.autor) return false;
    const blob = new Blob([JSON.stringify(dane, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = PREFIKS + czysc(dane.autor) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return true;
  }

  /* przywrócenie z pliku pobranego wcześniej (input type=file) */
  async function przywrocZPliku(plik) {
    let dane;
    try { dane = JSON.parse(await plik.text()); } catch (e) { return { ok: false, powod: "to nie jest plik backupu" }; }
    if (!dane || !Array.isArray(dane.wpisy) || !dane.autor) return { ok: false, powod: "to nie jest plik backupu" };
    return wprowadzDane(dane);
  }

  /* szuka pliku backupu w folderze (dowolnego leśnika) */
  async function znajdzPlik(handle) {
    if (!handle || !handle.values) return null;
    for await (const fh of handle.values()) {
      if (fh.name && fh.name.startsWith(PREFIKS) && fh.name.endsWith(".json")) return fh;
    }
    return null;
  }

  async function odczytaj(handle) {
    const fh = await znajdzPlik(handle);
    if (!fh) return null;
    try {
      const plik = await fh.getFile();
      const dane = JSON.parse(await plik.text());
      if (!dane || !Array.isArray(dane.wpisy)) return null;
      return dane;
    } catch (e) { return null; }
  }

  /* przywrócenie: autor, wpisy (nowsze wygrywa), ostatnia wieś.
     Haseł do chmur NIE zapisujemy w backupie — po przywróceniu
     trzeba je raz wpisać ponownie w zakładce Sync. */
  /* wspólne wprowadzanie danych backupu do bazy */
  async function wprowadzDane(dane) {
    if (dane.autor) await DB.metaSet("autor", dane.autor);
    if (dane.ostatniaWies) await DB.metaSet("ostatniaWies", dane.ostatniaWies);
    const istniejace = await DB.wpisyAll();
    const mapa = new Map(istniejace.map(w => [w.id, w]));
    for (const w of dane.wpisy) {
      const stary = mapa.get(w.id);
      if (stary && String(stary.timestamp || "") >= String(w.timestamp || "")) continue;
      mapa.set(w.id, w);
      await DB.wpisyPut(w);
    }
    return { ok: true, autor: dane.autor, ile: dane.wpisy.length, zapisano: dane.zapisano };
  }

  async function przywroc(handle) {
    let dane = await odczytaj(handle);
    if (!dane) dane = await odczytajOpfs();  // w folderze brak — może w OPFS coś zostało
    if (!dane) return { ok: false, powod: "w folderze nie ma pliku backupu" };
    return wprowadzDane(dane);
  }

  /* zapis z logiem i toastem — używany po każdej zmianie danych */
  async function zapiszZLogiem() {
    const r = await zapisz();
    if (r.ok) CLOUDS.log("<b>backup sesji</b> — " + r.ile + " wpisów → " + r.nazwa);
    return r;
  }

  return { zapisz, zapiszZLogiem, odczytaj, odczytajOpfs, pobierz, przywroc, przywrocZPliku, PREFIKS };
})();
