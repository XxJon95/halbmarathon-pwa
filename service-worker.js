const CACHE_NAME = "halbmarathon-cache-v4";

const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("fetch", event => {
  if (event.request.url.includes("docs.google.com")) {
    // Nicht cachen – immer frisch laden
    event.respondWith(fetch(event.request));
  } else {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
  }
});



