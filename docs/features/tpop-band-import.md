# tpop.fandom.com band importer

[tpop.fandom.com](https://tpop.fandom.com/) is a Fandom wiki covering
Thai idol groups (e.g. [BUS](https://tpop.fandom.com/wiki/BUS),
[DICE](https://tpop.fandom.com/wiki/DICE)) — a much better source for
this content than TMDB/Wikipedia, neither of which reliably tracks
idol-group lineups, birth names, or labels. Fandom wikis are CC BY-SA
licensed, same as Wikipedia, and run the same MediaWiki software with an
official `action=parse` API — see
[wikipedia-agency-import.md](wikipedia-agency-import.md), whose shared
parsing helpers this reuses rather than re-implementing.

Fetching the plain rendered page (and even `/robots.txt`) directly hits
a Cloudflare bot-check ("Just a moment…") page — but `api.php` itself
answers cleanly with no challenge, so that's the access path used here.
This is the intended, sanctioned route for an API endpoint, not a
workaround for the challenge on the rendered page (which this doesn't
attempt to defeat).

## Files

- **`src/lib/mediawikiParse.ts`** — MediaWiki HTML-parsing helpers
  shared between this importer and the Wikipedia one:
  `fetchMediaWikiParsedHtml(apiBaseUrl, pageTitle, userAgent)`,
  `headingByText`, `contentAfterHeading`, `textWithBreaks`,
  `parseTableGrid`. Extracted here (rather than each importer keeping
  its own copy) once a second MediaWiki-based source needed the exact
  same rowspan/colspan and heading-wrapper handling.
- **`src/lib/tpopFandom.ts`** — pure fetch+parse, no DB access:
  `fetchTpopBandPage(pageTitleOrUrl)` (name, photo, origin, genre,
  debut, label, current members with their own page links) and
  `fetchTpopMemberPage(pageTitleOrUrl)` (stage name, birth name, birth
  date, birth place, current agency, photo).
- **`src/lib/tpopFandomImport.ts`** — DB orchestration:
  `importTpopBand(pageUrlOrTitle, onProgress?)` upserts the band as a
  `Performer` (type `BAND`) and its label as an `Agency`, then for every
  current member fetches their own page, matches or creates a
  `Performer` (type `SOLO`), and links them via `BandMember`.
- **`scripts/import-tpop-band.ts`** — CLI entry point, no review screen:
  ```
  npx tsx scripts/import-tpop-band.ts <tpop-fandom-url-or-title>
  ```

## What gets parsed, and why

- **Current lineup only**: pulled from the band infobox's "Current"
  `<ul><li><a>` list (name + link to that member's own page), not the
  article's larger historical members table further down — that table
  also lists pre-debut/departed members (hit for real on DICE, whose
  table has a literal "Pre-debut" divider row before a member who isn't
  in the current lineup), which don't belong in a band's current roster
  any more than a departed member belongs in an agency's "Current"
  roster in `wikipedia-agency-import.md`.
- **Band bio**: synthesized from Origin/Genre/Debut/Label — the schema
  has no dedicated fields for those, so `synthesizeBandBio` turns them
  into two short sentences ("Pop group from Bangkok, Thailand. Debuted
  December 6, 2023 under SONRAY MUSIC.") stored in the existing `bio`
  field, same field a solo performer's bio already uses.
- **Member profile**: each member's *own* page (not the band's roster
  table) is the source for birth name/date/place/photo/agency — richer
  and more reliable per-member than what the band page itself lists.
  - **Stage name** comes from the "Other name(s)" infobox field
    (stripped of its Thai-script parenthetical), not "Nickname" — the
    former matches the name used in the band's own roster and is what
    fans actually call them in a group context; "Nickname" is often a
    separate, more private nickname (e.g. Marckris's "Nickname" is
    "Marc", used nowhere else on the site).
  - **Real name**: "Legal name" takes priority over "Birth name" when a
    page has both (hit for real on DICE's Jay, who has a documented
    legal name change) — otherwise falls back to "Birth name".
  - **Current agency**: an "Agency" field commonly lists every agency a
    member has ever been under, e.g. `"SONRAY MUSIC (2023-present),
    Nadao Bangkok (2020-2022?)"` — `parseCurrentAgencyName` picks the
    entry whose date range says "present", falling back to the first
    entry if none does.

### Reused from `mediawikiParse.ts`

- **`textWithBreaks`**: infobox fields with multiple values are
  `<br>`-joined the same way Wikipedia's wikitable cells are (see
  `wikipedia-agency-import.md`'s network-cell fix) — hit again here on
  the "Agency" and "Birth name" fields, which would otherwise run
  together with no separator at all.
- **`parseTableGrid`**: not used directly by this importer (the current
  lineup comes from the infobox list, not a table), but available if a
  future addition needs the historical members table.

## Matching against our DB

- **Band**: matched by `name` (case-insensitive) + `type: "BAND"`. An
  existing row only gets its blank profile fields filled in (`bio`,
  `photoUrl`) — never overwrites a value that's already set, since a
  band added by hand may already have curated data. The label is
  *added* to its agency set (`addPerformerAgency`,
  `src/lib/performerAgency.ts`) rather than replacing whatever's there —
  see "A performer can belong to more than one agency" in
  [catalog.md](catalog.md#agencies).
- **Members**: matched by `name` *or* `realName` (case-insensitive,
  either matching) against existing `Performer` rows — a member already
  in the catalog under their stage name, or already under their real
  name (e.g. from a TMDB import, which prefers `realName` for cast
  credits — see `tmdb-import.md`), both resolve to the same match. A
  miss creates a new `Performer` (type `SOLO`) from the member page's
  data. Profile fields only fill in blanks; the member's own agency
  (from their page's "Agency" field, falling back to the band's own
  label if their page doesn't list one) is added to their set the same
  way as the band's.
- **`BandMember`**: upserted per member (`bandId_performerId` composite
  key) — safe to re-run, matching character-role `upsert` idempotency
  used elsewhere in this project's importers.

### A band and its members can each have more than one agency

Real idol groups often have both a talent management agency and a
separate music label, signed independently — and a member can be signed
to the label without the wiki listing their management, or vice versa.
Concretely: BUS and DICE were already manually set to agency "Tada
Entertainment" (their management) before this importer ever ran;
tpop.fandom.com's "Label(s)"/"Agency" fields say "SONRAY MUSIC" (their
music label) instead. Because agency associations are additive
(`PerformerAgency`, many-to-many — see
[catalog.md](catalog.md#agencies)), both bands now correctly show
**both** "Tada Entertainment" and "SONRAY MUSIC", and every member picked
up "SONRAY MUSIC" alongside whatever agency they already had — nothing
lost, nothing needed to be chosen between.

## New fields this added

None — reuses the same `Performer`/`Agency`/`PerformerAgency`/
`BandMember` fields every other importer writes to. No schema change.

## Discography import (albums + songs)

`scripts/import-tpop-discography.ts <tpop-url-or-title>` — отдельный
проход по секции `==Discography==` той же статьи (сырой wikitext через
`action=parse&prop=wikitext`, парсер — `src/lib/tpopDiscography.ts`).
Исполнитель матчится по названию статьи против `Performer.name` /
`musicAlias` (без регистра) и должен уже существовать.

- Подсекции с "album"/"EP" в заголовке → `Album` (тип ALBUM/EP), с
  обложкой со страницы самого альбома (`prop=pageimages`, URL викии
  обрезается до базового — суффикс `/revision/latest` у всех
  одинаковый и ломал локальные имена файлов). Апсерт по
  `(performerId, title)`.
- Подсекции singles/collaborations/OSTs/soundtracks → `Song` с годом и
  note из `{{small|…}}` («with SIZZY», название OST — для OST-строк
  название песни и OST меняются местами). Повторный запуск докидывает
  только новые (дедуп по title+note в коде — на Song нет уникального
  индекса).

Выводится на публичной странице исполнителя: секции «Альбомы» (ряд
обложек) и «Песни и синглы» (список с годами и note) — см.
[catalog.md](catalog.md#music).
