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
groups of `Performer`, `Drama` or `Agency` rows sharing the exact same
(case-insensitive, trimmed) name, and lets an admin merge each group down
to one record.

- **Detection**: `findDuplicatePerformerGroups()` /
  `findDuplicateDramaGroups()` / `findDuplicateAgencyGroups()` in
  `src/lib/duplicates.ts` — exact
  normalized-name match only, no fuzzy matching. A typo'd duplicate
  ("Beside The Sky" vs "Beside the sky ") would still be caught (case +
  whitespace insensitive); a genuinely different spelling would not.
  У агентства `name` уникален, поэтому в его группы попадает только то,
  что база пропустила: разный регистр и лишние пробелы.
- **Paging**: групп бывает несколько сотен, а каждая — карточка с
  формой слияния, поэтому страница режет общий список (сначала
  сериалы, потом исполнители, потом агентства) на страницы по
  `DENSE_PAGE_SIZE` (20) из
  `src/lib/pagination`. Заголовок раздела показывает полное число
  групп этого типа, под ним — только попавшие на текущую страницу;
  раздел без своих групп на странице не рисуется. `?a=`/`?b=` формы
  ручного сравнения переносятся в ссылки пагинации.
- **UI**: `MergeGroupCard.tsx` — radio-select which row to keep, shows
  each candidate's relation counts (events/dramas for performers;
  cast/locations/events for dramas; артисты/сериалы/избранное for
  agencies) so the admin can judge which one has
  the richer data before picking, then a confirm-and-merge button.
- **Слаг после слияния** (жалоба владельца 2026-09-06): если выживший
  жил по нумерованному `nick-2`, а «чистый» `nick` был как раз у дубля,
  выживший забирает `nick` — освободившийся адрес занять больше некому.
  Делает `reclaimBaseSlug` (`src/lib/slugReclaim.ts`), в самом конце
  транзакции слияния (для сериалов, исполнителей и агентств).
  Правило намеренно узкое: слаг обязан выглядеть как `база-N`, база —
  совпадать со `slugify(название)`, и быть свободной. Поэтому под него
  не попадают ни переименованные записи (слаг у нас стабилен при
  переименовании), ни названия, которые сами кончаются цифрой
  («Blossom Campus 2» → `blossom-campus-2` — это не нумерация).
  Накопившееся до этой правки разбирает разовый
  `scripts/reclaim-slugs.ts` (сухой прогон по умолчанию, `--apply`
  пишет; проходит по всем каталожным моделям со слагом). Учтите: смена
  слага меняет публичный адрес, и ссылки на старый нумерованный
  перестают открываться — истории слагов с редиректами у нас нет.
  Проверки правила — `tests/unit/slugReclaim.test.ts`.
- **Merge logic**: `mergePerformers` / `mergeDramas` / `mergeAgencies` in
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

## «Не сливать» (И5)

В группы попадают не только дубли: ремейк с тем же названием, тёзки с
одним ником. Раньше такая пара мозолила глаза при каждом заходе —
слить нельзя, убрать нельзя. Кнопка «Не сливать» на карточке скрывает
группу (`DuplicateDismissal`); скрытые доступны по ссылке «Скрытые
„не сливать“ (N)» (`?hidden=1`), там же «Вернуть в дубли» — скрытие по
ошибке не должно быть необратимо-невидимым.

Скрытие привязано к ТОЧНОМУ составу группы (`groupMemberKey` —
отсортированные id через «|»), а не к имени: появится третий кандидат
с тем же названием — состав изменится, и группа сама вернётся в общий
список. Осиротевшие записи скрытий (состав больше не встречается)
безвредны — они просто ни с чем не совпадают.

## Слияние дозаполняет пустые поля

`mergePerformers`/`mergeDramas` перед удалением проигравшего копируют
его значения в ПУСТЫЕ скалярные поля выжившего (`fillBlanks`): фото/
постер, био/описание, даты, реальное имя, tpop-поля (рост, награды,
источники…) — «у выжившего не было фото, у влитого было» больше не
теряется. Занятые поля никогда не перезаписываются.

## Три сетки поиска и ручное слияние

Сольные исполнители и музыкальные группы ищутся ОДНИМ списком, без
разделения по типу: «группа X» и заведённый парсером «соло X» — это и
есть дубль, ради которого инструмент нужен (правка владельца
2026-09-10). Тип видно в подписи строки («группа» / «соло»).

Вторая сетка: одинаковое РЕАЛЬНОЕ имя при разных никах — тоже
вероятные дубли (Jeff ↔ Jeff Demo Project с одним Worakamol Satoe);
сравнение нормализованное (без дефисов/пробелов), группы, целиком
совпадающие с найденными по нику, не дублируются (ключ `real::…`).

Третья сетка (`loose::…`, правка владельца 2026-09-10): одно имя с
точностью до **пробелов, дефисов, точек и апострофов** — «Yes'sirdays» ↔
«Yes'sir Days», «Lee Tae-vin» ↔ «Lee Tae Vin», «Murrph.» ↔ «Murrph».
Именно такие расхождения плодят парсеры, а точное сравнение их не
ловило: на момент правки первые две сетки давали 1 группу, третья — 49,
все настоящие. Разведение по реальному имени работает и здесь, а имена
короче трёх знаков после нормализации отбрасываются как шум.

Наверху /admin/duplicates — форма «Сравнить и слить вручную»: две
ссылки на публичные страницы артистов (или слаги) → карточки рядом
(фото, реальное имя, счётчики связей, агентства, источник) с кнопкой
«Оставить эту запись» на каждой — вторая вливается через
`mergePerformersAction`.

## Агентства

Слияние агентств (`mergeAgencies`): PerformerAgency/FavoriteAgency —
через reassignJoinRows, Drama.agencyId — updateMany, пустые
logoUrl/description дозаполняются, слаг проигравшего забирается
(`reclaimBaseSlug`). Изначально функция вызывалась разово скриптом —
чистка мусорных агентств с датами в имени (15 штук слито в базовые).

С 2026-09-09 у неё есть кнопка: раздел «Агентства» на
/admin/duplicates — та же `MergeGroupCard`, что у сериалов и
исполнителей, через `mergeAgenciesAction`. Дискриминатора у агентства
нет (ни года, ни реального имени), поэтому группы не дробятся; «не
сливать» работает так же (`entityType: "agency"` в
`DuplicateDismissal`).
