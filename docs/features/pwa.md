# PWA manifest & offline cache

Makes the site installable ("Add to Home Screen") on phones — manifest +
icons + theme color, plus a small hand-written service worker for offline
reading of recently visited pages. Since standalone mode strips the
browser chrome, the public layout also ships a fixed bottom tab bar
(`src/components/MobileNav.tsx`, `.mobile-tabbar` in `globals.css`)
padded for `env(safe-area-inset-bottom)`, which is only non-zero on iOS
thanks to `viewportFit: "cover"` in the root layout's `viewport` export.
The tab bar and the burger drawer show below `lg` (992px) — see
"Навигация: брейкпоинты" in [../design-system.md](../design-system.md).

- **`src/app/manifest.ts`** — Next's `MetadataRoute.Manifest` file
  convention, served at `/manifest.webmanifest`. Name, short description,
  standalone display mode, dark background/theme color matching the app's
  own dark theme, and two icon sizes. **Single-language, English** — the
  site's default. There is one manifest for the whole site and it lives
  at a URL with no language prefix (`localeHref` doesn't add one, and the
  browser fetches the file on its own), so `proxy` hands that request the
  default language and there is nothing here to switch. On top of that
  the browser remembers the name at install time: reading the locale
  cookie here would mean the home-screen shortcut is labelled in whatever
  language happened to be selected that day.
- **`public/icons/icon-192.png`** / **`icon-512.png`** — растеризуются
  sharp-ом из `public/icons/logo.svg` (тот же знак, что в
  `src/components/Logo.tsx` и `src/app/icon.svg`). Знак переделан
  2026-09-18 по референсу владельца (иконка 1.1.1.1): скруглённый
  квадрат, дуги, которые закручиваются и пересекаются, в оранжевой
  гамме прежнего знака (персиковый завиток, фирменная оранжевая
  основа, дуги к красно-оранжевому `#e8431f`), и белая монограмма
  **MBH** — короткая марка бренда; полное имя MyBLHub остаётся в
  вордмарке рядом со знаком и в домене. Радужные версии (пастельная,
  тёплая, в порядке прайд-флага, инвертированная маской внутри букв)
  владелец посмотрела и вернулась к оранжевой. Буквы нарисованы
  контурами, не шрифтом: в SVG-файлах веб-шрифта нет, и текст поплыл
  бы. Пересобрать PNG: `node -e` со sharp (`resize(192/512)` из svg,
  density 300) — так же сделан `public/apple-touch-icon.png` (180).
- **`src/app/layout.tsx`** — `icons` in `generateMetadata()` (favicon +
  apple-touch-icon, both pointing at the 192px icon) and a separate `viewport` export for
  `themeColor` (this Next.js version deprecated `metadata.themeColor` in
  favor of a dedicated `viewport` export — see
  [architecture.md](../architecture.md)).

## Offline cache (service worker)

**`public/sw.js`** (plain JS, no build step), registered once per app
load by **`src/components/ServiceWorkerRegistrar.tsx`**. `/sw.js` is in
`src/proxy.ts`'s `PUBLIC_PATHS` so the browser can fetch it without a
session cookie. Strategy per request type (same-origin GET only):

- **Navigations** — network-first, successful responses copied into the
  page cache; offline falls back to the cached copy, so recently visited
  pages (афиша, план поездки) stay readable without a connection.
- **`/_next/static/`** — cache-first, no entry limit (filenames are
  content-hashed by Next, so entries never go stale; the cache is
  cleared wholesale on a version bump).
- **`/uploads/`** — cache-first with an entry limit: after storing a new
  response the cache is trimmed to **150 entries**, evicting the oldest
  first (FIFO via `cache.keys()` insertion order). Keeps the cache from
  growing without bound and lets replaced images cycle out.
- **`/uploads/tickets/` and `/files/`** — **never cached**: ticket files
  (uploaded via `src/app/api/upload-ticket/route.ts`) are private
  per-user documents and must not linger in a shared browser cache.

Cache names are versioned via the `CACHE_VERSION` constant in `sw.js`
(currently `v2` → `pages-v2` / `static-v2` / `uploads-v2`). The
`activate` handler deletes every cache whose name isn't in the current
known set — so bumping `CACHE_VERSION` is the way to invalidate
everything cached under an old policy.

## The gotcha this ran into

`/manifest.webmanifest` and everything under `/icons/` need to be
fetchable **without a session cookie** — the browser/OS requests them on
its own, and a logged-out visitor on the public landing page should still
get a working install prompt. `src/proxy.ts`'s login gate originally
didn't know about either path, so both came back as login-page HTML
instead of the real manifest/icon. Fixed by adding
`/manifest.webmanifest` to `PUBLIC_PATHS` and `icons/` to the matcher's
exclusion list, the same way `uploads/` was already excluded for the same
reason. If you add another asset path under `/public/` that needs to be
fetched cookie-free, it needs the same treatment.
