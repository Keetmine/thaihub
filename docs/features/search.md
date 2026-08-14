# Search

`src/app/(public)/search/page.tsx` (`GET /search?q=...`), searched from
the `SearchForm` in the public nav (`src/app/(public)/layout.tsx`).

Queries five entity types in parallel with Prisma
`contains`/`insensitive` filters (case-insensitive substring match, not
fuzzy — a typo won't match):

- **Events** — title, venue, or any cast member's name.
- **Performers** — name or real name.
- **Dramas** — title.
- **Locations** — name.
- **Agencies** — name.

Each result type is capped at 24 rows (`take: 24`) except events, which
are unbounded (events are the primary browsing surface and typically a
much smaller set). Results render in sections, one per entity type, each
only shown when it has at least one match (`Section` component with a
`count` prop that early-returns `null` at zero). Events use the same
`EventAgendaRow` as everywhere else (favorited/going/friends-going state
included); the other four types render as a wrapped grid of
`EntityMiniCard`s linking to their detail pages.

No query at all shows a prompt instead of running anything; a query with
zero matches across all five types shows "ничего не найдено".
