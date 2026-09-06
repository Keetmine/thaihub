# blscene.com importer

[blscene.com](https://blscene.com/where-were-they-filmed-bl-shows-a-z/)
publishes an A–Z index of BL dramas, each with its own "where was X
filmed" page listing filming locations (name, area/city, a Google Maps
link, usually a photo). Public, plain HTML, no anti-bot blocking —
scrapable with a normal `fetch` + `cheerio`, no headless browser needed
*except* to resolve short Google Maps links (see below).

## Files

- **`src/lib/blscene.ts`** — pure scraping, no DB access: `fetchBlsceneIndex()`
  (parses the A–Z list into `{title, year, url}[]`), `scrapeBlsceneDrama(url)`
  (parses one drama page into title/year/poster/synopsis/MyDramaList
  link/locations), `resolveMapsCoords(url, browser)` (Google Maps link →
  `{lat, lng}`). Kept free of DB access so it's importable from both the
  Next app and a standalone script.
- **`src/lib/blsceneImport.ts`** — the DB-writing orchestration:
  `importScrapedDrama` (create a new `Drama` + link its locations),
  `syncNewDramasFromBlscene` (diff the index against what's already in the
  DB, import what's missing, refresh what's already there — see below),
  `refreshBlsceneLocations` (the refresh-only half of the same sweep, no
  new-drama import — used by the admin button below). The script and the
  admin button intentionally call different functions now (see "Admin
  button" below for why). Both sweeps take an optional `runId`: when the
  caller wraps them in an `ImportRun`, they call `checkImportCancelled`
  before each show, so the admin's «Остановить» button stops the sweep
  after the current drama — already imported dramas and their locations
  stay (see [admin-panel.md](admin-panel.md), «Импорты»). Without a
  `runId` (the standalone script) the check is a no-op.
- **`scripts/import-blscene.ts`** — one-off backfill
  (`npx tsx scripts/import-blscene.ts`), used for the initial bulk import
  of the whole index and for catching up on new shows blscene adds later
  — `syncNewDramasFromBlscene`'s import+refresh sweep, same as before.
- **Admin button** — «Проверить актуальный список» в карточке
  «blscene: новые локации съёмок» на **`/admin/imports`**
  (`imports/BlsceneLocationsSyncButton.tsx` → `syncBlsceneLocations`
  server action in `src/app/admin/(protected)/locations/actions.ts`),
  for catching newly added filming locations on already-imported
  dramas' pages. Кнопка переехала со страницы локаций: там она стояла
  без объяснений над списком и терялась, а по смыслу это импорт —
  теперь рядом с остальными и с подробным описанием того, что именно
  она делает. Прогон пишется в журнал импортов (`logImportRun`, kind
  `blscene`) — поэтому его видно в списке запусков и **можно
  остановить** кнопкой «Остановить»: обход замечает флаг между
  сериалами и выходит, уже найденные локации остаются. Deliberately
  scoped to locations only — new-drama importing from blscene stays a
  script-only operation (`scripts/import-blscene.ts`), so this button
  can't be used to bulk-create dramas by accident.

## Dedup: matching by URL, not title

**A drama's on-page title (what actually gets stored as `Drama.title`)
can differ from the A–Z index's link text** — e.g. the index lists
"Fourever You Part 2: Beside The Sky" but the page itself titles it just
"Beside The Sky". Comparing the index title against stored `Drama.title`
therefore doesn't reliably detect "already imported", and re-running the
sync would create duplicates forever for exactly the shows where the two
titles disagree.

Fix: `Drama.blsceneUrl` (unique, nullable) stores the exact source URL a
drama was imported from. `syncNewDramasFromBlscene` builds its
already-imported set primarily from `blsceneUrl`, falling back to a
title match only for dramas that don't have one yet (i.e. added manually
through the admin form, not via this importer). See
`src/lib/blsceneImport.ts` for the exact matching logic.

*(This is also the actual fix for a real incident: repeated sync runs
before this fix created several sets of triplicate `Drama` rows for the
title-mismatched shows. If you ever see duplicate dramas again, check
`Drama.blsceneUrl` is actually being set on new imports before assuming
it's a new bug — and see [duplicates.md](duplicates.md) for the general
cleanup tool.)*

## Locations that don't match anything else: refresh pass

`syncNewDramasFromBlscene` (the script's sweep) does two passes:

1. **Import** — index entries with no matching `Drama` (by URL or title)
   get scraped and created fresh via `importScrapedDrama`.
2. **Refresh** — index entries that *do* already have a matching `Drama`
   (по ссылке ИЛИ по названию) get re-scraped too, via
   `refreshScrapedDrama`: metadata fields
   (title/year/poster/synopsis/MyDramaList link) are updated to whatever's
   on the page now, and any locations that have been added to that page
   since the last sync get linked (already-linked locations are left
   alone — `linkScrapedLocations` is a no-op for names that already
   resolve to an existing `Location` row linked to that drama). This means
   a full sync run always re-fetches every drama's page, not just new
   ones — expect it to take a few minutes, not seconds.

**Совпал по названию, но без ссылки — тоже обновляем** (баг, пойманный
владельцем 2026-09-06 на «You Maniac»). Сериал, заведённый другим
импортом (обычно MDL), проваливался между двумя списками: в «импорт» его
не пускала защита от дублей по названию, в «обновление» — пустое
`blsceneUrl`. Итог: страница blscene не открывалась ни разу, и локации
не приезжали — таких сериалов нашлось шесть. Теперь оба прохода ищут
запись и по названию тоже, а `refreshScrapedDrama` заодно проставляет
`blsceneUrl`, так что со следующего прогона сериал обычный. Живая
проверка: у «You Maniac» стало 15 локаций (12 заведено, 3 переиспользовано),
плюс догнались Match Point, Unlucky Bae, Bad Buddy и ещё шесть.

Там же поправлено: `mydramalistUrl` теперь только ДОБАВЛЯЕТСЯ. Раньше
поле писалось со страницы blscene как есть, и у сериала, заведённого с
MDL, пустое значение затирало нашу ссылку — а по ней работает весь
MDL-импорт.

**Раз в день по расписанию** (просьба владельца 2026-09-06): задача
`blscene-locations` на `/admin/schedule` («Локации blscene») запускает
тот же второй проход, что и кнопка на `/admin/locations`, и пишет в тот
же журнал (`kind: blscene`) — на вкладке задачи видны и ночные прогоны,
и ручные. Новые места заводятся сразу в каталог: очереди на проверку
тут нет, источник свой и проверенный.

`refreshBlsceneLocations` (the admin button's sweep) is just pass 2 —
same `refreshScrapedDrama` call, same re-fetch-every-page cost, but
skipping pass 1 entirely so it can never create a new `Drama`.

## Photos are stored locally

Neither `Location.photoUrl` nor `Drama.posterUrl` keeps a blscene.com
URL: `linkScrapedLocations`, `importScrapedDrama` and
`refreshScrapedDrama` all run the scraped image through
`downloadRemoteImage(url, "blscene")` before writing, so the file lives
in `public/uploads/blscene/`. One flat folder for both fields, same as
`uploads/tmdb/` — blscene's own filenames are long and unique enough
that a location photo can't collide with a poster. A failed download
never blocks the import (the helper returns the original URL and logs a
warning), and a refresh pass is cheap because the file is already on
disk. See "Local image storage" in [tmdb-import.md](tmdb-import.md) for
the general rule; the 492 rows imported before this was fixed are moved
over by `scripts/localize-remote-images.ts`.

## Location dedup + coordinate resolution

Locations are deduped by exact name (`prisma.location.findFirst({where:
{name}})`) before creating a new row — the same real place legitimately
shows up across multiple dramas. Coordinates are only resolved for
genuinely new `Location` rows (`resolveMapsCoords`), not re-resolved for
existing ones.

**Google Maps link resolution:**

- Оба резолвера (`resolveMapsCoordsViaHttp` и браузерный
  `resolveMapsCoords`) ходят ТОЛЬКО на google.com (с поддоменами),
  goo.gl и g.co — allowlist в `src/lib/blscene.ts` поверх общей
  SSRF-защиты `src/lib/urlGuard.ts`. Это важно, потому что те же
  функции резолвят maps-ссылки, введённые пользователем (см.
  [place-lists.md](place-lists.md)): без allowlist сервер можно было бы
  гонять по произвольным адресам, включая внутреннюю сеть. HTTP-резолв
  перепроверяет **каждый** редирект-хоп; чужой хост даёт `null`
  («координат нет»), импорт продолжается.

- Long-form `google.com/maps/place/...` URLs already carry coordinates in
  the URL itself (`!3d{lat}!4d{lng}` or `@{lat},{lng},{zoom}z` patterns) —
  resolved via plain regex, no browser needed.
- Short `maps.app.goo.gl/...` links are Firebase Dynamic Links — the
  destination only reveals itself via client-side JS, so a plain
  `fetch`/`curl` gets an empty 200 response with no redirect. These need a
  real headless browser (Playwright/Chromium — a normal `dependencies`
  entry, not dev-only, since the admin button needs it at runtime, not
  just for local testing). Google sometimes serves a
  `consent.google.com` cookie-consent interstitial first; that
  interstitial's URL embeds the real destination (and its coordinates) in
  its own `continue=` query param, so there's no need to actually click
  through consent.
- About 80% of locations resolve to precise coordinates this way. The
  rest are plain Google search-query links with no place ID — they get
  created with `latitude`/`longitude` left `null`, pickable up later by an
  admin manually via the location edit page's map picker (see
  [locations.md](locations.md)).

OpenStreetMap's free Nominatim geocoder was evaluated as a
browser-free alternative but found unreliable for small
businesses/restaurants (found a university fine, found nothing for two
tested restaurants) — not used.

## Найденное видно на главной

Лента «Что нового» на главной показывает не только музыкальные новинки,
но и места съёмок: «у сериала появились локации, N мест на карте»
(просьба владельца 2026-09-06). Считается по `DramaLocation.createdAt`
— полю, добавленному тогда же (миграция
`20260906T3_drama_location_created_at`, существующие связи заполнены
датой самой локации, чтобы лента сразу после выкатки не выглядела так,
будто каталог завели вчера). Именно по дате ПРИВЯЗКИ, а не создания
места: одно кафе переиспользуется разными сериалами, и новостью
становится связь. Места одного сериала склеиваются в одну строку —
иначе пятнадцать точек «You Maniac» вытеснили бы из ленты всё
остальное; окно новизны — месяц (`getLocationNews` в
`src/lib/whatsNew.ts`).
