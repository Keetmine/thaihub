# Favorites, watch status, going, friends

## Favorites

A plain heart/bookmark toggle, one join table per entity type
(`FavoritePerformer`, `FavoriteAgency`, `FavoriteEvent` — see
[data-model.md](../data-model.md)). Toggle UI: `FavoriteButton.tsx`,
server actions in `src/app/(public)/favorites/actions.ts`. Helper reads:
`getFavoritedEventIds()` in `src/lib/favorites.ts`.

**Dramas deliberately don't have a favorite/heart** — `FavoriteDrama` was
removed (migration `remove_favorite_drama`) since watch status already
covers "how do I feel about this drama", and having both was redundant.
`FavoriteKind` (`FavoriteButton.tsx`) only accepts `"performer" | "event"
| "agency"`.

## Watch status

Per-drama, MyDramaList-style status (`DramaWatchStatus`, one of
`WATCHING`/`COMPLETED`/`ON_HOLD`/`PLAN_TO_WATCH`/`DROPPED`) — the one
per-user "how do I feel about this drama" signal, replacing what would've
been a favorite. Two UIs:

- **`WatchStatusSelect`** — a full dropdown matching the app's
  `.performer-select` styling, used on a drama's own detail page where
  there's room for a labeled control.
- **`DramaStatusButton`** — a compact icon-button version used everywhere
  a drama shows up as a row/card (the `/dramas` list, a performer's or
  agency's filmography): a "+" when nothing's set yet, a pencil once it
  is, both opening the same small status-picker dropdown anchored to the
  button (`.drama-status-dropdown` in `globals.css`, reusing
  `.performer-select-option` row styling but positioned `right: 0` off a
  small trigger instead of stretching full-width).

`getDramaWatchStatuses(dramaIds, userId)` in `src/lib/favorites.ts` batch-
loads a `Map<dramaId, status>` for a page's rows (same shape as
`getFavoritedEventIds`) — deliberately *not* in `src/lib/watchStatus.ts`,
which stays free of any server-only import (Prisma) since client
components (`AccountTabs`, `WatchStatusSelect`, `DramaStatusButton`) pull
`WATCH_STATUS_LABELS`/`WATCH_STATUS_ORDER` from it.

`/dramas` filters by this status via a `.tab-bar-row` — "Все" plus one
tab per `WATCH_STATUS_ORDER` entry, combined with the existing title
search in the same row. `?status=` filters `Drama.findMany` by
`watchStatuses: { some: { userId, status } }` for the signed-in user;
logged-out visitors just see everything regardless of which status tab
is selected, since there's no per-user status to filter by.

## Going ("Я иду") — per occurrence

**«Иду» ставится на конкретную дату события** (`EventAttendance` keyed
`(userId, occurrenceId)`, with a denormalized `eventId` for
whole-event lookups): на двухдневном концерте можно выбрать только
25-е — и только оно попадёт в «мои события», календарь, план поездки и
ICS-фид. Списковые карточки (одна карточка = одна дата) переключают
свою дату; страница события показывает чипы «Пойду: [+ 24 авг] [✓ 25
авг]» (`GoingDateChips`). Фильтры «Я иду», friends-going индикаторы и
телеграм-напоминания тоже работают по датам. Старые событийные отметки
миграция размножила на все даты события.

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

## Public user profiles

`/users/[id]` (`(public)/users/[id]/page.tsx`) — any logged-in user can
open anyone's profile (own id redirects to `/account`). The header is a
DetailHero-style hero on the `.detail-hero` classes (Э2ф, `.profile-hero`
in `globals.css`): the user's photo as a blurred backdrop plus a round
avatar (letter fallback on the warm gradient when there's no photo), the
name large, «На MyBLHub с …» as subtitle, and the friends/events/
actors/series counts as a `.date-chip` row (hidden with the rest of the
activity for private profiles). Actions sit on the right: for friends a
«Ваш друг» chip plus the notification bell toggle
(`FriendNotifyToggle` — a `.chip-link`-style capsule with the
`BellIcon`/`BellOffIcon` SVGs); for everyone else a «В друзья» button
(`FriendActionButton` → `sendFriendRequest`), which turns into a «Заявка
отправлена» chip once a request is pending (an *incoming* pending
request shows «Ответить на заявку» linking to `/friends`).
«Пожаловаться» (`ReportButton`) deliberately lives as a small gray link
at the very bottom of the page, not in the header. Below the hero:
the trips this *viewer* is allowed to see (PUBLIC always, FRIENDS only
for the owner's accepted friends — same rules as the trip page itself),
favorite performers as `EntityMiniCard`s, and the upcoming events the
person is going to — the latter only when the **viewer** has premium
(events are subscription-gated; non-premium viewers see just the
count). Linked from every `UserRow` on `/friends` (avatar+name are the
link) and from the "Поездка пользователя X" note on a shared trip page.
A friend's shared trips are shown *only* here — `/friends` itself no
longer lists them.

## Account page event grouping

The account tabs show a multi-day event as **one row with a combined
date list** («16, 17, 18 октября 2026», `formatCombinedDateList`) —
`AccountEventEntry` in `AccountTabs.tsx`, built per *event* rather than
per occurrence. Per-date splitting stays only where lists are sorted by
date (the home афиша, day view, calendar, trip pages). An event counts
as upcoming until its **last** date has passed.

## Приватность профиля (гранулярная)

Друзья видят всё всегда. Для остальных — четыре переключателя в
настройках аккаунта: `hideProfileActivity` (мастер: только имя/фото),
`hideAchievements`, `hideFavoritePerformers`, `hideVisitedPlaces`.
Публичный профиль (/users/[id]) гейтит соответствующие секции; там же
появилась секция «Посещённые места» (chips, последние 24).
