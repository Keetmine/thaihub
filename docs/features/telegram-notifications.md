# Telegram event reminders

The same bot that powers [Telegram login](auth.md) DMs users about
upcoming events. Requires `TELEGRAM_BOT_TOKEN`; `APP_URL` (absolute
origin) additionally makes the messages carry a link to the event page.

## Вне production бот молчит

Бот у прода и у локальной машины ОДИН (токен в `.env` тот же), поэтому
владелец получала каждое админ-уведомление ДВАЖДЫ — с сервера и со своей
машины (жалоба 2026-09-10). Теперь `sendTelegramMessage`
(`src/lib/telegram.ts`) отправляет только при `NODE_ENV=production`, а
иначе пишет сообщение в консоль и возвращает `true` — вызывающий ведёт
свою бухгалтерию (дедуп напоминаний, «разговор стал живым») как в бою,
и локальный прогон проверяет весь сценарий, кроме самой доставки.

Гейт стоит в единственной точке отправки — иначе его пришлось бы
повторять в админ-уведомлениях, напоминаниях, дайджестах, рассылке и
вебхуке. Счета на оплату (`createInvoiceLink`) не глушатся: их создаёт
человек, нажавший кнопку прямо сейчас, фоном они не рассылаются.
Проверить настоящую отправку с машины — `TELEGRAM_ALLOW_OUTBOUND=1`
в `.env`.

## Предложение привязать Telegram (попап)

Зарегистрировавшимся ПОЧТОЙ уведомления приходят только на сайт, и
человек про них попросту не знает: в настройки за привязкой никто не
заходит. Поэтому один раз показывается окно «Подключите Telegram»
(`src/components/TelegramPrompt.tsx`, правка владельца 2026-09-06).

Условия показа считает сервер в `(public)/layout.tsx`
(`shouldPromptTelegram`) — все сразу:

- вход почтой и телеграма нет (у пришедших через Telegram он есть по
  определению);
- ещё не спрашивали (`User.telegramPromptedAt`): показываем ОДИН раз,
  отказ помним у пользователя, а не в браузере — иначе окно всплывало
  бы на каждом новом устройстве;
- тур уже пройден или закрыт: два окна разом — это осада, а не забота
  (поймано на проверке: тур перекрывал попап собой).

Возраста аккаунта в условиях НЕТ (правка владельца 2026-09-06):
предложить можно и новичку — важно не «сколько дней назад он
зарегистрировался», а что он прямо сейчас сидит на сайте.

Это и считает сам попап: **пять минут живого времени на страницах**, а
не таймер с загрузки. Секунды копятся в `localStorage` и только пока
вкладка на виду: человек ходит по разделам, компонент при каждом
переходе монтируется заново, и обычный `setTimeout` не сработал бы
никогда, а свёрнутое окно — это не «сидит на сайте». Хранилище
недоступно (приватный режим) — считаем в памяти, тогда окно всплывёт за
пять минут одной страницы.

`?tgprompt=1` в адресе показывает окно сразу — чтобы посмотреть, как
оно выглядит, не досиживая пять минут.

Любое закрытие (крестик, «Не сейчас», клик мимо) считается ответом и
записывается.

Текст короткий и по делу: заголовок «Уведомления в Telegram», три
пункта — новые серии, заявки в друзья и приглашения, старт продаж, — и
строка о том, что состав настраивается в профиле. Объяснять человеку,
что он «зарегистрировался по почте», незачем: это наша внутренняя
кухня, а не его забота (правка владельца).
Привязка идёт тем же виджетом, что в настройках; занятый другим
аккаунтом Telegram отправляем разбирать в настройки — там для переноса
есть отдельный диалог.

## Who gets what

Every user with a linked `telegramId` who marked an event "я иду"
(`EventAttendance`) **or** favorited it (`FavoriteEvent`) gets one
reminder per `EventOccurrence` starting within the next 24 hours —
i.e. a 3-day concert produces up to three reminders, one per date, which
is the point (each date is its own "don't miss it").

- **Dedup**: `TelegramNotification` (`@@id([userId, occurrenceId])`) —
  a row is written right after a send attempt, so the half-hourly job
  never re-sends. A 403 from Telegram (user never pressed Start on the
  bot) is also recorded — retrying an unreachable chat every 30 minutes
  would just burn API calls. Send *errors* (network etc.) are **not**
  recorded, so those retry next run.
- Users must press **Start** on the bot once for DMs to work — Telegram
  forbids bots from initiating chats. Logging in via the widget does not
  by itself open the chat.

## Scheduling

`src/instrumentation.ts` (`register()`, Next's server-startup hook) arms
a self-scheduling timer (a `setTimeout` re-armed only **after** the
current sweep finishes — deliberately not `setInterval`, which fires on
the clock and would overlap a long sweep with itself) calling
`sendUpcomingEventReminders` (`src/lib/telegramNotifications.ts`) every
30 minutes — first run one minute after boot. A module-level
`running`-flag guards against re-entry as a second layer. The same
pattern drives the 10-minute job scheduler tick (`runDueJobs`), which
additionally claims each job atomically in the DB (conditional
`updateMany` on `lastRunAt`), so one job can never start twice — even
across overlapping ticks or processes. No external cron: the
docker-compose deploy is a single always-on app container, so an
in-process timer is the simplest reliable place. The whole thing no-ops
when `TELEGRAM_BOT_TOKEN` is unset.

Dedup ledgers don't grow forever: the `cleanup-expired` scheduled job
(`src/lib/scheduledJobs.ts`) rotates `TelegramNotification`,
`TelegramPresaleNotification`, `EpisodeNotification` and
`PerformerEventNotification` rows after 180 days and
`BirthdayNotification` rows after 2 years — all far beyond the
window in which a reminder could repeat.

**Получателей выбираем узким `select`, а не строками User целиком.**
Прогон идёт каждые полчаса и по каждому идущему/избравшему тянул бы
всё — био, страну, все tg-флаги, — ради двух-трёх полей. Рассылки,
которые пишут через `notifyUser`, берут `NOTIFY_RECIPIENT_SELECT`
(язык + `telegramId` + переключатели) и передают уже прочитанного
человека параметром `user`, иначе `notifyUser` перечитывал бы User на
каждое уведомление (N+1). Те, что шлют в бота напрямую, берут ровно
своё: `sendUpcomingEventReminders` — `id` и `telegramId`,
`sendPresaleReminders` — плюс `premiumUntil`, по нему `isPremiumActive`
решает, положен ли пресейл-пинг; `sendOnlineBookingReminders` — как
рассылки через `notifyUser`, `NOTIFY_RECIPIENT_SELECT` через связь
`EventTicket.user`.

## Other notifications

The same half-hourly job also sends: **presale reminders** («продажа
открывается через час», `sendPresaleReminders` — favorited/going users
with Telegram *and an active subscription*, dedup in
`TelegramPresaleNotification` per (user, event)) and **premium expiry
reminders** (3 days before `premiumUntil`, dedup via
`premiumExpiryNotifiedFor`; бессрочные (`premiumLifetime`) пропускаются —
им нечего продлевать). Separately, `notifyFriendsAboutGoing` fires
from `toggleGoing` (fire-and-forget) — «X идёт на …» to the actor's
friends, unless a friend muted them (`FriendNotificationMute`, toggled
by the bell button on the friend's profile page; экшен заводит mute
только при принятой дружбе — иначе ошибка значением, а не строка про
постороннего); receivers also need Telegram + active premium.

**Дни рождения избранных артистов** (`sendBirthdayNotifications`, З3) —
там же, в получасовом прогоне. Блок на главной показывает именинников
всем, а это личное: приходит только тому, кто добавил артиста в
избранное, и только про него. Отправка идёт через `notifyUser`, а не
своим сообщением в бота, — тогда повод попадает и в колокольчик, и в
Telegram, на языке получателя и по его переключателю
(`tgNotifyBirthdays`, свой, а не общий с событиями). Месяц и день
сравниваются в UTC: даты-без-времени лежат как полночь UTC, и приведение
к поясу сервера сдвигало бы поздравление на день. Дедуп —
`BirthdayNotification` с годом в ключе, иначе за сутки ушло бы двадцать
поздравлений; отметка ставится ДО отправки и она же разнимает гонку двух
тиков.

**Новые серии отслеживаемых сериалов** (`sendEpisodeNotifications`, З1)
— там же, в получасовом прогоне; подробности в
[notifications.md](notifications.md): кому, когда по бангкокскому
времени, дедуп `EpisodeNotification`, переключатель `tgNotifyEpisodes`.
Тот же прогон шлёт и «Стартовал сериал из ваших планов» (`DRAMA_STARTED`)
тем, у кого сериал «В планах», когда выходит серия №1.

**У избранного артиста новое событие** (`PERFORMER_EVENT`,
`notifyFavoritersAboutEventPerformers`) — НЕ из получасового прогона, а
из админских экшенов создания события и правки состава: повод возникает
в момент привязки артиста, ждать до получаса незачем. Дедуп —
`PerformerEventNotification` (userId+eventId), ротируется чисткой вместе
с остальными; Telegram — по `tgNotifyEvents`. Подробности — в
[notifications.md](notifications.md).

**Онлайн-бронирование по своему билету** (`sendOnlineBookingReminders`)
— там же. Билеты с `EventTicket.onlineBookingAt` в окне «через 0–60
минут» (см. [events.md](events.md), «Онлайн-бронирование у билета»);
получатель — владелец билета, подписка не проверяется. Время лежит
тайским настенным в UTC-слоте, поэтому окно строится от бангкокского
«сейчас» (`now + 7ч`, разложенного в UTC-компоненты), а не от голого
`now` — иначе напоминание ушло бы на 7 часов позже открытия. Через
`notifyUser`: повод `ONLINE_BOOKING`, заголовок «Скоро откроется
онлайн-бронирование на «Событие»», тело «Откроется примерно через час —
в 10:00 (тайское время).» плюс ссылка на бронирование строкой ниже (в
`href` она не идёт: go-маршрут колокольчика во внешний редирект не
ходит, ведёт на страницу события); Telegram — по `tgNotifyEvents`.
Дедуп — не таблица, а `onlineBookingNotifiedAt` на самом билете:
ставится атомарным `updateMany … WHERE onlineBookingNotifiedAt IS NULL`
до отправки (гонку тиков судит это условие), сбрасывается экшеном при
смене времени. Ротировать нечего: отметка живёт с билетом.

## Недельный дайджест «Ваша неделя» (подписка)

Воскресная рассылка (аудит 2026-09, раздел 8) — НЕ из получасового
прогона, а задачей планировщика `weekly-digest`
(`src/lib/scheduledJobs.ts`): `intervalDays: 7` плюс `weekday: 0` (час
по умолчанию — 10, не 4 утра, как у парсеров: дайджест человек читает).
День недели жёсткий, а не «через семь дней после прошлого раза»: один
пропуск (задачу выключали, прогон упал) увёл бы воскресную рассылку на
среду навсегда.

Получают: привязанный Telegram + активная подписка + `tgNotifyDigest`.
Текст собирает **общий** сборщик подборок `buildDigestMessage`
(`src/lib/botDigest.ts`, `days: 7`) — тот же, что отвечает боту на
`/week`; второго сборщика нет намеренно, два списка «что у меня на
неделе» разъехались бы молча. Пустую подборку рассылка пропускает
(`skipEmpty` — вместо подсказки бота она возвращает `null`): человек
рассылку не спрашивал.

Отдельного дедуп-журнала нет и не нужно: прогон задачи планировщик
захватывает атомарно и повторно за неделю не стартует.

## Месячная сводка владельцу сообщества

Задача планировщика `community-digest` (`intervalDays: 30`, час по
умолчанию 11), `sendCommunityMonthlySummaries`. Создателю каждого
сообщества — что у него было за 30 дней: сколько пришло участников
(`CommunityMember` со `status: ACTIVE` — неодобренная заявка и
забаненный не в счёт), сколько завели тем и написали комментариев,
какая встреча ближайшая. Всё считается по существующим моделям, новых
таблиц нет; комментарии — одним `groupBy` на все сообщества сразу,
ближайшие встречи — одной выборкой будущих дат (никаких запросов «на
каждое сообщество»).

**Пустая сводка не уходит.** «За месяц ничего не произошло» — это
ежемесячное напоминание о том, что сообщество мертво, то есть спам;
одна лишь ближайшая встреча поводом тоже не считается — о ней владелец
знает, он её и завёл.

Получатель — владелец сообщества. Доставка идёт через `notifyUser` с
видом `COMMUNITY_DIGEST`: строка ложится в колокольчик, а в Telegram
уходит по тумблеру «Сообщества» (`tgNotifyCommunities`) — одним
движением. Своего `sendTelegramMessage` у сводки нет намеренно: иначе
владелец с привязанным ботом получал бы её дважды. В колокольчик едет
тот же счёт словами, но без ссылок и разметки Telegram.

**Обе рассылки разделены на «собрать» и «отправить»**
(`collectWeeklyDigests` / `sendWeeklyDigests`,
`collectCommunityMonthlySummaries` / `sendCommunityMonthlySummaries`).
Это не украшательство: у рассылки в живого бота иначе нет способа
посмотреть, что именно она напишет людям, — а посмотреть надо ДО того,
как она написала. Сухой прогон глушит `TELEGRAM_BOT_TOKEN` (любая
случайная отправка тогда падает на `botToken()`, а не уходит в чат) и
зовёт только половину `collect*`.

## Разговор с ботом (И7)

Текст, написанный боту (не команда и не reply), пересылается админам
(`notifyAdmins("feedback", …)` с меткой `(id N)` — по ней работает
«Ответить»), а отправителю бот подтверждает получение — **один раз в
начале разговора**, а не на каждое сообщение: раньше три строки подряд
получали три одинаковых «Спасибо!», и бот выглядел автоответчиком.

Разговор — это окно активности: `TelegramChatState` (ключ — telegram
chat id, НЕ userId: боту пишут и незарегистрированные) помнит последнее
сообщение человека и последний ответ админа. Пока с последней реплики
любой стороны прошло меньше 48 часов, разговор живой и
автоподтверждение молчит; после ответа админа — тем более (это уже
диалог с человеком). Вернулся после паузы — разговор считается новым, и
подтверждение уместно снова: вопрос наверняка другой.

Ответ админа (штатный reply в Telegram на пересланное обращение)
доставляется человеку и отмечает `lastAdminReplyAt`.

## Payments webhook

`/api/telegram/webhook` (registered once via
`scripts/setup-telegram-webhook.ts`, authenticated by
`TELEGRAM_WEBHOOK_SECRET` header) handles Telegram Stars subscription
payments: `pre_checkout_query` is confirmed if the payload (our userId,
embedded by `createPremiumInvoiceLink`) resolves to a user;
`successful_payment` extends `premiumUntil` by 30 days
(`extendPremium`), links `telegramId` if missing, and thanks the payer.
Бессрочный подписчик (`premiumLifetime`) до кнопки оплаты не доходит —
пейволл активным не показывается; если оплата всё же пришла, срок
копится как обычно.
The paywall (`PremiumUpsell` → `BuyPremiumButton` →
`getPremiumInvoiceLink`) opens the invoice link in Telegram.

## Files

- `src/lib/telegram.ts` — bot API client: `verifyTelegramAuth` (login
  widget HMAC check), `sendTelegramMessage` (returns `false` on 403
  instead of throwing). Every Bot API call goes through one helper with
  a 10-second `AbortSignal.timeout` — Node's `fetch` has no deadline of
  its own, and a hung request would stall the half-hourly sweep
  indefinitely. `answerPreCheckoutQuery` never throws (answering
  pre-checkout is best-effort) but logs non-ok responses instead of
  silently ignoring them.
- `src/lib/telegramNotifications.ts` — all reminder sweeps + friend
  notifications + дайджесты (недельный и месячная сводка сообщества).
- `src/lib/botDigest.ts` — общий сборщик подборок «что у меня сегодня /
  на неделе»: ответы бота на `/today` и `/week` и текст недельного
  дайджеста.
- `src/instrumentation.ts` — the timer.

## Команды бота

`/start`, `/today`, `/week`, `/terms`, `/support` — обрабатываются в
`src/app/api/telegram/webhook/route.ts`, список для кнопки «Меню»
регистрируется скриптом `scripts/setup-telegram-commands.ts` (разовый
запуск, как и вебхук; после добавления команды скрипт нужно прогнать
заново).

`/today` и `/week` — личная подборка (`buildDigestMessage` в
`src/lib/botDigest.ts`): серии моих сериалов на день/неделю, мои
события, старты продаж по ним и дни рождения избранных. Тот же сборщик
готовит воскресный недельный дайджест подписчикам (см. выше) — поэтому
секция стартов продаж появилась и в ответах бота. Выборки повторяют
сайт, чтобы бот и страницы не разъезжались: серии — как вкладка
сериалов календаря с фильтром «только мои» (любой статус просмотра),
события — как телеграм-напоминания («иду» на дату или событие в
избранном, только афиша — встречи сообществ боту не место), старты
продаж — как пресейл-напоминания, но БЕЗ проверки подписки (дата
препродажи и так открыто написана на странице события; платное в ней —
пинг за час, а не знание), дни рождения — как поздравления З3
(месяц/день в UTC). Ответ — на языке привязанного
аккаунта, ссылки ведут на версию сайта этого языка; секция длиннее 12
строк обрезается с «…», совсем пустая подборка отвечает подсказкой
«отмечайте сериалы и добавляйте в избранное». Аккаунт ищется по
`telegramId` ОТПРАВИТЕЛЯ (`from.id`, не chat id: командам из группового
чата чужая подборка не положена); непривязанному бот подсказывает
привязать Telegram в настройках — по-русски, как остальные ответы бота:
язык человека без аккаунта узнать неоткуда.

`/terms` и `/support` обязательны для ботов, принимающих Telegram Stars
(Live Checklist в core.telegram.org/bots/payments-stars). Оттуда же ещё
одно требование, которое кодом не закрыть: **на аккаунте-владельце бота
должна быть включена двухэтапная аутентификация** — без неё оплата
падает с `PROVIDER_ACCOUNT_INVALID`. Условия лежат на `/terms`.
