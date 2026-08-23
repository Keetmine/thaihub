// Оффлайн-кэш MyBLHub (Г7): network-first для навигаций с откатом в кэш
// последних посещённых страниц — афиша/план поездки остаются читаемыми
// без сети (на концерте связь часто плохая). Статика Next кэшируется
// cache-first: имена файлов контентно-стабильные. Картинки /uploads/ —
// тоже cache-first, но с лимитом записей (FIFO): имена там обычно
// уникальные (UUID / basename импорта), но замена файла под тем же
// именем возможна, а без лимита кэш рос бы неограниченно — лимит и
// бамп версии кэша вымывают устаревшие копии.
// Приватные файлы (/uploads/tickets/ — билеты) не кэшируются вовсе.
//
// При изменении политики кэширования бампайте CACHE_VERSION: activate
// удалит все кэши со старыми именами.
const CACHE_VERSION = "v2";
const PAGE_CACHE = `pages-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const UPLOAD_CACHE = `uploads-${CACHE_VERSION}`;
const KNOWN_CACHES = [PAGE_CACHE, STATIC_CACHE, UPLOAD_CACHE];

// Максимум записей в кэше /uploads/ — после записи нового ответа кэш
// подрезается до этого размера, удаляя самые старые записи (FIFO).
const UPLOAD_CACHE_LIMIT = 150;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !KNOWN_CACHES.includes(name)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// Подрезает кэш до limit записей. Cache.keys() отдаёт записи в порядке
// вставки, так что удаление с начала — это FIFO.
async function trimCache(cache, limit) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) {
    await cache.delete(keys[i]);
  }
}

// Кэш → сеть; успешный ответ кладём в cacheName (с подрезкой до limit).
function cacheFirst(req, cacheName, limit) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            cache.put(req, copy).then(() => {
              if (limit) return trimCache(cache, limit);
            });
          }
          return res;
        }),
    ),
  );
}

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

  // Приватные файлы — билеты и брони — никогда не кэшируем.
  if (url.pathname.startsWith("/uploads/tickets/") || url.pathname.startsWith("/files/")) {
    return;
  }

  // Статика Next: кэш → сеть, без лимита (чистится сменой версии кэша).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Картинки /uploads/: кэш → сеть с лимитом записей.
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(cacheFirst(req, UPLOAD_CACHE, UPLOAD_CACHE_LIMIT));
  }
});
