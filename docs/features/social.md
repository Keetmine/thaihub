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
been a favorite. One UI:

- **`DramaStatusButton`** — a compact icon-button used everywhere
  a drama shows up as a row/card (the `/dramas` list, a performer's or
  agency's filmography): a "+" when nothing's set yet, a pencil once it
  is, both opening the same small status-picker dropdown
  (`.drama-status-dropdown` in `globals.css`, reusing
  `.performer-select-option` row styling). The dropdown renders through
  `createPortal(document.body)` with `position: fixed` coords taken from
  the button: card ancestors carry transforms (`.stagger`, poster
  hover), which turn `fixed` into ancestor-relative and used to fling
  the menu to a random spot on the page; scrolling just closes it.

У залогиненного пользователя со статусами `WATCHING` на главной
(`src/app/(public)/page.tsx`) выводится секция «Смотрю сейчас» — до 4
постеров (`PosterTile`, свежие по `updatedAt` первыми) со ссылкой
«все →» на `/dramas`; при пустом списке блок скрыт. Не за подпиской,
как и весь каталог.

### Прогресс по сериям (Ж6)

`DramaWatchStatus.episodesWatched` — на какой серии человек
остановился. `null` значит «не отмечал» и отличается от `0` («начал и
не посмотрел ни одной»): в первом случае полоса не рисуется вовсе.
Общее число берётся из `Drama.episodes` и тоже бывает неизвестным —
тогда счётчик работает без верхней границы.

**Счётчик двигает статус**, и это главное в фиче: досмотрел последнюю
серию — сериал уходит в `COMPLETED`, убавил обратно — возвращается в
`WATCHING`; отметил серию у того, что лежало в `PLAN_TO_WATCH`, —
значит уже смотрит. И наоборот: поставил `COMPLETED` руками — счётчик
догоняет до конца, досчитывать серии после этого человек не должен.
Без этой связки список «Смотрю сейчас» врёт, а на глаз это не заметно —
счётчик-то показывает правильное число. Автоматика только предугадывает
очевидное: поменять статус руками после неё по-прежнему можно.

**Но только у вышедшего целиком сериала.** У выходящего «последняя
серия» — это последняя из уже вышедших, дальше будут новые, и унести
такое в «Просмотрено» значит спрятать его из «Смотрю сейчас» ровно
тогда, когда человек ждёт продолжения. Придерживаем `RETURNING_SERIES`,
`PLANNED` и `IN_PRODUCTION`; неизвестный статус (`Drama.status = null`)
считаем вышедшим — у части импортированного статуса нет вовсе, и иначе
автоматика там не работала бы никогда.

**У `COMPLETED` пустой счётчик читается как n из n.** Статус могли
поставить до того, как появился подсчёт серий, или руками у сериала с
неизвестным тогда числом серий. Показывать «0 из 22» у досмотренного
было бы прямой ложью, поэтому подстановкой занимается `episodeProgress`
в `src/lib/watchStatus.ts` — общий помощник для всех мест показа.

Показывается в трёх местах — везде, где его можно править. На
постерных карточках КАТАЛОГА (фильмография артиста) прогресса нет
намеренно: цифры на каждой карточке ряда превращают его в таблицу, а
одна полоса без цифр ничего не сообщает — там смотрят, что за сериал, а
не сколько серий осталось. Карточка «Смотрю сейчас» на главной — другое
дело: она рабочая, прогресс с неё правят, поэтому полоса там есть.

- **страница сериала** — счётчик «− [5] / 22 +» с полосой
  (`EpisodeProgress`), в колонке фактов прямо над описанием: там человек
  и так задерживается. Только когда статус уже стоит — у сериала,
  который человек не смотрит, прогресс ничего не значит. Число — инпут
  (правка владельца): ввести «9» сразу быстрее, чем девять раз нажать
  плюс; черновик уходит в базу по Enter или уходу из поля, мусор
  откатывается к текущему значению, границы те же, что у кнопок.
  Выглядит инпут обычным текстом — ни рамки, ни фона, при фокусе только
  каретка; рядом «из N», а не слеш. Число
  на страницу приходит через `episodeProgress()` из lib/watchStatus, а
  не сырым полем: у «Просмотрено» счётчик бывает пустым (статус ставили
  до подсчёта серий), и сырой NULL показывал «0 из 10» у досмотренного;
- **список `/dramas`** — тот же счётчик справа, у кнопки статуса
  (`variant="inline"`: без подписи, цифры и кнопки мельче): править
  серии хочется прямо оттуда, не заходя на страницу сериала, но и
  отнимать ширину у названия он не должен. На узком экране строка
  переносит счётчик с кнопкой вниз — втроём в один ряд они там не
  помещаются, а обрезанное до «Th…» название хуже переноса;
- **карточка в «Смотрю сейчас»** на главной — тот же счётчик под
  постером и полоса внутри постера (`variant="card"`: без подписи
  «Серии» и без своей полосы, её рисует `PosterTile`, — две полосы
  рядом выглядели бы небрежно). Ради счётчика карточки на телефоне идут
  по две в ряд, а не по три. Эта карточка рабочая, а не витринная, —
  тем и отличается от постеров каталога, где прогресса нет вовсе;

Число рисуется оптимистично, до ответа сервера — нажал плюс, увидел
сразу; `router.refresh()` следом подтягивает остальное. Поэтому
компонент подравнивает своё состояние под пришедший prop прямо в
рендере: значение могло измениться и не отсюда (например, статус
переставили на «Просмотрено», и сервер досчитал серии до конца).

`getDramaWatchStatuses(dramaIds, userId)` in `src/lib/favorites.ts` batch-
loads a `Map<dramaId, status>` for a page's rows (same shape as
`getFavoritedEventIds`) — deliberately *not* in `src/lib/watchStatus.ts`,
which stays free of any server-only import (Prisma) since the client
component `DramaStatusButton` pulls `WATCH_STATUS_ORDER` from it. The
labels themselves live in the dictionary (`t.catalog.watchStatus`), not
in that module.

`/dramas` filters by this status via a `.tab-bar-row` — "Все" plus one
tab per `WATCH_STATUS_ORDER` entry, with the title search in the same
row. `?status=` filters `Drama.findMany` by
`watchStatuses: { some: { userId, status } }` for the signed-in user;
logged-out visitors just see everything regardless of which status tab
is selected, since there's no per-user status to filter by.

**Поиск и вкладки не пересекаются** (Ж5): при непустом `q` статус
игнорируется, запрос идёт по всему каталогу, вкладка показывается как
«Все» и под строкой поиска выводится пояснение «Поиск идёт по всему
каталогу, независимо от вкладок». Раньше они комбинировались в одном
`where`, и поиск внутри вкладки выглядел сломанным: сериал в каталоге
есть, а «ничего не найдено», потому что он не отмечен нужным статусом.
Ссылки самих вкладок запрос не тащат — переход на вкладку сбрасывает
поиск.

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
open anyone's profile. Свой профиль по **id** редиректит на `/account`,
а по **нику** открывается как есть — именно так ведёт пункт «Мой
профиль» в меню, это предпросмотр своей публичной страницы. В этом
случае вместо дружеских действий показывается ссылка «Это вы · в
кабинет» (Ж7: раньше на своей же странице висела кнопка «В друзья», и
заявку можно было отправить самому себе — сервер её отбивал, но кнопка
сбивала с толку). The header is a
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
Ошибки `sendFriendRequest` («сам себе», «заявка уже есть») приходят
значением `{ ok: false, error }` — текст исключения из server action в
проде до клиента не доезжает — и `FriendActionButton` показывает их
под кнопкой.
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
