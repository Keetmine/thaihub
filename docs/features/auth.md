# Auth

Two entirely separate systems — don't conflate them.

## Admin

One shared password (`ADMIN_PASSWORD` env var), no per-admin accounts.
`src/app/admin/login/actions.ts`'s `login` action checks the submitted
password against `ADMIN_PASSWORD` and, on success, sets a cookie
(`admin_session`) to `ADMIN_SESSION_SECRET` (also an env var — the cookie
value itself is the shared secret, not a generated session id).

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

The same bot also sends event reminders — see
[telegram-notifications.md](telegram-notifications.md).

## Premium flag

`User.isPremium` (boolean, default false) — toggled per-user from
`/admin/users` (no payment provider yet; the switch *is* the
subscription). What it gates:

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
- `/`, `/login`, `/signup`, `/manifest.webmanifest` — always public.
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
