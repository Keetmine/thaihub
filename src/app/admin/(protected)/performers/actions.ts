"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { scrapePerson, parsePersonHtml, type ScrapedPerson } from "@/lib/mydramalist";

async function createPerformerRecord(name: string, type: string) {
  if (!name) throw new Error("Укажите имя исполнителя или группы");

  const performer = await prisma.performer.create({
    data: { name, type: type === "BAND" ? "BAND" : "SOLO" },
  });

  revalidatePath("/admin/performers");
  revalidatePath("/performers");

  return performer;
}

export async function createPerformerAndReturn(
  name: string,
): Promise<{ id: string; name: string; type: string }> {
  const performer = await createPerformerRecord(name.trim(), "SOLO");
  return { id: performer.id, name: performer.name, type: performer.type };
}

export async function deletePerformer(id: string) {
  await prisma.performer.delete({ where: { id } });
  revalidatePath("/admin/performers");
  revalidatePath("/performers");
  redirect("/admin/performers");
}

type LinkInput = { label: string; url: string };

function getLinks(formData: FormData): LinkInput[] {
  const labels = formData.getAll("linkLabel").map(String);
  const urls = formData.getAll("linkUrl").map(String);

  const links: LinkInput[] = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
    const label = (labels[i] ?? "").trim();
    const url = (urls[i] ?? "").trim();
    if (!url) continue; // skip empty rows / rows missing a url
    links.push({ label: label || url, url });
  }
  return links;
}

function parseBirthDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getMemberIds(formData: FormData): string[] {
  const ids = formData.getAll("memberIds").map(String).filter(Boolean);
  return Array.from(new Set(ids));
}

function getDramaIds(formData: FormData): string[] {
  const ids = formData.getAll("dramaIds").map(String).filter(Boolean);
  return Array.from(new Set(ids));
}

function getEventIds(formData: FormData): string[] {
  const ids = formData.getAll("eventIds").map(String).filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * Full performer creation: profile fields + links, same shape as the edit
 * form. Solo performers can optionally be paired with an existing performer
 * right away; band performers can have their member roster set right away.
 * Redirects to the new performer's edit page so the admin can continue
 * (mydramalist import, more links, etc.) without a second lookup.
 */
export async function createPerformer(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "SOLO") === "BAND" ? "BAND" : "SOLO";
  const realName = String(formData.get("realName") ?? "").trim();
  const birthDate = parseBirthDate(String(formData.get("birthDate") ?? ""));
  const bio = String(formData.get("bio") ?? "").trim();
  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const links = getLinks(formData);

  if (!name) throw new Error("Укажите имя исполнителя или группы");

  const performer = await prisma.performer.create({
    data: {
      name,
      type,
      realName: realName || null,
      birthDate: type === "SOLO" ? birthDate : null,
      bio: bio || null,
      agencyId: agencyId || null,
      photoUrl: photoUrl || null,
      links: {
        create: links.map((l) => ({ label: l.label, url: l.url })),
      },
    },
  });

  if (type === "SOLO") {
    const partnerId = String(formData.get("pairingPartnerId") ?? "").trim();
    if (partnerId && partnerId !== performer.id) {
      const pairingName = String(formData.get("pairingName") ?? "").trim();
      const [performerAId, performerBId] = [performer.id, partnerId].sort();
      await prisma.pairing.create({
        data: { name: pairingName || null, performerAId, performerBId },
      });
    }

    const dramaIds = getDramaIds(formData);
    if (dramaIds.length > 0) {
      await prisma.performerDrama.createMany({
        data: dramaIds.map((dramaId) => ({ performerId: performer.id, dramaId })),
      });
    }
  } else {
    const memberIds = getMemberIds(formData);
    if (memberIds.length > 0) {
      await prisma.bandMember.createMany({
        data: memberIds.map((performerId) => ({ bandId: performer.id, performerId })),
      });
    }
  }

  const eventIds = getEventIds(formData);
  if (eventIds.length > 0) {
    await prisma.eventPerformer.createMany({
      data: eventIds.map((eventId) => ({ eventId, performerId: performer.id })),
    });
  }

  revalidatePath("/admin/performers");
  revalidatePath("/admin/pairings");
  revalidatePath("/performers");
  revalidatePath("/");
  redirect(`/admin/performers/${performer.id}/edit`);
}

export async function updatePerformer(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "SOLO") === "BAND" ? "BAND" : "SOLO";
  const realName = String(formData.get("realName") ?? "").trim();
  const birthDate = parseBirthDate(String(formData.get("birthDate") ?? ""));
  const bio = String(formData.get("bio") ?? "").trim();
  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const mydramalistUrl = String(formData.get("mydramalistUrl") ?? "").trim();
  const links = getLinks(formData);
  const memberIds = type === "BAND" ? getMemberIds(formData) : [];
  const dramaIds = type === "SOLO" ? getDramaIds(formData) : [];
  const eventIds = getEventIds(formData);

  if (!name) throw new Error("Укажите имя исполнителя или группы");

  await prisma.$transaction([
    prisma.performerLink.deleteMany({ where: { performerId: id } }),
    prisma.bandMember.deleteMany({ where: { bandId: id } }),
    prisma.performerDrama.deleteMany({ where: { performerId: id } }),
    prisma.eventPerformer.deleteMany({ where: { performerId: id } }),
    prisma.performer.update({
      where: { id },
      data: {
        name,
        type,
        realName: realName || null,
        birthDate: type === "SOLO" ? birthDate : null,
        bio: bio || null,
        agencyId: agencyId || null,
        photoUrl: photoUrl || null,
        mydramalistUrl: mydramalistUrl || null,
        links: {
          create: links.map((l) => ({ label: l.label, url: l.url })),
        },
        bandMembers: {
          create: memberIds.map((performerId) => ({ performerId })),
        },
        dramas: {
          create: dramaIds.map((dramaId) => ({ dramaId })),
        },
        events: {
          create: eventIds.map((eventId) => ({ eventId })),
        },
      },
    }),
  ]);

  revalidatePath("/admin/performers");
  revalidatePath(`/admin/performers/${id}/edit`);
  revalidatePath("/performers");
  revalidatePath(`/performers/${id}`);
  revalidatePath("/");
  redirect("/admin/performers");
}

/**
 * Merges a scraped mydramalist.com profile into the performer's record: sets
 * mydramalistUrl, overwrites photoUrl/bio when the scrape found something
 * (this is an explicit user-triggered "import" action, so overwriting is
 * acceptable), and upserts Drama + PerformerDrama rows for each credited
 * drama (matching existing dramas by case-insensitive title to avoid
 * duplicates). Shared by both the live-fetch and pasted-HTML import paths.
 */
async function applyScrapedPerson(performerId: string, url: string, scraped: ScrapedPerson) {
  await prisma.performer.update({
    where: { id: performerId },
    data: {
      mydramalistUrl: url,
      ...(scraped.photoUrl ? { photoUrl: scraped.photoUrl } : {}),
      ...(scraped.bio ? { bio: scraped.bio } : {}),
    },
  });

  for (const drama of scraped.dramas) {
    if (!drama.title) continue;

    let dramaRecord = await prisma.drama.findFirst({
      where: { title: { equals: drama.title, mode: "insensitive" } },
    });

    if (!dramaRecord) {
      dramaRecord = await prisma.drama.create({
        data: {
          title: drama.title,
          mydramalistUrl: drama.mydramalistUrl ?? null,
          year: drama.year ?? null,
        },
      });
    } else if (drama.mydramalistUrl && !dramaRecord.mydramalistUrl) {
      dramaRecord = await prisma.drama.update({
        where: { id: dramaRecord.id },
        data: { mydramalistUrl: drama.mydramalistUrl },
      });
    }

    await prisma.performerDrama.upsert({
      where: { performerId_dramaId: { performerId, dramaId: dramaRecord.id } },
      update: {},
      create: { performerId, dramaId: dramaRecord.id },
    });
  }

  revalidatePath("/admin/performers");
  revalidatePath(`/admin/performers/${performerId}/edit`);
  revalidatePath("/performers");
  revalidatePath(`/performers/${performerId}`);
}

/**
 * Fetches and scrapes a mydramalist.com person page directly. mydramalist
 * sits behind a Cloudflare bot challenge that a server-side fetch cannot
 * solve, so this will almost always fail — kept as the "try it anyway" path;
 * {@link importFromMydramalistHtml} is the one that actually works today.
 *
 * Called directly from a client component (not as a <form action>), so
 * errors thrown here reach the caller's try/catch with their message intact.
 */
export async function importFromMydramalist(performerId: string, mydramalistUrl: string) {
  const url = mydramalistUrl.trim();
  if (!url) throw new Error("Укажите ссылку на профиль mydramalist.com");

  const performer = await prisma.performer.findUnique({ where: { id: performerId } });
  if (!performer) throw new Error("Исполнитель не найден");

  const scraped = await scrapePerson(url);
  await applyScrapedPerson(performerId, url, scraped);
}

/**
 * Same as {@link importFromMydramalist}, but parses HTML the admin pasted in
 * themselves (copied from their own browser's "view page source" after the
 * page loaded past Cloudflare) instead of fetching it server-side.
 */
export async function importFromMydramalistHtml(
  performerId: string,
  mydramalistUrl: string,
  html: string,
) {
  const url = mydramalistUrl.trim();
  if (!url) throw new Error("Укажите ссылку на профиль mydramalist.com");
  if (!html.trim()) throw new Error("Вставьте HTML-код страницы");

  const performer = await prisma.performer.findUnique({ where: { id: performerId } });
  if (!performer) throw new Error("Исполнитель не найден");

  const scraped = parsePersonHtml(html, url);
  await applyScrapedPerson(performerId, url, scraped);
}
