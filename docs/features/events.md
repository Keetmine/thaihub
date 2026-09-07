# Events

Public list/detail: `src/app/(public)/events/page.tsx` — the feed
("Афиша"), with an Все/Иду/Избранное/Мои артисты filter, a name search
box and a `?from=YYYY-MM-DD&to=YYYY-MM-DD` date-range filter (see below).
**The feed lives at `/events`, not at `/`** — `/` is the logged-in
summary page and takes no search params at all. Every control on the feed
(search box `action`, `DateRangeFilterButton` `action`, the trip tabs)
must therefore point at `/events`; pointing one at `/` throws the visitor
onto the summary page (and, on `/ru`, into a 404 — `NameSearchBox` adds
the locale prefix itself, so it must be handed an unprefixed path).
Also: `src/app/(public)/day/[date]/page.tsx`,
`src/app/(public)/event/[id]/page.tsx`, `src/app/(public)/calendar/page.tsx`
(month grid, defaults to showing **all** events — `?view=mine` narrows to
just the ones the current user is going to, `?view=birthdays` and
`?view=series` switch the grid to birthdays / episode air dates).

## Каталожные выборки: фильтр обязателен

С появлением сообществ (АА25) у `Event` два разных смысла: **афишные
события** (концерты, фанмиты, премьеры — их заводят админка и импортёры)
и **встречи сообществ** («смотрим серию у Кати» — их заводят люди,
`Event.communityId` не null). Таблица одна: так встреча бесплатно
получает карточку, «я иду», комментарии, карту и календарь.

**Каждое место, где события берутся скопом, обязано идти через
`catalogEventsWhere()` / `catalogOccurrencesWhere()`
(`src/lib/catalogEvents.ts`).** Одна забытая выборка — и домашние
посиделки окажутся в общей афише рядом с концертом в Impact Arena, а
вместе с ними чей-то домашний адрес.

```ts
where: { ...catalogEventsWhere(), dramaId: id }
where: { ...catalogOccurrencesWhere(), startsAt: { gte: today } }
```

Где фильтр уже стоит: лента и счётчик афиши (`lib/eventList.ts`), тизер
афиши, названия-подложка на `/events`, лендинг, главная, календарь,
страница дня, страницы сериала, локации, артиста, поиск (раздел событий
и «всё сразу»), живые подсказки поиска, план поездки, профиль
пользователя («иду» и избранное, включая счётчик), лента активности,
карта сайта, ICS-фид, выгрузка CSV, telegram-напоминания и пресейл-пинги,
статистика и «видела вживую» (`lib/userStats.ts`), дедуп импорта
(`lib/eventDedupe.ts`), сверка концертов в импорте агентства, а в админке
— список событий, массовые действия, быстрый поиск, комбобокс событий,
счётчики дашборда и аналитика.

Отдельные случаи, где фильтра нет намеренно:

- `getFavoritedEventIds`, `getGoingOccurrenceIds`,
  `getFriendsGoingByOccurrence` — они сужают уже полученный список id и
  наследуют фильтр вызывающего;
- поиск существующего события по `sourceUrl` в импортёрах — у встречи
  `sourceUrl` всегда `null`, совпасть не с чем;
- правка и удаление одного события по id в админке — это модерация, а не
  список.

Обратная сторона фильтра — `openMeetupsWhere()`: встречи, которые автор
открыл всем. Они показываются на `/events` отдельным блоком (см.
`docs/features/communities.md`, раздел «Встречи сообщества»).

## Date-range filter (the feed)

`/events?from=2026-08-20&to=2026-08-25` — either bound is optional. When a
range is active, the feed drops its usual upcoming/archive split
(both stop being meaningful once you've picked an explicit window — e.g.
revisiting a past trip) and shows every matching occurrence as one
ascending list, still day-grouped the same way. The `filter`
(Все/Иду/Избранное) toggle and the date range compose — switching filters
carries the active range along via `rangeQuery`. This is meant as the
building block for a possible future "trip" feature (save a named date
range, mark which of its events you actually attended) — if that gets
built, it should stay a thin wrapper over this same query rather than a
heavier new concept.

Above the feed, an active range adds a "N событий в диапазоне" line. Its
count comes from `countEventListRange` (`src/lib/eventList.ts`), which
shares one `occurrenceFilterWhere` helper with `fetchEventListPage` — the
counter must not build its own copy of the conditions. It did once, and
drifted: the copy never grew the "Мои артисты" branch, so that tab with a
date range reported the unfiltered total (73 instead of 59 on the owner's
account) while the list below showed the filtered one.

The from/to inputs live behind `DateRangeFilterButton` (a calendar-icon
button, filled/`is-accent` when a range is active) rather than as
always-visible fields — clicking it opens a small popover
(`.date-range-filter-dropdown`) with the same two `<input type="date">`s,
a "Показать" submit, and a "Сбросить" link when a range is set. It sits
inside the feed's `.tab-bar-row`, to the left of the search box (see
[architecture.md](../architecture.md#conventions)) — a reusable pattern
for "a filter that needs real inputs but shouldn't clutter a tab row",
distinct from `DramaStatusButton`'s dropdown (a fixed list of options
instead of freeform inputs).

Admin CRUD: `src/app/admin/(protected)/events/` (`EventForm.tsx`,
`actions.ts`, `new/`, `[id]/edit/`).

## Fields

An `Event` has a title, venue (free text), optional description, and
optionally links to a `Drama` (`dramaId`) and/or a `Location`
(`locationId`) — see below and [locations.md](features/locations.md).
**Dates/times live on a separate `EventOccurrence` model, not on `Event`
itself** — see the next section. See [data-model.md](../data-model.md)
for the full field list.

## Организатор, адрес, карта и теги

Четыре необязательных поля, которые заполняет краулер фестивалей
(см. [musicfestival-import.md](musicfestival-import.md)), а руками —
секция «Основное» формы события:

- `organizer` — кто проводит («GMM Show»);
- `address` — адрес площадки текстом (район и город); `venue` остаётся
  отображаемым НАЗВАНИЕМ площадки;
- `mapsUrl` — ссылка на карту, у источников часто короткая
  (`maps.app.goo.gl/…`);
- `tags` — жанры/теги события; в форме это одна строка через запятую,
  как жанры и теги сериала (`getCsv` в `actions.ts`), а не отдельный
  виджет.

Все четыре сохраняются и при создании, и при правке, и идут в историю
правок через `diffRecords` (подписи — `FIELD_LABELS` в
`src/lib/audit.ts`).

На публичной странице они живут в том же инфо-блоке, что площадка и
даты, и **пустые не рисуются вовсе** — у большинства событий эти поля
пустые, и строка «Организатор: —» на всю афишу хуже её отсутствия:

- с `mapsUrl` название площадки становится ссылкой на карту
  (`target="_blank" rel="noopener noreferrer"`, `title` — «Открыть на
  карте»); без него — обычный текст;
- `address` идёт тихой серой добавкой через «·» прямо за названием
  площадки, а не отдельной строкой;
- `organizer` — своей строкой-фактом под площадкой (`BuildingIcon`);
- `tags` — чипами `.tag-chip` сразу под организатором (правка владельца
  2026-09-06), и чип КЛИКАБЕЛЬНЫЙ: ведёт в
  `/search?section=events&tags=<тег>`, как жанр у сериала. Сам фильтр —
  `tags` в `eventFilterDefs`/`eventFilterWhere`
  (`src/lib/catalogFilters.ts`), варианты берутся из базы
  (`loadEventFilterOptions`, кэш на полчаса с `CATALOG_TAG`); несколько
  тегов сужают выдачу (`hasEvery`), как у сериалов. Тот же фильтр виден
  и в админском списке событий.

## Multi-day events are one Event, several EventOccurrences

A concert that repeats over several nights (e.g. LYKN's 2-day Reflexion
Concert) is genuinely **one** `Event` — one title, one venue, one cast,
one favorite/going state, one presale block — with several
`EventOccurrence` child rows (`id`, `eventId`, `startsAt`,
`endsAt?`). It shows up once per date everywhere events are listed (home,
day view, calendar, search), but editing or deleting it acts on the whole
thing at once, and toggling favorite/going affects every date identically
since those are keyed on `Event.id`, not per-occurrence.

- **`src/lib/eventOccurrences.ts`**'s `flattenOccurrence()` is the
  standard way to turn one `EventOccurrence` (+ its parent `Event`) into
  the row shape list pages render — `EventWithPerformers` in
  `src/lib/types.ts`. Its `id` field is deliberately the **Event** id
  (so favorite/going/detail-link behavior is identical across every date
  of the same event); `occurrenceId` is a second field used only for
  React list keys, since the same event can legitimately render more than
  once in one list.
- **Every event-listing query fetches `EventOccurrence` rows (optionally
  filtered by date range), not `Event` rows**, then flattens each one via
  `flattenOccurrence`. See `src/app/(public)/page.tsx`,
  `day/[date]/page.tsx`, `calendar/page.tsx` for the direct
  `prisma.eventOccurrence.findMany(...)` pattern; `search/page.tsx`,
  `dramas/[id]/page.tsx`, `performers/[id]/page.tsx`,
  `locations/[id]/page.tsx` instead match on `Event` fields first (title,
  cast, dramaId, locationId) and then `flatMap` each matched event's
  `occurrences` into rows, since the match criteria aren't date-based.
- **`EventForm.tsx`** has a repeatable date/time row list (not a single
  date field) — always at least one row, "+ Добавить ещё день" adds
  more, available in **both** create and edit mode (editing can add/
  remove dates from an existing event, not just adjust the one it had).
  Each row carries an `occurrenceId` (empty for a new, unsaved row).
- **`createEvent`**/**`updateEvent`** (`actions.ts`) read parallel
  `occurrenceId[]`/`occurrenceDate[]`/`occurrenceStartTime[]`/
  `occurrenceEndTime[]` arrays from the submitted form
  (`getOccurrenceInputs`). `createEvent` just creates one `EventOccurrence`
  per row alongside the `Event`. `updateEvent`'s `syncOccurrences` diffs
  the submission against what's already in the DB: rows with an
  `occurrenceId` get updated in place, rows without one get created, and
  any existing occurrence *not* present in the submission anymore gets
  deleted — so removing a date in the edit form actually removes that
  `EventOccurrence` row.
- Deleting an `Event` cascades to its `EventOccurrence` rows
  (`onDelete: Cascade` in the schema) — no separate cleanup needed.
- **The event detail page** (`event/[id]/page.tsx`) groups occurrences
  that share the same time-of-day via `groupOccurrencesByTime` and
  renders each group as one line: a single-occurrence group keeps the
  full weekday date format, a multi-occurrence group instead uses
  `formatCombinedDateList` (`src/lib/dates.ts`) to compact same-month
  dates into "21, 22, 23 августа 2026" followed by the one shared time —
  avoids a full "Дата и время: ..." line per date for a show that just
  repeats on consecutive nights at the same time.

## Календарь серий: день, «только мои», входы (И8–И11)

Вкладка «Сериалы» календаря (`/calendar?view=series`) показывает
строки `DramaEpisode` с объявленной датой. Число дня в ячейке — ссылка
на `/day/<дата>` (чипы заняты ссылками на сериалы, целиком ячейку
ссылкой не сделать — вложенные `<a>`); сама страница дня показывает и
события афиши, и СЕРИИ этого дня (раньше — только события, и клик по
числу уводил в пустоту). Заголовки секций «События»/«Серии» рисуются
только когда на дне есть и то и другое.

«Только мои» (И11): второй ряд-переключатель под вкладками, только на
вкладке сериалов и только залогиненным — фильтрует расписание до
сериалов с ЛЮБЫМ статусом просмотра пользователя. Параметр `mine=1`
(`view=mine` занят событиями), переживает листание месяцев через
`viewQuery`.

Входы в календарь серий (И9, И10): ссылка «Календарь» у блока
«Выходит сегодня» на главной и иконка календаря на `/dramas` рядом с
полем поиска — раньше из каталога и главной в расписание было не
попасть.

## Инфо-блок и состав

Инфо-блок (площадка, дата и время, цены, препродажа) — БЕЗ
подложки-surface, как и «Описание» (просьбы владельца). Состав «кто
выступает» ЛЮБОГО размера живёт плашками-капсулами прямо в инфо-блоке
(`CastGrid chips clampRows={2}`) — как каст на странице сериала;
раньше составы больше 12 человек уезжали в отдельную секцию
фото-сеткой, и две страницы событий выглядели по-разному (жалоба
владельца). Свёртка — максимум ДВА РЯДА по фактической высоте капсул
(они разной ширины, счётчиком ряды не угадать: ResizeObserver меряет
первую капсулу и ставит max-height), дальше «Показать всех (N)».
Пейринги — чипами под капсулами. Пофестивальный «Состав по дням»
остался отдельной секцией.

## Presale

`presaleAt` / `presaleUrl`, toggled by a switch in the admin form
(`presaleEnabled` checkbox gates whether the date/time/URL fields are read
at all — see `getPresaleAt`/`getPresaleUrl` in `actions.ts`).

On the public event page it lives inside the same info card as venue/
date/price, right under "Цена билетов:" — not a separate `surface` block
further down the page, so it reads as one more fact about the event
rather than a disconnected section. It still shows the "Билеты" link (if
`presaleUrl` is set) and a **labeled** "Добавить в календарь" button (if
`presaleAt` is set **and still in the future** — a reminder for a
presale that already started is noise, so the button disappears once
`presaleAt` passes) side by side — deliberately a text button, not a
second icon in the top icon row next to the regular calendar-add button,
so it reads as part of the presale call-to-action rather than a generic
page action.

## ICS export (single event)

`src/app/(public)/event/[id]/ics/route.ts` — `GET
/event/[id]/ics` (add `?presale=1` for the presale reminder instead of the
event itself) returns a `.ics` file via `buildEventICS` /
`buildPresaleICS` in `src/lib/ics.ts`. `buildEventICS` emits **one VEVENT
per `EventOccurrence`**, UID'd by occurrence id (not event id) — a 2-day
event's `.ics` download has two calendar entries, both titled the same.
This route is explicitly exempted from the login gate in `src/proxy.ts`
(`pathname.startsWith("/event/") && pathname.endsWith("/ics")`) since
calendar apps fetch it directly, without a session cookie.

## ICS subscribe feed (all "going" events)

Unlike the one-off download above, `/account/settings` exposes a **live,
subscribable** feed URL: `GET /api/calendar-feed/[token]`
(`src/app/api/calendar-feed/[token]/route.ts`), returning every occurrence
of every event the token's owner has marked "Иду" as one multi-`VEVENT`
`.ics` file (`buildFeedICS` in `src/lib/ics.ts`, same per-occurrence VEVENT
generation as above). A calendar app (Google/Apple Calendar) that
subscribes to this URL re-fetches it periodically and picks up newly-added
"going" events automatically — no manual re-download.

- **Auth model:** the URL itself *is* the credential — `User.icsToken` (a
  random UUID, generated on first visit to settings via
  `getOrCreateIcsToken()` in `src/app/(public)/account/actions.ts`). The
  route looks the user up by token, not by session cookie, since calendar
  apps don't carry one. `/api/*` is exempted from the proxy login gate
  entirely, so this works.
- **Revoking access:** `regenerateIcsToken()` issues a new token,
  invalidating the old URL. Exposed via the "Обновить ссылку" button in
  `IcsFeedSection.tsx`.
- UI: `src/app/(public)/account/settings/IcsFeedSection.tsx` (client
  component — shows the URL, a copy button, and the regenerate button).

## Linking an event to a `Location`

`Event.locationId` is an optional pointer into the `Location` catalog
(separate from the free-text `venue` string, which always renders as the
display address regardless of whether it's linked). Use case: a recurring
fan-meet spot, or a venue that's also a filming location already in the
catalog — linking it means:

- The event shows up in a "События здесь" section on that location's
  detail page (`src/app/(public)/locations/[id]/page.tsx`).
- It becomes discoverable from the location side without duplicating the
  venue as free text somewhere else.

Set via the "Локация из каталога (необязательно)" `EntitySelect` in
`EventForm.tsx` — entirely optional, independent of the required `venue`
text field.

## Friends going

Event rows and the event detail page show who among the current user's
accepted friends is also going — see
[social.md](features/social.md#friends-going).

## Ticket price

`Event.ticketPrice` is a free-text field (e.g. `"6,900 / 5,900 / 5,000
baht"`), not a structured number — sources like ThaiTicketMajor list
several seating tiers as one string, and there's no need to model that as
anything richer than what gets displayed. Editable in `EventForm.tsx`,
shown on the public event page under the time/venue block when set, and
as a hero chip: short strings verbatim, long tier lists (>30 chars with
2+ numbers) compacted to «от {min} {unit}» (full list stays in the info
card).

## Фото для покупающих билеты (Ж9)

`EventPhoto` (`eventId` cascade, `url`, `sort`) — до ТРЁХ фото у
события: схема зала, цены по секциям, бенефиты билетов. Без типов,
заголовков и подписей — владелец сперва просил раздельные
озаглавленные блоки «Схема зала и цены» / «Бенефиты билетов», потом
упростил до одного ряда (история упрощения: типизированная модель с
`kind`+`caption` прожила один локальный коммит и убрана миграцией
`event_photos_single_list` до первого деплоя). Постер остаётся
отдельным полем — он идёт в OG-картинку и карточки.

Публичная страница: ряд ровно из трёх миниатюр
(`EventPhotoGallery.tsx`, `.event-photo-thumb` — ширина `(100%−1rem)/3`)
с небольшим зазором, НАД блоком «Мои билеты», без подложки (подложка
снята и с «Описания»). Клик поднимает фото попапом на весь экран
(`.event-photo-lightbox`; закрытие — клик, крестик, Esc), а не
открывает новую вкладку. Оверлей рендерится порталом в body (внутри
контента он попадал в чужой stacking context и нырял под липкую
шапку), z-index 2000 — выше `.nav-sticky` (1030); картинка не выше
86vh. Блок без фото не рендерится.

Админка: секция «Фото для покупающих билеты» в `EventForm` — один
список `EventPhotosField` (мультизагрузка через `/api/upload`, порядок
стрелками, удаление; кнопка добавления прячется после третьего фото).
Лимит в 3 фото проверяется ДО загрузки: лишние файлы отрезаются на
клиенте ещё до похода на сервер (раньше файл сначала загружался и
оставался сиротой на диске), пачка уходит одним запросом, а сама ручка
`/api/upload` принимает не больше трёх файлов за раз и держит лимит
30 файлов за 10 минут на пользователя (как и три приватные
upload-ручки; см. чистку сирот в
[tmdb-import.md](tmdb-import.md#local-image-storage)).
В форму список уходит одним hidden-полем с JSON (`photos`); экшены
пересобирают строки целиком (`deleteMany` + `create`), как остальные
связи события.

## Poster

`Event.posterUrl` — a plain external URL (not necessarily uploaded through
`/api/upload`; a scraped source's own image URL is stored as-is, same
convention as `Drama.posterUrl` for blscene imports). Editable via
`FileDropzone` in `EventForm.tsx` (drag-and-drop upload, or it just keeps
whatever URL it was pre-filled with if the admin never touches it). The
public event page header is a `DetailHero` (see `docs/design-system.md`):
the poster as photo card + blurred backdrop, venue as subtitle, chips for
the nearest (or, for past events, first) date via `formatShortDate`,
«дат: N» for multi-day events and the ticket price, with the favorite
heart and the ICS calendar button as hero actions. The presale «Билеты»
button, which used to live under the poster column, now always renders
in the presale block of the info card.

## Thai time always has a Moscow equivalent available

Every event in MyBLHub is a Thailand event, so every displayed event/
presale time has a Moscow equivalent nearby — Thailand (ICT, UTC+7) and
Moscow (MSK, UTC+3) both run without DST, so the gap is a constant 4
hours; `toMskTime` (`src/lib/dates.ts`) just subtracts 4 hours from a
`Date`, no timezone library or per-event timezone field needed.

**On the single event detail page** (`event/[id]/page.tsx`) it's shown
inline, since that's the one page worth reading closely —
`formatTimeWithMsk` ("18:00 (МСК 14:00)") for a single time,
`formatTimeRangeWithMsk` ("18:00–21:00 (МСК 14:00–17:00)") for a range.

**Everywhere events show up as a list** — `EventCard` (home, day view,
trip pages) and `EventAgendaRow` (performer/drama/location pages,
search), plus the account page's going/favorited event rows — it's
hidden by default and shown on hover/focus instead, via `MskTimeInfo`: a
small "i" icon (`.agenda-time-info`) whose `data-tooltip` reads "Тайское
время. МСК: HH:MM[–HH:MM]". This keeps list rows uncluttered; the admin
events list is the one exception and still shows it inline
(`formatTimeRangeWithMsk`), since that's a dense internal management
view, not a browsing surface.

## Event notes

`EventNote` (one per user+event, `@@unique`): заметка на странице
события (`EventNoteSection.tsx` + `saveEventNote` в `noteActions.ts`).
Видимость (`NoteVisibility`): **PERSONAL** (только автор, дефолт),
**FRIENDS** (принятые друзья) или **TRIP** — со-путешественники:
участники общих совместных поездок автора (`getCoTravelerIds` в
`src/lib/coTravelers.ts`). Empty text deletes; чужие видимые заметки
рендерятся под своей с именем/аватаркой автора.

## Группировка многодневных событий в списках

`groupByEvent` (`src/lib/eventOccurrences.ts`) схлопывает строки-даты
одного события в одну (ближайшая дата + `extraDates` → подпись «+N
дат» в `EventAgendaRow`). Применяется там, где список про САМИ события:
страницы артиста, сериала, локации, поиск, избранное в кабинете. В
афише, дне и календаре группировки нет — там строка на дату по смыслу,
как и «иду» в кабинете (отметки стоят на конкретные даты).

## Вкладки календаря

Вкладки /calendar — ссылки с `?view=…` в том же ряду `.mode-toggle`
(«Все события / Мои события / Дни рождения / Сериалы»), а не состояние
в компоненте: адрес переживает перезагрузку и делится ссылкой.
Выбранная вкладка едет вместе с месяцем — `viewQuery` подставляется в
«Пред./След./Сегодня» и в `MonthYearJump`. Сетка одна на все вкладки
(`getMonthGrid` + `.calendar-cell`), различается только содержимое
клетки. Подписка проверяется ДО разбора `?view`, поэтому новая вкладка
не может обойти пейволл. Русские подписи в четыре вкладки не влезают в
ширину телефона, поэтому ряду разрешён перенос (`flexWrap` прямо на
`.mode-toggle` — сам класс используется только здесь).

## Календарь дней рождения

Одна из вкладок на /calendar (`?view=birthdays`): та же месячная
сетка, но в ячейках — именинники (все исполнители с `birthDate`:
актёры, маскоты, группы), чипами с аватаркой и именем, ссылкой на
страницу артиста; тултип показывает исполняющийся возраст, до 3 на
день + «+N ещё». Месяцы сетки выбираются raw-запросом по
EXTRACT(MONTH) — тянуть все 550+ дат ради одного месяца незачем.

## Календарь выхода серий

Вкладка «Сериалы» (`?view=series`): в клетках дня — строки
`DramaEpisode` с объявленной датой (`airDate`), попавшие в сетку
месяца; серии без даты в календарь не попадают. Чип — «Ep. 5 / 5 серия»
жирным плюс название сериала, ссылкой на страницу сериала
(`dramaHref`); номер стоит первым, потому что в узкой клетке обрезается
именно хвост названия. Полная подпись (плюс название серии, если оно
есть) — в тултипе. Внутри дня порядок: время → сериал → номер, до 3 на
день + «+N ещё», как на остальных вкладках. Если в сетке месяца нет ни
одной серии — вместо пустой сетки `EmptyState` со ссылкой на каталог
сериалов; шапка с месяцем и вкладками остаётся, чтобы можно было уйти в
соседний месяц. На телефоне чипы — точки, как и на остальных вкладках
(`.calendar-cell .event-chip` в globals.css): семь колонок в 390px
названия не вмещают.

## Таймзона зрителя

Время событий всегда тайское; «в скобках» — конвертация в таймзону из
настроек юзера (`User.timezone`, IANA, дефолт `Europe/Moscow`; селект в
Настройки → Профиль, список зон в `src/lib/timezones.ts`). В списках —
тултип `MskTimeInfo` (клиентский, зона из контекста `TimezoneProvider`,
которого ставит публичный layout); на странице события — инлайн через
`formatTimeWithZone`/`formatTimeRangeWithZone` (`src/lib/dates.ts`).
Конвертация: тайское настенное время → инстант (−7ч ICT) → Intl с
`timeZone` (DST зон учитывается автоматически). Админка остаётся на
жёстком МСК.

## Билеты («Мои билеты»)

Билет — СВОЯ запись, модель `EventTicket` (userId + eventId +
occurrenceId? + fileUrl), а не поле на отметке «иду». Раньше он жил в
`EventAttendance.ticketUrl` и погибал вместе со строкой: снял «иду» —
билета нет; админ поправил даты события (пересборка occurrences,
каскад) — билета нет, причём файл оставался на диске, а владелец
получал «не найдено» (реальный случай на проде). Теперь удаление даты
события лишь отвязывает билет (`onDelete: SetNull` — он остаётся «без
даты» в кабинете), и только удаление всего события уносит запись
каскадом. Колонка `ticketUrl` в схеме пока лежит закомментированной
(ЛЕГАСИ) — страховка отката; миграция `event_ticket_table` перенесла
существующие билеты. Файл-сироту той поломки чинит
`scripts/adopt-orphan-ticket.ts --file … --user … --event …` — создаёт
запись для лежащего на диске файла.

К каждому своему «иду» на дату можно прикрепить купленный билет — PDF
или фото (блок `TicketSection.tsx` с оранжевой рамкой сразу под шапкой
события; по строке на каждую отмеченную дату). Файл грузится через
`/api/upload-ticket` (PDF/JPEG/PNG/WEBP до 10MB, без пережатия, SVG
запрещён) в приватное хранилище `private-uploads/tickets/` (вне
`public/` — билет с ФИО нельзя отдавать статикой; см.
`src/lib/privateUploads.ts`), URL вида `/files/tickets/…` раздаёт
route handler `src/app/files/[...path]` — только владельцу
(доказательство — запись EventTicket с этим fileUrl). Привязка —
экшеном `setAttendanceTicket` (принимает только строгий формат
`/files/tickets/<uuid>.<ext>`, и файл не должен быть занят чужой
записью — `canAttachPrivateFile` в `src/lib/privateFiles.ts`, иначе
чужой билет можно было привязать себе и удалить у владельца через
открепление; отметка «иду» по-прежнему обязательна — это порядок
интерфейса, но дальше билет от неё не зависит; смена файла подчищает
старый с диска; ошибки экшен возвращает значением, их показывает
`TicketSection`). Открепление удаляет запись и файл. Файлы броней — отелей и
перелётов — аналогично живут в `private-uploads/hotels/`
(`/api/upload-hotel`; папка названа так исторически, модель теперь
`TripBooking`) и видны владельцу и принятым участникам поездки. Там же
третья папка — `personal/` (`/api/upload-personal`): картинки к личным
событиям поездки, см. [trips.md](trips.md). Старые файлы переносит
`scripts/migrate-private-uploads.ts`; публичный путь
`/uploads/tickets/*` в Caddy отвечает 404.

### Онлайн-бронирование у билета

У тайских событий после покупки билета часто есть отдельное
онлайн-бронирование (мест, бенефитов), которое открывается в назначенное
время. Владелец записывает его у своего билета: поля
`EventTicket.onlineBookingAt` (дата + время) и `onlineBookingUrl`
(ссылка, необязательна). Строка под прикреплённым билетом в
`TicketSection` — «Онлайн-бронирование откроется суббота, 12 сентября
2026 · 10:00 (МСК 06:00)», кнопка «Открыть» (если есть ссылка), карандаш
и корзина; без записи — кнопка «+ Онлайн-бронирование», по ней инлайн-
форма (`DatePickerInput` + `<input type="time">` + ссылка). Только у
билета С файлом: записи `EventTicket` без `fileUrl` не бывает.

Время хранится и показывается **как `Event.presaleAt`**: тайское
настенное в UTC-слоте (`combineDateTime` в экшене), подпись —
`formatHumanDate` + `formatTimeWithZone` с зоной зрителя в скобках.
Экшены `setTicketOnlineBooking` / `removeTicketOnlineBooking`
(`ticketActions.ts`): только владелец билета, дата и время идут парой
(можно оставить одну ссылку — тогда без напоминания), ссылка — только
http(s) (она уходит в href кнопки и в текст Telegram). Смена времени
сбрасывает `onlineBookingNotifiedAt`, чтобы новое время напомнилось
заново.

За час до открытия приходит напоминание — в колокольчик и в Telegram
(`sendOnlineBookingReminders`, см.
[telegram-notifications.md](telegram-notifications.md)); подписка для
него не нужна — билет личный.

## Группа вместо своих участников в «Кто выступает» (АА14)

Если к событию привязана группа (BAND), в блоке «Кто выступает»
показывается ТОЛЬКО она — её участники из списка убираются, и напрямую
привязанные к событию тоже. Группа их уже представляет, а раньше состав
концерта одного бойзбенда читался как список из шести карточек, где
пятеро — та же группа поимённо.

**Раньше было ровно наоборот**: страница ДОРИСОВЫВАЛА участников группы
(карточками с подписью-названием группы). Владелец попросил обратного —
у фестиваля из четырёх групп в блоке набегало 27 карточек вместо
четырёх.

**Связи в базе не трогаются** — это только правило отображения: на
странице самого участника событие остаётся, и в поиске он по-прежнему
находится. Правило общее со страницей сериала — `hideMembersOfListedBands`
в `src/lib/castLineup.ts`, см. «Правила общего списка исполнителей» в
[catalog.md](catalog.md).

То же на «Лайнапе по дням»: у дня свой список, но правила у него те же.

Сам блок — каст-сетка (см. «Каст-сетка» в [catalog.md](catalog.md)):
собственная секция страницы события (`id="lineup"`) ниже карточки
дат/билетов, а не внутри неё; артисты отсортированы по популярности
(число событий, `Performer._count.events`), а поверх сортировки
участники пейринга ставятся рядом (АА4, `keepPairingsTogether` — там же
в `castLineup.ts`); первые ~14 видны сразу,
остальные за «Показать всех (N)». Пейринги остаются чипами под
сеткой, «Лайнап по дням» — той же сеткой без свёртки. Порядок секций
страницы: даты/билеты → «Мои билеты» → «Друзья идут» → состав →
заметки → описание → источники → отзывы; при ≥3 якорных секциях
(состав/описание/отзывы) под hero выводится ряд чипов-якорей
(`.section-anchors` + `.chip-link`).

## Отзывы и комментарии

Общий блок `ReviewsAndComments` (см. [catalog.md](catalog.md)) внизу
страницы события — открыт всем, как и сама карточка (написать отзыв
по-прежнему можно только залогиненному).
Прикреплённый билет показывается 🎫-ссылкой и в карточках «Моего
плана» поездки (EventCard prop ticketUrl).

## Афиша без подписки: тизер и публичная карточка

Раньше всё событийное было за подпиской целиком: гость на `/events`
получал лендинг (дубль главной под адресом, по которому он пришёл за
афишей), залогиненный без подписки — сразу пейволл, а в поиске события
показывались заглушками с блюром. Со стороны это читалось как «тут всё
платно», хотя лендинг обещает обратное; заодно события полностью
выпадали из поиска Google. Сейчас граница проходит иначе.

**Открыто всем (и поисковикам):**

- **Тизер на `/events`** — `src/app/(public)/events/EventsTeaser.tsx`:
  ближайшие `TEASER_SIZE = 2` события показаны честно и целиком —
  название, дата, время, площадка, постер, состав и живая ссылка на
  страницу события (`EventAgendaRow`, тот же компонент, что и в ленте).
  Никакого блюра поверх них нет: они действительно открыты.
  Многодневное событие схлопывается в одну строку — поэтому дат
  зачерпывается с запасом (`OCCURRENCE_POOL`). Ниже — `PremiumUpsell`
  со строкой-мостиком `intro`: сколько ещё событий в афише (округление
  ВНИЗ, как на лендинге: точное число девальвируется само, вверх —
  враньё) и что даёт подписка. Гостю без аккаунта там же пара кнопок
  «Создать аккаунт / Войти»: подписка привязывается к аккаунту.
- **Карточка события `/event/[id]`** — что, когда, где, кто выступает,
  постер, описание, фото зала, цена, ссылка на билеты, дата старта
  препродажи, сериал, отзывы и комментарии. Плюс `Event`-разметка
  (см. [seo.md](seo.md#json-ld)) и индексация: `noIndex` снят,
  robots.txt раздел пускает.
- **События в поиске** (`/search`) — обычными строками для всех:
  прятать в поиске то, что открыто по прямой ссылке и в Google, значит
  просто терять человека на заглушке.

**За подпиской осталось:**

- лента афиши целиком — фильтры Все/Иду/Избранное/Мои артисты, поиск по
  названию, диапазон дат, поездки, бесконечная прокрутка и архив;
- календарь (`/calendar`) и страница дня (`/day/[date]`);
- личное вокруг события: отметки «иду» по датам, «Мои билеты»,
  «друзья идут», заметки, напоминание о старте продаж и выгрузка в
  календарь (`/event/[id]/ics` и сам отвечает 403 без подписки).
  Вместо них на странице события стоит `PremiumUpsell` с `intro` про
  то, что именно добавляет подписка.

Избранное подпиской не ограничено: сердечко работает у любого
залогиненного и в тизере, и на странице события — как на страницах
артистов и сериалов.

Серверное маскирование ленты никуда не делось: `fetchEventListPage`
без подписки по-прежнему затирает поля и отдаёт только даты
(`EventCardLocked`, разблюривать в девтулзах нечего) — см. «Premium
flag» в [auth.md](auth.md). Тизер идёт мимо него отдельной выборкой:
там показывать нужно как раз всё.

Держится тестом `tests/e2e/premium-gates.spec.ts`: он проверяет обе
половины — тизер виден (но не больше двух событий, и страница события
открывается без подписки), а названия закрытой части ленты в разметку
не попадают.

## The two list row components

Обе строки держат одну иерархию (иначе время, площадка и состав шли
одним кеглем `small text-secondary` и читались серой простынёй):

1. **название** — белым, самый крупный элемент строки;
2. **время + площадка** — одной серой строкой ниже
   (`.event-row-venue`): время капсулой `.date-chip .event-row-time`
   первым элементом, за ним площадка, туда же уходят 🎫-билет и
   «друзья идут». В `EventCard` чип стоит именно здесь, а не в шапке
   рядом с названием: в шапке он перетягивал внимание с названия
   (просьба владельца). В `EventAgendaRow` чип остаётся у названия — там
   в него попадает и дата при `showDate`, а «+N дат» идёт вторым тихим
   чипом;
3. **состав** — отдельной, самой приглушённой строкой
   (`.event-row-cast`, opacity): максимум 3 имени-ссылки, дальше «+N» с
   полным списком в `title`. Общий компонент обеих строк —
   `src/components/EventRowCast.tsx`.

- **`EventCard`** (`src/components/EventCard.tsx`) — the main browsing
  row: a date block (big day number + month + weekday), the event's
  poster thumbnail when it has one, title/time/venue/performers, and the
  corner favorite/going icons. Used on the home page, `/day/[date]` and
  trip pages. Cards are grouped under **month** headings
  (`.month-group-heading`) — the earlier per-day headings with 1–2 rows
  each read as a wall of repeating dates, and the card already carries
  its own date.


  **Пропавший постер** уступает место буквенному фолбэку. Одного
  `onError` мало: разметка приходит с сервера, браузер начинает грузить
  картинку сразу, и ошибка успевает случиться ДО гидратации — React к
  тому моменту обработчик ещё не повесил. Поэтому карточка при
  монтировании ещё и спрашивает саму картинку (`complete` есть,
  `naturalWidth === 0` — значит не вышло). Держится тестом
  `tests/e2e/event-card.spec.ts`.

  Жёлоб под угловые иконки резервирует только строка с названием
  (`.event-card .event-row-head`): раньше `padding-right: 5rem` стоял у
  всего тела карточки, и площадка с составом теряли эту колонку по всей
  высоте.

### Infinite scroll (home page)

The home page no longer loads the whole catalog of occurrences: it
server-renders the first 20 (`fetchEventListPage` in
`src/lib/eventList.ts`, phase "upcoming" offset 0) and hands off to
`InfiniteEventList` (`src/components/InfiniteEventList.tsx`), which
fetches further pages through the `loadEventListPage` server action
(`(public)/eventListActions.ts`) when an IntersectionObserver sentinel
comes within ~600px of the viewport. Paging runs in two phases —
"upcoming" (ascending from today) and then "past" (the archive,
descending) — with an explicit date range collapsing to a single
"upcoming" phase over that range, matching the pre-existing no-split
behavior. Because pages are offset-based, the Все/Иду/Избранное filter
is applied **in the SQL where-clause** (`attendees/favoritedBy some`)
rather than post-filtering in JS, and the client dedupes rows by
`occurrenceId` in case data shifts between page fetches. The month
grouping (`groupByMonth`) therefore lives in the client component now,
computed over the accumulated list. The server page keys
`InfiniteEventList` by `filter|from|to|q` — without the key, switching
the Все/Иду/Избранное tabs (a soft navigation that only changes props)
left the client component's accumulated state in place and the list
never visually changed (a real bug, not hypothetical).
- **`EventAgendaRow`** (`src/components/EventAgendaRow.tsx`) — the
  compact text row for embedded lists on performer/drama/location pages,
  search results and the account tabs, where a poster-and-date-block card
  per event would crowd the page. Normally shows only a time; those
  flat-sequence pages pass `showDate`, и тогда в чип перед временем
  встаёт `formatShortDate` («24 окт»). Отдельной узкой колонки времени
  слева больше нет: она держала время таким же заметным, как название,
  и резала ширину под текст (эта разметка осталась только у витринной
  строки лендинга, `.agenda-time` / `.agenda-dash`).

## Импорт события по ссылке (TTM, Eventpop, Ticketmelon, AllTicket, Eventpass)

Карточка «Событие по ссылке» на `/admin/imports` — ОДНО поле на пять
сайтов, сайт распознаётся по домену (`detectEventSite` /
`scrapeEventByUrl` в `src/lib/eventTicketSites.ts`); дальше тот же
экран проверки, что был у TTM: правишь всё найденное и подтверждаешь.
Тот же поток доступен попапом прямо на `/admin/events` — кнопка
«Импортировать по ссылке» (`ImportEventButton.tsx`, широкая `Modal`
с тем же `TtmImportFlow`; после импорта модалка закрывается и список
обновляется через `onDone` вместо перехода на `/admin/events`).
**Nothing is written to the database until that confirm step** — the
scrape itself is read-only. Если событие с этим sourceUrl уже есть,
экран предупреждает и даёт ссылку на него (создать дубль всё ещё
можно — сознательно).

Каждый парсер приводит свой сайт к `TtmEvent`; артистов и предпродажу
отдаёт только TTM, у остальных админ добирает состав руками на том же
экране. Как добываются данные (разведка 2026-08-28):

- **ticketmelon.com** — событие целиком лежит готовым JSON в
  `__NEXT_DATA__`: название, площадка (name; там же адрес и
  координаты), описание, постер (или og:image), `show_starttime`/
  `show_endtime` — инстанты в мс, переводятся в бангкокское настенное
  и разворачиваются в дни.
- **allticket.com** — открытый статический JSON
  `/master/event_info/<слаг>.json` (их живой API за AWS WAF, но
  master-файл без защиты): название, место, цена, лого, дата ТЕКСТОМ
  («12-14 APRIL 2026», «5, 19, 26 SEPTEBER 2026» — да, с опечаткой в
  живых данных). `parseLooseDateList` разворачивает диапазоны ЦЕЛИКОМ
  (TTM-овский разборщик взял бы из «12-14» только 12 и 14) и матчит
  месяц по первым трём буквам — иначе их «SEPTEBER» потерялся бы.
  Описание — infoHtml, у которого надо срезать <style> целиком: иначе
  CSS сочится в текст.
- **eventpop.me** — обычный серверный HTML: og-меты (название, постер,
  `og:location`) + контент организатора (самый длинный прогон
  <p>-абзацев — обёртки без опознавательных классов).
  Структурированных дат в разметке НЕТ (расписание дорисовывает
  клиент) — дата выуживается из текста, ВРЕМЯ АДМИН СТАВИТ РУКАМИ.
- **ticket.eventpass.co** — Next.js flight-поток (`self.__next_f`);
  вход пускает только с кукой `allowed-user=true`, которую сайт сам
  ставит редиректом — шлём её сразу. Даты лежат ISO-строками с
  ФИКТИВНЫМ «Z» (витрина показывает те же часы) — режем строкой, не
  конвертируем.
- **theconcert.com** — НЕ парсится: Cloudflare-челлендж не проходит
  даже playwright (headless и с окном, цикл как у MdlClient) — их
  защита распознаёт автоматизацию. Ссылка отбивается понятным
  сообщением; события оттуда заводим руками.

### Сам TTM-скрейп

- **`src/lib/thaiticketmajor.ts`** — pure scraping (no DB access):
  `scrapeTtmEvent(url)` returns title, venue, date/time, poster, ticket
  price text, ticket on-sale date/time, and the artist lineup.
  - Title/venue/poster/date come from the page's `schema.org/Event`
    JSON-LD block (reliable, present site-wide). Date/time are kept as
    plain `"YYYY-MM-DD"`/`"HH:mm"` strings sliced directly out of the raw
    ISO string — **never passed through `new Date(...)`**, because the
    JSON-LD datetime has no timezone suffix (it's already Bangkok
    wall-clock time) and `new Date()` would reinterpret it in whatever
    timezone the Node process happens to run in, silently shifting the
    hour. This matches the "naive local wall-clock" convention the rest
    of the app already uses (`combineDateTime` in `src/lib/dates.ts`,
    shared by every place that turns a `"YYYY-MM-DD"` + `"HH:mm"` pair
    into a `Date` — the regular event form, the TTM importer, presale
    dates). It also guards against a real incident: a native
    `<input type="date">` handed back a Buddhist-era year (543 years
    ahead of Gregorian, e.g. `2569` instead of `2026`) for a couple of
    multi-day TTM imports, almost certainly a th-TH-locale date-picker
    quirk in the browser that ran the import. `combineDateTime` treats
    any year more than 50 years in the future as a leaked BE year and
    corrects it, rather than trusting the input verbatim.
  - The artist lineup and the ticket-price display string live in a
    separate free-text "details" table that's admin-entered per event
    (not guaranteed to have every row) and — critically — **renders in
    Thai by default**. Setting the `__la=en` cookie (what the site's own
    language-switch button does client-side) gets the same table back in
    English from a plain HTTP request, no headless browser required.
  - The ticket on-sale moment ("Public Sale") lives in a *third*, entirely
    different spot on the page — a summary panel above the details table,
    not inside it — as free-form text like `"Saturday 22 August 2026,
    10:00"`. `parseEnglishDateTime` parses that into the same plain
    date/time strings (never `new Date()`, same reasoning as above). A
    page can list several sale phases (e.g. presale then general sale);
    only the first is used. This becomes the import's presale
    date/time, pre-filling `Event.presaleAt`, with `Event.presaleUrl`
    defaulting to the source page itself (that *is* where you buy the
    tickets) — both editable/removable in the review screen the same way
    as everything else.
- **Artist name parsing is a best-effort heuristic, not a guarantee.**
  ThaiTicketMajor uses two formats with no shared delimiter:
  `"Jakrapatr Kaewpanpong (William)"` (full name, nickname in parens —
  parsed with a regex) and `"Earth Pirapat Watthanasetsiri"` (nickname
  first, no punctuation — parsed as "first word = nickname, rest = full
  name"). The second form is genuinely ambiguous in general, so
  `parseArtistLine` in `thaiticketmajor.ts` is deliberately just a
  reasonable guess — the review screen's nickname/full-name fields are
  always editable, never read-only text.
  - The details table wraps each artist name in its own `<div>` — except
    when there's only one artist, where the site sometimes puts bare text
    directly in the cell with no `<div>` at all (seen on
    gemini-art-venture-concert.html). `scrapeTtmEvent` falls back to the
    cell's own text when it finds zero `<div>`s, so a single-artist event
    doesn't silently come back with an empty lineup.
  - The row label itself isn't consistent either: most pages say
    "Artists :", some say "Artist :" (singular — seen on
    weirdo-101-the-first-gravity.html, a `/performance/...` URL rather
    than `/concert/...`). `findLabeledRow` does a prefix match, so
    `scrapeTtmEvent` looks up `"Artist"` (not `"Artists"`) — that prefix
    matches both, since "artists" itself starts with "artist".
- **Schema fit**: a scraped artist's nickname and full name map directly
  onto `Performer.name` and `Performer.realName` — no translation layer
  needed.
- **Dedup**: `scrapeTtmEventPreview` (`src/app/admin/(protected)/events/importActions.ts`)
  matches each artist's nickname against existing `Performer.name`,
  case-insensitively and exactly (no fuzzy matching). A match means
  "link the existing performer"; no match means "create a new one" —
  shown per-row in the review screen, and overridable (unchecking a row
  excludes it; editing its nickname clears the match, since the edited
  text may no longer correspond to who was found).
- **What this does NOT do**: it doesn't try to infer that a scraped
  performer is a member of a Performer with `type: BAND` that's already
  in the catalog (e.g. recognizing that the artists on a band's own
  concert page are that band's members) and auto-link `BandMember` — too
  easy to get wrong from page structure alone. Set that up manually via
  the performer edit form after import, same as any other band roster
  change.
- Creation itself — `createEventFromTtmImport` — runs in one
  `$transaction`: any artist without a match gets a new `Performer`
  (`type: SOLO`), then the `Event` is created linking every included
  artist plus any extra performers picked manually in the review screen.
- **The poster is downloaded before the write, never stored as a
  thaiticketmajor.com link** — `downloadRemoteImage(url, "posters")`
  (`src/lib/localImage.ts`, the same helper every other importer uses;
  see "Local image storage" in [tmdb-import.md](tmdb-import.md)) is
  called just outside the transaction, so a slow fetch can't hold it
  open. Rationale is the same as everywhere else — a foreign CDN URL
  baked into the DB is a standing external dependency — plus a concrete
  one here: TTM serves ~1000px-wide JPEG/PNG originals (200+ KB each)
  into a 74px-wide `.event-card-poster`, and the feed sat with an empty
  poster column for seconds while nine of them loaded from Bangkok.
  Downloading re-encodes to WebP and drops that ~5×. Failure is not
  fatal: `downloadRemoteImage` returns the original remote URL and logs
  a warning, so the event is still created (with an external poster, to
  be retried later). A poster the admin replaced with their own upload
  is already a `/uploads/...` path and comes back from the helper
  untouched.
- **`scripts/localize-event-posters.ts`** — one-off catch-up for events
  imported before that: sweeps every `Event.posterUrl` still starting
  with `http`, downloads each through the same helper and repoints the
  row. Prints what it would do and changes nothing without `--apply`; an
  image that won't download is skipped and listed by name rather than
  failing the run. Safe to re-run (already-local rows are excluded by
  the query itself). One run moved 14 events, 2.0 MB → 395 KB.
- **A poster whose file went missing** is recovered by
  `scripts/fix-missing-images.ts` (documented under "Local image storage"
  in [tmdb-import.md](tmdb-import.md)), which sweeps every image field in
  the catalog for `/uploads/...` paths with nothing behind them. For
  `/uploads/posters/` it can find the source even when `Event.sourceUrl`
  is null — every event imported so far predates that field: TTM names
  its poster `<page-slug>-<13 hex>-l.<ext>`, so the page URL is the
  filename minus that suffix (`fanboy-gala-night-ep1-6a852ded0eb4d-l.webp`
  → `/concert/fanboy-gala-night-ep1.html`). The scraped poster is only
  accepted when its basename is the very file that's missing, or when the
  page's title matches the event's (TTM swapped the artwork) — otherwise
  the field is nulled rather than filled from a page that may not be the
  right event at all.
- **Multi-day detection**: the page's date line (e.g. `"Saturday 24 -
  Sunday 25 October 2026"`, or a 3-night `"Friday 21, Saturday 22 and
  Sunday 23 August 2026"`) is parsed by `parseDateRangeDays` into every
  day mentioned, sharing the trailing month/year — strip the trailing
  `"<Month> <Year>"`, then every remaining 1–2 digit standalone number is
  a day. The scraper's own `date`/`startTime` (from JSON-LD) stays the
  first day; everything else becomes `TtmEvent.extraDates`, pre-filling
  the review screen's date rows (same "+ Добавить ещё день" UI as
  `EventForm`, editable/removable before confirming) so the import lands
  as one `Event` with one `EventOccurrence` per detected day — not
  several separate events.

## Время и лайнапы дней

Время начала события необязательно: пустое поле «Начало» хранится как
00:00 + `EventOccurrence.hasTime=false`, и время не выводится нигде в
интерфейсе (карточки, agenda, страница события). У каждого дня может
быть свой лайнап (фестивали): `OccurrenceLineup`, в админ-форме —
свёртка «Состав этого дня» под строкой даты (JSON в hidden-инпуте, свой
на строку); публично — секция «Лайнап по дням» на странице события.
Пустой лайнап = день наследует общий состав.

У каждого участника дня есть время и сцена — `OccurrenceLineup.timeText`
и `.stage`, обе строки свободные: афиша пишет «16:00-16:45» и «Monster
Stage», а не машинные метки, и слот бывает «TBA». Заполняет их краулер
musicfestival.in.th (docs/features/musicfestival-import.md), правятся
они прямо в чипе состава дня — два поля рядом с именем.

Публично расписание рисует `EventDayLineup` (`src/components/`) —
секцией «Лайнап по дням» СРАЗУ ПОД карточкой события, над описанием: у
фестиваля это главное, ради чего страницу открывают. Когда расписание
есть, общий состав «Кто выступает» в карточке НЕ показывается вовсе —
это те же люди, только без времени и сцен (правки владельца
2026-09-06).

Вид — афишей, а не списком: день отбит линией слева, с датой и числом
выступлений; сцена — точкой, разрядкой и гаснущей линией до края ряда;
начало выступления — плашкой на фото, полный слот со временем конца
остаётся подсказкой карточки. Классы `.lineup-*` в globals.css.

У каждого дня свой цвет — первый фирменный оранжевый, дальше розовый,
фиолетовый, бирюзовый, жёлтый, шестой по кругу (`DAY_COLORS` в
`EventDayLineup.tsx`). Цвет приходит инлайновой переменной
`--lineup-day-rgb` и красит ВСЕ акцентные элементы дня — дату, линию
слева, точки и линии сцен, рамки плашек времени, — чтобы день узнавался
по любой из них (правка владельца 2026-09-06: два оранжевых дня подряд
глазу не за что зацепить).

Раскладку считает `groupLineupByStage` (`src/lib/castLineup.ts`): сцены
идут по первому выступлению, внутри сцены — по времени, у кого времени
нет — в конец своей сцены, а участники без сцены — в конец дня. Слоты раньше шести утра считаются концом
фестивального дня, а не началом: «00:30» стоит после «22:00». Когда ни
времени, ни сцен нет (обычный концерт), день рисуется одной сеткой —
ровно как до расписаний.
