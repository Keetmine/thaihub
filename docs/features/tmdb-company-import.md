# TMDB production-company importer

A studio's TMDB "company" page (e.g.
[Studio Wabi Sabi](https://www.themoviedb.org/company/139832-studio-wabi-sabi/tv))
lists every TV show TMDB credits to it — a reliable way to bulk-fill a
studio's catalog and, from each show's cast, tag every performer who's
worked with that studio. Same official API as
[tmdb-import.md](tmdb-import.md) (no scraping), just a different entry
point (`/discover/tv?with_companies={id}` instead of person/show
search) and reusing that file's `importShow` directly rather than
duplicating drama/cast import logic.

## Files

- **`src/lib/tmdb.ts`** — `fetchTmdbCompany(companyId)` (name/logo/
  description) and `fetchTmdbCompanyTvShows(companyId)` (every TV show
  credited to it, paginating through `/discover/tv` — the same endpoint
  themoviedb.org's own company "TV" tab is backed by), plus
  `parseTmdbCompanyId` for pulling the numeric id out of a company page
  URL.
- **`src/lib/tmdbImport.ts`** — `importTmdbCompany(companyId,
  onProgress?)`: upserts the company as an `Agency`, then for every show
  it's credited with, calls `importShow(tvId)` (see
  [tmdb-import.md](tmdb-import.md)) and:
  - sets `Drama.agencyId` to this agency, unconditionally (even on an
    already-existing row) — a studio's own TMDB catalog is authoritative
    for what it produced, same reasoning as the Wikipedia agency
    importer's productions table.
  - adds this agency to every cast member's agency set via
    `addPerformerAgency` (`src/lib/performerAgency.ts`) — never
    overwrites, since the same show can be co-produced by two studios
    and a performer credited in it may formally be signed elsewhere
    (most commonly GMMTV, in this catalog). See "A performer can belong
    to more than one agency" in [catalog.md](catalog.md#agencies).
- **`scripts/import-tmdb-company.ts`** — CLI entry point, no review
  screen (same dedup-and-report shape as the other bulk importers —
  a studio's full catalog and cast isn't practical to review show by
  show):
  ```
  npx tsx scripts/import-tmdb-company.ts <tmdb-company-url-or-id>
  ```

## Why this needed the multi-agency schema change

Before `PerformerAgency` existed, `Performer.agencyId` was a single
column — importing a studio's cast would have had to either skip anyone
already linked to a different agency (losing real studio history) or
overwrite it (silently dropping GMMTV, say, off someone who's *also*
signed there). Concretely, when this first ran for Studio Wabi Sabi: 232
performer↔agency associations were added across 25 shows, and 50 of
those performers already had GMMTV set — all 50 correctly ended up
associated with **both**, which a single-`agencyId` model couldn't have
represented at all.

## What gets written

- **`Agency`**: upserted by name (TMDB's own company name — "Studio Wabi
  Sabi", not a manually-typed variant), with `logoUrl`/`description`
  filled in from TMDB when present.
- **`Drama`**: every show in the company's TMDB catalog, via
  `importShow` — title/synopsis/poster/year/status/tmdbId, same as any
  other TMDB-sourced drama, plus this company set as its `agencyId`.
- **`PerformerAgency`**: one row per (cast member, this company) pair
  that doesn't already exist, for every show's full cast — reuses
  `importShow`'s own cast-matching (`findOrCreateCastPerformer` in
  `tmdbImport.ts`), so a cast member already in the catalog under a
  TMDB-matched `tmdbId`/`realName`/`name` is reused rather than
  duplicated, exactly as it would be for any other TMDB drama import.

No new fields — reuses `Agency`, `Drama.agencyId`, and `PerformerAgency`
as they already exist.
