"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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
}
