# ThaiHub docs

ThaiHub is a personal fan-tracker for Thai BL (Boys Love) actors/pairings,
their dramas, and real-world events (concerts, fan meets). Single Next.js
app, Postgres via Prisma, one shared admin password + real per-user
accounts for everyone else.

**When you add or change a feature, update the relevant file here in the
same change.** These docs describe *current* behavior, not history — if
something changes, edit the doc in place rather than appending a note.

## Index

- [architecture.md](architecture.md) — stack, route layout, conventions, known gotchas
- [data-model.md](data-model.md) — every Prisma model and what it's for
- [testing.md](testing.md) — the Playwright smoke suite, how to run it
- Features:
  - [events.md](features/events.md) — events, multi-day, presale, ICS export + subscribe feed, location linkage
  - [catalog.md](features/catalog.md) — performers/bands, pairings, dramas, agencies
  - [locations.md](features/locations.md) — filming/venue locations, map, visited tracking
  - [blscene-import.md](features/blscene-import.md) — the blscene.com drama/location scraper
  - [gmmtv-import.md](features/gmmtv-import.md) — the GMMTV roster scraper
  - [tmdb-import.md](features/tmdb-import.md) — TMDB actor/drama importer (official API, not scraping)
  - [tmdb-company-import.md](features/tmdb-company-import.md) — TMDB production-company importer (official API, not scraping)
  - [wikipedia-agency-import.md](features/wikipedia-agency-import.md) — talent-agency importer (official MediaWiki API, not scraping)
  - [tpop-band-import.md](features/tpop-band-import.md) — idol-group importer from tpop.fandom.com (official MediaWiki API, not scraping)
  - [social.md](features/social.md) — favorites, watch status, "going", friends, friends-going indicator
  - [search.md](features/search.md) — cross-entity search
  - [duplicates.md](features/duplicates.md) — duplicate-name warnings + the admin merge tool
  - [auth.md](features/auth.md) — admin password gate + real user accounts
  - [pwa.md](features/pwa.md) — installable web-app manifest/icons

## Running locally

```
npm run dev              # dev server (picks a free port, or pass -p)
npx prisma migrate deploy   # apply migrations
npx prisma generate         # regenerate the client after a schema change
npm run db:seed             # optional seed data
npm run test:e2e            # Playwright smoke suite — needs a running dev server
```

Requires a local Postgres reachable via `DATABASE_URL` in `.env`, and
`ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` set for the admin login.
`TMDB_API_READ_ACCESS_TOKEN` is optional — only needed for the TMDB
importer (see [tmdb-import.md](features/tmdb-import.md)).
