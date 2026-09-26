/* Taksator terenowy — service worker: powłoka aplikacji offline + kafle mapy */
const WERSJA = "forestlygo-v12";
const SZKIELET = [
  "./", "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/db.js", "./js/optax.js", "./js/xlsx-io.js", "./js/clouds.js", "./js/session.js", "./js/wersja.js", "./js/app.js",
  "./vendor/xlsx.full.min.js",
  "./vendor/leaflet.js", "./vendor/leaflet.css",
  "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(WERSJA).then(c => c.addAll(SZKIELET)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== WERSJA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // kafle satelitarne Esri — najpierw cache, potem sieć (mapa działa offline w zasiegu zapisanych kafli)
  if (/arcgisonline\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.open(WERSJA + "-tiles").then(async c => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        try {
          const resp = await fetch(e.request);
          if (resp.ok) c.put(e.request, resp.clone());
          return resp;
        } catch (err) { return hit || Response.error(); }
      })
    );
    return;
  }

  // własne pliki — cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(WERSJA).then(async c => {
        const hit = await c.match(e.request, { ignoreSearch: true });
        if (hit) {
          // odśwież w tle
          fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); }).catch(() => {});
          return hit;
        }
        try {
          const resp = await fetch(e.request);
          if (resp.ok) c.put(e.request, resp.clone());
          return resp;
        } catch (err) { return Response.error(); }
      })
    );
  }
});
