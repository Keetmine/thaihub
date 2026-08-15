# Catalog: performers, pairings, dramas, agencies

## Performers & bands

One `Performer` model covers both solo actors and bands
(`type: SOLO | BAND`). Public: `src/app/(public)/performers/` (list +
`[id]` detail, `?view=agencies` — see below). Admin:
`src/app/admin/(protected)/performers/` (`PerformerForm.tsx`,
`AdminPerformerTabs.tsx` for the Актёры/Группы/Пейринги/Агентства tab
bar).

- A `BAND` performer's roster is other `Performer` rows linked through
  `BandMember` — an idol who's both in a group and individually credited
  in a drama is one `Performer` row, referenced both directly and as a
  band member. A band's current lineup, bio, photo, and label (as an
  `Agency`) can be pulled from tpop.fandom.com — see
  [tpop-band-import.md](tpop-band-import.md).
- Real name, birth date, place of birth, bio, agency, photo, MyDramaList
  link are all optional profile fields, fillable manually or (for dramas)
  picked up via the blscene importer's cast data where available. GMMTV's
  roster is kept in sync separately — see
  [gmmtv-import.md](gmmtv-import.md) — and a performer's place of birth,
  birth date, social links, and known-for dramas (with full cast) can be
  pulled from TMDB — see [tmdb-import.md](tmdb-import.md).
- **Public performer URLs are pretty, TMDB-style**:
  `/performers/{id}-{nickname-realname-slug}` — `performerHref()` in
  `src/lib/performerSlug.ts` builds the link everywhere one is needed,
  `parsePerformerIdFromParam()` strips the slug back off on the way in.
  The id (a Prisma cuid, never containing a hyphen) is always the real
  identifier; the slug is purely decorative and ignored on lookup, so a
  bare `/performers/{id}` still resolves and a stale slug in an old
  bookmark never breaks. Falls back to a bare id link when there's
  nothing Latin-script to slugify (a Thai-only name with no romanized
  form).
- `PerformerLink` is a free-form label+URL list per performer (social
  media, personal café, whatever) — no schema change needed to add a new
  kind of link. `src/lib/socialLinks.ts`'s `detectSocialPlatform(url)`
  recognizes Instagram/TikTok/Twitter by host regardless of what label an
  import or admin gave the row — used to (a) show those three (plus
  `mydramalistUrl`) as branded icon buttons under a performer's photo via
  `SocialLinkIcons`, everything else still a plain labeled pill, and (b)
  give `PerformerForm` three dedicated Instagram/TikTok/Twitter fields
  instead of lumping them into the generic add-a-link list — purely a
  form-UI split, `getLinks` in `performers/actions.ts` merges them back
  into the same `PerformerLink` rows on save, no separate schema field.
- The admin performers list (`/admin/performers`) is a flat, paginated
  list (see "Catalog scale" below) with a `NameSearchBox` search and a
  photo per row, edit/delete icon buttons instead of a favorite toggle.

## Shared A-Z index layout

`src/components/AlphabetIndexList.tsx` groups any `{id, name}[]` list by
first letter (digits collapse into one "0-9" group) and renders a
scrollable letter rail pinned to the right (`.performers-layout` /
`.performers-index` in `globals.css`) — used by the public and admin
performers lists, `/dramas`, `/locations` (alphabetical view), and
`/locations?group=drama` (grouping *dramas* alphabetically, each
`renderItem` rendering that drama's own location list). An optional
`trailingSection` renders one extra, ungrouped section after the letter
groups with its own short index-nav symbol — used by the locations
drama-grouped view for "Без сериала" (locations with no linked drama).

## Catalog scale

The performer/drama catalog grew into the thousands (bulk TMDB sync +
Wikipedia agency imports) — rendering every row on one page stopped being
viable. Public and admin list pages handle this differently, since
they're solving different problems:

- **Public `/performers` and `/dramas`**: without a search term, the
  page doesn't query the full catalog at all — only rows already
  favorited (performers) or marked with some `DramaWatchStatus`
  (dramas — drama favorites don't exist, see [social.md](social.md))
  are shown, so a signed-in user's own list stays small regardless of
  catalog size. Empty state points at the search box
  ("Используйте поиск, чтобы найти актёра/сериал") rather than showing
  nothing with no explanation. Typing a search term switches to a real
  catalog-wide query, capped at `SEARCH_RESULT_LIMIT` (100,
  `src/lib/pagination.ts`) — a short/common query (a single letter)
  can still match thousands of rows in a catalog this size, so results
  are capped with a "уточните запрос" note rather than rendering
  everything that matched. No page-number pagination here — narrowing
  the search is the intended way to get to a specific entry.
- **Admin list pages** (`/admin/performers`, `/admin/dramas`,
  `/admin/locations`, `/admin/pairings`, the `/admin` events dashboard,
  and the agencies tab inside `/admin/performers?view=agencies`): plain
  `?page=` pagination, `PAGE_SIZE` (20, same `src/lib/pagination.ts`)
  rows per page via Prisma `skip`/`take`, with a `<Pagination>`
  (`src/components/Pagination.tsx`) prev/next + "Стр. X из Y" footer —
  a full numbered page list isn't practical once a catalog runs into
  the hundreds of pages. The admin events dashboard is the one
  exception that can't paginate at the query level: it sorts by each
  event's first occurrence date, which only exists once every event's
  `EventOccurrence` rows are loaded, so it fetches everything, sorts in
  JS, then slices — fine given the event count is nowhere near
  performer/drama scale.

## Pairings

A `Pairing` names a two-performer "ship" (`performerAId`/`performerBId`,
unique together, optional display `name` — falls back to "A × B" when
unset). Selectable on events alongside/instead of individual performers.
Admin: `src/app/admin/(protected)/pairings/` +
`PairingManager.tsx`/`CreatePairingModal.tsx` inside the performer form
for inline creation.

**Current vs past**: `Pairing.status` (`CURRENT` | `PAST`, default
`CURRENT`) tracks whether a ship is still active — many real-life pairs
break up and one or both performers go on to new pairings, and a
performer can have several `Pairing` rows at once (the schema never
assumed exactly one). Admins toggle status from `/admin/pairings` or a
performer's edit page (`PairingManager.tsx`, `setPairingStatus` action in
`pairings/actions.ts`); `CreatePairingModal` also lets a new pairing be
entered directly as `PAST` (for backfilling history). Every query that
lists a performer's pairings orders `status` before `createdAt`, so
current ones sort first; the public performer page
(`(public)/performers/[id]/page.tsx`) splits them into separate "В паре
с" (current) and "Бывшие пары" (past, shown at reduced opacity)
sections. `mergePairingsForPerformer` (`src/lib/duplicates.ts`) upgrades
the surviving row to `CURRENT` if either side of a merge collision was.

## Dramas

`src/app/(public)/dramas/`, admin `src/app/admin/(protected)/dramas/`
(`DramaForm.tsx`, `actions.ts`). Cast (`PerformerDrama`, with an optional
`role` = character name), agency, filming locations
(`DramaLocation`), and an optional tie-in `Event` (premiere screening —
see [events.md](events.md)) all hang off a `Drama`.

Most of the catalog was bulk-imported from blscene.com rather than typed
in by hand — see [blscene-import.md](blscene-import.md). `Drama.status`
(TMDB's own airing-status vocabulary — Ended/Returning Series/etc., shown
as a badge next to the title) comes from the TMDB importer, see
[tmdb-import.md](tmdb-import.md). `Drama.network` (broadcaster/streamer)
comes from the Wikipedia agency importer, see
[wikipedia-agency-import.md](wikipedia-agency-import.md).

## Agencies

`Agency` has its own roster and can also be the production/distribution
agency on a `Drama` directly (independent of the cast's agencies). An
agency's roster/productions can be bulk-imported from any of several
sources, depending on what that particular agency has published where:
its own Wikipedia article (see
[wikipedia-agency-import.md](wikipedia-agency-import.md)), a TMDB
production-company page (see
[tmdb-company-import.md](tmdb-company-import.md)), a drama.fandom.com
category page (see
[drama-fandom-agency-import.md](drama-fandom-agency-import.md)), or its
own official site (see [memindy-import.md](memindy-import.md),
[change2561-import.md](change2561-import.md) — the latter combines its
own site for artists with its Wikipedia article for productions, since
not every agency publishes both halves in an equally parseable place).
All of these funnel through the same TMDB-matching/dedup rules
(`src/lib/agencyTmdbMatching.ts`) regardless of source.

**Admin management lives inside the Performers section, not as its own
top-level nav item** — `/admin/performers?view=agencies` renders the
agency list as a 4th tab (`AdminPerformerTabs.tsx`), mirroring the public
site's `/performers?view=agencies` consolidation. The standalone
`/admin/agencies` list page was removed; `/admin/agencies/new` and
`/admin/agencies/[id]/edit` still exist as real routes, just linked from
the embedded tab view instead of their own nav entry.

### A performer can belong to more than one agency

`Performer` ↔ `Agency` is many-to-many (`PerformerAgency`), not a single
`agencyId` — a drama is sometimes co-produced by two studios, so its cast
may formally be signed to a different studio than the one that produced
it, and a performer can move agencies over time. Every importer that
discovers an agency association *adds* to the performer's set rather
than overwriting it (`addPerformerAgency` in
`src/lib/performerAgency.ts`, idempotent) — concretely: syncing GMMTV's
roster ensures GMMTV is in the set without dropping a Studio Wabi Sabi
membership picked up elsewhere, and vice versa. `PerformerForm.tsx`'s
"Агентства" field is a multi-select (`EntityMultiSelect`, `agencyIds` in
form data) instead of the old single dropdown; the public performer page
lists all of a performer's agencies, comma-separated, each linking to
its own agency page.

No current/past status yet (a performer who's *left* an agency still
just shows as "associated with" it) — deliberately deferred until it's
actually needed, per the same reasoning as `Pairing.status` existing
for pairings but not (yet) for agencies.

An admin agency's roster editor (`AgencyForm.tsx`'s performer picker) is
a full "this is exactly who's currently in this agency" replace — saving
it clears and recreates *that agency's* `PerformerAgency` rows only, so
it never touches a performer's membership in any other agency.

## Duplicate names

Both `PerformerForm.tsx` and `DramaForm.tsx` show a live "похоже, уже
есть" hint under the name field on **create** (not edit) forms — see
[duplicates.md](duplicates.md).
