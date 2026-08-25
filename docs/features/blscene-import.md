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
   get re-scraped too, via `refreshScrapedDrama`: metadata fields
   (title/year/poster/synopsis/MyDramaList link) are updated to whatever's
   on the page now, and any locations that have been added to that page
   since the last sync get linked (already-linked locations are left
   alone — `linkScrapedLocations` is a no-op for names that already
   resolve to an existing `Location` row linked to that drama). This means
   a full sync run always re-fetches every drama's page, not just new
   ones — expect it to take a few minutes, not seconds.

`refreshBlsceneLocations` (the admin button's sweep) is just pass 2 —
same `refreshScrapedDrama` call, same re-fetch-every-page cost, but
skipping pass 1 entirely so it can never create a new `Drama`.

## Location dedup + coordinate resolution

Locations are deduped by exact name (`prisma.location.findFirst({where:
{name}})`) before creating a new row — the same real place legitimately
shows up across multiple dramas. Coordinates are only resolved for
genuinely new `Location` rows (`resolveMapsCoords`), not re-resolved for
existing ones.

**Google Maps link resolution:**

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
