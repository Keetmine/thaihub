"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function getIds(formData: FormData, key: string): string[] {
  return Array.from(new Set(formData.getAll(key).map(String).filter(Boolean)));
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

    revalidatePath("/admin/agencies");
    revalidatePath("/admin/performers/new");
    revalidatePath("/admin/performers");

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
  const agency = await createAgencyRecord(name.trim(), "", "");
  return { id: agency.id, name: agency.name, logoUrl: agency.logoUrl };
}

/**
 * Full agency creation from the admin form: profile fields + roster.
 * Redirects to the new agency's edit page so the admin can keep going.
 */
export async function createAgency(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const performerIds = getIds(formData, "performerIds");
  const dramaIds = getIds(formData, "dramaIds");

  const agency = await createAgencyRecord(name, logoUrl, description);

  if (performerIds.length > 0) {
    await prisma.performer.updateMany({
      where: { id: { in: performerIds } },
      data: { agencyId: agency.id },
    });
  }
  if (dramaIds.length > 0) {
    await prisma.drama.updateMany({
      where: { id: { in: dramaIds } },
      data: { agencyId: agency.id },
    });
  }

  revalidatePath("/performers");
  revalidatePath("/dramas");
  redirect(`/admin/agencies/${agency.id}/edit`);
}

export async function updateAgency(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const performerIds = getIds(formData, "performerIds");
  const dramaIds = getIds(formData, "dramaIds");

  if (!name) throw new Error("Укажите название агентства");

  try {
    await prisma.$transaction([
      prisma.performer.updateMany({ where: { agencyId: id }, data: { agencyId: null } }),
      ...(performerIds.length > 0
        ? [
            prisma.performer.updateMany({
              where: { id: { in: performerIds } },
              data: { agencyId: id },
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

  revalidatePath("/admin/agencies");
  revalidatePath(`/admin/agencies/${id}/edit`);
  revalidatePath("/performers");
  revalidatePath("/dramas");
  revalidatePath(`/agencies/${id}`);
  redirect("/admin/agencies");
}

export async function deleteAgency(id: string) {
  await prisma.agency.delete({ where: { id } });
  revalidatePath("/admin/agencies");
  revalidatePath("/admin/performers/new");
  revalidatePath("/admin/performers");
  revalidatePath("/dramas");
}
