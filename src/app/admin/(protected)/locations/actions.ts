"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

async function createLocationRecord(name: string, description: string, photoUrl: string) {
  if (!name) throw new Error("Укажите название локации");

  const location = await prisma.location.create({
    data: {
      name,
      description: description || null,
      photoUrl: photoUrl || null,
    },
  });

  revalidatePath("/admin/locations");
  revalidatePath("/locations");
  revalidatePath("/admin/dramas/new");

  return location;
}

/** Inline-create from a combobox (drama form's locations field). */
export async function createLocationAndReturn(
  name: string,
): Promise<{ id: string; name: string; photoUrl: string | null }> {
  const location = await createLocationRecord(name.trim(), "", "");
  return { id: location.id, name: location.name, photoUrl: location.photoUrl };
}

export async function createLocation(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();

  const location = await createLocationRecord(name, description, photoUrl);
  redirect(`/admin/locations/${location.id}/edit`);
}

export async function updateLocation(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();

  if (!name) throw new Error("Укажите название локации");

  await prisma.location.update({
    where: { id },
    data: {
      name,
      description: description || null,
      photoUrl: photoUrl || null,
    },
  });

  revalidatePath("/admin/locations");
  revalidatePath(`/admin/locations/${id}/edit`);
  revalidatePath("/locations");
  revalidatePath(`/locations/${id}`);
  redirect("/admin/locations");
}

export async function deleteLocation(id: string) {
  await prisma.location.delete({ where: { id } });
  revalidatePath("/admin/locations");
  revalidatePath("/locations");
}
