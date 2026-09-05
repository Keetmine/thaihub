"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit, diffRecords } from "@/lib/audit";

function getIds(formData: FormData, key: string): string[] {
  return Array.from(new Set(formData.getAll(key).map(String).filter(Boolean)));
}

/** Ссылки агентства из формы — тот же разбор, что у исполнителей:
 *  строки без адреса пропускаем, пустая подпись подменяется адресом
 *  (на странице такая ссылка всё равно станет иконкой соцсети). */
function getLinks(formData: FormData): { label: string; url: string }[] {
  const labels = formData.getAll("linkLabel").map(String);
  const urls = formData.getAll("linkUrl").map(String);
  const links: { label: string; url: string }[] = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
    const label = (labels[i] ?? "").trim();
    const url = (urls[i] ?? "").trim();
    if (!url) continue;
    links.push({ label: label || url, url });
  }
  return links;
}

function isUniqueNameError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function createAgencyRecord(name: string, logoUrl: string, description: string) {
  if (!name) throw new Error("Укажите название агентства");

  try {
    const agency = await prisma.agency.create({
      data: {
        name,
        logoUrl: logoUrl || null,
        description: description || null,
      },
    });

    revalidatePath("/admin/performers/new");
    revalidatePath("/admin/agencies");

    return agency;
  } catch (error) {
    if (isUniqueNameError(error)) {
      throw new Error("Агентство с таким названием уже существует");
    }
    throw error;
  }
}

/** Inline-create from a combobox (performer/drama form's agency field). */
export async function createAgencyAndReturn(
  name: string,
): Promise<{ id: string; name: string; logoUrl: string | null }> {
  await requireCatalogEditor();
  const agency = await createAgencyRecord(name.trim(), "", "");
  return { id: agency.id, name: agency.name, logoUrl: agency.logoUrl };
}

/**
 * Full agency creation from the admin form: profile fields + roster.
 * Redirects to the new agency's edit page so the admin can keep going.
 */
export async function createAgency(formData: FormData) {
  await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const performerIds = getIds(formData, "performerIds");
  const dramaIds = getIds(formData, "dramaIds");
  const links = getLinks(formData);

  const agency = await createAgencyRecord(name, logoUrl, description);

  if (links.length > 0) {
    await prisma.agencyLink.createMany({
      data: links.map((l) => ({ ...l, agencyId: agency.id })),
    });
  }
  if (performerIds.length > 0) {
    await prisma.performerAgency.createMany({
      data: performerIds.map((performerId) => ({ performerId, agencyId: agency.id })),
      skipDuplicates: true,
    });
  }
  if (dramaIds.length > 0) {
    await prisma.drama.updateMany({
      where: { id: { in: dramaIds } },
      data: { agencyId: agency.id },
    });
  }

  await logAudit({
    action: "CREATE",
    entityType: "Agency",
    entityId: agency.id,
    entityLabel: agency.name,
  });

  revalidatePath("/artists");
  revalidatePath("/dramas");
  redirect(`/admin/agencies/${agency.id}/edit`);
}

export async function updateAgency(id: string, formData: FormData) {
  await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const performerIds = getIds(formData, "performerIds");
  const dramaIds = getIds(formData, "dramaIds");
  const links = getLinks(formData);

  if (!name) throw new Error("Укажите название агентства");

  const before = await prisma.agency.findUnique({ where: { id } });

  try {
    await prisma.$transaction([
      // The roster picker below defines this agency's *entire* current
      // membership — clear its existing join rows and recreate exactly
      // the selected set, rather than touching a scalar column. This
      // only ever touches rows where agencyId = this agency, so a
      // performer's membership in any *other* agency is untouched.
      prisma.performerAgency.deleteMany({ where: { agencyId: id } }),
      ...(performerIds.length > 0
        ? [
            prisma.performerAgency.createMany({
              data: performerIds.map((performerId) => ({ performerId, agencyId: id })),
              skipDuplicates: true,
            }),
          ]
        : []),
      prisma.drama.updateMany({ where: { agencyId: id }, data: { agencyId: null } }),
      ...(dramaIds.length > 0
        ? [
            prisma.drama.updateMany({
              where: { id: { in: dramaIds } },
              data: { agencyId: id },
            }),
          ]
        : []),
      // Ссылки, как и состав, целиком описаны формой: снести и
      // пересоздать проще и надёжнее, чем вычислять диф по строкам.
      prisma.agencyLink.deleteMany({ where: { agencyId: id } }),
      ...(links.length > 0
        ? [
            prisma.agencyLink.createMany({
              data: links.map((l) => ({ ...l, agencyId: id })),
            }),
          ]
        : []),
      prisma.agency.update({
        where: { id },
        data: {
          name,
          logoUrl: logoUrl || null,
          description: description || null,
        },
      }),
    ]);
  } catch (error) {
    if (isUniqueNameError(error)) {
      throw new Error("Агентство с таким названием уже существует");
    }
    throw error;
  }

  if (before) {
    await logAudit({
      action: "UPDATE",
      entityType: "Agency",
      entityId: id,
      entityLabel: name,
      changes: diffRecords(before, { name, logoUrl, description }, ["name", "logoUrl", "description"]),
    });
  }

  revalidatePath("/admin/agencies");
  revalidatePath(`/admin/agencies/${id}/edit`);
  revalidatePath("/artists");
  revalidatePath("/dramas");
  revalidatePath(`/agencies/${id}`);
  // Правка не закрывает страницу (просьба владельца): назад на
  // свою же форму с отметкой «Сохранено».
  redirect(`/admin/agencies/${id}/edit?saved=1`);
}

export async function deleteAgency(id: string) {
  await requireCatalogEditor();
  const existing = await prisma.agency.findUnique({ where: { id }, select: { name: true } });
  await prisma.agency.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "Agency",
    entityId: id,
    entityLabel: existing?.name ?? id,
  });
  revalidatePath("/admin/performers/new");
  revalidatePath("/admin/agencies");
  revalidatePath("/dramas");
}
