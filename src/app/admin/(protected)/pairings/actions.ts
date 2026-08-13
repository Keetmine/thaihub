"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createPairing(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const performerAId = String(formData.get("performerAId") ?? "").trim();
  const performerBId = String(formData.get("performerBId") ?? "").trim();

  if (!performerAId || !performerBId) {
    throw new Error("Выберите обоих исполнителей");
  }
  if (performerAId === performerBId) {
    throw new Error("Пейринг должен состоять из двух разных исполнителей");
  }

  const [performerAIdSorted, performerBIdSorted] = [performerAId, performerBId].sort();

  try {
    await prisma.pairing.create({
      data: {
        name: name || null,
        performerAId: performerAIdSorted,
        performerBId: performerBIdSorted,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new Error("Такой пейринг уже существует");
    }
    throw error;
  }

  revalidatePath("/admin/pairings");
  revalidatePath("/admin/events");
  revalidatePath("/admin/events/new");
}

export async function deletePairing(id: string) {
  await prisma.pairing.delete({ where: { id } });
  revalidatePath("/admin/pairings");
  revalidatePath("/admin/events");
}
