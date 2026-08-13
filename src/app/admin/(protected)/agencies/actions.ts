"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new Error("Агентство с таким названием уже существует");
    }
    throw error;
  }
}

export async function createAgency(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  await createAgencyRecord(name, logoUrl, description);
}

/** Inline-create from the performer form's agency combobox. */
export async function createAgencyAndReturn(
  name: string,
): Promise<{ id: string; name: string; logoUrl: string | null }> {
  const agency = await createAgencyRecord(name.trim(), "", "");
  return { id: agency.id, name: agency.name, logoUrl: agency.logoUrl };
}

export async function updateAgency(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) throw new Error("Укажите название агентства");

  try {
    await prisma.agency.update({
      where: { id },
      data: {
        name,
        logoUrl: logoUrl || null,
        description: description || null,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new Error("Агентство с таким названием уже существует");
    }
    throw error;
  }

  revalidatePath("/admin/agencies");
  revalidatePath("/performers");
  revalidatePath(`/agencies/${id}`);
}

export async function deleteAgency(id: string) {
  await prisma.agency.delete({ where: { id } });
  revalidatePath("/admin/agencies");
  revalidatePath("/admin/performers/new");
  revalidatePath("/admin/performers");
}
