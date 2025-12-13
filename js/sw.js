const CACHE = "escale-v5";

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

  "./assets/img/annonce.png",
  "./assets/img/info.png",
  "./assets/img/messe.png",
  "./assets/img/prochainesactivites.png",
  "./assets/img/proposer.png",
  "./assets/img/repas.png",
  "./assets/img/service.png",
  "./assets/img/soireediscussion.png",
  "./assets/img/sortie.png",

  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

// Install: pré-cache
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// Activate: purge anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

// Fetch: Network-first pour HTML (toujours à jour), Cache-first pour le reste
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // on ne gère que notre origine
  if (url.origin !== self.location.origin) return;

  // HTML -> network first
  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

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

  // CSS/JS/images/json -> cache first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});

