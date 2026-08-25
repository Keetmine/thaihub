# Testing

A small Playwright Test smoke suite (`tests/e2e/`) covering the critical
paths, not comprehensive coverage. No unit tests exist elsewhere in the
project.

## Running

```
npm run dev              # in one terminal — tests run against a live dev server
npm run test:e2e          # in another
```

`playwright.config.ts` points at `http://localhost:3001` by default
(override with `BASE_URL`). **Deliberately does not auto-start the app
by default** — this project's Postgres data is the developer's real
local database, not a disposable test DB, so starting a second server
instance against it isn't something to do automatically. A `webServer`
block exists in the config but only activates when `PW_WEB_SERVER=1` is
set (that's what CI does); without the flag local behaviour is exactly
as described above.

## Signing in: once per run, not once per spec

The suite signs the admin in **exactly once per run**. A `setup` project
(`tests/e2e/auth.setup.ts`) logs in, then saves the browser state to
`playwright/.auth/admin.json`; every admin spec picks that state up with

```ts
import { ADMIN_STORAGE_STATE } from "./auth-state";

test.use({ storageState: ADMIN_STORAGE_STATE });
```

and simply navigates to the page it wants — no `loginAsAdmin` call. The
`e2e` project declares `dependencies: ["setup"]`, so the state file always
exists before the specs run.

Why it matters: the login form is rate-limited to 30 attempts per 10
minutes per IP (`src/lib/rateLimit.ts`, protection against brute force —
not something to raise for tests). Every spec used to call
`loginAsAdmin`, which put a full run at ~14 attempts: two runs in a row
passed, the third collapsed into `page.waitForURL` timeouts that looked
exactly like an application bug. Each call also spawned a `tsx` process to
upsert the admin, which is where most of the wall clock went — the local
run went from ~4m35s to ~55s.

The saved state carries both cookies that matter: `user_session` and
`locale=en`. The English one is deliberate — tests assert English labels,
and without it a spec that left Russian in the admin's profile would make
its neighbours fail on "missing" buttons.

**The state is never committed** (`playwright/.auth/` is in
`.gitignore`) — it's a live session.

Specs that sign in for real, on purpose:

- `admin-auth.spec.ts` — it tests the login itself, so it takes no stored
  state and calls `loginAsAdmin`;
- `user-locale.spec.ts` — it checks that the language is restored from the
  profile at login, which the stored `locale` cookie would paper over.

Everything else that is *not* about the admin (`favorites`,
`premium-gates`, `shared-trips`, `account-deletion`, most of `i18n`) stays
anonymous or makes its own user. That's why the stored state lives in
per-spec `test.use` rather than the config's global `use`: a project-wide
`storageState` also leaks into `browser.newContext()` calls inside tests,
which silently broke the "first visit, no cookies" locale tests. The one
admin test inside `i18n.spec.ts` therefore builds its own context with
`browser.newContext({ storageState: ADMIN_STORAGE_STATE })` instead of
switching the whole file over.

### If tests suddenly fail at login

- **Timeouts on `page.waitForURL(/\/account/)` in the setup project** —
  that's the rate limit, not a bug. Wait 10 minutes for the window to
  reset (the limiter is in-memory, so restarting the dev server also
  clears it). Don't raise `MAX_ATTEMPTS`.
- **A spec redirects to `/account` instead of showing the login form** —
  it inherited a session it didn't expect. Either it shouldn't have
  `test.use({ storageState })`, or it's creating a context that inherits
  from the config.
- **`Error: ENOENT ... playwright/.auth/admin.json`** — the setup project
  didn't run. It runs automatically for a full `npx playwright test`, but
  filtering by file (`npx playwright test tests/e2e/i18n.spec.ts`) filters
  the setup out too and reuses whatever state is on disk. Run the suite
  once, or `npx playwright test --project=setup`, to refresh it.
- **Stale session after wiping the database** — delete
  `playwright/.auth/` and run again.

## CI

`.github/workflows/e2e.yml` runs the whole suite on every push to `main`
and on pull requests (separate from `ci.yml`'s typecheck/lint/build and
`deploy.yml`'s auto-deploy). It needs no repository secrets. The job:

1. starts a disposable `postgres:16` service container
   (`e2e`/`e2e`/`myblhub_e2e`, health-checked with `pg_isready`);
2. `npm ci`, `prisma generate`, `prisma migrate deploy`, `npm run
   db:seed` — the seed's future events give `favorites.spec.ts` and
   `premium-gates.spec.ts` something to open;
3. creates the test admin via `tests/e2e/create-admin-user.ts` (creds
   are hardcoded in `helpers.ts` — `admin-e2e@test.local` /
   `admin-e2e-password` — so no secret is involved; the `setup` project
   creates it on its own anyway, the explicit step just fails fast if the
   tsx/Prisma scripts break, before `webServer` spends minutes building);
4. `playwright install --with-deps chromium`, then `playwright test`
   with `PW_WEB_SERVER=1` — the `setup` project signs in against the
   server Playwright started and writes `playwright/.auth/admin.json` into
   the workspace (gitignored, thrown away with the runner). Playwright
   itself builds the app and runs
   `next start -p 3001` (prod build, not dev; `output: "standalone"`
   only makes `next start` print a warning). `DATABASE_URL`, `APP_URL`
   and `BASE_URL` are set at the job level and inherited by the server;
5. on failure uploads `playwright-report/` (the config adds an HTML
   reporter when `CI` is set) plus `test-results/` traces as an
   artifact.

Expected skips in CI — these are not failures:

- `duplicate-warning.spec.ts` — the seed creates no dramas, so there is
  no existing title to collide with;
- `shared-trips.spec.ts` (all 3 tests) — the Аня/Маша demo users and
  their trip only exist in the dev database; `login()` skips when the
  credentials don't match instead of timing out;
- `telegram-webhook.spec.ts`, the two "with the real secret" cases —
  `TELEGRAM_WEBHOOK_SECRET` isn't set in CI. The 403 cases still run:
  with no secret configured the webhook rejects everything.

Optional env (`TELEGRAM_*`, `SMTP_*`, `SENTRY_*`, `GOOGLE_*`) is left
unset on purpose — the code guards all of it, and without tokens the
tests can't accidentally reach real external services.

## What's covered

- `admin-auth.spec.ts` — admin password login reaches the dashboard (the
  one admin spec that signs in for real; see "Signing in" above).
- `admin-event-crud.spec.ts` — create an event through the admin form,
  confirm it appears, delete it through the UI (doubles as cleanup).
- `favorites.spec.ts` — sign up a real (throwaway) user, favorite an
  event, confirm the state survives a reload (not just optimistic client
  state).
- `duplicate-warning.spec.ts` — regression test for the blscene duplicate
  bug: typing an existing drama's title on the create form must show the
  "похоже, уже есть" hint (see
  [features/duplicates.md](features/duplicates.md)).
- `premium-gates.spec.ts` — the money paths: a fresh non-premium user
  sees the subscription paywall (and zero event links) on `/events`,
  `/calendar` and `/trips`, and the gates open once `premiumUntil` is set
  (via `set-premium-test-user.ts`); a promo code created by
  `create-promo-code.ts` redeems on the paywall, opens the gate (checked
  again after a full reload), and a second redeem of the same code fails
  with "Код уже использован" (`delete-promo-code.ts` cleans the code up).
- `telegram-webhook.spec.ts` — the Telegram webhook rejects requests
  without/with a wrong secret token (403) and survives garbage JSON and
  unknown update shapes with the real secret (200). Only these cases run
  against the live dev server: updates carrying `message.text`,
  `pre_checkout_query` or `successful_payment` would hit the real
  Telegram Bot API (admin notifications, chat replies), so they are
  deliberately not exercised — see the comment in the spec.

## Writing a new test: avoid the Prisma-in-Playwright trap

**Don't `import { prisma } from "@/lib/prisma"` directly inside a
`*.spec.ts` file.** The generated Prisma client is ESM-only and
Playwright Test's own module loader fails on it
(`SyntaxError: Cannot use 'import.meta' outside a module`). Two ways
around it, both used in this suite:

1. **Prefer not needing the DB at all** — read what you need from the
   rendered page instead of querying Prisma directly. E.g.
   `duplicate-warning.spec.ts` scrapes an existing drama title off
   `/admin/dramas` rather than querying the DB for one; `favorites.spec.ts`
   verifies the favorite stuck by checking button state after a reload
   instead of querying `FavoriteEvent`.
2. **When you genuinely need DB access** (mainly for cleanup), shell out
   to a separate `tsx` process rather than importing Prisma into the spec
   file's own module graph — see `tests/e2e/cleanup-test-user.ts` and its
   `execFileSync` call in `favorites.spec.ts`'s `afterAll`-equivalent
   `finally` block.

## Selector gotcha: the admin nav has more than one submit button

`page.click('button[type="submit"]')` on any authenticated admin page can
match the nav's "Выйти" (logout) `<form>` instead of the form you actually
meant, since both the desktop and mobile nav variants render (CSS
`display` toggles visibility, but both stay in the DOM). Prefer
`page.getByRole("button", { name: "exact label" })` over a generic
`type="submit"` selector on any admin page.

## Test data hygiene

Every test that creates data cleans it up itself (deletes the test user /
event it made), and a test that needs *existing* catalog data reads it
from the DOM rather than assuming a specific seeded row exists. There's no
separate test database — these tests run against whatever's actually in
your local Postgres, so leaving junk behind pollutes real data.
