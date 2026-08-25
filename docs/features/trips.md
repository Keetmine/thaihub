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
- **Шапка страницы поездки**: название с карандашом-иконкой рядом
  (правка названия и дат — модалка `EditTripButton`; кнопка живёт
  внутри `h1`, поэтому ей задан свой `font-size`, иначе иконка в `em`
  унаследовала бы 2.5rem заголовка), справа — видимость и участники.
  «Удалить поездку» вынесена **в самый низ страницы**, за
  разделитель: в шапке она стояла среди обычных действий и нажималась
  случайно, а операция необратимая.
  В форме личного события поле «Место» (`LocationPickerField`) умеет не
  только искать, но и **заводить место на месте**: под полем поиска —
  «+ Своё место», форма разворачивается прямо внутри той же модалки
  (уходить в другой раздел и терять заполненное не нужно), а созданное
  место сразу подставляется выбранным. Это обычная кнопка, а не submit:
  вложенных `<form>` в HTML не бывает, и сабмит внешней формы создал бы
  событие вместо места; экшен — `createOwnPlaceAndReturn`, он
  возвращает созданную локацию.
- **Вкладка «Что посетить»**: ряд действий — поиск по каталогу и своим
  местам (`AddTripPlaceBox`), **«+ Своё место»** (создаёт локацию по
  ссылке Google Maps и сразу привязывает к поездке —
  `createTripOwnPlace`, список заводить не нужно) и прикрепление
  готового списка (`AttachListSelect`, показывается только если списки
  есть). Подробности про сами места — [place-lists.md](place-lists.md).
- **`/trips/[id]`** — two tabs over the trip's date range:
  **«Мой план»** (default; «План» when the trip has members) shows the
  occurrences of events any *participant* (owner + members) marked «я
  иду» (filtered in SQL via `attendees some userId in participantIds`),
  merged with the participants' personal events — for a guest viewer
  the plan of the participants is the point of sharing; **«Афиша»
  (`?view=all`)** shows every event of the range from the public
  calendar, so picking new events into the plan is one «иду» click
  away. На «Афише» — ТОЛЬКО события афиши: личные записи, дела и брони
  там мешали (просьба владельца), они живут в «Плане». Both tab labels
  carry live counts. Rendered with the same `EventCard` rows as the
  home page (favorite/going buttons and friends-going indicator
  included), plus a delete button.
  Счётчика «N в плане · M всего» на странице списка поездок больше
  нет: он сравнивал план со всей афишей этих дат и читался как
  «недобрал». Вместе с ним удалены три запроса, которые считались
  только ради него.
- **Personal events** (`TripPersonalEvent`: title, optional note, one
  `startsAt`; cascade-deleted with the trip): the owner's own private
  entries — flights, reservations, meetups — created via the «+ Личное
  событие» modal on the trip page and merged into the same chronological
  timeline as the public events. Rendered by `PersonalEventCard.tsx`
  (same `.event-card` layout, a «личное» badge, corner edit/delete
  buttons instead of favorite/going; editing opens a prefilled modal).
  A personal event without a time is stored at 00:00, sorting before
  that day's public events, and the card hides the meaningless "00:00".
  К записи можно приложить картинку или PDF (`imageUrl`, Ж10) — скан
  билета, скрин брони, афишу: в карточке она показывается миниатюрой
  5rem, по клику открывается в новой вкладке, а если файл не
  открылся — вместо битой картинки рисуется ссылка «Файл ↗». Файл
  приватный, как и сама запись: `/api/upload-personal` кладёт его в
  private-uploads/personal, а `/files/personal/…` отдаёт участникам
  поездки — и только автору, если запись помечена приватной.
  Галочка «Показывать на главной» (`showOnHome`, Ж11) поднимает запись
  в блок «Вы идёте» на главной: там события афиши и отмеченные личные
  события сортируются одним списком по дате (см.
  `src/app/(public)/page.tsx`). Галочка есть и в соло-, и в совместной
  поездке — это про свою главную, а не про доступ участников; в
  совместной поездке на главную попадают только собственные записи.
  All three actions (`createTripPersonalEvent`/`update…`/`delete…` in
  `trips/actions.ts`) go through `requireTripAccess` (owner OR member),
  scope the row by `tripId`, and update/delete additionally enforce
  per-item permissions via `canTouchItem` (see «Совместные поездки»).
- **Бронирования** (`TripBooking`, enum `TripBookingKind`: `HOTEL` |
  `FLIGHT`) — жильё и перелёты одной моделью: у них совпадает почти
  всё (название, даты со временем, ссылка, файл подтверждения,
  заметка), различие только в маршруте (`fromPlace`/`toPlace` у
  перелёта, `address` у отеля). `startAt`/`endAt` — это заезд/выезд у
  отеля и вылет/прилёт у перелёта; **время указывается у обоих видов и
  необязательно** (точного часа заселения человек может не знать).
  Раньше это был `TripHotel` только под жильё; миграция
  `trip_bookings_and_personal_image` сделана переименованием таблицы,
  а не DROP/CREATE, чтобы не потерять строки.

  **Бронь живёт в ленте плана, а не отдельным списком** (просьба
  владельца): каждая бронь даёт ленте ДВЕ записи — заселение в день
  заезда и выселение в день выезда, вылет в день вылета и прилёт в день
  прилёта (`TripBookingLeg.tsx`, данные готовит `bookingLegs` в
  `trips/[id]/page.tsx`). Промежуточные дни ничем не помечаются: строка
  «проживание в отеле» на каждый день — шум, это и так понятно.
  Внутри дня записи стоят по времени вперемешку с событиями и делами,
  поэтому «выселение → обед → заселение в другой отель» в один день
  выстраивается само. Правка и удаление — прямо из строки ленты
  (карандаш открывает ту же модалку, что и кнопка добавления).

  **Время указано не всегда**, а день всё равно должен читаться
  правдоподобно. «Без времени» — это ровно 00:00 в базе (та же
  договорённость, что у личных событий), и такие записи прижимаются к
  краям дня: выселение и прилёт — к началу (номер освобождают утром, а
  после прилёта день только начинается), заселение и вылет — к концу
  (заезд обычно после обеда, а после вылета в этом дне уже ничего не
  запланируешь). При совпадении времени с событием бронь идёт первой.

  **Линия жилья** (`.trip-timeline-item.in-stay` в `globals.css`) — тонкая
  оранжевая линия ПОД карточками от заселения до выселения (формулировка
  владельца: «линия, которая идёт за карточками, не подложкой»): под
  карточкой её не видно, в зазорах между строками видно, и заезд, события
  этих дней и выезд оказываются нанизаны на одну нить. Ни заливки
  диапазона, ни рамки — это связь, а не блок. Идёт она по центру
  дата-колонки (у всех строк ленты слева отступ 1rem и колонка 3.1rem),
  поэтому выходит из-под числа, а не жмётся к краю экрана. Слои:
  `.in-stay` заводит свой контекст наложения (`z-index: 0`), линию рисует
  `::before` с `z-index: -1` — под содержимым строки, но над фоном
  страницы. Сплошной она выглядит потому, что каждая строка диапазона
  рисует свой кусок с напуском на половину зазора между строками
  (`gap-3` = 1rem); у строки заселения линия начинается с середины
  (`stay-open`), у строки выселения там же кончается (`stay-close`) — вне
  диапазона её нет вовсе. Диапазон считается по уже отсортированной ленте
  счётчиком открытых броней (заселение открывает, выселение закрывает) —
  пересекающиеся брони (переезд в тот же день) линию не рвут. Рисуется
  только у брони с ОБЕИМИ датами — связывать нечего, если известна одна.

  Блок `TripBookings.tsx` над лентой остался только ради броней без
  единой даты: в ленте им негде встать, а увидеть и дозаполнить их надо
  (заголовок «Жильё и перелёты без дат» появляется вместе с такими
  строками, без них блока нет вовсе). Кнопки добавления переехали в общий
  ряд над вкладками (см. ниже). Форма брони общая для добавления и
  правки, отеля и перелёта (`BookingForm.tsx`), и открывается из двух
  мест: из кнопки в ряду и из карандаша в строке ленты. Файлы броней
  лежат в приватном хранилище; папка исторически называется `hotels` и
  переименованию не подлежит — на неё ссылаются уже загруженные файлы.

- **Ряд действий над вкладками** (просьба владельца: «вынесем кнопки над
  табами, и чтобы они всегда отображались») — **«+ Событие»** (акцентная,
  её жмут чаще), **«+ Отель»**, **«+ Перелёт»**, **«+ Место»**. Стоит
  выше `tab-bar-row`, поэтому виден на любой вкладке: раньше ряд жил
  внутри плана, и с «Дел» или «Что посетить» добавить событие было
  нельзя, не вернувшись назад. Кнопок нет вовсе у тех, кому нечего
  вносить (`canContribute`: гость, участник без подписки) — не спрятаны
  стилями, а не отрисованы. Каждая кнопка — свой компонент со своей
  модалкой: `AddPersonalEventButton`, `AddBookingButton` (kind
  HOTEL/FLIGHT), `AddTripPlaceButton`. Внутри «+ Места» оба способа
  добавить место — поиск по каталогу и своим местам (`AddTripPlaceBox`) и
  «своё место» по ссылке Google Maps (`CreateOwnPlaceButton`, открывается
  поверх); на вкладке «Что посетить» остался только тот способ, которого
  в ряду нет, — прикрепить готовый список.
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
`updateMany` by owner). Labels come from the dictionary
(`t.trips.visibility.*`, see [i18n.md](i18n.md)). **Personal events, todos and bookings stay participant-only at
every visibility level** — reservations/meetups aren't shown to guests
even on a public trip; guests see only the public events of the date
range. Участник без подписки видит брони в ленте, но не правит их
(`canEdit`), как и остальную поездку.

**Видимость у каждой записи** (`TripItemVisibility`: `PRIVATE` |
`PARTICIPANTS` | `FRIENDS` | `PUBLIC`, по умолчанию `PARTICIPANTS`) —
поле `visibility` есть у `TripTodo`, `TripPersonalEvent` и `TripBooking`,
и выбирается радио-группой в каждой форме (`ItemVisibilityField` в
`TripItemVisibility.tsx`, подписи — `t.trips.itemVisibility`). Оно
заменило галочку «приватное»: у поездки своя видимость, но отдельная
запись может быть закрытее или открытее её. Правила чтения (`canSeeItem`
в `trips/[id]/page.tsx`, один хелпер на все три типа): автор видит свою
запись всегда; `PRIVATE` — больше никто, даже участники; `PARTICIPANTS` —
владелец и ACCEPTED-участники; `FRIENDS` — они же плюс друзья автора
(дружба симметрична, поэтому «друг автора» = автор в списке друзей
зрителя, второго запроса не нужно); `PUBLIC` — все, кто вообще дошёл до
страницы (доступ к самой поездке проверен раньше). В строке видимость
подписывается бейджем (`ItemVisibilityBadge`) — у `PARTICIPANTS` бейджа
нет, это значение по умолчанию и подписывать им каждую строку шумно.

Гейт стоит НА ДАННЫХ, а не на стилях: невидимая запись не попадает в
разметку вообще (скрытое стилями всё равно уехало бы в HTML). У броней
это одна точка — `visibleBookings` в `trips/[id]/page.tsx`; из
отфильтрованного списка не рождается ни строк ленты, ни линии жилья.

**Открытая бронь показывает не всё.** Даже при `FRIENDS`/`PUBLIC`
не-участник получает только вид, название, даты и маршрут; адрес,
заметку (там номер брони и код от двери), ссылку и файл подтверждения
вырезает `bookingForViewer` — «видно всем» про то, где и когда человек
будет, а не про то, как попасть в его номер. Значение по умолчанию у
брони — `PARTICIPANTS`, и само оно не меняется.

`isPrivate` у `TripTodo`/`TripPersonalEvent` пока живёт в схеме и
пишется вместе с `visibility` (`visibility === "PRIVATE"`): его ещё
читает выдача вложений `/files/personal/…`. Порядок специальный —
сначала поле, потом код, потом отдельная миграция на удаление;
обратный уронил бы прод в промежутке. Картинка личного события при этом
остаётся доступной участникам поездки (и только автору у приватной
записи) независимо от `FRIENDS`/`PUBLIC` — сознательно строже, чем сама
запись.

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

Галочка «участники могут редактировать» показывается только в
совместных поездках; в соло-формах прежнее значение сохраняется
hidden-инпутом, иначе update сбросил бы флаг. Кто запись ВИДИТ — это
уже не галочка, а поле видимости записи (см. «Видимость у каждой
записи» выше): оно есть в любой поездке, потому что `FRIENDS` и
`PUBLIC` осмысленны и в соло-поездке.

Фильтр «Только моё» (`?mine=1`, кнопка справа от табов, только в
совместных поездках): план сужается до собственных отметок «иду»,
личных событий и дел текущего юзера.

## Дела поездки (TripTodo)

Вкладка «Дела» (между «Афишей» и «Что посетить»; видна тем, кто вносит,
и тем, кому видно хоть одно дело): обычный туду — чекбокс выполнения,
правка/удаление по правам выше. **Добавляют дело по кнопке «+ Дело»**
(`AddTripTodoButton`, модалка): раньше форма висела развёрнутой и
занимала первый экран ещё до того, как человек решил что-то добавить
(просьба владельца). Датированные дела попадают
в хронологию «Мой план» той же строкой (TodoRow).
Форма живёт внутри модалки и размонтируется вместе с ней, поэтому
прежний ремоунт по ключу (иначе DatePickerInput молча тащил прошлую
дату в следующий пункт) больше не нужен.

Блок «локации съёмок сериалов, которые вы смотрите» из «Что посетить»
убран — там остались только прикреплённые списки и отдельные места;
поиск в «добавить место» ищет и по названию места, и по названию
сериала (searchLocationOptions в lists/actions).
