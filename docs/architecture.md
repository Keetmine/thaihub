# Architecture

## Stack

- **Next.js 16** (App Router, TypeScript), server components by default,
  server actions (`"use server"`) for all writes — no separate REST/API
  layer except a couple of route handlers that genuinely need to be raw
  HTTP endpoints (ICS export/feed, file upload).
- **Prisma 7** + `@prisma/adapter-pg` against a **PostgreSQL** database
  (not SQLite — that was only true very early in the project). Client is
  generated to `src/generated/prisma` (custom `output` in
  `prisma/schema.prisma`), imported as `@/generated/prisma/client`.
- **Bootstrap 5**, dark-themed via CSS custom-property overrides in
  `src/app/globals.css`, Space Grotesk as the display font. Two accent
  colors: orange for the public site, violet scoped to `.admin-shell` for
  admin.
- **Leaflet + react-leaflet** for the locations map (OpenStreetMap tiles,
  no API key). See [locations.md](features/locations.md).
- **Playwright** — both a runtime dependency (the blscene importer drives
  a real browser to resolve Google Maps short links) and a dev dependency
  (`@playwright/test`, the smoke suite). See [testing.md](testing.md).

## Route layout

One app, two route groups, both under the same Next.js project:

- `src/app/(public)/*` — the fan-facing site. Gated behind a real user
  session for everything except `/`, `/login`, `/signup` (see
  [auth.md](features/auth.md)); `/` itself renders a marketing landing
  page instead of the event feed when logged out.
- `src/app/admin/*` — CRUD admin. `src/app/admin/layout.tsx` wraps
  everything (just applies the violet admin theme class); `src/app/admin/(protected)/*`
  is the actual authenticated admin area with its own nav, gated by a
  single shared `ADMIN_PASSWORD`. `src/app/admin/login/*` is deliberately
  outside `(protected)`.
- `src/app/api/*` — route handlers for things that aren't page navigations:
  file upload, the per-event `.ics` download, the per-user `.ics`
  subscribe feed.

Auth gating happens in `src/proxy.ts` (this Next.js version's replacement
for `middleware.ts`) — see [auth.md](features/auth.md) for exactly what it
does and doesn't check.

## Conventions

- **`export const dynamic = "force-dynamic"`** on every page that reads
  Prisma directly without another dynamic API — otherwise Next prerenders
  it at build time and it goes stale. Apply this to any new data-reading
  page.
- **Server actions live in `actions.ts`** next to the pages/forms that use
  them (e.g. `src/app/admin/(protected)/events/actions.ts`), not in a
  shared actions file. Shared, reusable *read* logic goes in `src/lib/*`
  instead (`favorites.ts`, `friends.ts`, `duplicates.ts`, etc.).
- **Forms are client components wrapping a server action** passed in as
  the `action` prop from the page (server component), so the same form
  component works for both create and edit — presence of `defaultValues`
  toggles create-vs-edit behavior.
- **`ConfirmForm`** (`src/components/ConfirmForm.tsx`) wraps a delete
  button in a custom in-app confirmation modal (not a native
  `window.confirm()`). Its trigger's `type` gets forced to `"button"` via
  `cloneElement` — always write `type="button"` on the JSX passed as its
  child, not `type="submit"` (a real hydration-mismatch bug from writing
  `type="submit"` there was fixed across the whole app; don't reintroduce
  it).
- **`EntitySelect` / `EntityMultiSelect`** (`src/components/`) are the
  standard custom dropdown/combobox components used everywhere instead of
  native `<select>` — they take `{id, name, photoUrl?}` options and
  support inline "create new" via a callback.

## Known gotchas

- **Lightning CSS** (Turbopack's default CSS processor) silently drops
  **both** `backdrop-filter` and a manually-adjacent
  `-webkit-backdrop-filter` if you write both on the same rule. Write only
  the unprefixed `backdrop-filter` and let Lightning CSS auto-prefix.
- **`next/dynamic({ ssr: false })` is not allowed directly inside an async
  Server Component** in this Next.js version. If you need a client-only
  dynamic import from a Server Component page, put the `dynamic(...)` call
  inside a small `"use client"` wrapper component instead (see
  `src/components/LocationMapLoader.tsx`) and import that wrapper from the
  page.
- **The generated Prisma client is ESM-only** and Playwright Test's own
  module loader can't import it directly inside a `*.spec.ts` file. Any
  test that needs direct DB access shells out to a separate `tsx` process
  instead (see `tests/e2e/cleanup-test-user.ts` and its usage in
  `tests/e2e/favorites.spec.ts`) rather than `import`-ing `@/lib/prisma`
  into the test file itself.
- **After changing `prisma/schema.prisma` and running `prisma generate`,
  restart the dev server.** A `next dev` process that started before the
  regenerate keeps the stale client in memory and throws
  `PrismaClientValidationError: Unknown field ...` for anything on the new
  field/model until it's restarted.
- **`src/proxy.ts`'s matcher must exclude anything the browser/OS fetches
  without a session cookie** — static assets, uploaded files, and PWA
  icons/manifest all need to bypass the login redirect or they come back
  as login-page HTML instead of the real asset. See the `matcher` config
  and `PUBLIC_PATHS` in `src/proxy.ts`.
- This Next.js version's own docs live in `node_modules/next/dist/docs/`
  and are worth checking before assuming default Next.js behavior — file
  conventions, deprecations, and APIs have real differences from training
  data (e.g. `proxy.ts` replacing `middleware.ts`, `viewport`/`themeColor`
  living in a separate `viewport` export rather than `metadata`).
