// KoalaTree Service Worker — Network-First Strategy
// Always fetch fresh content, cache as fallback

const CACHE_NAME = "koalatree-v3";

// Pre-cache essential assets on install
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activate immediately, don't wait
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "/koda-portrait.png",
        "/kiki-portrait.png",
        "/api/icons/logo.png",
        "/api/icons/icon-192.png",
      ])
    )
  );
});

// Clean old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // Take control of all pages immediately
  );
});

// Network-first: always try fresh, fall back to cache
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API calls and auth — never cache these
  if (
    request.url.includes("/api/") ||
    request.url.includes("/sign-in") ||
    request.url.includes("/sign-up") ||
    request.url.includes("clerk")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for offline fallback
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: serve from cache
        return caches.match(request);
      })
  );
});
