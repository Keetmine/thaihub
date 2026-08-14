# Data model

Source of truth is `prisma/schema.prisma`. This is a guided tour, not a
copy — read the schema file for exact field types/nullability.

## Core catalog

- **`Performer`** — a solo actor or a band (`type: SOLO | BAND`). Solo
  performers can belong to an `Agency`, have `Pairing`s, appear in
  `Drama`s (via `PerformerDrama`, with an optional `role`), appear at
  `Event`s (via `EventPerformer`), and have arbitrary `PerformerLink`s
  (social media, personal brand, etc.). A `BAND` performer's members are
  other `Performer` rows linked via `BandMember` (`bandId` ↔
  `performerId`) — bands don't get their own dramas/pairings, only their
  members do.
- **`Agency`** — a talent/management agency. Has a roster (`Performer[]`)
  and can also be linked to `Drama`s directly (production/distribution
  agency, not necessarily the cast's agency).
- **`Drama`** — a BL series. `blsceneUrl` (unique, nullable) links it back
  to its blscene.com source page when it came from the importer — see
  [blscene-import.md](features/blscene-import.md) for why that's a
  separate field from `title` rather than matching on title text.
- **`Pairing`** — a named "ship" of two performers
  (`performerAId`/`performerBId`, unique together). Selectable on events
  alongside or instead of individual performers.

## Events

- **`Event`** — no date/time fields of its own; see `EventOccurrence`
  below. See [events.md](features/events.md) for the full picture
  (multi-day creation, presale, ICS export). Optionally linked to a
  `Drama` (`dramaId`) and/or a `Location` (`locationId`) — both nullable,
  independent of each other.
- **`EventOccurrence`** — one date/time an `Event` happens on
  (`eventId`, `startsAt`, `endsAt?`). A multi-day concert is one `Event`
  with several of these, not several `Event` rows — see
  [events.md](features/events.md#multi-day-events-are-one-event-several-eventoccurrences).
  Cascade-deletes with its `Event`.
- **`EventPerformer`** / **`EventPairing`** — join tables, event ↔
  performer / event ↔ pairing.

## Locations

- **`Location`** — a real-world place (filming spot, venue), with optional
  `latitude`/`longitude` for the map. See
  [locations.md](features/locations.md).
- **`DramaLocation`** — join table, drama ↔ location (a location can be
  reused across multiple dramas — blscene tracks this itself, so the
  importer dedupes by location name rather than creating a fresh row per
  drama).
- **`LocationVisit`** — a user marking a location as visited (their own
  "been there" checklist, not a favorite).

## Per-user state

Every one of these is a two-column join table keyed on `(userId, ...)`,
following the same shape:

- **`FavoritePerformer`**, **`FavoriteDrama`**, **`FavoriteAgency`**,
  **`FavoriteEvent`** — the heart/bookmark toggle, one per entity type.
- **`EventAttendance`** — "Я иду" (I'm going) to this event.
- **`DramaWatchStatus`** — MyDramaList-style status
  (`WATCHING`/`COMPLETED`/`ON_HOLD`/`PLAN_TO_WATCH`/`DROPPED`), distinct
  from favoriting.
- **`LocationVisit`** — see above.

See [social.md](features/social.md) for how these surface in the UI.

## Users & auth

- **`User`** — real account (email/password), separate from the single
  shared admin password. `icsToken` (unique, nullable) backs the
  "subscribe to my calendar" feed — see
  [events.md](features/events.md#ics-subscribe-feed).
- **`UserSession`** — server-side session row; the cookie just holds this
  row's id.
- **`Friendship`** — a directed request row (`requesterId` →
  `addresseeId`) with `status: PENDING | ACCEPTED`. An accepted row *is*
  the friendship — there's no second row for the other direction; queries
  check both `requesterId` and `addresseeId` for a given user. See
  [social.md](features/social.md#friends).

See [auth.md](features/auth.md) for how login/session validation actually
works (proxy.ts vs. `getCurrentUser()`).
