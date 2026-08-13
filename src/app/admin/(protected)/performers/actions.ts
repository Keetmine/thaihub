"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createPerformer(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "SOLO");

  if (!name) throw new Error("Укажите имя исполнителя или группы");

  await prisma.performer.create({
    data: { name, type: type === "BAND" ? "BAND" : "SOLO" },
  });

  revalidatePath("/admin/performers");
  revalidatePath("/performers");
}

export async function deletePerformer(id: string) {
  await prisma.performer.delete({ where: { id } });
  revalidatePath("/admin/performers");
  revalidatePath("/performers");
}
