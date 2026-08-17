# Duplicate detection

Two separate mechanisms, prevention and cleanup:

## Prevention: live "похоже, уже есть" warning

`src/components/DuplicateNameWarning.tsx` — a debounced (400ms) client-side
lookup against the name field on **create** forms only (gated on
`isCreating`/`isNewDrama` in the form component; edit forms never show
it). Non-blocking — it's a hint, not validation, so it never stops
submission.

- Wired into `PerformerForm.tsx` (name field) and `DramaForm.tsx` (title
  field).
- Backed by two server actions returning up to 5 matches each:
  `findSimilarPerformers` (`src/app/admin/(protected)/performers/actions.ts`)
  and `findSimilarDramas` (`src/app/admin/(protected)/dramas/actions.ts`) —
  both case-insensitive `contains` on the name/title, skipped entirely for
  queries under 2 characters.
- Each match links to that record's edit page (opens in a new tab) so the
  admin can go check "is this the same thing?" without losing their
  in-progress form.

This exists because of a real incident: the blscene sync's title-based
dedup missed several shows (see
[blscene-import.md](blscene-import.md#dedup-matching-by-url-not-title))
and quietly created duplicate `Drama` rows across repeated sync runs. The
warning here is a second, independent line of defense for the manual-entry
path (typing the same performer/drama in twice by hand), not a fix for
that specific bug.

## Cleanup: admin merge tool

`/admin/duplicates` (`src/app/admin/(protected)/duplicates/`) — finds
groups of `Performer` or `Drama` rows sharing the exact same
(case-insensitive, trimmed) name, and lets an admin merge each group down
to one record.

- **Detection**: `findDuplicatePerformerGroups()` /
  `findDuplicateDramaGroups()` in `src/lib/duplicates.ts` — exact
  normalized-name match only, no fuzzy matching. A typo'd duplicate
  ("Beside The Sky" vs "Beside the sky ") would still be caught (case +
  whitespace insensitive); a genuinely different spelling would not.
- **UI**: `MergeGroupCard.tsx` — radio-select which row to keep, shows
  each candidate's relation counts (events/dramas for performers;
  cast/locations/events for dramas) so the admin can judge which one has
  the richer data before picking, then a confirm-and-merge button.
- **Merge logic**: `mergePerformers` / `mergeDramas` in
  `src/lib/duplicates.ts`, each wrapped in one `prisma.$transaction` (all
  relations move or none do). Every relation table gets reassigned from
  the loser id(s) to the keeper id; where a row would collide with
  something the keeper already has (e.g. a user who favorited *both*
  duplicate dramas), the loser's row is dropped instead of violating the
  unique constraint — nothing is silently overwritten, but nothing errors
  either.
  - **Pairings are the one genuinely tricky case** when merging
    performers: a `Pairing` is a named entity with its own unique
    `(performerAId, performerBId)` pair and its own `EventPairing`
    children, not a plain join row. `mergePairingsForPerformer` handles
    three outcomes per affected pairing: the loser was paired with the
    *keeper themself* (the pairing becomes meaningless — deleted, its
    events dropped too); the substitution collides with a pairing that
    already exists (the loser pairing's events get moved onto the existing
    one, then it's deleted); otherwise the pairing row is just updated in
    place.
  - Deleting the loser `Drama`/`Performer` row itself happens last, after
    every relation has somewhere to land.

**This merge is destructive and has no undo** — the loser rows are
genuinely deleted, not soft-deleted. The confirm dialog in
`MergeGroupCard.tsx` says so; don't remove that copy.

## Дискриминаторы (не-дубли)

Одинаковое имя — ещё не дубль: группы дробятся по дискриминатору
(`splitByDiscriminator` в `src/lib/duplicates.ts`). Для исполнителей —
реальное имя (одинаковый ник при разных реальных именах = разные люди),
для сериалов — год (одно название при разных годах = ремейк). Один
известный вариант на группу — группа остаётся целиком (null считается
совпадением); несколько разных — подгруппы по значению, записи без
значения отбрасываются как неоднозначные. В карточке дублей
исполнителей выводится реальное имя.
