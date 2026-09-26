/* ===================== BAZA DANYCH (IndexedDB) =====================
   Dwa magazyny: 'wpisy' (opisy taksacyjne) i 'meta' (konfiguracja:
   autor, uchwyt folderu, dane logowania do chmur). */

const DB = (() => {
  const NAZWA = "taksator-db";
  const WERSJA = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAZWA, WERSJA);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("wpisy")) db.createObjectStore("wpisy", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) { return open().then(db => db.transaction(store, mode).objectStore(store)); }
  function wrap(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

  /* ---- wpisy ---- */
  const wpisyAll = () => tx("wpisy", "readonly").then(s => wrap(s.getAll()));
  const wpisyPut = w => tx("wpisy", "readwrite").then(s => wrap(s.put(w)));
  const wpisyDelete = id => tx("wpisy", "readwrite").then(s => wrap(s.delete(id)));
  const wpisyByWies = async wies => (await wpisyAll()).filter(w => w.wies === wies);
  const wpisyWsie = async () => [...new Set((await wpisyAll()).map(w => w.wies).filter(Boolean))];

  /* ---- meta ---- */
  const metaGet = k => tx("meta", "readonly").then(s => wrap(s.get(k)));
  const metaSet = (k, v) => tx("meta", "readwrite").then(s => wrap(s.put(v, k)));

  return { open, wpisyAll, wpisyPut, wpisyDelete, wpisyByWies, wpisyWsie, metaGet, metaSet };
})();
