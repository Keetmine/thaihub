# Auth

## Admin

Admin is a **user role**, not a separate login: `User.isAdmin` (set via
DB/script; keetmine@gmail.com is admin). There is no `/admin/login`, no
`ADMIN_PASSWORD`, no `AdminSession` — an admin signs in like any user
and gets an админка icon button next to their profile in the public
nav. `proxy.ts` only checks *presence* of the ordinary `user_session`
cookie for `/admin/*` (redirects to `/login` otherwise); real
validation is `isAdminAuthenticated()` (current user's `isAdmin`)
called by the `(protected)` admin layout, and **every admin server
action starts with `await requireAdmin()`** — the actions are reachable
by POST regardless of layout rendering, so each one guards itself.
E2e tests upsert a dedicated admin user via
`tests/e2e/create-admin-user.ts`.

## Real users

`src/lib/userAuth.ts`:

- `hashPassword`/`verifyPassword` — `scrypt` with a random salt (Node's
  `crypto`, no external dependency), constant-time comparison via
  `timingSafeEqual`.
- `createUserSession(userId)` — creates a `UserSession` row (30-day
  expiry) and sets a `user_session` cookie to that row's id.
- `getCurrentUser()` — looks up the session by cookie, checks expiry,
  returns the `User` (or `null`). **This is the actual authorization
  check** — call it in any page/action that needs to know who's logged
  in; it does a real DB round-trip on purpose (see below for why the
  cookie check alone isn't enough).

Signup/login pages: `src/app/(public)/signup/`, `src/app/(public)/login/`.

## Блокировка (бан)

Инструмент владельца сайта — в отличие от мягкого удаления, которое
человек делает сам (см. «Согласие и самоудаление»). Поля на `User`:
`bannedAt`, `banReason` (служебная, человеку не показывается),
`bannedById` + связь `bannedBy`.

**Проверка одна, и она на чтении сессии.** `getCurrentUser()` отдаёт
`null`, если у аккаунта стоит `bannedAt`, — ровно там же, где отсеивается
`deletedAt`. Через эту функцию проходит вся авторизация сайта: «кто я»
больше неоткуда взять, `proxy.ts` смотрит только наличие куки и в базу не
ходит. Поэтому с момента блокировки заблокированный для всего кода —
гость: страницы рисуются как анониму, любой server action упирается в
собственную проверку «нужен вход», `isAdminAuthenticated()` не пускает в
админку. Рассыпать проверку по страницам не нужно и вредно — забытая
страница стала бы дырой.

**Вход** закрывается в `createUserSession()`: все четыре способа войти
(пароль, регистрация, Google, Telegram) заканчиваются этой функцией, так
что забыть проверку в новом способе входа физически негде. Сессия
заблокированному не заводится вовсе, вместо этого — редирект на
`/banned`.

**Действующие сессии** при бане НЕ гасятся (в отличие от
`softDeleteUser`, который их сносит). Это осознанно: строка `UserSession`
остаётся живой, чтобы на следующем же клике человек попал на экран с
объяснением, а не на форму входа, где он решил бы, что ошибся паролем.
Безопасности это не стоит ничего — `getCurrentUser()` ходит в базу на
каждый запрос, и кука без прав ничего не открывает. Разблокировка по той
же причине возвращает человека в аккаунт без повторного входа.

**Экран `/banned`** (`src/app/banned/page.tsx`) лежит ВНЕ группы
`(public)`: её layout зовёт `assertNotBanned()` (`src/lib/userAuth.ts`),
который уводит заблокированного на `/banned` с любой публичной страницы,
и страница внутри группы зациклила бы редирект на саму себя. Layout
рендерится перед каждой публичной страницей — одной строки хватает на
весь сайт. Это только объяснение, а не защита: доступ уже закрыт выше.
Не заблокированного (и гостя) `/banned` уводит на главную.

Что видит человек: факт блокировки, что написанное им осталось на местах,
и форму обращения (обычный `FeedbackForm` → `/admin/feedback` + Telegram
админам) — без неё писать было бы некуда, `/help` лежит в `(public)` и
заблокированного с неё увело бы на тот же `/banned`. **Причину не
показываем** (решение владельца): она служебная, для админки. Экшен видит
заблокированного как анонима, поэтому почта в форме обязательна;
подставляется почта аккаунта, чтобы обращение можно было сопоставить.
Тексты — `auth.banned` в `src/lib/i18n/{ru,en}/auth.ts`, страница
`noindex`.

**Контент заблокированного остаётся** (решение владельца): массовое
исчезновение чужих реплик рвёт разговоры, лишнее админ удаляет точечно с
карточки пользователя. Участником сообществ он при этом не считается ни
для одной записи — все проверки прав в `communities` строятся от
`getCurrentUser()`, то есть от `null`. В счётчике «N участников» строка
`CommunityMember` пока учитывается (счётчик фильтрует только `status`) —
как и у мягко удалённых аккаунтов.

Кнопки — в админке: `/admin/users` и карточка `/admin/users/[id]`, экшены
в `src/app/admin/(protected)/users/banActions.ts` (`banUser`,
`unbanUser`), см. [admin-panel.md](admin-panel.md). Причина обязательна.
Нельзя заблокировать себя (иначе админ потерял бы и админку, и
возможность разблокироваться) и админа сайта (снять блокировку было бы
некому, кроме как руками в базе); обе проверки — в экшене, а не только в
кнопке. Каждая блокировка и разблокировка пишется в журнал правок
(`logAudit`, `entityType: "User"`).

## Подписка

`User.premiumUntil` — срок; подписка активна, пока дата в будущем.
Продлевается из админки («+1 мес»), промокодом или оплатой Stars —
всегда через `extendPremium` (месяц к концу текущего срока, если он
ещё идёт, иначе от сегодня). `User.premiumLifetime` — бессрочная,
выдаётся кнопкой «Бессрочно» на `/admin/users` (см.
[admin-panel.md](admin-panel.md)): активна независимо от срока, о
скором окончании не напоминает (`sendPremiumExpiryReminders` её
пропускает), Stars-продление и промокод для неё бессмысленны, но не
вредят — `premiumUntil` просто копится на случай снятия флага.

Проверка активности — **только** через `src/lib/premium.ts`:
`isPremiumActive(user)` в коде (тип требует оба поля — выборка с одним
`premiumUntil` не соберётся) и `premiumActiveWhere(now)` /
`premiumInactiveWhere(now)` в Prisma `where` (счётчики дашборда и
аналитики, аудитория рассылок, фильтр «подписка» в списке
пользователей, «активные подписки» в финансах). Голого
`premiumUntil: { gt: now }` в коде быть не должно — оно теряет
бессрочных. Публично подписка показывается иконкой на профиле с
подсказкой «Active subscription» / «Lifetime subscription»
(`account.planPremiumHint` / `planLifetimeHint`); пейволл
(`PremiumUpsell`) активным — в том числе бессрочным — не рендерится
вовсе. Юнит-тест: `tests/unit/premium.test.ts`.

**Promo codes**: одноразовый `PromoCode` (+1 месяц подписки) —
генерация/удаление в блоке на `/admin/users`, активация полем
«Промокод» на пейволле (`PromoCodeRedeem` → `redeemPromoCode`,
транзакционное использование + rate limit). Месяц прибавляется к
текущему сроку.

**Signup is open** — no invite codes (the `InviteCode` system was
removed; anyone can register with email+password). **Rate limiting**:
`assertRateLimit` (`src/lib/rateLimit.ts`, in-memory fixed window, 30
attempts / 10 min per IP) guards user login and signup. IP берётся из
**последнего** элемента X-Forwarded-For — его дописывает Caddy, а
начало списка может прислать сам клиент (первый элемент давал
бесплатный обход лимита). Для e2e лимитер отключается переменной
`E2E_RATE_LIMIT_OFF=1`, но только вне production (`NODE_ENV`).

## Google login

`/api/auth/google` → Google consent → `/api/auth/google/callback`
(plain OAuth 2.0 authorization-code flow, no library; CSRF state
cookie). The callback exchanges the code directly with Google and reads
the profile from the `id_token` payload (signature deliberately not
verified — the token arrives straight from Google over HTTPS in
exchange for code+client_secret). Account resolution: by `googleId`,
then by email (links Google to an existing email account), else a new
`User` is created (`passwordHash` null, like Telegram accounts).
Привязка/создание по email требует `email_verified === true` в
id_token: иначе Google-аккаунт с чужой неподтверждённой почтой входил
бы в существующий аккаунт с этим email.
Requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` env vars — the
login/signup buttons render only when configured. Redirect URI must be
`{APP_URL}/api/auth/google/callback` in the Google console. Apple
Sign-In is NOT implemented — it requires a paid Apple Developer
account (own key/team setup); revisit if that appears.

## Telegram login

Optional third way in (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME`
env vars; the login-page widget only renders when the username is set).
Official Telegram Login Widget on `/login` → redirects to
`/api/auth/telegram` with a signed profile; `verifyTelegramAuth`
(`src/lib/telegram.ts`) checks the HMAC signature (secret =
SHA256(bot token)) and a 24h `auth_date` freshness window, then the
route finds-or-creates a `User` by `telegramId` and sets the same
`user_session` as a password login. Telegram accounts have `email` and
`passwordHash` both `null` (the columns went nullable for this) — the
password-login action treats a null hash as "wrong password", and
`changePassword` rejects them with an explanation. **Widget caveat**: it
only renders on the domain bound to the bot via BotFather's `/setdomain`
— it will not appear on localhost.

**Привязка к существующему аккаунту** — кнопка виджета стоит прямо в
настройках (`TelegramLinkButton`). Промежуточного окна «сначала
откройте попап, потом нажмите Telegram» нет: лишний шаг ничего не
добавлял.

Виджет работает в режиме `data-onauth`: отдаёт профиль в JS-колбэк,
попап шлёт его POST'ом на `/api/auth/telegram/link`, и страница
остаётся на месте. С `data-auth-url` браузер уходил на серверный
колбэк и возвращался — страница успевала перезагрузиться до того, как
человек видел вопрос.

Если Telegram занят другим аккаунтом, роут **не пишет куку**, а
возвращает подписанные данные обратно вместе с тем, что будет потеряно
(избранное, отметки «иду», поездки) — и только тогда всплывает попап
`TelegramRelinkDialog`. Это его единственная роль. Кука раньше заставляла попап ходить на сервер при
открытии и ждать её удаления при отмене; подпись всё равно
перепроверяется в `confirmTelegramRelink`, так что кука ничего не
защищала. Старый аккаунт удаляется мягко (`softDeleteUser`).

**Отвязка** — через `ConfirmForm`: кнопка стоит вплотную к настройкам
рассылки, промахнуться легко, а отвязка обрывает все напоминания. У
обёртки появились `confirmLabel` / `busyLabel` — она писала «Удалить»
на кнопке подтверждения, что для отвязки было бы неправдой.

Колбэк регистрируется в `window` отдельным эффектом от вставки
скрипта. Вместе они не уживались: в dev React монтирует эффекты
дважды, очистка удаляла функцию, а повторный проход выходил раньше
(скрипт уже вставлен) и не регистрировал её снова — виджет звал имя,
которого больше нет.

GET на том же маршруте остался запасным путём: перенос он завершить не
может (попап живёт на клиенте), поэтому при занятом Telegram просто
возвращает `?telegram=taken`. Вход на `/login` по-прежнему идёт
переходом, там перезагрузка всё равно неизбежна.

The same bot also sends event reminders — see
[telegram-notifications.md](telegram-notifications.md).

## Premium flag

`User.premiumUntil` (nullable date) — the subscription is a 30-day term,
active while the date is in the future (`isPremiumActive` in
`src/lib/premium.ts` — every gate checks through it). Granted +1 month
at a time from `/admin/users` (extends from the current end if still
active) or by a Telegram Stars payment (see
[telegram-notifications.md](telegram-notifications.md), "Payments
webhook"); a Telegram reminder goes out 3 days before expiry. What it
gates:

- the calendar (`/calendar`), the day view (`/day/[date]`) and the ICS
  subscribe feed (`/api/calendar-feed` returns 403 for non-premium
  owners);
- **the event feed, but no longer the events themselves.** Since the
  teaser round the event *card* (`/event/[id]`) is public in full —
  title, dates, venue, poster, cast, ticket price and presale link —
  and `/events` shows a guest the two nearest events for real, followed
  by `PremiumUpsell` (see
  [events.md](events.md#афиша-без-подписки-тизер-и-публичная-карточка)).
  Search, however, locks event rows for non-premium viewers (reversed
  2026-09-05 by the owner): searching an artist's name is a filtered
  feed, and the open results were a legal paywall bypass. SEO loses
  nothing — every `?q=` page canonicalises to bare `/search`, so query
  results were never indexed; crawlers find events via the sitemap shard
  and the public cards. The live search palette skips the events section
  for non-premium viewers entirely. What the subscription gates is the
  **listing and the personal layer**: the feed with filters/archive,
  search results, the "going" chips, my tickets, notes, friends-going
  and the presale reminder. Embedded lists on performer/drama/location
  pages and search render `EventCardLocked` — the real date plus
  blurred bars. Masking stays **server-side** (locked
  cards receive nothing but a date; `fetchEventListPage` blanks
  title/venue/performers/poster before the payload leaves the server),
  so the blur cannot be removed via devtools. Single-event ICS export
  returns 403, the account page's events tab receives empty arrays, and
  `loadEventListPage` re-checks premium itself;
- the whole trips feature (see [trips.md](trips.md)): `/trips` shows
  `PremiumUpsell`, `createTrip`/`setTripVisibility` and every
  personal-event action throw for non-premium users, and the home page
  hides trip tabs. A trip created while premium stays readable by its
  owner at `/trips/[id]` after the flag is revoked (read-only — manage
  buttons hidden, `deleteTrip` still allowed so people can clean up),
  and shared FRIENDS/PUBLIC trips stay viewable by others regardless of
  the *viewer's* premium status.

Non-premium users see `PremiumUpsell`
(`src/components/PremiumUpsell.tsx`) in place of the page content.

## Admin user management

`/admin/users` — list (name/email/telegram, registration date, activity
counts, последний заход), search, sort, per-user premium toggle
(`PremiumToggle.tsx` → `setUserPremium`), and delete (cascades to all
user-owned rows). Подробнее про раздел —
[admin-panel.md](admin-panel.md).

## Отметка активности

`User.lastSeenAt` — когда человек последний раз что-то делал на сайте;
нужна одному потребителю, админке (`/admin/users`), чтобы понимать,
живой аккаунт или заброшенный.

Пишется в `getCurrentUser()` — это единственная точка, где известно
«сессия валидна, аккаунт не удалён, человек прямо сейчас делает
запрос», и она уже обёрнута в `React.cache`, так что на один HTTP-запрос
приходится одна проверка. Сама запись — в `touchLastSeen()`
(`src/lib/lastSeen.ts`) и с двумя оговорками:

- **дросселирование**: обновляем, только если с прошлой отметки прошло
  больше `LAST_SEEN_THROTTLE_MS` (10 минут). Иначе каждый переход по
  сайту (плюс опрос уведомлений и раздача файлов, которые тоже зовут
  `getCurrentUser()`) стоил бы UPDATE ради поля, которое смотрят раз в
  неделю;
- **не блокирует ответ**: UPDATE уходит в `after()` из `next/server`,
  то есть после отдачи страницы, и его ошибки глушатся — упавшая
  отметка активности не должна ронять страницу. Вне запроса (скрипты,
  крон) `after()` недоступен, там отметка просто пропускается.

`ONLINE_WINDOW_MS` (15 минут, чуть шире порога записи) — окно, в котором
админка показывает «сейчас на сайте».

## `src/proxy.ts` — what it does and doesn't check

Per this Next.js version's own guidance (proxy runs on every route,
including prefetched ones), `proxy.ts` does an **optimistic
cookie-presence check only** — it never touches the database:

- `/admin/*` (except `/admin/login`) — redirects to `/admin/login` unless
  the `admin_session` cookie's value exactly equals
  `ADMIN_SESSION_SECRET`.
- `/api/*` — always passes through; API routes handle their own auth
  internally (a redirect response would just confuse a `fetch` caller
  instead of sending a person anywhere useful).
- `/`, `/about` (лендинг по постоянному адресу), `/wiki` (индекс) и
  `/wiki/[slug]`, `/login`, `/signup`, `/forgot-password`,
  `/reset-password/[token]`, `/manifest.webmanifest` — always public.
- **Каталог открыт без логина ради SEO** (regex в proxy): `/artists`,
  `/dramas`, `/novels`, `/locations`, `/agencies`, `/day`, `/event`,
  `/search` со всеми подстраницами. Страницы null-safe по
  `getCurrentUser()`; действия («в избранное», «иду», статусы) сами
  редиректят анонима на /login. Анониму без поиска показываются
  свежие сериалы по дате эфира и актёры с событиями (вместо пустых
  списков «ваших» статусов/избранного; залогиненный на /artists видит
  избранных + событийных). `/help` тоже публичный (форма обращений
  принимает анонимов с обязательной почтой). Личное (аккаунт, поездки,
  списки, друзья, календарь) — за логином.
- **Профиль человека `/users/{ник}` открыт без логина** (правка
  владельца 2026-09-06): ссылкой на себя делятся снаружи, и упираться в
  форму входа она не должна. Гость проходит по тем же веткам, что
  залогиненный незнакомец: он никому не друг и не хозяин профиля,
  поэтому видит ровно то, что владелец открыл посторонним — приватные
  поездки, приватные списки, приватные отзывы и вкладка билетов в
  разметку не попадают вовсе (не прячутся стилями, а не выбираются в
  запросе). Действия из профиля («в друзья», «пожаловаться») уводят
  гостя на /login, как и везде. В поиске профилей нет: у страницы стоит
  `noIndex` — открыт по ссылке, но не индексируется. Покрыто
  `tests/e2e/public-profile.spec.ts`.
- `/event/[id]/ics` — public (calendar apps fetch it directly, no session
  cookie).
- Everything else — redirects to `/login` unless a `user_session` cookie
  is present at all (not validated against the DB here).

**Real session validation — is this cookie's session actually valid and
unexpired — happens per-page via `getCurrentUser()`**, not in proxy.ts.
This two-layer split (cheap optimistic check in proxy, real check in the
Data Access Layer) is the documented pattern for this Next.js version,
specifically to avoid a DB round-trip on every single request including
ones proxy sees but the page never really needs auth for.

**If you add a new public (no-login-required) route**, or a new static
asset path the browser/OS fetches without cookies (like the PWA icons),
you need to add it to `PUBLIC_PATHS` or the `matcher` exclusion in
`src/proxy.ts` yourself — it won't work automatically. See
[pwa.md](pwa.md) for a concrete example of this exact gotcha.

## Антиспам на регистрации

Скрытое honeypot-поле `website` в форме: боты-автозаполнялки его
заполняют — экшен молча отвечает как при успехе, не создавая аккаунт.
Плюс общий rate limit. Следующая ступень при появлении спама —
Cloudflare Turnstile.

## Сброс пароля

`/forgot-password` → `requestPasswordReset`: одноразовый токен
(`PasswordResetToken`, час жизни), письмо через SMTP
(`src/lib/mailer.ts`, env SMTP_HOST/PORT/USER/PASS/FROM + SITE_URL).
Пока SMTP не настроен, форма честно отвечает «временно недоступно —
напишите нам». `/reset-password/[token]` — форма нового пароля
(клиентская `ResetPasswordForm`: ошибки экшен возвращает значением,
и форма показывает их под полем), `resetPassword` помечает токен
использованным и **удаляет все `UserSession` пользователя** — если
пароль сбрасывают из-за утечки, чужая сессия гаснет. Смена пароля в
настройках (`changePassword`) делает то же, но текущую сессию
оставляет. Существование ящика не
раскрывается («письмо отправлено» в любом случае). Ссылка «Забыли
пароль?» — на /login. Письмо уходит на языке страницы, с которой
запросили сброс, и ссылка в нём — с тем же префиксом (`/ru/…`).
Rate-limit: MAX_ATTEMPTS поднят до 30/10мин (полный e2e-прогон делает
10+ логинов с одного IP), плюс обход `E2E_RATE_LIMIT_OFF=1` вне
production.

### Аварийный сброс всех сессий

Гашение чужих сессий при смене/сбросе пароля появилось позже, чем сами
сессии: выданные до этого живут свой 30-дневный срок, и украденная
когда-то кука может ещё работать. Обнулить весь хвост разом —
`scripts/revoke-all-sessions.ts`:

```
npx tsx --env-file=.env scripts/revoke-all-sessions.ts          # черновик: сколько сессий и у скольких людей
npx tsx --env-file=.env scripts/revoke-all-sessions.ts --apply  # удалить все UserSession
```

⚠️ `--apply` **разлогинивает всех пользователей разом, включая
владельца** — это осознанная аварийная мера при подозрении на утечку, а
не уборка и не кандидат в планировщик. Черновой режим (по умолчанию)
ничего не трогает и заодно показывает, сколько сессий выдано больше 30
дней назад и всё ещё живо — «протухшие, но действующие».

Модель одна — `UserSession`: отдельных серверных админ-сессий больше
нет (админ — роль обычного пользователя, см. «Admin» выше), так что
этого достаточно и для админки.

## Онбординг (/welcome)

После регистрации редирект на /welcome: плитки самых «событийных»
артистов + мультиселект с поиском — выбранные уходят в избранное
(`saveOnboardingFavorites`, skipDuplicates), «Пропустить» ведёт на
главную. Логин ведёт на /account, как раньше.

## Согласие и самоудаление

Регистрация требует чекбокс согласия с /terms и /privacy
(`acceptTerms`, проверяется и в server action); под кнопками
Google/Telegram — текст «Входя через…, вы соглашаетесь…». См.
[legal.md](legal.md).

Удаление аккаунта самим пользователем: настройки → вкладка
«Безопасность» → «Удалить аккаунт» (ConfirmForm) →
`deleteOwnAccount` — тот же `softDeleteUser`, что у админа, плюс
`destroyUserSession` и редирект на главную. Покрыто e2e
`account-deletion.spec.ts`.
