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
  plus `tmdbImageUrl`/`parseTmdbPersonId` helpers.
- **`src/lib/tmdbImport.ts`** — DB orchestration: `previewTmdbPersonImport`
  (read-only) and `commitTmdbPersonImport` (writes).
- **`src/app/admin/(protected)/performers/tmdbActions.ts`** — thin
  `"use server"` wrappers the client flow calls directly (same shape as
  the TTM importer's `importActions.ts`), plus `revalidatePath` calls.
- **Admin flow**: `/admin/performers/[id]/import-tmdb` — a "Импортировать
  с TMDB" link on a **solo** performer's edit page (bands aren't people on
  TMDB, so this doesn't apply to them). `TmdbImportFlow.tsx` mirrors
  `TtmImportFlow.tsx`'s two-step shape: paste a person URL/id → review →
  confirm. Nothing is written until the confirm step.

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
  `Performer` with `name = realName = TMDB's name`, editable afterward
  like any manually-added performer.
- **A known-for show** matches an existing `Drama` by `tmdbId`, falling
  back to an exact case-insensitive title match — same two-tier pattern
  as `blscene-import.md`'s `blsceneUrl`-then-title dedupe, so a drama
  already imported from blscene.com gets enriched (status, TMDB poster/
  synopsis, `tmdbId`) instead of duplicated. A match either way is treated
  as "update", never skipped — TMDB is authoritative for these fields
  once you've explicitly chosen to pull a show in.

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

## New fields this added

- `Performer.placeOfBirth` (`String?`) — also a plain editable field in
  the regular admin performer form, not TMDB-exclusive.
- `Performer.tmdbId` (`String? @unique`).
- `Drama.status` (`DramaStatus?` enum: `RETURNING_SERIES`/`PLANNED`/
  `IN_PRODUCTION`/`ENDED`/`CANCELED`/`PILOT`, TMDB's own TV status
  vocabulary) — shown as a badge next to the title/year on a drama's
  public page (`DRAMA_STATUS_LABELS` in `src/lib/dramaStatus.ts`). Distinct
  from `DramaWatchStatus` (a signed-in user's personal watch progress,
  see [social.md](social.md)) — this is the show's own real-world airing
  status, not per-user.
- `Drama.tmdbId` (`String? @unique`).

`src/lib/dramaStatus.ts` mirrors `src/lib/watchStatus.ts`'s
client-safety split — no server-only imports, since it's pulled into
whatever renders the status badge.
