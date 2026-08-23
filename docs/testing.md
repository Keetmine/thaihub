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
(override with `BASE_URL`). **Deliberately does not use Playwright's
`webServer` option to auto-start the app** — this project's Postgres data
is the developer's real local database, not a disposable test DB, so
starting a second server instance against it isn't something to do
automatically.

## What's covered

- `admin-auth.spec.ts` — admin password login reaches the dashboard.
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
