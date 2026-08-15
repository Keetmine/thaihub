"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { refreshBlsceneLocations, type BlsceneLocationRefreshResult } from "@/lib/blsceneImport";

function getCoordinate(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function createLocationRecord(
  name: string,
  description: string,
  photoUrl: string,
  latitude: number | null,
  longitude: number | null,
) {
  if (!name) throw new Error("Укажите название локации");

  const location = await prisma.location.create({
    data: {
      name,
      description: description || null,
      photoUrl: photoUrl || null,
      latitude,
      longitude,
    },
  });

  revalidatePath("/admin/locations");
  revalidatePath("/locations");
  revalidatePath("/locations/map");
  revalidatePath("/admin/dramas/new");

  return location;
}

/** Inline-create from a combobox (drama form's locations field). */
export async function createLocationAndReturn(
  name: string,
): Promise<{ id: string; name: string; photoUrl: string | null }> {
  const location = await createLocationRecord(name.trim(), "", "", null, null);
  return { id: location.id, name: location.name, photoUrl: location.photoUrl };
}

export async function createLocation(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const latitude = getCoordinate(formData, "latitude");
  const longitude = getCoordinate(formData, "longitude");

  const location = await createLocationRecord(name, description, photoUrl, latitude, longitude);
  redirect(`/admin/locations/${location.id}/edit`);
}

export async function updateLocation(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const latitude = getCoordinate(formData, "latitude");
  const longitude = getCoordinate(formData, "longitude");

  if (!name) throw new Error("Укажите название локации");

  await prisma.location.update({
    where: { id },
    data: {
      name,
      description: description || null,
      photoUrl: photoUrl || null,
      latitude,
      longitude,
    },
  });

  revalidatePath("/admin/locations");
  revalidatePath(`/admin/locations/${id}/edit`);
  revalidatePath("/locations");
  revalidatePath(`/locations/${id}`);
  revalidatePath("/locations/map");
  redirect("/admin/locations");
}

export async function deleteLocation(id: string) {
  await prisma.location.delete({ where: { id } });
  revalidatePath("/admin/locations");
  revalidatePath("/locations");
}

/**
 * Re-checks every already-imported drama's blscene page for filming
 * locations added since our last visit. New-drama importing lives in the
 * standalone backfill script instead — this only ever adds locations to
 * dramas we already have.
 */
export async function syncBlsceneLocations(): Promise<BlsceneLocationRefreshResult> {
  const browser = await chromium.launch();
  try {
    const result = await refreshBlsceneLocations(browser);
    revalidatePath("/admin/locations");
    revalidatePath("/locations");
    revalidatePath("/locations/map");
    return result;
  } finally {
    await browser.close();
  }
}
