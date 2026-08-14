# Catalog: performers, pairings, dramas, agencies

## Performers & bands

One `Performer` model covers both solo actors and bands
(`type: SOLO | BAND`). Public: `src/app/(public)/performers/` (list +
`[id]` detail, `?view=agencies` — see below). Admin:
`src/app/admin/(protected)/performers/` (`PerformerForm.tsx`,
`AdminPerformerTabs.tsx` for the Актёры/Группы/Пейринги/Агентства tab
bar).

- A `BAND` performer's roster is other `Performer` rows linked through
  `BandMember` — an idol who's both in a group and individually credited
  in a drama is one `Performer` row, referenced both directly and as a
  band member.
- Real name, birth date, bio, agency, photo, MyDramaList link are all
  optional profile fields, fillable manually or (for dramas) picked up via
  the blscene importer's cast data where available. GMMTV's roster is kept
  in sync separately — see [gmmtv-import.md](gmmtv-import.md).
- `PerformerLink` is a free-form label+URL list per performer (social
  media, personal café, whatever) — no schema change needed to add a new
  kind of link.

## Pairings

A `Pairing` names a two-performer "ship" (`performerAId`/`performerBId`,
unique together, optional display `name` — falls back to "A × B" when
unset). Selectable on events alongside/instead of individual performers.
Admin: `src/app/admin/(protected)/pairings/` +
`PairingManager.tsx`/`CreatePairingModal.tsx` inside the performer form
for inline creation.

## Dramas

`src/app/(public)/dramas/`, admin `src/app/admin/(protected)/dramas/`
(`DramaForm.tsx`, `actions.ts`). Cast (`PerformerDrama`, with an optional
`role` = character name), agency, filming locations
(`DramaLocation`), and an optional tie-in `Event` (premiere screening —
see [events.md](events.md)) all hang off a `Drama`.

Most of the catalog was bulk-imported from blscene.com rather than typed
in by hand — see [blscene-import.md](blscene-import.md).

## Agencies

`Agency` has its own roster and can also be the production/distribution
agency on a `Drama` directly (independent of the cast's agencies).

**Admin management lives inside the Performers section, not as its own
top-level nav item** — `/admin/performers?view=agencies` renders the
agency list as a 4th tab (`AdminPerformerTabs.tsx`), mirroring the public
site's `/performers?view=agencies` consolidation. The standalone
`/admin/agencies` list page was removed; `/admin/agencies/new` and
`/admin/agencies/[id]/edit` still exist as real routes, just linked from
the embedded tab view instead of their own nav entry.

## Duplicate names

Both `PerformerForm.tsx` and `DramaForm.tsx` show a live "похоже, уже
есть" hint under the name field on **create** (not edit) forms — see
[duplicates.md](duplicates.md).
