const CACHE = "escale-v6";

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
  "./data/repas.json",

  // Images (tout est chez vous dans assets/img)
  "./assets/img/annonce.png",
  "./assets/img/info.png",
  "./assets/img/messe.png",
  "./assets/img/prochainesactivites.png",
  "./assets/img/proposer.png",
  "./assets/img/repas.png",
  "./assets/img/service.png",
  "./assets/img/soiree.png",
  "./assets/img/sortie.png",

  // Icônes PWA / logo
  "./assets/img/favicon.png",
  "./assets/img/icon-192.png",
  "./assets/img/icon-512.png",
  "./assets/img/icon-1200.png",

  // Background si utilisé
  "./assets/img/besancon.png"
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  // HTML: network-first (pour éviter l'effet Ctrl+F5)
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Autres assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});
