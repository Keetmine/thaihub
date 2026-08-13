"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { scrapePerson } from "@/lib/mydramalist";

async function createPerformerRecord(name: string, type: string) {
  if (!name) throw new Error("Укажите имя исполнителя или группы");

  const performer = await prisma.performer.create({
    data: { name, type: type === "BAND" ? "BAND" : "SOLO" },
  });

  revalidatePath("/admin/performers");
  revalidatePath("/performers");

  return performer;
}

export async function createPerformer(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "SOLO");

  await createPerformerRecord(name, type);
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

export async function updatePerformer(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "SOLO");
  const birthDate = parseBirthDate(String(formData.get("birthDate") ?? ""));
  const bio = String(formData.get("bio") ?? "").trim();
  const agency = String(formData.get("agency") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const mydramalistUrl = String(formData.get("mydramalistUrl") ?? "").trim();
  const links = getLinks(formData);

  if (!name) throw new Error("Укажите имя исполнителя или группы");

  await prisma.$transaction([
    prisma.performerLink.deleteMany({ where: { performerId: id } }),
    prisma.performer.update({
      where: { id },
      data: {
        name,
        type: type === "BAND" ? "BAND" : "SOLO",
        birthDate,
        bio: bio || null,
        agency: agency || null,
        photoUrl: photoUrl || null,
        mydramalistUrl: mydramalistUrl || null,
        links: {
          create: links.map((l) => ({ label: l.label, url: l.url })),
        },
      },
    }),
  ]);

  revalidatePath("/admin/performers");
  revalidatePath(`/admin/performers/${id}/edit`);
  revalidatePath("/performers");
  revalidatePath(`/performers/${id}`);
  redirect("/admin/performers");
}

/**
 * Scrapes a mydramalist.com person page and merges the result into the
 * performer's profile: sets mydramalistUrl, overwrites photoUrl/bio when
 * the scrape found something (this is an explicit user-triggered "import"
 * action, so overwriting is acceptable), and upserts Drama + PerformerDrama
 * rows for each credited drama (matching existing dramas by case-insensitive
 * title to avoid duplicates).
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
