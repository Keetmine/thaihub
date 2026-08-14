# GMMTV roster importer

[gmm-tv.com/artists/](https://www.gmm-tv.com/artists/) lists GMMTV's full
talent roster; each artist has a profile page at
`/artists/view/{id}/` (sequential numeric ids). Sits behind Cloudflare and
is client-JS-rendered — needs a real headless browser, not `fetch`/`curl`.

## Files

- **`src/lib/gmmtv.ts`** — pure scraping, no DB access: `fetchGmmtvArtistLinks(page)`
  (roster page → `{id, url}[]`), `scrapeGmmtvArtist(url, page)` (one profile
  page → nickname/full name/birth date/photo/social links).
- **`src/lib/gmmtvImport.ts`** — DB orchestration: `importOrUpdateGmmtvArtist`
  (create-or-update one `Performer`, matched by nickname), `syncGmmtvArtists`
  (scrape the whole roster and call the above for each artist, all linked to
  a find-or-created "GMMTV" `Agency`). Used by both the one-off script and
  the admin button.
- **`scripts/import-gmmtv.ts`** — one-off backfill
  (`npx tsx scripts/import-gmmtv.ts`), used for the initial bulk import.
- **Admin button** — "Проверить GMMTV" on `/admin/performers` (both the
  "Актёры" and "Группы" tabs, not "Агентства") — `GmmtvSyncButton.tsx` →
  `syncGmmtv` server action in `src/app/admin/(protected)/performers/actions.ts`.

## Cloudflare and the User-Agent

A `Playwright` page with its **default** User-Agent gets served link-poor
content by Cloudflare — the artist grid renders visually but the roster
page's `<a>` tags don't include the profile links, so
`fetchGmmtvArtistLinks` silently returns zero results. Fix: `newPage()` is
called with an explicit realistic Chrome UA string in
`syncGmmtvArtists`. No `robots.txt` exists on the site (404).

## Parsing profile pages

All key data lives in `<meta>` tags, not the visible DOM:

- `og:title` is `"{EN_NICK} : {EN_FULLNAME} {TH_NICK} : {TH_FULLNAME}"`.
  Split on the first Thai-Unicode-range character (U+0E00–U+0E7F) to drop
  the Thai half, then split the English half on the first `:`.
- `og:description` is `"Date of Birth : {D} {Month} {Y}, Weight : {W} kg. Height : {H} cm."`
  — birth date extracted via a `{day} {MonthName} {year}` regex.
- `og:image` is the full-resolution (1200px) profile photo.
- Social links (Instagram/Twitter/TikTok/Facebook/YouTube) aren't in a
  dedicated block — found by pattern-matching every `<a href>` on the page
  against the known social domains.

## Dedup: matched by nickname, not created fresh every run

`importOrUpdateGmmtvArtist` matches an existing `Performer` by
case-insensitive exact match on `Performer.name` (the nickname) — same
convention as the ThaiTicketMajor importer's artist matching. If found, it
updates `realName`/`birthDate` (GMMTV is the authoritative source for its
own roster, so these always get overwritten), adds GMMTV to the
performer's agency set (`addPerformerAgency`,
`src/lib/performerAgency.ts` — a performer can be signed to more than one
agency at once, see "A performer can belong to more than one agency" in
[catalog.md](catalog.md#agencies), so this never drops an agency they're
already linked to), and adds any social links not already present
(deduped by exact URL, so re-running is idempotent). If not found, a new
`Performer` is created.

**`photoUrl` is the one field that's deliberately *not* always
overwritten** — controlled by a `replacePhotos` option:

- The one-off bulk script passes `replacePhotos: true`, per an explicit
  one-time instruction to refresh every photo on the initial import.
- The admin "Проверить GMMTV" button passes `replacePhotos: false`, so a
  routine re-check doesn't clobber a photo an admin has since picked by
  hand.

## Initial import (2026-08-14)

171 artists found on the roster; 132 created, 39 updated (already existed
as `Performer` rows from manual entry or event imports), 0 failures.
