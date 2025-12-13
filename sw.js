const CACHE = "escale-v2";
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
  "./js/data.js",
  "./manifest.webmanifest",
  "./data/annonces.json",
  "./data/calendrier.json",
  "./data/repas.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).catch(() => caches.match("./index.html")))
  );
});
