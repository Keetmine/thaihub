# Locations

A `Location` is a real-world place — a filming spot, a venue — kept as its
own browsable entity rather than a free-text field, so it can carry a
photo, coordinates, and a per-user "visited" checklist.

Public: `src/app/(public)/locations/` (list, `[id]` detail,
`/locations/map`). Admin: `src/app/admin/(protected)/locations/`
(`LocationForm.tsx`, `actions.ts`).

## Map

Leaflet + `react-leaflet` v5, OpenStreetMap tiles (no API key/billing).
Marker icons are self-hosted under `/public/leaflet/` (copied from
`node_modules/leaflet/dist/images`) rather than pulled from a CDN, to
avoid bundler asset-path issues. Dark-mode tile recoloring is a CSS filter
on `.leaflet-map-dark .leaflet-tile-pane` (see `globals.css`).

- `src/components/LocationMapLoader.tsx` is a `"use client"` wrapper doing
  `next/dynamic(..., { ssr: false })` internally — required because this
  Next.js version doesn't allow `ssr: false` directly inside an async
  Server Component. Pages import `LocationMapLoader`, not `next/dynamic`,
  directly.
- The admin location form has a click-to-place coordinate picker (plus
  manual lat/lng inputs) built on the same map component.
- `/locations/map` plots every catalogue location that has coordinates; a
  location without coordinates (blscene link had no resolvable place, or
  it was never given one) just doesn't appear there — no error, no
  placeholder. Маркер несёт четыре поля (`id`, название, широта,
  долгота): описания, адреса и источники карте не нужны.

### Вкладка «Из моих сериалов» (`?mine=1`)

Залогинённому карта показывает ряд вкладок: **«Все места»** и **«Из
моих сериалов (N)»** (аудит 2026-09, §6 п.7). Вторая оставляет только
локации, снятые в сериалах, которые зритель отметил у себя, —
`DramaLocation` × `DramaWatchStatus` одним условием запроса:

```ts
dramas: { some: { drama: { watchStatuses: { some: { userId } } } } }
```

Отметкой считается **любой** статус просмотра (смотрю, посмотрел, буду
смотреть) — тем же правилом живут «мои сериалы» в календаре
(`?view=series&mine=1`) и «Выходит сегодня» на главной: в поездку едут и
за тем, что ещё только собираются посмотреть.

Состояние в адресе, а не в куке: ссылкой на срез можно поделиться, и без
JS переключатель работает. **Гостю вкладок нет вовсе** — отмечать
сериалы ему негде, и вкладка обещала бы содержимое, которого у него быть
не может; `?mine=1` без сессии просто показывает всю карту. Вкладки нет
и у того, у кого отмеченные сериалы есть, а мест съёмок у них не
заведено (`mineCount === 0`): пустую вкладку мы не предлагаем — то же
правило, что у переключателя «Мои» на главной. Счётчик в подписи —
отдельный `count`, он считается всегда, пока вкладка рисуется.

Пусто на «моих» и пусто вообще — разные `EmptyState`: во втором случае
дело в координатах каталога, в первом — в отметках зрителя, и сказать
надо разное.

## List views: alphabetical vs. grouped by drama

`/locations` has a toggle (`?group=drama`) between the default A-Z index
(`AlphabetIndexList`, same component the performers list uses) and a
view grouped by `Drama` — same `AlphabetIndexList` component, but each
*drama* is the indexed item (grouped by the first letter of its title,
with the same right-side letter rail), and `renderItem` renders that
drama's heading plus its linked locations underneath. Locations with
no linked drama at all (e.g. a venue only ever linked to an `Event`) get
a trailing "Без сериала" group via `AlphabetIndexList`'s `trailingSection`
prop, reachable from the index rail via a "—" link, so nothing silently
disappears from that view. The search box works in both modes — in
drama-grouped mode it filters which `Location` rows show under each
heading (via a `where` on the `DramaLocation` `include`, not a separate
query) and drops any drama left with zero matching locations, rather
than showing an empty heading.

## Detail page

The `[id]` page header is a `DetailHero` (see
`docs/design-system.md`): the location photo as card + blurred backdrop,
chips for the category (emoji + label from `src/lib/locationCategories.ts`,
when set) and «сериалов снималось: N», with `description` as the subtitle —
for catalog locations that field holds the district/city (≤100 chars),
not prose. Hero actions: the visited button («была здесь»), the
«Хочу сюда» heart (`WantToVisitButton` → `toggleWantToVisit`, puts the
place into the user's system "Хочу посетить" list — see
[place-lists.md](place-lists.md#системный-список-хочу-посетить); works
without a subscription) and, when the
user has place lists, an `AddToListButton` wired to `addPlaceToList`
(the button is hidden for users with zero lists — its empty state is
worded for performer lists). Filming dramas render below under the
«Дорамы» heading.

Two "related places" sections, deliberately distinct:

- **«Рядом с этим местом»** — up to 5 catalog locations within ~2 km by
  coordinates, each labeled with the straight-line distance («≈ 400 м»,
  «≈ 1.3 км»). Candidates are cut by a lat/lng bounding box in the
  Prisma query, then the exact haversine distance, sort and top-5 happen
  in JS (`src/lib/geo.ts` — no raw SQL/PostGIS; a few hundred locations
  with coordinates make this instant). Locations without coordinates
  simply don't get the block.
- **«Другие места этих съёмок»** — locations sharing a linked drama;
  those can be across the whole city.

## What links to a Location

- **`Drama`** via `DramaLocation` — many-to-many; the same real place is
  legitimately reused across multiple dramas (blscene tracks this itself
  as "reused locations"), so it's one `Location` row linked from several
  dramas rather than duplicated per drama.
- **`Event`** via `Event.locationId` (optional) — see
  [events.md](events.md#linking-an-event-to-a-location). A location's
  detail page shows a "События здесь" section for anything linked this
  way.
- **`LocationVisit`** — a user's own "been there" mark, independent of
  favoriting (there's no `FavoriteLocation` — visited *is* the tracked
  state here).

## Where the data comes from

The bulk of the `Location` catalog was populated by the blscene.com
importer, including automatic coordinate resolution from Google Maps
links where possible. See [blscene-import.md](blscene-import.md). Manual
entries (via the admin form) work exactly the same way, just without a
`blsceneUrl`/coordinate auto-resolution step.
