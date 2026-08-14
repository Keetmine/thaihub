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
- `/locations/map` plots every location that has coordinates; a location
  without coordinates (blscene link had no resolvable place, or it was
  never given one) just doesn't appear there — no error, no placeholder.

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
