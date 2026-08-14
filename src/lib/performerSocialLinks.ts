import { prisma } from "@/lib/prisma";

/** Creates the PerformerLink rows for a scraped/discovered social link
 *  that aren't already on the performer's profile (matched by exact
 *  URL, so re-running any importer that calls this never creates
 *  duplicates). Existing links from other sources are left untouched —
 *  shared by every importer that picks up social handles (currently
 *  GMMTV, Me Mind Y). */
export async function syncSocialLinks(
  performerId: string,
  socialLinks: { label: string; url: string }[],
): Promise<void> {
  if (socialLinks.length === 0) return;
  const existing = await prisma.performerLink.findMany({
    where: { performerId },
    select: { url: true },
  });
  const existingUrls = new Set(existing.map((l) => l.url));
  const toCreate = socialLinks.filter((l) => !existingUrls.has(l.url));
  if (toCreate.length > 0) {
    await prisma.performerLink.createMany({
      data: toCreate.map((l) => ({ performerId, label: l.label, url: l.url })),
    });
  }
}
