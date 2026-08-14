# Favorites, watch status, going, friends

## Favorites

A plain heart/bookmark toggle, one join table per entity type
(`FavoritePerformer`, `FavoriteDrama`, `FavoriteAgency`, `FavoriteEvent` —
see [data-model.md](../data-model.md)). Toggle UI: `FavoriteButton.tsx`,
server actions in `src/app/(public)/favorites/actions.ts`. Helper reads:
`getFavoritedEventIds()` in `src/lib/favorites.ts`.

## Watch status

Per-drama, MyDramaList-style status (`DramaWatchStatus`, one of
`WATCHING`/`COMPLETED`/`ON_HOLD`/`PLAN_TO_WATCH`/`DROPPED`) — separate
concept from favoriting a drama. Rendered as a custom dropdown matching
the app's `.performer-select` styling, not a native `<select>`.

`/dramas` filters by this status via a `.tab-bar-row` — "Все" plus one
tab per `WATCH_STATUS_ORDER` entry (`src/lib/watchStatus.ts`), combined
with the existing title search in the same row. `?status=` filters
`Drama.findMany` by `watchStatuses: { some: { userId, status } }` for the
signed-in user; logged-out visitors just see everything regardless of
which status tab is selected, since there's no per-user status to filter
by. Same `WATCH_STATUS_LABELS` Russian labels drive both the tabs here
and the dropdown on a drama's own page.

## Going ("Я иду")

`EventAttendance` — a user marking themselves as attending a specific
event. Toggle UI: `GoingButton.tsx`. Drives:

- The Все/Иду/Избранное filter on the home page
  (`src/app/(public)/page.tsx`).
- The calendar's Все/Мои toggle (`src/app/(public)/calendar/page.tsx`) —
  defaults to showing **all** events; `?view=mine` narrows to just the
  ones you're going to.
- A bolder "going" chip style on calendar day cells.
- The ICS subscribe feed (every "going" event, live — see
  [events.md](events.md#ics-subscribe-feed)).
- Friends-going, below.

## Friends

`Friendship` is a directed request row (`requesterId` → `addresseeId`,
`status: PENDING | ACCEPTED`) — an accepted row *is* the friendship, there
is no mirrored second row for the other direction. UI:
`src/app/(public)/friends/page.tsx` (search by name/email, incoming/outgoing
requests, accepted list), actions in
`src/app/(public)/friends/actions.ts`.

### Friends-going indicator

`src/lib/friends.ts` exports two helpers built for this:

- `getFriendIds(userId)` — ids of the user's accepted friends, either
  side of the `Friendship` row.
- `getFriendsGoingByEvent(eventIds, friendIds)` — for a batch of events,
  which of those friends are attending each one (one query, grouped by
  event id — avoids N+1 queries on list pages).

Surfaced as a "N друзей идут" line (with names on hover) via
`EventAgendaRow`'s optional `friendsGoing` prop, wired in on every page
that lists events: home (`src/app/(public)/page.tsx`), day view, search
results, and a location's "События здесь" section. The event detail page
(`src/app/(public)/event/[id]/page.tsx`) shows a dedicated "Друзья идут"
block with mini-cards instead of a text line, since it has more room.

Friend mini-cards on the event detail page link to `/friends` — there's
no individual public user-profile page to deep-link to, so this is
intentionally the closest existing destination rather than a dead link.
