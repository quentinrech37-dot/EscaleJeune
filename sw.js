// sw.js (à la racine)
const CACHE = "escale-v57";

const ASSETS = [
  "./",
  "./index.html",
  "./annonces.html",
  "./calendrier.html",
  "./repas.html",
  "./proposer.html",
  "./mentions.html",

  "./css/styles.css",
  "./js/app.js",

  "./manifest.webmanifest",

  "./assets/img/favicon.png",
  "./assets/img/icon-192.png",
  "./assets/img/icon-512.png",

  "./assets/img/annonce.png",
  "./assets/img/info.png",
  "./assets/img/messe.png",
  "./assets/img/prochainesactivites.png",
  "./assets/img/proposer.png",
  "./assets/img/repas.png",
  "./assets/img/service.png",
  "./assets/img/soiree.png",
  "./assets/img/sortie.png",

  "./data/annonces.json",
  "./data/calendrier.json",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

// HTML : network-first (pour voir les mises à jour)
// assets/json : cache-first
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // uniquement dans le scope GitHub Pages
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached;
    }
  })());
});
