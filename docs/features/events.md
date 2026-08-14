# Events

Public list/detail: `src/app/(public)/page.tsx` (all events, with an
Все/Иду/Избранное filter and a `?from=YYYY-MM-DD&to=YYYY-MM-DD` date-range
filter — see below), `src/app/(public)/day/[date]/page.tsx`,
`src/app/(public)/event/[id]/page.tsx`, `src/app/(public)/calendar/page.tsx`
(month grid, defaults to showing **all** events — `?view=mine` narrows to
just the ones the current user is going to).

## Date-range filter (home page)

`/?from=2026-08-20&to=2026-08-25` — either bound is optional. When a
range is active, the home page drops its usual upcoming/archive split
(both stop being meaningful once you've picked an explicit window — e.g.
revisiting a past trip) and shows every matching occurrence as one
ascending list, still day-grouped the same way. The `filter`
(Все/Иду/Избранное) toggle and the date range compose — switching filters
carries the active range along via `rangeQuery`, and there's a "Сбросить
даты" link to drop the range while keeping the current filter. This is
meant as the building block for a possible future "trip" feature (save a
named date range, mark which of its events you actually attended) — if
that gets built, it should stay a thin wrapper over this same query
rather than a heavier new concept.

Admin CRUD: `src/app/admin/(protected)/events/` (`EventForm.tsx`,
`actions.ts`, `new/`, `[id]/edit/`).

## Fields

An `Event` has a title, venue (free text), optional description, and
optionally links to a `Drama` (`dramaId`) and/or a `Location`
(`locationId`) — see below and [locations.md](features/locations.md).
**Dates/times live on a separate `EventOccurrence` model, not on `Event`
itself** — see the next section. See [data-model.md](../data-model.md)
for the full field list.

## Multi-day events are one Event, several EventOccurrences

A concert that repeats over several nights (e.g. LYKN's 2-day Reflexion
Concert) is genuinely **one** `Event` — one title, one venue, one cast,
one favorite/going state, one presale block — with several
`EventOccurrence` child rows (`id`, `eventId`, `startsAt`,
`endsAt?`). It shows up once per date everywhere events are listed (home,
day view, calendar, search), but editing or deleting it acts on the whole
thing at once, and toggling favorite/going affects every date identically
since those are keyed on `Event.id`, not per-occurrence.

- **`src/lib/eventOccurrences.ts`**'s `flattenOccurrence()` is the
  standard way to turn one `EventOccurrence` (+ its parent `Event`) into
  the row shape list pages render — `EventWithPerformers` in
  `src/lib/types.ts`. Its `id` field is deliberately the **Event** id
  (so favorite/going/detail-link behavior is identical across every date
  of the same event); `occurrenceId` is a second field used only for
  React list keys, since the same event can legitimately render more than
  once in one list.
- **Every event-listing query fetches `EventOccurrence` rows (optionally
  filtered by date range), not `Event` rows**, then flattens each one via
  `flattenOccurrence`. See `src/app/(public)/page.tsx`,
  `day/[date]/page.tsx`, `calendar/page.tsx` for the direct
  `prisma.eventOccurrence.findMany(...)` pattern; `search/page.tsx`,
  `dramas/[id]/page.tsx`, `performers/[id]/page.tsx`,
  `locations/[id]/page.tsx` instead match on `Event` fields first (title,
  cast, dramaId, locationId) and then `flatMap` each matched event's
  `occurrences` into rows, since the match criteria aren't date-based.
- **`EventForm.tsx`** has a repeatable date/time row list (not a single
  date field) — always at least one row, "+ Добавить ещё день" adds
  more, available in **both** create and edit mode (editing can add/
  remove dates from an existing event, not just adjust the one it had).
  Each row carries an `occurrenceId` (empty for a new, unsaved row).
- **`createEvent`**/**`updateEvent`** (`actions.ts`) read parallel
  `occurrenceId[]`/`occurrenceDate[]`/`occurrenceStartTime[]`/
  `occurrenceEndTime[]` arrays from the submitted form
  (`getOccurrenceInputs`). `createEvent` just creates one `EventOccurrence`
  per row alongside the `Event`. `updateEvent`'s `syncOccurrences` diffs
  the submission against what's already in the DB: rows with an
  `occurrenceId` get updated in place, rows without one get created, and
  any existing occurrence *not* present in the submission anymore gets
  deleted — so removing a date in the edit form actually removes that
  `EventOccurrence` row.
- Deleting an `Event` cascades to its `EventOccurrence` rows
  (`onDelete: Cascade` in the schema) — no separate cleanup needed.

## Presale

`presaleAt` / `presaleUrl`, toggled by a switch in the admin form
(`presaleEnabled` checkbox gates whether the date/time/URL fields are read
at all — see `getPresaleAt`/`getPresaleUrl` in `actions.ts`).

On the public event page, the presale block shows the "Билеты" link (if
`presaleUrl` is set) and a **labeled** "Добавить в календарь" button (if
`presaleAt` is set) side by side — deliberately a text button inside the
presale surface, not a second icon in the top icon row next to the
regular calendar-add button, so it reads as part of the presale
call-to-action rather than a generic page action.

## ICS export (single event)

`src/app/(public)/event/[id]/ics/route.ts` — `GET
/event/[id]/ics` (add `?presale=1` for the presale reminder instead of the
event itself) returns a `.ics` file via `buildEventICS` /
`buildPresaleICS` in `src/lib/ics.ts`. `buildEventICS` emits **one VEVENT
per `EventOccurrence`**, UID'd by occurrence id (not event id) — a 2-day
event's `.ics` download has two calendar entries, both titled the same.
This route is explicitly exempted from the login gate in `src/proxy.ts`
(`pathname.startsWith("/event/") && pathname.endsWith("/ics")`) since
calendar apps fetch it directly, without a session cookie.

## ICS subscribe feed (all "going" events)

Unlike the one-off download above, `/account/settings` exposes a **live,
subscribable** feed URL: `GET /api/calendar-feed/[token]`
(`src/app/api/calendar-feed/[token]/route.ts`), returning every occurrence
of every event the token's owner has marked "Иду" as one multi-`VEVENT`
`.ics` file (`buildFeedICS` in `src/lib/ics.ts`, same per-occurrence VEVENT
generation as above). A calendar app (Google/Apple Calendar) that
subscribes to this URL re-fetches it periodically and picks up newly-added
"going" events automatically — no manual re-download.

- **Auth model:** the URL itself *is* the credential — `User.icsToken` (a
  random UUID, generated on first visit to settings via
  `getOrCreateIcsToken()` in `src/app/(public)/account/actions.ts`). The
  route looks the user up by token, not by session cookie, since calendar
  apps don't carry one. `/api/*` is exempted from the proxy login gate
  entirely, so this works.
- **Revoking access:** `regenerateIcsToken()` issues a new token,
  invalidating the old URL. Exposed via the "Обновить ссылку" button in
  `IcsFeedSection.tsx`.
- UI: `src/app/(public)/account/settings/IcsFeedSection.tsx` (client
  component — shows the URL, a copy button, and the regenerate button).

## Linking an event to a `Location`

`Event.locationId` is an optional pointer into the `Location` catalog
(separate from the free-text `venue` string, which always renders as the
display address regardless of whether it's linked). Use case: a recurring
fan-meet spot, or a venue that's also a filming location already in the
catalog — linking it means:

- The event shows up in a "События здесь" section on that location's
  detail page (`src/app/(public)/locations/[id]/page.tsx`).
- It becomes discoverable from the location side without duplicating the
  venue as free text somewhere else.

Set via the "Локация из каталога (необязательно)" `EntitySelect` in
`EventForm.tsx` — entirely optional, independent of the required `venue`
text field.

## Friends going

Event rows and the event detail page show who among the current user's
accepted friends is also going — see
[social.md](features/social.md#friends-going).

## Ticket price

`Event.ticketPrice` is a free-text field (e.g. `"6,900 / 5,900 / 5,000
baht"`), not a structured number — sources like ThaiTicketMajor list
several seating tiers as one string, and there's no need to model that as
anything richer than what gets displayed. Editable in `EventForm.tsx`,
shown on the public event page under the time/venue block when set.

## Poster

`Event.posterUrl` — a plain external URL (not necessarily uploaded through
`/api/upload`; a scraped source's own image URL is stored as-is, same
convention as `Drama.posterUrl` for blscene imports). Editable via
`FileDropzone` in `EventForm.tsx` (drag-and-drop upload, or it just keeps
whatever URL it was pre-filled with if the admin never touches it), shown
as a banner image at the top of the public event page when set.

## Thai time is always shown with a Moscow equivalent

Every event in ThaiHub is a Thailand event, so every displayed event/
presale time gets a "(МСК HH:MM)" suffix — `formatTimeWithMsk` in
`src/lib/dates.ts`. Thailand (ICT, UTC+7) and Moscow (MSK, UTC+3) both run
without DST, so the gap is a constant 4 hours; the helper just subtracts 4
hours from whatever `formatTime` would already show — no timezone library,
no per-event timezone field. Used on the event detail page's "Время:" and
presale date/time lines. **Not** used in `EventAgendaRow`'s compact
list-view time column (`.agenda-time` is only `3.2rem` wide — there's no
room for the suffix without breaking that layout; the detail page has
plenty of room instead).

## Date in the compact list view

`EventAgendaRow` normally shows only a time, since it's mostly used on
pages that already group rows under a day heading (home, `/day/[date]`).
Pages that list events as a flat sequence with no day heading — performer
and drama detail pages, a location's "События здесь", search results —
pass `showDate`, which stacks a small `formatShortDate` ("24 окт") line
above the time in the same narrow column (`formatShortDate` in
`src/lib/dates.ts`).

## Importing an event from ThaiTicketMajor

`/admin/events/import-ttm` — paste a `thaiticketmajor.com/concert/...` or
`/performance/...` URL, review/edit everything the scrape found, then
confirm to actually create the event. **Nothing is written to the
database until that confirm step** — the scrape itself is read-only.

- **`src/lib/thaiticketmajor.ts`** — pure scraping (no DB access):
  `scrapeTtmEvent(url)` returns title, venue, date/time, poster, ticket
  price text, ticket on-sale date/time, and the artist lineup.
  - Title/venue/poster/date come from the page's `schema.org/Event`
    JSON-LD block (reliable, present site-wide). Date/time are kept as
    plain `"YYYY-MM-DD"`/`"HH:mm"` strings sliced directly out of the raw
    ISO string — **never passed through `new Date(...)`**, because the
    JSON-LD datetime has no timezone suffix (it's already Bangkok
    wall-clock time) and `new Date()` would reinterpret it in whatever
    timezone the Node process happens to run in, silently shifting the
    hour. This matches the "naive local wall-clock" convention the rest
    of the app already uses (`combineDateTime` in `events/actions.ts`).
  - The artist lineup and the ticket-price display string live in a
    separate free-text "details" table that's admin-entered per event
    (not guaranteed to have every row) and — critically — **renders in
    Thai by default**. Setting the `__la=en` cookie (what the site's own
    language-switch button does client-side) gets the same table back in
    English from a plain HTTP request, no headless browser required.
  - The ticket on-sale moment ("Public Sale") lives in a *third*, entirely
    different spot on the page — a summary panel above the details table,
    not inside it — as free-form text like `"Saturday 22 August 2026,
    10:00"`. `parseEnglishDateTime` parses that into the same plain
    date/time strings (never `new Date()`, same reasoning as above). A
    page can list several sale phases (e.g. presale then general sale);
    only the first is used. This becomes the import's presale
    date/time, pre-filling `Event.presaleAt`, with `Event.presaleUrl`
    defaulting to the source page itself (that *is* where you buy the
    tickets) — both editable/removable in the review screen the same way
    as everything else.
- **Artist name parsing is a best-effort heuristic, not a guarantee.**
  ThaiTicketMajor uses two formats with no shared delimiter:
  `"Jakrapatr Kaewpanpong (William)"` (full name, nickname in parens —
  parsed with a regex) and `"Earth Pirapat Watthanasetsiri"` (nickname
  first, no punctuation — parsed as "first word = nickname, rest = full
  name"). The second form is genuinely ambiguous in general, so
  `parseArtistLine` in `thaiticketmajor.ts` is deliberately just a
  reasonable guess — the review screen's nickname/full-name fields are
  always editable, never read-only text.
  - The details table wraps each artist name in its own `<div>` — except
    when there's only one artist, where the site sometimes puts bare text
    directly in the cell with no `<div>` at all (seen on
    gemini-art-venture-concert.html). `scrapeTtmEvent` falls back to the
    cell's own text when it finds zero `<div>`s, so a single-artist event
    doesn't silently come back with an empty lineup.
- **Schema fit**: a scraped artist's nickname and full name map directly
  onto `Performer.name` and `Performer.realName` — no translation layer
  needed.
- **Dedup**: `scrapeTtmEventPreview` (`src/app/admin/(protected)/events/importActions.ts`)
  matches each artist's nickname against existing `Performer.name`,
  case-insensitively and exactly (no fuzzy matching). A match means
  "link the existing performer"; no match means "create a new one" —
  shown per-row in the review screen, and overridable (unchecking a row
  excludes it; editing its nickname clears the match, since the edited
  text may no longer correspond to who was found).
- **What this does NOT do**: it doesn't try to infer that a scraped
  performer is a member of a Performer with `type: BAND` that's already
  in the catalog (e.g. recognizing that the artists on a band's own
  concert page are that band's members) and auto-link `BandMember` — too
  easy to get wrong from page structure alone. Set that up manually via
  the performer edit form after import, same as any other band roster
  change.
- Creation itself — `createEventFromTtmImport` — runs in one
  `$transaction`: any artist without a match gets a new `Performer`
  (`type: SOLO`), then the `Event` is created linking every included
  artist plus any extra performers picked manually in the review screen.
- **Multi-day detection**: the page's date line (e.g. `"Saturday 24 -
  Sunday 25 October 2026"`, or a 3-night `"Friday 21, Saturday 22 and
  Sunday 23 August 2026"`) is parsed by `parseDateRangeDays` into every
  day mentioned, sharing the trailing month/year — strip the trailing
  `"<Month> <Year>"`, then every remaining 1–2 digit standalone number is
  a day. The scraper's own `date`/`startTime` (from JSON-LD) stays the
  first day; everything else becomes `TtmEvent.extraDates`, pre-filling
  the review screen's date rows (same "+ Добавить ещё день" UI as
  `EventForm`, editable/removable before confirming) so the import lands
  as one `Event` with one `EventOccurrence` per detected day — not
  several separate events.
