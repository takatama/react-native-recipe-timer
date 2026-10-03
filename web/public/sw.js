const CACHE = "kitchenflow-v2-1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(["/", "/icon.svg", "/manifest.webmanifest"]);
      const html = await (await cache.match("/")).text();
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g),
      ].map((match) => match[1]);
      await cache.addAll([...new Set(assets)]);
    }),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("kitchenflow-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put("/", copy)),
            );
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches
                .open(CACHE)
                .then((cache) => cache.put(event.request, copy)),
            );
          }
          return response;
        }),
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window" })
      .then((clients) =>
        clients[0] ? clients[0].focus() : self.clients.openWindow("/"),
      ),
  );
});
