# Events

Public list/detail: `src/app/(public)/page.tsx` (all events, with an
Все/Иду/Избранное filter), `src/app/(public)/day/[date]/page.tsx`,
`src/app/(public)/event/[id]/page.tsx`, `src/app/(public)/calendar/page.tsx`
(month grid, defaults to showing **all** events — `?view=mine` narrows to
just the ones the current user is going to).

Admin CRUD: `src/app/admin/(protected)/events/` (`EventForm.tsx`,
`actions.ts`, `new/`, `[id]/edit/`).

## Fields

An `Event` has a title, venue (free text), start/end time, optional
description, and optionally links to a `Drama` (`dramaId`) and/or a
`Location` (`locationId`) — see below and
[locations.md](features/locations.md). See
[data-model.md](../data-model.md) for the full field list.

## Multi-day creation

A concert that repeats over several nights isn't a new schema concept —
it's just several ordinary `Event` rows created together, sharing
everything (title, venue, performers, pairings, drama, presale) except
`startsAt`/`endsAt`. There's no `EventOccurrence` parent entity; each day
is independently editable/deletable afterward.

- **Create-only.** `EventForm.tsx` only shows the "+ Добавить ещё день"
  button when `defaultValues` is absent (i.e. not editing an existing
  event). Clicking it appends a plain `<input type="date" name="extraDates">`
  row; state is a simple `string[]` of extra date values.
- `createEvent` (`actions.ts`) reads `formData.getAll("extraDates")`,
  dedupes against the primary `date` field, and runs one
  `prisma.event.create` per resulting date inside a `$transaction`.
- `updateEvent` has no multi-day concept — editing always touches exactly
  the one `Event` row being edited.

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
event itself) returns a one-event `.ics` file via `buildEventICS` /
`buildPresaleICS` in `src/lib/ics.ts`. This route is explicitly exempted
from the login gate in `src/proxy.ts` (`pathname.startsWith("/event/") &&
pathname.endsWith("/ics")`) since calendar apps fetch it directly, without
a session cookie.

## ICS subscribe feed (all "going" events)

Unlike the one-off download above, `/account/settings` exposes a **live,
subscribable** feed URL: `GET /api/calendar-feed/[token]`
(`src/app/api/calendar-feed/[token]/route.ts`), returning every event the
token's owner has marked "Иду" as one multi-`VEVENT` `.ics` file
(`buildFeedICS` in `src/lib/ics.ts`). A calendar app (Google/Apple
Calendar) that subscribes to this URL re-fetches it periodically and picks
up newly-added "going" events automatically — no manual re-download.

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
