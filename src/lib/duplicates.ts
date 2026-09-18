import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { reclaimBaseSlug } from "@/lib/slugReclaim";

function norm(s: string) {
  return s.trim().toLowerCase();
}

export type DuplicateGroup<T> = { key: string; rows: T[] };

/** Ключ ТОЧНОГО состава группы — для «не сливать» (DuplicateDismissal):
 *  скрытие держится, пока состав не изменился; новый кандидат меняет
 *  ключ, и группа возвращается в список сама. */
export function groupMemberKey(rows: { id: string }[]): string {
  return rows.map((r) => r.id).sort().join("|");
}

/** Имя в «слова» для сетки «ник приклеен к имени». Дефис НЕ режем
 *  намеренно: у корейских имён он внутри личного имени, и с разрезанием
 *  «Kim Seok» ложно входил бы в «Kim Dong-seok», а «Joo Ho» — в «Yang
 *  Joo-ho» (это РАЗНЫЕ люди). Точки и апострофы убираем — они шум. */
function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[.'’`]/g, "").split(/[\s_]+/).filter(Boolean);
}

/**
 * Сетка «ник приклеен к имени» (правка владельца 2026-09-18: «реальное
 * имя указано в нике, и отдельно профиль с ником и реальным именем, а
 * оно не понимает, что это дубли»).
 *
 * Ловит пары вида «Nuntapong Wongsakulyong» ↔ «Copter Nuntapong
 * Wongsakulyong»: одно имя — ХВОСТ другого, то есть второе отличается
 * приписанным спереди ником. Таких записей в каталоге сотни: парсеры
 * заводят человека то по паспортному имени, то по «ник + имя».
 *
 * Хвост — минимум два слова: одного слова мало («Ohm» — нік доброй
 * половины тайских актёров, и «Ohm» ⊂ «Ohm Atshar Nampan» свело бы
 * двух РАЗНЫХ Ohm-ов). Сравниваются последовательности, а не множества
 * слов: у «Kim Young-ho» и «Kim Ho-young» набор слов одинаковый, но это
 * разные люди.
 *
 * Чистая функция — проверяется юнит-тестом tests/unit/duplicates.test.ts.
 */
export function nicknamePrefixGroups<T extends { id: string; name: string }>(
  rows: T[],
): DuplicateGroup<T>[] {
  // Каждая запись регистрируется под всеми своими хвостами длиной 2+
  // слова, включая полное имя: группа — это хвост, под которым оказалось
  // больше одной записи.
  const byTail = new Map<string, T[]>();
  for (const row of rows) {
    const tokens = nameTokens(row.name);
    for (let i = 0; i + 2 <= tokens.length; i++) {
      const key = tokens.slice(i).join(" ");
      if (!byTail.has(key)) byTail.set(key, []);
      byTail.get(key)!.push(row);
    }
  }
  return [...byTail.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key: `tail::${key}`, rows: group }));
}

/** Группы исполнителей-кандидатов в дубли. Пять сеток, от сильного
 *  сигнала к слабому: точное имя, общее РЕАЛЬНОЕ имя при разных никах,
 *  имя с точностью до пробелов/дефисов/апострофов, «ник приклеен к
 *  имени» и «ник одного = реальное имя другого». Сольные и группы
 *  идут ОДНИМ списком: «группа X» и «соло X», заведённый парсером, —
 *  это и есть дубль (правка владельца 2026-09-10).
 *
 *  Одинаковый ник при РАЗНЫХ реальных именах — не дубли (два разных
 *  человека с ником Pond): такие группы дробятся по реальному имени,
 *  записи без реального имени при конфликте отбрасываются как
 *  неоднозначные. */
export async function findDuplicatePerformerGroups(): Promise<
  DuplicateGroup<{ id: string; name: string; realName: string | null; type: string; createdAt: Date; _count: { events: number; dramas: number } }>[]
> {
  // Первый проход — только имена. Счётчики связей для КАЖДОЙ строки
  // каталога (двумя коррелированными подзапросами) были главной
  // тяжестью страницы дублей — теперь они считаются вторым запросом и
  // только для строк, попавших в группы (attachCounts ниже).
  const performers = await prisma.performer.findMany({
    select: { id: true, name: true, realName: true, type: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const byNick = groupByNormName(performers, (p) => p.name).flatMap((g) =>
    splitByDiscriminator(g, (p) => p.realName),
  );

  // Вторая сетка: одинаковое РЕАЛЬНОЕ имя при разных никах — тоже
  // вероятные дубли (Jeff / Jeff Demo Project с одним Worakamol Satoe).
  // Нормализация без дефисов/пробелов ловит «Opas-iamkajorn» ↔
  // «Opasiamkajorn». Группы, целиком совпадающие с уже найденными по
  // нику, не дублируем.
  const seenSets = new Set(byNick.map((g) => g.rows.map((r) => r.id).sort().join("|")));
  const normReal = (v: string) => v.toLowerCase().replace(/[-\s]/g, "");
  const byReal = new Map<string, typeof performers>();
  for (const p of performers) {
    if (!p.realName || p.realName.trim().length < 5) continue;
    const key = normReal(p.realName);
    if (!byReal.has(key)) byReal.set(key, []);
    byReal.get(key)!.push(p);
  }
  const realGroups = [...byReal.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key: `real::${key}`, rows }))
    .filter((g) => !seenSets.has(g.rows.map((r) => r.id).sort().join("|")));
  for (const g of realGroups) seenSets.add(g.rows.map((r) => r.id).sort().join("|"));

  // Третья сетка: ОДНО имя с точностью до пробелов, дефисов и
  // апострофов — «Yes'sirdays» ↔ «Yes'sir Days», «T Bone» ↔ «T-Bone»
  // (правка владельца 2026-09-10: заготовки парсеров плодят именно
  // такие расхождения, и точное сравнение их не ловило). Сигнал слабее
  // точного совпадения, поэтому отдельным проходом и с тем же
  // разведением по реальному имени; группы, уже найденные выше, не
  // повторяем. Тип НЕ разводит: «группа X» и «соло X» из парсера — это
  // ровно тот дубль, ради которого всё и затевалось.
  const normLoose = (v: string) => v.toLowerCase().replace(/[-\s.'’]/g, "");
  const byLoose = new Map<string, typeof performers>();
  for (const p of performers) {
    const key = normLoose(p.name);
    // Один-два знака после нормализации — это не имя, а шум.
    if (key.length < 3) continue;
    if (!byLoose.has(key)) byLoose.set(key, []);
    byLoose.get(key)!.push(p);
  }
  const looseGroups = [...byLoose.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key: `loose::${key}`, rows }))
    .flatMap((g) => splitByDiscriminator(g, (p) => p.realName))
    .filter((g) => !seenSets.has(g.rows.map((r) => r.id).sort().join("|")));
  for (const g of looseGroups) seenSets.add(g.rows.map((r) => r.id).sort().join("|"));

  // Четвёртая сетка: «ник приклеен к имени» — «Nuntapong Wongsakulyong»
  // ↔ «Copter Nuntapong Wongsakulyong» (см. nicknamePrefixGroups выше).
  const tailGroups = nicknamePrefixGroups(performers)
    .flatMap((g) => splitByDiscriminator(g, (p) => p.realName))
    .filter((g) => !seenSets.has(g.rows.map((r) => r.id).sort().join("|")));
  for (const g of tailGroups) seenSets.add(g.rows.map((r) => r.id).sort().join("|"));

  // Пятая сетка: ник ОДНОГО равен реальному имени ДРУГОГО — «Jeff»
  // (реальное: Jeff Satur) ↔ «Jeff Satur» без реального имени (правка
  // владельца 2026-09-18). Пять знаков после нормализации — чтобы
  // короткий ник вроде «Ice» не сцеплял пол-каталога.
  const byNormName = new Map<string, typeof performers>();
  for (const p of performers) {
    const key = normReal(p.name);
    if (key.length < 5) continue;
    if (!byNormName.has(key)) byNormName.set(key, []);
    byNormName.get(key)!.push(p);
  }
  const crossPairs = new Map<string, typeof performers>();
  for (const p of performers) {
    if (!p.realName || p.realName.trim().length < 5) continue;
    const key = normReal(p.realName);
    const others = (byNormName.get(key) ?? []).filter((o) => o.id !== p.id);
    if (others.length === 0) continue;
    // Ключ — по реальному имени: если таких записей несколько, они все
    // про одного человека и идут одной группой.
    if (!crossPairs.has(key)) crossPairs.set(key, [...others]);
    const bucket = crossPairs.get(key)!;
    if (!bucket.some((r) => r.id === p.id)) bucket.push(p);
  }
  const crossGroups = [...crossPairs.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key: `cross::${key}`, rows }))
    .filter((g) => !seenSets.has(g.rows.map((r) => r.id).sort().join("|")));
  for (const g of crossGroups) seenSets.add(g.rows.map((r) => r.id).sort().join("|"));

  const groups = [...byNick, ...realGroups, ...looseGroups, ...tailGroups, ...crossGroups];
  const countRows = await prisma.performer.findMany({
    where: { id: { in: groups.flatMap((g) => g.rows.map((r) => r.id)) } },
    select: { id: true, _count: { select: { events: true, dramas: true } } },
  });
  const countById = new Map(countRows.map((c) => [c.id, c._count]));
  return groups.map((g) => ({
    key: g.key,
    rows: g.rows.map((r) => ({
      ...r,
      _count: countById.get(r.id) ?? { events: 0, dramas: 0 },
    })),
  }));
}

/** Groups of Dramas sharing the exact same (normalized) title.
 *  Одно название при разных годах — не дубли (ремейк/одноимённый
 *  проект): группы дробятся по году, записи без года при конфликте
 *  отбрасываются. */
export async function findDuplicateDramaGroups(): Promise<
  DuplicateGroup<{ id: string; title: string; year: number | null; createdAt: Date; _count: { performers: number; locations: number; events: number } }>[]
> {
  // Та же двухпроходная схема, что у исполнителей: имена без счётчиков,
  // затем счётчики только для попавших в группы.
  const dramas = await prisma.drama.findMany({
    select: { id: true, title: true, year: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const groups = groupByNormName(dramas, (d) => d.title).flatMap((g) =>
    splitByDiscriminator(g, (d) => (d.year != null ? String(d.year) : null)),
  );
  const countRows = await prisma.drama.findMany({
    where: { id: { in: groups.flatMap((g) => g.rows.map((r) => r.id)) } },
    select: {
      id: true,
      _count: { select: { performers: true, locations: true, events: true } },
    },
  });
  const countById = new Map(countRows.map((c) => [c.id, c._count]));
  return groups.map((g) => ({
    key: g.key,
    rows: g.rows.map((r) => ({
      ...r,
      _count: countById.get(r.id) ?? { performers: 0, locations: 0, events: 0 },
    })),
  }));
}

/**
 * Группы агентств с одинаковым (нормализованным) названием.
 *
 * Дискриминатора у агентства нет: ни года, ни реального имени — тёзка
 * с точностью до регистра и пробелов это и есть дубль. Само поле `name`
 * уникально, поэтому в группу попадает только то, что база пропустила:
 * «GMMTV » против «gmmtv», мусор из импорта с датой в названии.
 */
export async function findDuplicateAgencyGroups(): Promise<
  DuplicateGroup<{ id: string; name: string; createdAt: Date; _count: { performers: number; dramas: number; favoritedBy: number } }>[]
> {
  // Та же двухпроходная схема, что у сериалов: сначала названия, потом
  // счётчики только для попавших в группы.
  const agencies = await prisma.agency.findMany({
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const groups = groupByNormName(agencies, (a) => a.name);
  const countRows = await prisma.agency.findMany({
    where: { id: { in: groups.flatMap((g) => g.rows.map((r) => r.id)) } },
    select: {
      id: true,
      _count: { select: { performers: true, dramas: true, favoritedBy: true } },
    },
  });
  const countById = new Map(countRows.map((c) => [c.id, c._count]));
  return groups.map((g) => ({
    key: g.key,
    rows: g.rows.map((r) => ({
      ...r,
      _count: countById.get(r.id) ?? { performers: 0, dramas: 0, favoritedBy: 0 },
    })),
  }));
}

/** Дробит группу «одинаковых» по дискриминатору (реальное имя / год):
 *  один известный вариант на группу — вся группа остаётся вместе (null
 *  считаем совпадением); несколько разных — подгруппы по значению, null
 *  отбрасывается как неоднозначный. */
function splitByDiscriminator<T>(
  group: DuplicateGroup<T>,
  getValue: (row: T) => string | null,
): DuplicateGroup<T>[] {
  const distinct = new Set(
    group.rows.map(getValue).filter((v): v is string => v != null).map(norm),
  );
  if (distinct.size <= 1) return [group];
  const byValue = new Map<string, T[]>();
  for (const row of group.rows) {
    const v = getValue(row);
    if (v == null) continue;
    const key = norm(v);
    if (!byValue.has(key)) byValue.set(key, []);
    byValue.get(key)!.push(row);
  }
  return [...byValue.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([suffix, rows]) => ({ key: `${group.key}::${suffix}`, rows }));
}

function groupByNormName<T>(rows: T[], getName: (row: T) => string): DuplicateGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = norm(getName(row));
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }
  return [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, rows: group }));
}

/**
 * Reassigns every row of a two-column join table (unique on both columns
 * together) from loserId to keeperId, deleting the loser's row instead
 * whenever the keeper already has an equivalent one (avoids a unique-
 * constraint violation, e.g. a user who favorited both duplicate dramas).
 *
 * Typed loosely on purpose: Prisma's per-model delegate types are too
 * specific to genericize over cleanly, and this helper is only ever called
 * internally with matching (model, column names) pairs below.
 */
async function reassignJoinRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  ownColumn: string,
  otherColumn: string,
  keeperId: string,
  loserId: string,
) {
  const loserRows: Record<string, string>[] = await model.findMany({ where: { [ownColumn]: loserId } });
  const keeperOtherIds = new Set(
    (await model.findMany({ where: { [ownColumn]: keeperId } })).map(
      (r: Record<string, string>) => r[otherColumn],
    ),
  );

  for (const row of loserRows) {
    const otherId = row[otherColumn];
    if (keeperOtherIds.has(otherId)) {
      await model.deleteMany({ where: { [ownColumn]: loserId, [otherColumn]: otherId } });
    } else {
      await model.updateMany({
        where: { [ownColumn]: loserId, [otherColumn]: otherId },
        data: { [ownColumn]: keeperId },
      });
    }
  }
}

/** Merges `loserIds` into `keeperId`: every relation moves over, duplicates
 *  are dropped rather than violating a unique constraint, and the losers
 *  are deleted. Runs in one transaction — either the whole merge lands or
 *  none of it does. */
/** Пустые скалярные поля выжившего заполняются из вливаемого — фото,
 *  био, даты и т.п. не должны теряться при слиянии, если у проигравшего
 *  они были, а у выжившего нет. Занятые поля не трогаем. */
function fillBlanks<T extends Record<string, unknown>>(
  keeper: T,
  loser: T,
  fields: (keyof T)[],
): Partial<T> {
  const data: Partial<T> = {};
  for (const f of fields) {
    const kv = keeper[f];
    const lv = loser[f];
    const keeperEmpty =
      kv == null || kv === "" || (Array.isArray(kv) && kv.length === 0);
    const loserHas =
      lv != null && lv !== "" && !(Array.isArray(lv) && lv.length === 0);
    if (keeperEmpty && loserHas) data[f] = lv;
  }
  return data;
}

/** Подписи выжившего и проигравших для строки истории. */
async function mergedLabels(
  model: "drama" | "agency" | "performer",
  keeperId: string,
  loserIds: string[],
): Promise<{ keeper: string; losers: string[] }> {
  const ids = [keeperId, ...loserIds];
  if (model === "drama") {
    const rows = await prisma.drama.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
    const byId = new Map(rows.map((r) => [r.id, r.title]));
    return { keeper: byId.get(keeperId) ?? keeperId, losers: loserIds.map((id) => byId.get(id) ?? id) };
  }
  const rows =
    model === "agency"
      ? await prisma.agency.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : await prisma.performer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return { keeper: byId.get(keeperId) ?? keeperId, losers: loserIds.map((id) => byId.get(id) ?? id) };
}

async function logMerge(
  entityType: string,
  keeperId: string,
  merged: { keeper: string; losers: string[] },
): Promise<void> {
  if (merged.losers.length === 0) return;
  await logAudit({
    action: "MERGE",
    entityType,
    entityId: keeperId,
    entityLabel: merged.keeper,
    note: `слито: ${merged.losers.join(", ")}`,
  });
}

export async function mergeDramas(keeperId: string, loserIds: string[]) {
  // Подписи проигравших запоминаем до транзакции — после слияния их
  // записей уже нет, а в истории должно остаться, что во что слили.
  const merged = await mergedLabels("drama", keeperId, loserIds);
  await prisma.$transaction(async (tx) => {
    for (const loserId of loserIds) {
      if (loserId === keeperId) continue;

      const [keeper, loser] = await Promise.all([
        tx.drama.findUnique({ where: { id: keeperId } }),
        tx.drama.findUnique({ where: { id: loserId } }),
      ]);
      if (keeper && loser) {
        const data = fillBlanks(keeper, loser, [
          "posterUrl", "description", "year", "nativeTitle", "alsoKnownAs",
          "director", "screenwriter", "genres", "tags", "episodes",
          "airedFrom", "airedTo", "airedOn", "duration", "contentRating",
          "mdlScore", "mydramalistUrl", "trailerUrl", "agencyId", "novelId",
        ] as (keyof typeof keeper)[]);
        if (Object.keys(data).length > 0) {
          await tx.drama.update({
            where: { id: keeperId },
            data: data as Prisma.DramaUpdateInput,
          });
        }
      }

      await reassignJoinRows(tx.performerDrama, "dramaId", "performerId", keeperId, loserId);
      await reassignJoinRows(tx.dramaWatchStatus, "dramaId", "userId", keeperId, loserId);
      await reassignJoinRows(tx.dramaLocation, "dramaId", "locationId", keeperId, loserId);
      await tx.event.updateMany({ where: { dramaId: loserId }, data: { dramaId: keeperId } });

      await tx.drama.delete({ where: { id: loserId } });
    }
    // Слаг проигравшего освободился: если выживший жил по `nick-2`, а
    // «чистый» `nick` был как раз у дубля — забираем его (правка
    // владельца 2026-09-06, см. slugReclaim.ts).
    await reclaimBaseSlug(tx.drama as never, keeperId, "title");
  });
  await logMerge("Drama", keeperId, merged);
}

/** Слияние агентств: связи артистов/сериалов/избранного — на выжившее,
 *  пустые поля дозаполняются, проигравшие удаляются. */
export async function mergeAgencies(keeperId: string, loserIds: string[]) {
  const merged = await mergedLabels("agency", keeperId, loserIds);
  await prisma.$transaction(async (tx) => {
    for (const loserId of loserIds) {
      if (loserId === keeperId) continue;
      const [keeper, loser] = await Promise.all([
        tx.agency.findUnique({ where: { id: keeperId } }),
        tx.agency.findUnique({ where: { id: loserId } }),
      ]);
      if (keeper && loser) {
        const data = fillBlanks(keeper, loser, ["logoUrl", "description"] as (keyof typeof keeper)[]);
        if (Object.keys(data).length > 0) {
          // `as never`: fillBlanks возвращает срез строки таблицы, и с
          // появлением json-колонки `translations` её тип перестал
          // совпадать с UpdateInput (Json против JsonValue). Поля в
          // срезе перечислены руками выше — подставляется ровно то, что
          // названо.
          await tx.agency.update({ where: { id: keeperId }, data: data as never });
        }
      }
      await reassignJoinRows(tx.performerAgency, "agencyId", "performerId", keeperId, loserId);
      await reassignJoinRows(tx.favoriteAgency, "agencyId", "userId", keeperId, loserId);
      await tx.drama.updateMany({ where: { agencyId: loserId }, data: { agencyId: keeperId } });
      await tx.agency.delete({ where: { id: loserId } });
    }
    await reclaimBaseSlug(tx.agency as never, keeperId, "name");
  });
  await logMerge("Agency", keeperId, merged);
}

export async function mergePerformers(keeperId: string, loserIds: string[]) {
  const merged = await mergedLabels("performer", keeperId, loserIds);
  await prisma.$transaction(async (tx) => {
    for (const loserId of loserIds) {
      if (loserId === keeperId) continue;

      const [keeper, loser] = await Promise.all([
        tx.performer.findUnique({ where: { id: keeperId } }),
        tx.performer.findUnique({ where: { id: loserId } }),
      ]);
      if (keeper && loser) {
        const data = fillBlanks(keeper, loser, [
          "photoUrl", "realName", "bio", "birthDate", "placeOfBirth",
          "nationality", "gender", "musicAlias", "alsoKnownAs",
          "occupation", "instruments", "soloDebut", "height", "weight",
          "mvAppearances", "trivia", "awards", "references", "sourceUrl",
          "mydramalistUrl", "musicFestivalUrl",
        ] as (keyof typeof keeper)[]);
        // musicFestivalUrl уникален: пока проигравший жив, адрес нельзя
        // повторить у выжившего — сначала снимаем его с проигравшего.
        if ("musicFestivalUrl" in data) {
          await tx.performer.update({ where: { id: loserId }, data: { musicFestivalUrl: null } });
        }
        if (Object.keys(data).length > 0) {
          // Json-поля (awards/references): в data попадают только не-null
          // значения (fillBlanks), каст безопасен.
          await tx.performer.update({
            where: { id: keeperId },
            data: data as Prisma.PerformerUpdateInput,
          });
        }
      }

      await reassignJoinRows(tx.eventPerformer, "performerId", "eventId", keeperId, loserId);
      await reassignJoinRows(tx.performerDrama, "performerId", "dramaId", keeperId, loserId);
      await reassignJoinRows(tx.favoritePerformer, "performerId", "userId", keeperId, loserId);
      await tx.performerLink.updateMany({ where: { performerId: loserId }, data: { performerId: keeperId } });
      // Музыка и кастомные списки: без переноса каскад удаления проигравшего
      // молча снёс бы альбомы/песни/строки списков. Альбом с тем же
      // названием у выжившего — переносим песни внутрь и убираем дубль
      // (уникальный индекс (performerId, title) не даёт просто пересадить).
      const loserAlbums = await tx.album.findMany({ where: { performerId: loserId } });
      for (const album of loserAlbums) {
        const clash = await tx.album.findUnique({
          where: { performerId_title: { performerId: keeperId, title: album.title } },
        });
        if (clash) {
          await tx.song.updateMany({ where: { albumId: album.id }, data: { albumId: clash.id } });
          await tx.album.delete({ where: { id: album.id } });
        } else {
          await tx.album.update({ where: { id: album.id }, data: { performerId: keeperId } });
        }
      }
      await tx.song.updateMany({ where: { performerId: loserId }, data: { performerId: keeperId } });
      await reassignJoinRows(tx.performerListItem, "performerId", "listId", keeperId, loserId);

      await reassignJoinRows(tx.bandMember, "bandId", "performerId", keeperId, loserId);
      await reassignJoinRows(tx.bandMember, "performerId", "bandId", keeperId, loserId);
      // Union rather than keep-one — merging two performers who were each
      // signed to a different agency should leave the survivor associated
      // with both, not silently drop the loser's.
      await reassignJoinRows(tx.performerAgency, "performerId", "agencyId", keeperId, loserId);

      await mergePairingsForPerformer(tx, keeperId, loserId);

      await tx.performer.delete({ where: { id: loserId } });
    }
    await reclaimBaseSlug(tx.performer as never, keeperId, "name");
  });
  await logMerge("Performer", keeperId, merged);
}

/**
 * Pairing is trickier than a plain join row: it's a *named entity* with its
 * own unique [performerAId, performerBId] pair and its own EventPairing
 * children, so a straight column-swap can (a) collide with an existing
 * pairing of the same two people, or (b) pair someone with themselves once
 * the loser's id becomes the keeper's id.
 */
async function mergePairingsForPerformer(
  tx: Prisma.TransactionClient,
  keeperId: string,
  loserId: string,
) {
  const loserPairings = await tx.pairing.findMany({
    where: { OR: [{ performerAId: loserId }, { performerBId: loserId }] },
  });

  for (const pairing of loserPairings) {
    const newA = pairing.performerAId === loserId ? keeperId : pairing.performerAId;
    const newB = pairing.performerBId === loserId ? keeperId : pairing.performerBId;

    if (newA === newB) {
      // The loser was paired with the keeper themself — that pairing no
      // longer means anything once they're the same performer.
      await tx.eventPairing.deleteMany({ where: { pairingId: pairing.id } });
      await tx.pairing.delete({ where: { id: pairing.id } });
      continue;
    }

    const existing = await tx.pairing.findFirst({
      where: { id: { not: pairing.id }, performerAId: newA, performerBId: newB },
    });

    if (existing) {
      // The keeper already has this exact pairing — move the loser
      // pairing's events over (skipping ones already on the keeper's
      // pairing) and drop the now-redundant duplicate. If either side
      // was marked CURRENT, the surviving row should be too.
      await reassignJoinRows(tx.eventPairing, "pairingId", "eventId", existing.id, pairing.id);
      if (pairing.status === "CURRENT" && existing.status !== "CURRENT") {
        await tx.pairing.update({ where: { id: existing.id }, data: { status: "CURRENT" } });
      }
      await tx.pairing.delete({ where: { id: pairing.id } });
    } else {
      await tx.pairing.update({
        where: { id: pairing.id },
        data: { performerAId: newA, performerBId: newB },
      });
    }
  }
}
