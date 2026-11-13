// Offline/cache behavior is paused until its scope is agreed.
const OFFLINE_FEATURE_ENABLED = false;
const SHELL_CACHE = "graduation-monitor-shell-v1";
const CDN_CACHE = "graduation-monitor-cdn";
const APP_FILES = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./students.html",
  "./student.html",
  "./import-export.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./icons/app-icon.svg",
  "./icons/app-icon-192.png",
  "./icons/app-icon-512.png",
  "./icons/apple-touch-icon.png",
  "./css/styles.css",
  "./Binusian_logolightmode.png",
  "./Binusian_logodarkmode.png",
  "./js/pwa.js",
  "./js/config.js",
  "./js/data.js",
  "./js/dashboard.js",
  "./js/engine.js",
  "./js/errors.js",
  "./js/import-export.js",
  "./js/report.js",
  "./js/student.js",
  "./js/students.js",
  "./js/supabase-data.js",
  "./js/supabase.js",
  "./js/theme.js",
  "./js/ui.js",
  "./js/utils.js",
];

self.addEventListener("install", (event) => {
  if (!OFFLINE_FEATURE_ENABLED) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(APP_FILES.map((path) => new Request(new URL(path, self.registration.scope))))
    )
  );
});

self.addEventListener("activate", (event) => {
  if (!OFFLINE_FEATURE_ENABLED) {
    // Caching stays off, but the worker itself must stay registered so the app
    // keeps meeting the installability requirements of Chrome/Edge Android.
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("graduation-monitor-"))
            .map((key) => caches.delete(key))
        )
      )
    );
    return;
  }
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("graduation-monitor-shell-") && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!OFFLINE_FEATURE_ENABLED) return;
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (!OFFLINE_FEATURE_ENABLED) return;
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request).catch(async () =>
          (await caches.match(request, { ignoreSearch: true })) ||
          (await caches.match(new URL("./offline.html", self.registration.scope))) ||
          caches.match(new URL("./index.html", self.registration.scope))
        )
      );
    } else {
      event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request))
      );
    }
    return;
  }

  // Cache only CDN module assets needed to render the app, never Supabase data/API calls.
  if (url.hostname !== "cdn.jsdelivr.net") return;
  const cachePromise = caches.open(CDN_CACHE);
  const refresh = cachePromise.then((cache) => fetch(request).then((response) => {
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && response.type !== "opaque" && /javascript|ecmascript|css|font/i.test(contentType)) {
        return cache.put(request, response.clone()).then(() => response, (error) => {
          console.warn("Penyimpanan aset CDN gagal:", error);
          return response;
        });
      }
      return response;
    }));
  event.waitUntil(refresh.catch((error) => console.warn("Pembaruan aset CDN gagal:", error)));
  event.respondWith(
    cachePromise
      .then((cache) => cache.match(request))
      .then((cached) => cached || refresh)
  );
});
