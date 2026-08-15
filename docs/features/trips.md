# Trips («Поездки»)

A `Trip` is a user's named date range (`title`, `startDate`, `endDate`)
— the trip page answers "what's happening while I'm in Thailand" without
manually re-entering a date filter every time.

- **`/trips`** (`src/app/(public)/trips/page.tsx`) — the user's own
  trips (ascending by start date, past ones dimmed, each with a count of
  events falling inside it); creation lives behind a «+ Создать поездку»
  button opening a `Modal` popup (`CreateTripButton.tsx`) rather than an
  always-visible form. **Premium-only** — the whole trips feature sits
  behind `User.isPremium` (see [auth.md](auth.md) for the exact gate
  matrix, including what happens to trips created before the flag was
  revoked).
- **`/trips/[id]`** — two tabs over the trip's date range:
  **«Мой план»** (default) shows only the occurrences of events the trip
  *owner* marked «я иду» (filtered in SQL via `attendees some userId`),
  merged with the owner's personal events — for a shared trip a guest
  sees the owner's plan, which is the point of sharing; **«Все события
  дат» (`?view=all`)** shows everything in the range, so picking new
  events into the plan is one «иду» click away. Both tab labels carry
  live counts, and the trips list page shows «N в плане · M всего» per
  trip. Rendered with the same `EventCard` rows as the home page
  (favorite/going buttons and friends-going indicator included), plus a
  delete button.
- **Personal events** (`TripPersonalEvent`: title, optional note, one
  `startsAt`; cascade-deleted with the trip): the owner's own private
  entries — flights, reservations, meetups — created via the «+ Личное
  событие» modal on the trip page and merged into the same chronological
  timeline as the public events. Rendered by `PersonalEventCard.tsx`
  (same `.event-card` layout, a «личное» badge, corner edit/delete
  buttons instead of favorite/going; editing opens a prefilled modal).
  A personal event without a time is stored at 00:00, sorting before
  that day's public events, and the card hides the meaningless "00:00".
  All three actions (`createTripPersonalEvent`/`update…`/`delete…` in
  `trips/actions.ts`) go through `requireOwnTrip`, and update/delete
  additionally scope the row by `tripId` — no cross-user or cross-trip
  reach, mirroring `deleteTrip`'s scoped-`deleteMany` pattern.
- Actions (`trips/actions.ts`): `createTrip` (validates dates via
  `combineDateTime`, so Buddhist-era years from Thai-locale date inputs
  get normalized like everywhere else), `updateTrip` (название/даты, модалка «Редактировать»), `deleteTrip` (scoped
  `deleteMany` by `{id, userId}` so deleting someone else's trip is a
  no-op). No edit — recreate is cheap.
- Nav: «Поездки» appears in the public nav only when logged in, plus a
  «Мои поездки» item in the profile dropdown (`ProfileMenu.tsx`).

## Visibility

`Trip.visibility` (`PRIVATE` | `FRIENDS` | `PUBLIC`, default `PRIVATE`):

- **PRIVATE** — owner only (any other viewer gets a 404, deliberately
  not a 403 — the trip's existence isn't confirmed to outsiders).
- **FRIENDS** — owner plus their ACCEPTED friends (checked via
  `getFriendIds(trip.userId)` on the trip page).
- **PUBLIC** — any logged-in user with the link.

Chosen at creation (radio group in the create modal,
`TripVisibilityControls.tsx`) and changeable later from the trip page's
owner toolbar (`VisibilitySelect` → `setTripVisibility`, scoped
`updateMany` by owner). Labels live in `src/lib/tripVisibility.ts` — a
client-safe module importable from server pages too (same split as
`dramaStatus.ts`). **Personal events stay owner-only at every
visibility level** — reservations/meetups aren't shown to guests even
on a public trip; guests see only the public events of the date range.
Friends' shared trips are surfaced on their profile pages
(`/users/[id]`, see [social.md](social.md)) — not on `/friends` (an
earlier «Поездки друзей» section there was removed as duplication).

## Trip tabs on the home page

The home page's tab bar (Все события / Я иду / Избранное) also lists
the user's own not-yet-finished trips as extra tabs (`✈ {title}`).
A trip tab is a **standalone mode, not a composable filter**: clicking
one shows *all* events of the trip's date range — the Иду/Избранное
filter is forced back to "all" while a trip is active, the manual
date-range button is hidden, and only the trip tab itself highlights.
Clicking any filter tab drops the trip; re-clicking the active trip tab
is a no-op navigation to the same URL, like any other tab. Under the hood `?trip={id}` still resolves
into the same `from`/`to` values as the manual range filter; the search
box keeps working within an active trip (its hidden fields carry `trip`
instead of `from`/`to`).
