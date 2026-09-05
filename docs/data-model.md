# Data model

Source of truth is `prisma/schema.prisma`. This is a guided tour, not a
copy — read the schema file for exact field types/nullability.

## Core catalog

- **`Performer`** — a solo actor or a band (`type: SOLO | BAND`). A
  performer can belong to one or more `Agency` (via `PerformerAgency`),
  have `Pairing`s, appear in `Drama`s (via `PerformerDrama`, with an
  optional `role`), appear at `Event`s (via `EventPerformer`), and have
  arbitrary `PerformerLink`s (social media, personal brand, etc.). A
  `BAND` performer's members are other `Performer` rows linked via
  `BandMember` (`bandId` ↔ `performerId`) — bands don't get their own
  dramas/pairings, only their members do.
- **`Agency`** — a talent/management agency (or, for `Drama`, a
  production/distribution studio — see below). Has a roster
  (`PerformerAgency[]`, many-to-many).
- **`PerformerAgency`** — join table, performer ↔ agency. Many-to-many
  because a performer can be signed to more than one at once — a
  co-produced drama's cast may formally belong to a different studio
  than the one that produced it, or a performer may move agencies over
  time — see [catalog.md](features/catalog.md#agencies). No current/past
  status field yet; every row just means "associated with", left simple
  until that distinction is needed.
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
- **`EventDraft`** — черновик события из краулера афиши ThaiTicketMajor
  и заодно память краулера (PENDING/APPROVED/REJECTED/NO_MATCH); своя
  таблица, а не флаг на `Event` — до одобрения владельцем публичная
  таблица не трогается. См. [ttm-crawl.md](features/ttm-crawl.md).
- **`MascotDraft`** — черновик маскота из недельного краулера вики GMMTV
  и заодно память краулера (PENDING/APPROVED/REJECTED); дедуп по
  нормализованному имени (`nameKey` @unique), совпавшие владельцы —
  Json. Та же логика «своя таблица, публичный `Performer` не трогается».
  См. [gmmtv-mascots-import.md](features/gmmtv-mascots-import.md).

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

- **`FavoritePerformer`**, **`FavoriteAgency`**, **`FavoriteEvent`** — the
  heart/bookmark toggle, one per entity type. Dramas don't get one —
  `DramaWatchStatus` below is their only per-user signal.
- **`EventAttendance`** — "Я иду" (I'm going) to this event.
- **`EventTicket`** — купленный билет-файл к событию (обычно к его
  дате; `occurrenceId` nullable, `SetNull` — пересборка дат события не
  убивает билет). Своя модель, а не поле на `EventAttendance`: билет
  должен переживать снятое «иду». Легаси-колонка `ticketUrl` на
  отметке закомментирована в схеме до отката. См.
  [events.md](features/events.md#билеты-мои-билеты).
- **`DramaWatchStatus`** — MyDramaList-style status
  (`WATCHING`/`COMPLETED`/`ON_HOLD`/`PLAN_TO_WATCH`/`DROPPED`).
- **`LocationVisit`** — see above.
- **`UserAchievement`** — `(userId, key)`, the fact + moment a user
  unlocked an achievement. `key` references `Achievement.key` (below)
  deliberately **without** an FK: deleting a definition in the admin just
  stops the badge from rendering, the fact row stays.

See [social.md](features/social.md) for how these surface in the UI.

## Achievements

- **`Achievement`** — an achievement definition, editable at
  `/admin/achievements` (used to be hardcoded). `key` (unique), `emoji`,
  `title`, `hint`, `metric`, `threshold`, `enabled`, `sort`. `metric` is a
  key into the fixed code-side registry (`METRICS` in
  `src/lib/achievements.ts`) — the DB says *which* metric and *what*
  threshold, the code does the counting. Flag-style metrics keep
  `threshold = 1`. See [gamification.md](features/gamification.md).

## Users & auth

- **`User`** — real account (email/password), separate from the single
  shared admin password. `icsToken` (unique, nullable) backs the
  "subscribe to my calendar" feed — see
  [events.md](features/events.md#ics-subscribe-feed). `lastSeenAt`
  (nullable) — последняя активность, обновляется не чаще раза в 10
  минут; см. [auth.md](features/auth.md#отметка-активности).
- **`UserSession`** — server-side session row; the cookie just holds this
  row's id.
- **`Friendship`** — a directed request row (`requesterId` →
  `addresseeId`) with `status: PENDING | ACCEPTED`. An accepted row *is*
  the friendship — there's no second row for the other direction; queries
  check both `requesterId` and `addresseeId` for a given user. See
  [social.md](features/social.md#friends).

See [auth.md](features/auth.md) for how login/session validation actually
works (proxy.ts vs. `getCurrentUser()`).
