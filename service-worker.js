const CACHE_NAME = "bep-thu-ngan-v5";
const APP_FILES = [
  "./bep.html",
  "./quay.html",
  "./firebase-config.js",
  "./pwa-install.js",
  "./manifest.json",
  "./quay-manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const fallbackPage = url.pathname.endsWith("/quay.html") ? "./quay.html" : "./bep.html";
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(fallbackPage)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
    )
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (_error) {
    data = { body: event.data?.text() || "Bếp vừa gửi thông báo." };
  }

  const cashierUrl = new URL(data.url || "./quay.html", self.registration.scope).href;
  const iconUrl = new URL("./icon-192.png", self.registration.scope).href;
  event.waitUntil(
    self.registration.showNotification(data.title || "Thông báo từ bếp", {
      body: data.body || "Bếp vừa gửi thông báo.",
      icon: iconUrl,
      badge: iconUrl,
      tag: data.tag || `bep-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [220, 100, 220],
      data: { url: cashierUrl }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || new URL("./quay.html", self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).pathname.endsWith("/quay.html") && "focus" in client) {
          if ("navigate" in client) await client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});
