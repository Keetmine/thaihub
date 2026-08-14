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
