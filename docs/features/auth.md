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

**Promo codes**: одноразовый `PromoCode` (+1 месяц подписки) —
генерация/удаление в блоке на `/admin/users`, активация полем
«Промокод» на пейволле (`PromoCodeRedeem` → `redeemPromoCode`,
транзакционное использование + rate limit). Месяц прибавляется к
текущему сроку.

**Signup is open** — no invite codes (the `InviteCode` system was
removed; anyone can register with email+password). **Rate limiting**:
`assertRateLimit` (`src/lib/rateLimit.ts`, in-memory fixed window, 10
attempts / 10 min per IP from X-Forwarded-For) guards user login and
signup.

## Google login

`/api/auth/google` → Google consent → `/api/auth/google/callback`
(plain OAuth 2.0 authorization-code flow, no library; CSRF state
cookie). The callback exchanges the code directly with Google and reads
the profile from the `id_token` payload (signature deliberately not
verified — the token arrives straight from Google over HTTPS in
exchange for code+client_secret). Account resolution: by `googleId`,
then by email (links Google to an existing email account), else a new
`User` is created (`passwordHash` null, like Telegram accounts).
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

**Привязка к существующему аккаунту** — кнопка «Подключить Telegram» в
настройках открывает попап (`TelegramRelinkDialog`), и уже в нём живёт
виджет. Кнопка сама по себе ничего не грузит и не сохраняет, поэтому
окно открывается и закрывается мгновенно.

Виджет работает в режиме `data-onauth`: отдаёт профиль в JS-колбэк,
попап шлёт его POST'ом на `/api/auth/telegram/link`, и страница
остаётся на месте. С `data-auth-url` браузер уходил на серверный
колбэк и возвращался — страница успевала перезагрузиться до того, как
человек видел вопрос.

Если Telegram занят другим аккаунтом, роут **не пишет куку**, а
возвращает подписанные данные обратно вместе с тем, что будет потеряно
(избранное, отметки «иду», поездки) — попап показывает это вторым
шагом в том же окне. Кука раньше заставляла попап ходить на сервер при
открытии и ждать её удаления при отмене; подпись всё равно
перепроверяется в `confirmTelegramRelink`, так что кука ничего не
защищала. Старый аккаунт удаляется мягко (`softDeleteUser`).

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
- **all event data**: the home page shows a plain `PremiumUpsell`
  instead of the list for non-premium users (no event data queried at
  all); embedded lists on performer/drama/location pages and search
  render `EventCardLocked` — the real date plus blurred placeholder
  bars — so it's still visible *that* a performer has events, just not
  which; the event detail page shows only the dates + `PremiumUpsell`.
  All masking happens **server-side** (locked cards receive nothing but
  a date; `fetchEventListPage` blanks title/venue/performers/poster
  before the payload leaves the server), so the blur cannot be removed
  via devtools — the data simply isn't in the HTML or any action
  response. Single-event ICS export returns 403 too, the account page's
  events tab receives empty arrays, and the `loadEventListPage` server
  action re-checks premium itself, so calling it directly leaks
  nothing;
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
counts), search, per-user premium toggle (`PremiumToggle.tsx` →
`setUserPremium`), and delete (cascades to all user-owned rows).

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
напишите нам». `/reset-password/[token]` — форма нового пароля,
`resetPassword` помечает токен использованным. Существование ящика не
раскрывается («письмо отправлено» в любом случае). Ссылка «Забыли
пароль?» — на /login. Rate-limit: MAX_ATTEMPTS поднят до 30/10мин
(полный e2e-прогон делает 10+ логинов с одного IP).

## Онбординг (/welcome)

После регистрации редирект на /welcome: плитки самых «событийных»
артистов + мультиселект с поиском — выбранные уходят в избранное
(`saveOnboardingFavorites`, skipDuplicates), «Пропустить» ведёт на
главную. Логин ведёт на /account, как раньше.
