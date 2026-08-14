import { prisma } from "@/lib/prisma";

/** Idempotently associates a performer with an agency — a performer can
 *  belong to more than one at once (a co-produced drama's cast may
 *  formally be signed to a different studio than the one that produced
 *  it, or a performer may have moved agencies over time), so every
 *  importer that discovers an agency association should *add* to the
 *  set rather than overwrite it. Safe to call when the association
 *  already exists. */
export async function addPerformerAgency(performerId: string, agencyId: string): Promise<void> {
  await prisma.performerAgency.upsert({
    where: { performerId_agencyId: { performerId, agencyId } },
    update: {},
    create: { performerId, agencyId },
  });
}
