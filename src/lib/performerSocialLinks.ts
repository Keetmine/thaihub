import { prisma } from "@/lib/prisma";
import { oneProfilePlatformOf, socialLinkKey } from "@/lib/socialLinks";

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
  // По нормализованному ключу, не по строке (www./слэш давали «разные»
  // адреса), и не доливаем вторую ссылку на занятую сеть «один
  // профиль»: это почти всегда переименованный аккаунт (кейс Sea).
  const existingUrls = new Set(existing.map((l) => socialLinkKey(l.url)));
  const existingNetworks = new Set(
    existing.map((l) => oneProfilePlatformOf(l.url)).filter((p) => p !== null),
  );
  const toCreate = socialLinks.filter((l) => {
    if (existingUrls.has(socialLinkKey(l.url))) return false;
    const network = oneProfilePlatformOf(l.url);
    if (network && existingNetworks.has(network)) return false;
    if (network) existingNetworks.add(network);
    existingUrls.add(socialLinkKey(l.url));
    return true;
  });
  if (toCreate.length > 0) {
    await prisma.performerLink.createMany({
      data: toCreate.map((l) => ({ performerId, label: l.label, url: l.url })),
    });
  }
}
