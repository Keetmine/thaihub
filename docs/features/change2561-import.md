# CHANGE 2561 importer

CHANGE 2561's artists come from its own site
([change2561.com/changeartist](https://www.change2561.com/changeartist));
its productions come from
[its Wikipedia article](https://en.wikipedia.org/wiki/Change2561)
instead — the site's own "works" listing mixes dramas together with
music videos and ad-campaign credits under labels with no stable
marker to cleanly separate them (unlike Me Mind Y's "Series" label —
see [memindy-import.md](memindy-import.md)), so Wikipedia's dedicated
"Television dramas" list is the more reliable source for this
particular agency.

## Files

- **`src/lib/change2561.ts`** — pure fetch+parse, no DB access, no
  browser needed at all: `fetchChange2561ArtistIds()` and
  `fetchChange2561Artist(id)`.
- **`src/lib/change2561Import.ts`** — DB orchestration:
  `importChange2561(onProgress?)`, combining this site's artists with
  Wikipedia's productions (via `fetchWikipediaAgencyPage`, see
  [wikipedia-agency-import.md](wikipedia-agency-import.md)) into one
  `Agency`.
- **`scripts/import-change2561.ts`** — CLI entry point:
  ```
  npx tsx scripts/import-change2561.ts
  ```

## No browser needed — a real JSON API, once found

The listing page's artist cards (`data-key="79"`, etc.) are server-
rendered and directly in the raw HTML — no client-side grid to wait
for. Clicking a card in a real browser was traced (via Playwright's
`page.on("request")`) to a plain `GET
/changeartist/getModel/{id}` call, which turns out to answer a bare
`fetch` directly with no session/cookie requirement — a clean JSON
profile including `name_en`/`nickname_en` (the listing page itself
only shows Thai; the language toggle turned out to be a client-side-
only UI switch with no working URL/query-param equivalent, so this
goes straight to the English fields in the JSON instead of fighting
that toggle) plus ready-to-use social profile URLs.

## Wikipedia's "Television dramas" is a list, not a table

Change2561's article structures its productions as a plain `<ul>` of
`Title (Year)` / `Title (YearStart–YearEnd)` / `Title (TBA)` entries
under an h3 "Television dramas" — not a wikitable like Domundi TV/
GMMTV's "Television series"/"TV series", and not the "Network, Year"
shape Be On Cloud's drama.fandom.com list uses either (see
[drama-fandom-agency-import.md](drama-fandom-agency-import.md)).
`wikipediaAgency.ts`'s production-heading search was generalized to
try **both** shapes per candidate heading — table first (the richer
shape, when present), falling back to
`parseProductionList`/`parseProductionListEntry`
(`mediawikiParse.ts`, shared with the drama.fandom.com importer) —
and `"Television dramas"` was added to its candidate heading list
alongside `"Television series"`/`"TV series"`.
`parseProductionListEntry` takes the *last* year in a range (a show
still airing/recently ended) and treats `"(TBA)"`/no digits as no year
at all rather than guessing one.

## What gets written

- **Productions**: from Wikipedia, via `importAgencyProduction`
  (`agencyTmdbMatching.ts`) — matched against TMDB first, created from
  the bare title/year otherwise, tagged with this `Agency`.
- **Artists**: from change2561.com, via `findOrCreateAgencyArtist`
  (same shared matcher) — added to the artist's agency set (never
  overwrites another agency they're already linked to; see "A performer
  can belong to more than one agency" in
  [catalog.md](catalog.md#agencies)). Social links (Instagram/Twitter/
  TikTok, already full URLs in the JSON) synced via `syncSocialLinks`
  (`src/lib/performerSocialLinks.ts`).
- Artists aren't cross-matched against specific Wikipedia productions —
  the two sources are independent enrichment passes over the same
  agency, not linked row-to-row.

## New fields this added

None.
