import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import { fetchGmmtvArtistLinks, scrapeGmmtvArtist, type GmmtvArtist } from "@/lib/gmmtv";
import { addPerformerAgency } from "@/lib/performerAgency";

export type GmmtvSyncResult = {
  checked: number;
  created: string[];
  updated: string[];
  errors: { id: string; message: string }[];
};

const AGENCY_NAME = "GMMTV";

async function getGmmtvAgencyId(): Promise<string> {
  const agency = await prisma.agency.upsert({
    where: { name: AGENCY_NAME },
    update: {},
    create: { name: AGENCY_NAME },
  });
  return agency.id;
}

/** Creates the PerformerLink rows for a scraped artist's social links that
 *  aren't already on their profile (matched by exact URL, so re-running
 *  this never creates duplicates). Existing links from other sources are
 *  left untouched. */
async function syncSocialLinks(performerId: string, socialLinks: GmmtvArtist["socialLinks"]) {
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

/**
 * Creates or updates one Performer from a scraped GMMTV profile. Matches
 * an existing performer by nickname (Performer.name), case-insensitively
 * and exactly — same convention as the ThaiTicketMajor importer's artist
 * matching (see docs/features/catalog.md). `replacePhotos` controls
 * whether an existing performer's photoUrl gets overwritten; birthDate
 * and realName are always updated to GMMTV's values since GMMTV is the
 * authoritative source for its own roster. GMMTV is always *added* to
 * the performer's agency set (never removes another agency they're
 * already linked to — see PerformerAgency in schema.prisma) since a
 * performer can be signed to more than one studio at once.
 */
export async function importOrUpdateGmmtvArtist(
  scraped: GmmtvArtist,
  agencyId: string,
  options: { replacePhotos: boolean },
): Promise<"created" | "updated" | "skipped"> {
  if (!scraped.nickname) return "skipped";

  const existing = await prisma.performer.findFirst({
    where: { name: { equals: scraped.nickname, mode: "insensitive" } },
  });

  const birthDate = scraped.birthDate ? new Date(scraped.birthDate) : null;

  if (existing) {
    await prisma.performer.update({
      where: { id: existing.id },
      data: {
        realName: scraped.fullName || existing.realName,
        birthDate: birthDate ?? existing.birthDate,
        photoUrl: options.replacePhotos && scraped.photoUrl ? scraped.photoUrl : existing.photoUrl,
      },
    });
    await addPerformerAgency(existing.id, agencyId);
    await syncSocialLinks(existing.id, scraped.socialLinks);
    return "updated";
  }

  const created = await prisma.performer.create({
    data: {
      name: scraped.nickname,
      type: "SOLO",
      realName: scraped.fullName || null,
      birthDate,
      photoUrl: scraped.photoUrl,
      agencies: { create: { agencyId } },
    },
  });
  await syncSocialLinks(created.id, scraped.socialLinks);
  return "created";
}

/**
 * Scrapes the whole GMMTV roster and creates/updates a Performer for each
 * artist, all linked to the (find-or-created) "GMMTV" Agency. Used by
 * both the one-off backfill script and the admin "sync" action.
 */
export async function syncGmmtvArtists(
  browser: Browser,
  options: { replacePhotos: boolean },
  onProgress?: (message: string) => void,
): Promise<GmmtvSyncResult> {
  const log = onProgress ?? (() => {});
  const agencyId = await getGmmtvAgencyId();

  // gmm-tv.com sits behind Cloudflare, which serves different (often
  // link-poor) content to Playwright's default UA — a realistic browser
  // UA gets the same page a person would see.
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  });
  const links = await fetchGmmtvArtistLinks(page);
  log(`${links.length} artists found on GMMTV roster`);

  const result: GmmtvSyncResult = { checked: links.length, created: [], updated: [], errors: [] };

  for (const [i, link] of links.entries()) {
    try {
      const scraped = await scrapeGmmtvArtist(link.url, page);
      log(`[${i + 1}/${links.length}] ${scraped.nickname || link.id}`);
      const outcome = await importOrUpdateGmmtvArtist(scraped, agencyId, options);
      if (outcome === "created") result.created.push(scraped.nickname);
      if (outcome === "updated") result.updated.push(scraped.nickname);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  ! failed: ${message}`);
      result.errors.push({ id: link.id, message });
    }
  }

  await page.close();
  return result;
}
