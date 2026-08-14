# drama.fandom.com agency importer

A talent agency can have its own category page on
[drama.fandom.com](https://drama.fandom.com/) (e.g.
[Be On Cloud](https://drama.fandom.com/es/wiki/Categoría:Be_On_Cloud) —
the `/es/` is just Fandom's UI-chrome language, the actual article
content is in English) listing its roster and productions. Same
MediaWiki software and CC BY-SA license as Wikipedia/tpop.fandom.com
(see [wikipedia-agency-import.md](wikipedia-agency-import.md)), so this
reuses `mediawikiParse.ts`'s helpers — but unlike those two, the
**page itself** sits behind a Cloudflare bot-check that even the
official `action=parse` API can't get past on this particular wiki (it
answers with a real, non-Cloudflare `missingtitle` error — confirmed by
its `cf-cache-status`/`cache-tag` response headers, not a challenge
page), so this needs a real browser page, same as `gmmtv.ts`.

## Files

- **`src/lib/dramaFandomAgency.ts`** — pure fetch+parse, no DB access:
  `fetchDramaFandomAgencyPage(pageUrlOrTitle, page)` takes a Playwright
  `Page` (lifecycle managed by the caller, same convention as
  `gmmtv.ts`) and returns the agency's name, productions, and
  current/former artist rosters.
- **`src/lib/dramaFandomAgencyImport.ts`** — DB orchestration:
  `importDramaFandomAgency(pageUrlOrTitle, page, onProgress?)`, built
  entirely on `agencyTmdbMatching.ts`'s shared production/artist
  matching (see below) plus a plain `Agency` upsert.
- **`scripts/import-drama-fandom-agency.ts`** — CLI entry point:
  ```
  npx tsx scripts/import-drama-fandom-agency.ts <drama-fandom-url>
  ```

## Old-style MediaWiki headings

This wiki (`MediaWiki 1.43.9` per its own `siteinfo`) still renders
headings the pre-"wrapper div" way — a flat `<h2><span
class="mw-headline">…</span></h2>` with the section content as the
`<h2>`'s own next sibling, not a `<div class="mw-heading">` wrapper's.
`mediawikiParse.ts`'s `headingByText`/`contentAfterHeading` were
generalized to detect which shape applies rather than assuming the
newer one (Wikipedia/tpop.fandom.com's), so both work transparently —
see their doc comments for the exact heuristic. Also generalized:
`headingByText` now strips a heading's `.mw-editsection` (the
interactive "[edit]" link) before comparing text — a *live rendered*
page (this file) includes it, `action=parse` output (Wikipedia,
tpop.fandom.com) doesn't, and its literal "[" "]" bracket text broke an
exact match ("Detalles[]" != "Detalles") the first time this ran.

## What gets parsed

- **Name**: the "Detalles" infobox's "Nombre" field (its own declared
  agency name), falling back to the page title.
- **Productions**: the "Producciones Filmográficas" `<ul>` list, each
  entry shaped "Title (Network, Year)" — parsed by
  `parseProductionListEntry` (`mediawikiParse.ts`, shared with
  Change2561's Wikipedia-sourced list — see
  [change2561-import.md](change2561-import.md)).
- **Current/former artists**: "Artistas" (which has an "Actrices" h3
  sub-list nested as a plain sibling — collected together by walking
  every `<ul>` from right after "Artistas" until the next real `<h2>`,
  rather than treating the sub-heading specially) and "Ex-Artistas",
  both in "Full Name (Nickname)" shape — same
  `parseNameNickname`/`parseNameNicknameList` (`mediawikiParse.ts`) the
  Wikipedia importer uses.

## Shared matching: `agencyTmdbMatching.ts`

`importAgencyProduction`/`findOrCreateAgencyArtist` — TMDB-first
matching for a production/artist, with an agency-page-only fallback for
whatever TMDB doesn't have — were extracted out of
`wikipediaAgencyImport.ts` into their own module once this importer
needed byte-identical logic, rather than duplicating it a second time.
See that file's doc comments for the exact matching rules (both
importers, and [change2561-import.md](change2561-import.md), share
them verbatim).

## New fields this added

None — reuses `Agency`/`Drama`/`Performer`/`PerformerAgency` as they
already exist.
