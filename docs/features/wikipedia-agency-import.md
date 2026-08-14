# Wikipedia agency importer

Talent agencies (e.g. [Domundi TV](https://en.wikipedia.org/wiki/Domundi_TV),
[GMMTV](https://en.wikipedia.org/wiki/GMMTV)) often have a well-maintained
English Wikipedia article listing their full roster and production
history — a lot of it for performers/dramas not yet in our catalog.
Wikipedia's content is CC BY-SA (reuse explicitly permitted) and its
`robots.txt` has no AI-bot disallow, a real contrast with TMDB/IMDb (see
[tmdb-import.md](tmdb-import.md)) — so this uses the official MediaWiki
API (`action=parse`), not raw-HTML scraping.

Different agencies' pages are edited by different people and don't share
one exact layout — GMMTV's productions table is headed "TV series" where
Domundi TV's is "Television series", for instance. The parser is written
to tolerate that (see "Productions" and "Heading structure" below) rather
than assuming every agency page matches the first one it was built
against.

## Files

- **`src/lib/wikipediaAgency.ts`** — pure fetch+parse, no DB access:
  `fetchWikipediaAgencyPage(pageTitleOrUrl)` returns the agency's name,
  logo, description, productions, upcoming shows, and current/former
  artist rosters.
- **`src/lib/wikipediaAgencyImport.ts`** — DB orchestration:
  `importWikipediaAgency(pageUrlOrTitle, onProgress?)` upserts the
  `Agency` and walks productions → upcoming → artists, reusing
  `matchTmdbTvShow`/`matchTmdbPerson`/`importShow` from
  `tmdbImport.ts` (exported specifically for this reuse) rather than
  reimplementing TMDB matching.
- **`scripts/import-wikipedia-agency.ts`** — CLI entry point, no review
  screen (same dedup-and-report shape as the GMMTV/TMDB bulk importers —
  a roster this size isn't practical to review row by row):
  ```
  npx tsx scripts/import-wikipedia-agency.ts <wikipedia-url-or-title>
  ```

## What gets parsed, and why

- **Name**: the *page title* ("Domundi TV"), not the infobox's full legal
  name ("Domundi TV Co., Ltd.") — shorter, and matches how the agency is
  referred to everywhere else on the page and in the app.
- **Productions**: tries each heading in `seriesHeadingCandidates`
  (`"Television series"`, then `"TV series"`) in order and takes the
  first one whose table actually parses out rows — added after GMMTV's
  page turned out to head its production table "TV series" instead of
  Domundi TV's "Television series". Deliberately does *not* fall back to
  every heading that looks production-related: GMMTV also has a "Drama"
  table (a separate, older pre-BL-era catalog, out of scope for this
  importer) and a "TV shows" table (its variety shows — same
  reality/variety exclusion reasoning as `tmdb-import.md`'s "Self"-credit
  filtering for known-for shows) that must **not** get pulled in just
  because they also contain Year/Title columns.
- **Upcoming TV series**: parsed into `Drama` rows with
  `status: "PLANNED"` when TMDB has no match yet; the "notes" column
  becomes `synopsis`. If TMDB *does* have the show already (common once
  it's actually gone into production), the real TMDB status is used
  instead of the `"PLANNED"` fallback.
- **Current/former artists**: every `<li>` under the "Current" heading
  (regardless of which sub-heading/generation group it's nested under)
  plus every `<li>` under "Former" — everyone is pulled in, even artists
  with no Wikipedia link of their own, since the whole point of this
  importer is surfacing people not already in our catalog.

### Rowspan/colspan table parsing

Wikipedia's production tables group rows by year/network, leaving that
cell out of every row but the first and using `rowspan` to "carry it
down" visually. Reading `<td>`s by a fixed index per row — what a naive
parser does — silently shifts every subsequent column left for those
rows. Hit for real on the first import attempt: a `rowspan="3"` Network
cell caused the next two rows' own Notes text to be read as their Title
("Spin-off of Cutie Pie; starring Max Kornthas and Nat Natasit" as a
drama title).

`parseTableGrid()` reconstructs the table's actual visual grid — tracking
pending `{text, remaining}` rowspans per column index across row
iterations — instead of indexing raw `<td>`s directly. Used for both the
production and upcoming-shows tables, then columns are looked up by
header name (`"year"`, `"title"`, `"network"`, `"notes"`) rather than a
hardcoded position, since column order isn't guaranteed to match across
different agencies' pages.

A cell listing several values (multiple networks, multiple
co-production companies) commonly stacks them with `<br>` instead of
punctuation — hit for real on GMMTV, where a network cell rendered as
`"One HDBang Channel"` with no separator at all once `.text()` dropped
the line break. `parseTableGrid()` replaces every `<br>` with `", "`
before extracting each cell's text to keep multi-value cells readable.

### Heading structure

Modern Wikipedia wraps every heading in `<div class="mw-heading
mw-heading{level}">` — the content that visually follows a heading is
that wrapper div's next sibling, not the heading tag's own. Handled by
`contentAfterHeading()`/the "Current" roster's manual sibling-walk (which
stops at the next `mw-heading2` wrapper, since "Current" is itself
nested inside a larger section with sibling sub-groups).

`contentAfterHeading()` also skips past non-content elements
(`<link>`/`<style>`/`<meta>`) instead of trusting the wrapper's very
first sibling — GMMTV's "Former" section has a stray empty `<link>`
between the heading and the actual artist list, and taking that first
sibling at face value silently produced zero former artists instead of
the real 87.

## Matching against our DB

Same tmdbId-then-name/title dedup pattern as `tmdb-import.md`, reusing
its exact matcher functions rather than a separate implementation:

- **Productions/upcoming shows**: `matchTmdbTvShow(title, year)` first;
  on a hit, `importShow(tvId)` updates/creates the `Drama` row, then
  `network` (from Wikipedia — TMDB doesn't reliably carry this for Thai
  networks) and `agencyId` are set on top. No TMDB match falls back to a
  case-insensitive title match against our own catalog, same
  last-resort as the bulk drama sweep.
- **Artists**: matched by `realName` or `name` (nickname) against our
  existing `Performer` rows first — no TMDB call needed for someone
  already in the catalog. A miss falls through to `matchTmdbPerson`
  before creating anyone new, so a brand-new `Performer` still gets a
  real photo/`tmdbId`/place of birth when TMDB has them, with the nickname
  derived via `deriveNicknameFromAlsoKnownAs` (same helper `tmdb-import.md`
  uses) falling back to the name Wikipedia already parenthesized
  ("Pruk Panich (Zee)" → nickname "Zee") if TMDB's own data doesn't
  yield one.
- **Existing performer's agency**: only filled in if currently unset — a
  performer's current agency elsewhere might be more specific/correct
  than a Wikipedia roster snapshot, so this never overwrites one that's
  already set. Also repairs the fallback-to-realName `name` state (see
  `tmdb-import.md`'s nickname section) using the nickname Wikipedia's
  roster already spells out, if the existing row is in that state.
- **Drama's agency/network**: set unconditionally, even on an existing
  `Drama` — unlike a performer's agency, a studio's own production
  listing is treated as authoritative for what it actually produced.

### tmdbId collision on artist creation

`matchTmdbPerson` can resolve to someone already in our DB under a
name/realName spelling different enough that the name/realName lookup
above missed them — attempting `prisma.performer.create()` would then
collide on `tmdbId`'s uniqueness (hit for real: crashed an import 9
artists in). `findOrCreateAgencyArtist` checks
`prisma.performer.findUnique({ where: { tmdbId } })` before creating and
treats a hit as an existing match instead.

## New fields this added

- `Drama.network` (`String?`) — the broadcaster/streamer, sourced from
  the agency's own Wikipedia production table (TMDB doesn't reliably
  carry this for Thai networks).

No new fields on `Agency` — `logoUrl`/`description` already existed and
are simply filled in (only if currently empty) from the infobox image
and lead paragraph.
