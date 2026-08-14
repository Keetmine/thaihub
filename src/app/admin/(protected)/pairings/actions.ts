"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { PairingStatus } from "@/generated/prisma/client";

export async function createPairing(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const performerAId = String(formData.get("performerAId") ?? "").trim();
  const performerBId = String(formData.get("performerBId") ?? "").trim();
  const status: PairingStatus = formData.get("status") === "PAST" ? "PAST" : "CURRENT";

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
        status,
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

export async function setPairingStatus(id: string, status: PairingStatus) {
  const pairing = await prisma.pairing.update({ where: { id }, data: { status } });
  revalidatePath("/admin/pairings");
  revalidatePath("/admin/performers");
  revalidatePath(`/performers/${pairing.performerAId}`);
  revalidatePath(`/performers/${pairing.performerBId}`);
}
