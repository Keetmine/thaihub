import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

function norm(s: string) {
  return s.trim().toLowerCase();
}

export type DuplicateGroup<T> = { key: string; rows: T[] };

/** Groups of Performers sharing the exact same (normalized) name. */
export async function findDuplicatePerformerGroups(): Promise<
  DuplicateGroup<{ id: string; name: string; type: string; createdAt: Date; _count: { events: number; dramas: number } }>[]
> {
  const performers = await prisma.performer.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      _count: { select: { events: true, dramas: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return groupByNormName(performers, (p) => p.name);
}

/** Groups of Dramas sharing the exact same (normalized) title. */
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
  return groupByNormName(dramas, (d) => d.title);
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
export async function mergeDramas(keeperId: string, loserIds: string[]) {
  await prisma.$transaction(async (tx) => {
    for (const loserId of loserIds) {
      if (loserId === keeperId) continue;

      await reassignJoinRows(tx.performerDrama, "dramaId", "performerId", keeperId, loserId);
      await reassignJoinRows(tx.dramaWatchStatus, "dramaId", "userId", keeperId, loserId);
      await reassignJoinRows(tx.dramaLocation, "dramaId", "locationId", keeperId, loserId);
      await tx.event.updateMany({ where: { dramaId: loserId }, data: { dramaId: keeperId } });

      await tx.drama.delete({ where: { id: loserId } });
    }
  });
}

export async function mergePerformers(keeperId: string, loserIds: string[]) {
  await prisma.$transaction(async (tx) => {
    for (const loserId of loserIds) {
      if (loserId === keeperId) continue;

      await reassignJoinRows(tx.eventPerformer, "performerId", "eventId", keeperId, loserId);
      await reassignJoinRows(tx.performerDrama, "performerId", "dramaId", keeperId, loserId);
      await reassignJoinRows(tx.favoritePerformer, "performerId", "userId", keeperId, loserId);
      await tx.performerLink.updateMany({ where: { performerId: loserId }, data: { performerId: keeperId } });

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
