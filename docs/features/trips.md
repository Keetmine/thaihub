# Trips («Поездки»)

A `Trip` is a user's named date range (`title`, `startDate`, `endDate`)
— the trip page answers "what's happening while I'm in Thailand" without
manually re-entering a date filter every time.

- **`/trips`** (`src/app/(public)/trips/page.tsx`) — the user's own
  trips plus shared trips they were added to as a member, rendered as
  ticket-style `.trip-card` cards (Э2ф in `globals.css`, a `.glow-panel`
  variation): the date range large in the display font («20 авг →
  27 авг», year small), the title under it, «совместная» as a
  `.date-chip` (organizer's name shown on shared trips), the «N в
  плане · M всего» counter doubled by a mini progress bar
  (`.trip-progress`), visibility as small text. Ascending by start
  date; все предстоящие карточки равнозначные и приглушённые (без
  hero-варианта — фидбек владельца), past trips collapse into dimmed
  compact rows (`.trip-card-past`) under a «Прошедшие» heading; creation lives behind a «+ Создать поездку»
  button opening a `Modal` popup (`CreateTripButton.tsx`) rather than an
  always-visible form; в форме есть мультиселект «С кем едете»
  (EntityMultiSelect по друзьям, с аватарками) — выбранные друзья сразу
  становятся участниками (`createTrip` фильтрует id по реальным
  друзьям). **Premium-only** — the whole trips feature sits
  behind `User.isPremium` (see [auth.md](auth.md) for the exact gate
  matrix, including what happens to trips created before the flag was
  revoked).
- **Блок на главной**: у залогиненного премиум-пользователя на главной
  (`src/app/(public)/page.tsx`) между «Вы идёте» и «Что нового»
  выводится секция «Ваши поездки» — до 3 ближайших незавершённых
  поездок (свои + принятые совместные, `endDate >= now`, по
  `startDate`), компактными строками «название + даты» со ссылкой
  «все →» на `/trips`; при пустом списке блок скрыт целиком.
- **`/trips/[id]`** — two tabs over the trip's date range:
  **«Мой план»** (default; «План» when the trip has members) shows the
  occurrences of events any *participant* (owner + members) marked «я
  иду» (filtered in SQL via `attendees some userId in participantIds`),
  merged with the participants' personal events — for a guest viewer
  the plan of the participants is the point of sharing; **«Все события
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
  `trips/actions.ts`) go through `requireTripAccess` (owner OR member),
  scope the row by `tripId`, and update/delete additionally enforce
  per-item permissions via `canTouchItem` (see «Совместные поездки»).
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
`dramaStatus.ts`). **Personal events and todos stay participant-only at
every visibility level** — reservations/meetups aren't shown to guests
even on a public trip; guests see only the public events of the date
range. Trip members see the trip regardless of its visibility.
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

## Совместные поездки (TripMember)

Владелец приглашает в поездку друзей (модалка «Участники (N)» на
странице поездки, `TripMembersControls.tsx`, или мультиселект прямо в
форме создания; кандидаты — ACCEPTED-друзья владельца, ещё не
состоящие в поездке). Добавление — это **инвайт**
(`TripMember.status`: PENDING → ACCEPTED): приглашённый видит блок
«Приглашения» на `/trips` и баннер «Принять / Отклонить» на странице
самой поездки (PENDING даёт право открыть страницу при любой
видимости, но личное/дела до принятия не видны). Отклонение удаляет
строку (можно пригласить снова), владелец может отменить инвайт из
модалки («приглашение отправлено» + корзина). Приглашённому уходит
телеграм-сообщение со ссылкой на поездку (`notifyTripInvite`), а
владельцу — уведомление, когда инвайт принят. Участником считается
только ACCEPTED: поездка появляется у него в `/trips` и в табах
главной, и он наравне с владельцем вносит события/дела/места (гейт
`requireTripAccess` в actions: владелец ИЛИ ACCEPTED-участник, премиум
обязателен обоим). Выйти из поездки участник может сам (кнопка в той
же модалке); владелец может убрать любого.

Права на записи (личные события и дела): у каждой записи есть
`createdById` (null = владелец, легаси) и флаг `editableByOthers` —
галочка «Участники поездки могут редактировать и удалять» в формах
создания/правки (показывается только в совместных поездках; в
соло-формах прежнее значение сохраняется hidden-инпутом, иначе update
сбросил бы флаг). Менять/удалять запись могут: автор, владелец поездки,
и другие участники — только при поднятом флаге (`canTouchItem` в
`trips/actions.ts`, продублировано в UI per-item полем `canEdit`).
В совместной поездке у записей подписывается автор (имя серым).

Вторая галочка — «Приватное — видно только мне» (`isPrivate` на
TripTodo и TripPersonalEvent): запись не показывается никому, кроме
автора, даже другим участникам и владельцу (бейдж «приватное» у
автора). Обе галочки видны только в совместных поездках; в соло-формах
прежние значения флагов сохраняются hidden-инпутами, иначе update
сбросил бы их.

Фильтр «Только моё» (`?mine=1`, кнопка справа от табов, только в
совместных поездках): план сужается до собственных отметок «иду»,
личных событий и дел текущего юзера.

## Дела поездки (TripTodo)

Вкладка «Дела» (участникам, между «Все события дат» и «Что посетить»):
обычный туду — добавить пункт (текст + необязательная дата), чекбокс
выполнения, правка/удаление по правам выше. Датированные дела попадают
в хронологию «Мой план» той же строкой (TodoRow).
Форма добавления ремоунтится по ключу после сабмита — иначе
DatePickerInput молча тащит прошлую дату в следующий пункт.

Блок «локации съёмок сериалов, которые вы смотрите» из «Что посетить»
убран — там остались только прикреплённые списки и отдельные места;
поиск в «добавить место» ищет и по названию места, и по названию
сериала (searchLocationOptions в lists/actions).
