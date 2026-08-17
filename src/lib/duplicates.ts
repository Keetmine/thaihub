import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

function norm(s: string) {
  return s.trim().toLowerCase();
}

export type DuplicateGroup<T> = { key: string; rows: T[] };

/** Groups of Performers sharing the exact same (normalized) name.
 *  Одинаковый ник при РАЗНЫХ реальных именах — не дубли (два разных
 *  человека с ником Pond): такие группы дробятся по реальному имени,
 *  записи без реального имени при конфликте отбрасываются как
 *  неоднозначные. */
export async function findDuplicatePerformerGroups(): Promise<
  DuplicateGroup<{ id: string; name: string; realName: string | null; type: string; createdAt: Date; _count: { events: number; dramas: number } }>[]
> {
  const performers = await prisma.performer.findMany({
    select: {
      id: true,
      name: true,
      realName: true,
      type: true,
      createdAt: true,
      _count: { select: { events: true, dramas: true } },
    },
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

  return [...byNick, ...realGroups];
}

/** Groups of Dramas sharing the exact same (normalized) title.
 *  Одно название при разных годах — не дубли (ремейк/одноимённый
 *  проект): группы дробятся по году, записи без года при конфликте
 *  отбрасываются. */
export async function findDuplicateDramaGroups(): Promise<
  DuplicateGroup<{ id: string; title: string; year: number | null; createdAt: Date; _count: { performers: number; locations: number; events: number } }>[]
> {
  const dramas = await prisma.drama.findMany({
    select: {
      id: true,
      title: true,
      year: true,
      createdAt: true,
      _count: { select: { performers: true, locations: true, events: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return groupByNormName(dramas, (d) => d.title).flatMap((g) =>
    splitByDiscriminator(g, (d) => (d.year != null ? String(d.year) : null)),
  );
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

export async function mergeDramas(keeperId: string, loserIds: string[]) {
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
  });
}

/** Слияние агентств: связи артистов/сериалов/избранного — на выжившее,
 *  пустые поля дозаполняются, проигравшие удаляются. */
export async function mergeAgencies(keeperId: string, loserIds: string[]) {
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
          await tx.agency.update({ where: { id: keeperId }, data });
        }
      }
      await reassignJoinRows(tx.performerAgency, "agencyId", "performerId", keeperId, loserId);
      await reassignJoinRows(tx.favoriteAgency, "agencyId", "userId", keeperId, loserId);
      await tx.drama.updateMany({ where: { agencyId: loserId }, data: { agencyId: keeperId } });
      await tx.agency.delete({ where: { id: loserId } });
    }
  });
}

export async function mergePerformers(keeperId: string, loserIds: string[]) {
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
          "mydramalistUrl",
        ] as (keyof typeof keeper)[]);
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
  });
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
