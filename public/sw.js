// Оффлайн-кэш MyBLHub (Г7): network-first для навигаций с откатом в кэш
// последних посещённых страниц — афиша/план поездки остаются читаемыми
// без сети (на концерте связь часто плохая). Статика Next и картинки
// кэшируются cache-first: имена файлов контентно-стабильные.
const PAGE_CACHE = "pages-v1";
const ASSET_CACHE = "assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Навигации: сеть → кэш (устаревшая копия лучше, чем ничего).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Статика/картинки: кэш → сеть.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
