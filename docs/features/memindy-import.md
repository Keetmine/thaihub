# Me Mind Y importer

[Me Mind Y](https://www.memindy.com/en/artist/) is a Thai talent
agency whose entire roster — including each artist's "Previous Works"
credits — lives on one listing page, no separate per-artist profile
pages to crawl. WordPress-based, but "artist" is a custom post type not
exposed via the standard `wp-json/wp/v2` REST API (checked and
confirmed absent from `/wp-json/wp/v2/types`), and the grid itself is
rendered by an isotope script rather than present in the server
response, so this needs a real browser page — same reasoning as
`gmmtv.ts`.

## Files

- **`src/lib/memindy.ts`** — pure fetch+parse, no DB access:
  `fetchMemindyArtists(page)` takes a Playwright `Page` and returns
  every artist's name/nickname, photo, "Series" credits, and social
  handles, all extracted in one `page.evaluate` pass over
  `article.type-artist` cards.
- **`src/lib/memindyImport.ts`** — DB orchestration:
  `importMemindyAgency(page, onProgress?)`.
- **`scripts/import-memindy.ts`** — CLI entry point:
  ```
  npx tsx scripts/import-memindy.ts
  ```

## "Previous Works" mixes categories — only "Series" is dramas

Each artist's stat block is followed by a `<ul>` of labeled sub-lists —
"Series", but also "Artist's '{stage name}'" (music releases) and
sometimes "Project" — siblings at the same level, not nested under a
common "Previous Works" parent. `fetchMemindyArtists` walks each
top-level `<li>`, reads its own direct text (with the nested `<ul>`
subtracted out) as the category label, and only collects titles from
the one labeled exactly "Series" — same reality/variety-exclusion
reasoning as `tmdb-import.md`'s known-for filtering, just for music
credits instead of unscripted TV here.

## What gets written

- **Artists**: matched/created via `findOrCreateAgencyArtist`
  (`agencyTmdbMatching.ts` — same TMDB-first matching the Wikipedia/
  drama.fandom.com importers use, see
  [wikipedia-agency-import.md](wikipedia-agency-import.md)). A blank
  `photoUrl` is filled in from the site's own artist photo; social
  handles (Instagram/X/TikTok, published as bare handles like `IG :
  boss.ckm`, expanded into full URLs) are synced via
  `syncSocialLinks` (`src/lib/performerSocialLinks.ts` — extracted from
  the GMMTV importer once a second source needed the exact same
  dedup-by-URL logic).
- **Series**: each title is deduped within one run (`seenSeries`, since
  the same show is often credited to several cast members) and passed
  through `importAgencyProduction` (`agencyTmdbMatching.ts`) with no
  network/year — this page doesn't carry either — matched against TMDB
  first, created from the bare title otherwise.

## New fields this added

None.
