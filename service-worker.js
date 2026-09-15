const CACHE_VERSION = "eghtesadyar-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./service-worker.js"
];

// وابستگی خارجی موجود در HTML
const EXTERNAL_RUNTIME_ASSETS = [
  "https://cdn.tailwindcss.com"
];

// -----------------------------
// Install
// -----------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);

      // فایل‌های محلی فقط در صورت موجود بودن Cache شوند.
      // نبودن یکی از فایل‌ها نباید باعث شکست نصب Service Worker شود.
      await Promise.all(
        LOCAL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, {
              cache: "no-cache"
            });

            if (response.ok) {
              await cache.put(url, response.clone());
            }
          } catch (error) {
            console.warn("PWA cache skipped:", url, error);
          }
        })
      );

      self.skipWaiting();
    })()
  );
});

// -----------------------------
// Activate
// -----------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith("eghtesadyar-") &&
              cacheName !== STATIC_CACHE &&
              cacheName !== RUNTIME_CACHE
          )
          .map((cacheName) => caches.delete(cacheName))
      );

      await self.clients.claim();
    })()
  );
});

// -----------------------------
// Fetch
// -----------------------------
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // فقط درخواست‌های GET
  if (request.method !== "GET") {
    return;
  }

  const requestURL = new URL(request.url);
  const isSameOrigin = requestURL.origin === self.location.origin;

  // --------------------------------------------------
  // فایل‌های خارجی:
  // در Cache اولیه قرار نمی‌گیرند.
  // بعد از اولین دریافت موفق آنلاین، در Runtime Cache ذخیره می‌شوند.
  // --------------------------------------------------
  const isTailwindCDN =
    requestURL.href === "https://cdn.tailwindcss.com";

  if (isTailwindCDN) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);

          if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
          }

          return networkResponse;
        } catch (error) {
          return new Response("", {
            status: 503,
            statusText: "Offline"
          });
        }
      })
    );

    return;
  }

  // --------------------------------------------------
  // فایل‌های محلی:
  // Cache First → Network → ذخیره در Cache
  // --------------------------------------------------
  if (isSameOrigin) {
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);

          // فقط پاسخ‌های موفق را ذخیره کن
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(request, networkResponse.clone());
          }

          return networkResponse;
        } catch (error) {
          // برای navigation اگر آفلاین بود، index.html را برگردان
          if (request.mode === "navigate") {
            const fallback =
              (await caches.match("./index.html")) ||
              (await caches.match("./"));

            if (fallback) {
              return fallback;
            }
          }

          return new Response("Offline", {
            status: 503,
            statusText: "Offline"
          });
        }
      })()
    );
  }
});

// -----------------------------
// Message: skip waiting
// -----------------------------
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});