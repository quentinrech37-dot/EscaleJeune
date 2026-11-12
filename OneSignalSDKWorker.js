// OneSignalSDKWorker.js (à la racine)

// 1) OneSignal (OBLIGATOIRE)
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// 2) Votre SW de cache (copiez-collez ici le contenu actuel de sw.js)
const CACHE = "aumonerie-v164";

const ASSETS = [
  "/",
  "/index.html",
  "/messe.html",
  "/annonces.html",
  "/calendrier.html",
  "/mentions.html",
  "/outils.html",
  "/cuisine.html",
  "/liturgie.html",
  "/avent.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/agenda.js",
  "/js/cuisine.js",
  "/js/cuisine-calc.js",
  "/js/liturgie.js",
  "/js/liturgie-calc.js",
  "/js/avent.js",
  "/manifest.webmanifest",
  "/assets/img/favicon.png",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png",
  "/assets/img/annonce.png",
  "/assets/img/info.png",
  "/assets/img/messe.png",
  "/assets/img/prochainesactivites.png",
  "/assets/img/proposer.png",
  "/assets/img/repas.png",
  "/assets/img/service.png",
  "/assets/img/soiree.png",
  "/assets/img/sortie.png",
  "/data/annonces.json",
  "/data/calendrier.json",
  "/data/recettes.json",
  "/data/avent.json",
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("/index.html");
      }
    })());
    return;
  }

  // Données et agenda : réseau d'abord (jamais de données périmées), cache en secours
  if (url.pathname.startsWith("/data/") || url.pathname.endsWith(".ics")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) || Response.error();
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
