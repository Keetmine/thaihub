# TMDB actor/drama importer

[themoviedb.org](https://www.themoviedb.org/) has an official public API,
used here instead of scraping — TMDB's `robots.txt` explicitly disallows
AI bots (`anthropic-ai`, `Claude-Web`, etc. by name), so this is the
compliant path, not just a technical convenience. Requires
`TMDB_API_READ_ACCESS_TOKEN` in `.env` (a personal read-access token from
[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)).

## Files

- **`src/lib/tmdb.ts`** — pure API client, no DB access: `fetchTmdbPerson`,
  `fetchTmdbPersonKnownForTv`, `fetchTmdbTvShow`, `fetchTmdbTvCredits`,
  `fetchTmdbCompany`/`fetchTmdbCompanyTvShows` (see
  [tmdb-company-import.md](tmdb-company-import.md)), plus
  `tmdbImageUrl`/`parseTmdbPersonId`/`parseTmdbCompanyId` helpers.
- **`src/lib/tmdbImport.ts`** — DB orchestration:
  - `previewTmdbPersonImport` (read-only) and `commitTmdbPersonImport`
    (writes) — the one-actor reviewed-import flow, below.
  - `syncAllDramasFromTmdb` / `syncAllPerformersFromTmdb` — the whole-
    catalog bulk sweep, further down.
  - `importShow(tvId, knownDramaId?)` — creates/updates one `Drama` plus
    its full cast, returning `castPerformerIds` alongside the
    created/updated counts; reused directly by both the bulk sweep above
    and [tmdb-company-import.md](tmdb-company-import.md) (which also
    needs to know *which* performers a show's cast resolved to, to add
    a studio to each of them).
- **`src/app/admin/(protected)/performers/tmdbActions.ts`** — thin
  `"use server"` wrappers the client flow calls directly (same shape as
  the TTM importer's `importActions.ts`), plus `revalidatePath` calls.
- **`src/lib/localImage.ts`** — `downloadRemoteImage(url, folder)`, used
  by every DB-persisting TMDB image write (see "Local image storage"
  below).
- **Admin flow**: `/admin/performers/[id]/import-tmdb` — a "Импортировать
  с TMDB" link on a **solo** performer's edit page (bands aren't people on
  TMDB, so this doesn't apply to them). `TmdbImportFlow.tsx` mirrors
  `TtmImportFlow.tsx`'s two-step shape: paste a person URL/id → review →
  confirm. Nothing is written until the confirm step.
- **`scripts/sync-dramas-tmdb.ts`** / **`scripts/sync-performers-tmdb.ts`**
  — one-off bulk sweeps over the *whole* catalog, no review screen (same
  reasoning as the GMMTV/blscene bulk scripts: hundreds of items is too
  many to review one by one, so this is dedup-and-report instead).
  Run dramas first — see "Bulk sync" below for why the order matters.
  The same sweep is also reachable from the admin UI: an "Импортировать
  с TMDB" button on `/admin/dramas` (`TmdbSyncButton.tsx` +
  `syncTmdbDramas` in that folder's `actions.ts`) and `/admin/performers`
  (same component/action names, next to `GmmtvSyncButton`) — same
  running/result-summary pattern as the GMMTV and blscene sync buttons,
  since (like those) there's nothing to review per item.

## "Known For" isn't a real API field

TMDB's own person page shows a curated "Known For" carousel, but the API
doesn't expose that computation directly — the closest raw data is
`/person/{id}/combined_credits`. Sorting that by raw `popularity` surfaces
reality/variety shows above someone's actual dramas (their GMMTV
variety-show appearances often outrank BL dramas that are far more
"known for" in the fandom sense), so `fetchTmdbPersonKnownForTv`:

1. Filters to `media_type === "tv"`.
2. Drops any credit whose `character` is empty or starts with "Self"
   (`"Self"`, `"Self - Guest"`, `"Self - Host"`, …) — the standard
   heuristic for excluding non-scripted appearances.
3. Sorts what's left by `vote_count` descending, caps at 15.

This is a deliberate approximation, not a literal reproduction of TMDB's
own algorithm — good enough that the review screen's ordering matches
what you'd expect, not perfect.

## Dedup: performers by tmdbId, then name; dramas by tmdbId, then title

- **The performer being imported for** is picked explicitly (you're on
  *their* edit page) — no fuzzy matching needed for them. Their `tmdbId`
  gets set on commit, before any show's cast is processed, so if they
  also appear in their own cast list (they always do) they match
  themselves instead of getting created as a duplicate.
- **A show's full cast** (`findOrCreateCastPerformer` in `tmdbImport.ts`)
  matches an existing `Performer` by `tmdbId` first, then `realName`
  (case-insensitive exact), then `name` (nickname). TMDB credit names are
  usually a person's real/romanized name, not their fan nickname — that's
  why `realName` is checked before `name`. No match creates a new
  `Performer`, with `name` set to a nickname if one can be derived (below),
  falling back to the same value as `realName` otherwise — either way,
  editable afterward like any manually-added performer.
- **A known-for show** matches an existing `Drama` by `tmdbId`, falling
  back to an exact case-insensitive title match (or, when the caller
  already knows exactly which of our rows a `tvId` belongs to — the bulk
  drama sweep — that row directly, bypassing the fuzzy title match; see
  "Bulk sync" below for why) — same two-tier pattern as
  `blscene-import.md`'s `blsceneUrl`-then-title dedupe, so a drama already
  imported from blscene.com gets enriched (status, TMDB poster/synopsis,
  `tmdbId`) instead of duplicated. A match either way is treated as
  "update", never skipped — TMDB is authoritative for these fields once
  you've explicitly chosen to pull a show in.

### Nicknames from `also_known_as`

A newly-created cast member's TMDB credit name is their real/romanized
name ("Nattawin Wattanagitiphat"), not the nickname Thai fans actually
use ("Apo") — `deriveNicknameFromAlsoKnownAs` (`src/lib/tmdb.ts`) looks
for a `also_known_as` entry shaped like `"{Nickname} {Full Name}"`
(TMDB lists these alongside unrelated variants — native-script name,
ship-name mashups like "MileApo", partial-name variants) and returns the
short Latin-script prefix once the exact full name is stripped off the
end, or `null` if nothing in the list fits that shape confidently.
`syncPerformerFromTmdb` also applies this **retroactively**: if a
performer's `name` and `realName` are identical (the fallback-to-realName
case above), a sync looks for a nickname again and renames them —
never touches a `name` that's already distinct from `realName`, since
that's a real curated nickname, not a fallback that needs fixing.

## Bulk sync (whole catalog)

`syncAllDramasFromTmdb`/`syncAllPerformersFromTmdb` sweep every `Drama`/
solo `Performer` already in the catalog, matching each against TMDB by
search when it doesn't have a `tmdbId` yet. **Run dramas first** — by the
time the performer sweep runs, most catalog dramas already have a
`tmdbId`, so `importShow`'s cast-import calls (which don't know a
specific target row up front, unlike the drama sweep) resolve by `tmdbId`
instead of needing the fuzzier title fallback.

A bare title or name search is too ambiguous to trust blindly — "Cutie
Pie" matches two unrelated shows, "Off" matches random unrelated people —
so both matchers narrow candidates before accepting one, and return
`null` (skip, reported in the summary) rather than guess:

- **`matchTmdbTvShow(title, year)`** — searches, keeps only results whose
  name is actually related to the query (`titlesLookRelated`: normalized
  substring match, or a shared 4+ letter word — catches "2gether" vs.
  TMDB's "2gether: The Series" while rejecting an unrelated same-language
  result), prefers Thai-origin results (this catalog is 100% Thai dramas),
  then a release year within ±1 of ours. Falls back to a single Thai-
  and-title-related candidate with no year to disambiguate it, but *not*
  when there's more than one such candidate — a real single-candidate
  fallback caught "The Boyfriend" correctly; without the
  `titlesLookRelated` filter it had previously accepted "Sweet Tooth,
  Good Dentist" as the (wrong) sole Thai result.
- **`matchTmdbPerson(realName)`** — requires `realName` (a bare nickname
  like "Off" alone matches unrelated people; skipped if not set), prefers
  TMDB's "Acting" department, otherwise takes the top search result.

**Conflicts**: two rows in *our own* catalog occasionally turn out to be
the same TMDB show — either a genuine duplicate (blscene import created
both "I told sunset" and "I Told Sunset About You") or a multi-season
series TMDB doesn't split into separate show ids per season ("SOTUS" /
"SOTUS S" both resolve to one `tvId`). Writing the second row's `tmdbId`
would violate the column's uniqueness — `importShow` checks for this
before writing and throws `TmdbConflictError` instead of letting Postgres
do it; both sync functions catch it and report a "conflict" outcome
(which existing title it collided with) rather than crashing the whole
sweep. A genuine duplicate should be merged via
[duplicates.md](duplicates.md)'s admin tool; a split-season case is
correctly left alone (merging would wrongly combine two seasons' filming
locations into one `Drama`).

## What gets written

On confirm, for the target performer: `tmdbId`, `placeOfBirth` (the
review screen's text field, editable/clearable before confirming — not
read-only). For each **selected** show (already-imported ones are
unchecked by default, but still shown with a "уже в базе" badge so a
deliberate re-sync is one click): `Drama.title/synopsis/posterUrl/year/
status/tmdbId`, then every cast member's `PerformerDrama.role` (=
character name) via `upsert`, so re-running an import is idempotent —
matching character names just get overwritten, not duplicated.

Cast import itself isn't reviewable row-by-row (unlike the show
selection) — it runs automatically per selected show, same as the GMMTV
importer's dedup-and-report pattern, since a per-cast-member review
screen for potentially dozens of names per show would be unwieldy. The
result screen reports created-drama/updated-drama/created-performer
counts after the fact instead.

### Birth date and social links

`fetchTmdbPerson` also fetches `birthday` and `external_ids`
(Instagram/Twitter/TikTok/Facebook/YouTube handles, via
`append_to_response=external_ids` on the same request rather than a
second round-trip) — expanded into full URLs and returned as
`TmdbPerson.socialLinks`. Every path that creates a new `Performer` from
a TMDB match (`findOrCreateCastPerformer` here,
`findOrCreateAgencyArtist` in `agencyTmdbMatching.ts`,
`commitTmdbPersonImport` above) sets `birthDate` and calls
`syncSocialLinks` (`src/lib/performerSocialLinks.ts`) on create.

These two fields were added to `fetchTmdbPerson` after the fact, so
every `Performer` created before that fix has a `tmdbId` but is still
missing them even though TMDB has the data — `scripts/backfill-agency-
photos.ts` (photo only) and `scripts/backfill-agency-profile-details.ts`
(birth date + social links) are one-off catch-up passes, scoped to
performers with at least one `Agency` (this catalog's thousands of
incidental cast members outside that scope were judged not worth the
TMDB request volume for now).

## Local image storage

TMDB image URLs (`https://image.tmdb.org/t/p/w500/...`) are never stored
as-is — every DB-persisting write downloads the file first and stores a
local `/uploads/tmdb/...` URL instead, via `downloadRemoteImage(url,
"tmdb")` (`src/lib/localImage.ts`), called from `findOrCreateCastPerformer`
and `importShow` (`Drama.posterUrl`) in `tmdbImport.ts`,
`importTmdbCompany` (`Agency.logoUrl`), and `findOrCreateAgencyArtist`
(`agencyTmdbMatching.ts`). Rationale: a remote CDN URL baked into the DB
is a standing external dependency (TMDB could re-path, rate-limit, or
just go down) for something that's cheap to own outright once fetched.

- **Filename = the remote URL's own last path segment** (TMDB's image
  paths are already unique, content-addressed-looking ids like
  `kL8HP4KyRl0AmSg0MMhcnJhpX78.jpg`), so re-syncing the same person/show
  is a cheap `fs.access` check, not a re-download — safe to call on
  every sync, not just once. All three fields share one flat
  `public/uploads/tmdb/` folder rather than a per-field subfolder, since
  the filenames themselves already can't collide.
- **Everything is stored as WebP** (`toWebp` in `localImage.ts`, sharp,
  q82) — the basename is kept and the extension becomes `.webp`; GIFs
  are saved as-is to preserve animation. The manual `/api/upload`
  endpoint re-encodes to WebP the same way. Files downloaded before this
  existed are converted in place by `scripts/convert-uploads-webp.ts`
  (walks `public/uploads/` recursively, converts each JPEG/PNG, repoints
  every DB image field that referenced the old filename, deletes the
  original; safe to re-run).
- **Never blocks an import**: any failure (network error, non-2xx,
  content-type outside the same JPEG/PNG/WEBP/GIF allowlist
  `/api/upload` uses) falls back to returning the original remote URL
  and logs a warning — a broken image fetch shouldn't sink an otherwise-
  good sync. `tmdb.ts` itself stays untouched (still a pure, synchronous
  URL builder) since some of its callers are preview-only
  (`fetchTmdbPersonKnownForTv`'s `posterUrl` is shown on the review
  screen but never persisted) and shouldn't trigger a download at all.
- **Proxy caveat (real incident, not hypothetical)**: TMDB's image CDN
  (`tmdb-image-prod.b-cdn.net`, behind `image.tmdb.org`) is DNS-blocked
  by some ISPs — resolves to 127.0.0.1, so every image download fails
  with `fetch failed` while the API host itself still works. curl works
  around it via the `HTTPS_PROXY` env var automatically, but Node's
  built-in fetch ignores proxy env vars unless `NODE_USE_ENV_PROXY=1`
  is set — which is why the `dev`/`start` npm scripts set it (a no-op
  when no proxy vars are configured) and `scripts/backfill-tmdb-images.ts`
  should be run with it too on such networks.
- **`scripts/backfill-tmdb-images.ts`** — one-off catch-up
  (`npx tsx scripts/backfill-tmdb-images.ts`) for every row imported
  before this existed: sweeps `Drama.posterUrl`/`Performer.photoUrl`/
  `Agency.logoUrl` still pointing at `image.tmdb.org`, downloads each via
  the same `downloadRemoteImage`, 16-way concurrent. Safe to re-run —
  already-local rows are excluded by the query itself, and a row that
  failed last time just gets retried.
- **Docker persistence**: `public/uploads` (both this and the manual
  admin upload endpoint) needs a named volume in `docker-compose.yml`
  (`uploads_data:/app/public/uploads`) or every downloaded/uploaded file
  is lost on the next `docker compose up --build` — it otherwise lives
  only in the container's writable layer. The `public` folder's `COPY`
  in the `Dockerfile` also needs `--chown=nextjs:nodejs` (the container
  runs as that non-root user) so it can actually write into the mounted
  volume.

## New fields this added

- `Performer.placeOfBirth` (`String?`) — also a plain editable field in
  the regular admin performer form, not TMDB-exclusive.
- `Performer.tmdbId` (`String? @unique`).
- `Drama.status` (`DramaStatus?` enum: `RETURNING_SERIES`/`PLANNED`/
  `IN_PRODUCTION`/`ENDED`/`CANCELED`/`PILOT`, TMDB's own TV status
  vocabulary) — shown as a badge next to the title/year on a drama's
  public page (`DRAMA_STATUS_LABELS` in `src/lib/dramaStatus.ts`), and a
  smaller "Выходит" (`RETURNING_SERIES` only) badge overlaid on the
  poster in a performer's own drama list. That list sits in the profile
  column next to their (now larger, `16rem`) photo and renders as a
  horizontal scrolling poster row (TMDB "Known For"-style — posters,
  title, year, the per-user `DramaStatusButton` overlaid top-right),
  sorted newest-`year`-first with undated entries last, so a currently-
  airing show reads clearly amongst their older credits without needing
  to open each one. Distinct from `DramaWatchStatus` (a signed-in user's
  personal watch progress, see [social.md](social.md)) — this is the
  show's own real-world airing status, not per-user.
- `Drama.tmdbId` (`String? @unique`).

`src/lib/dramaStatus.ts` mirrors `src/lib/watchStatus.ts`'s
client-safety split — no server-only imports, since it's pulled into
whatever renders the status badge.
