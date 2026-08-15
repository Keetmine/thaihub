"use server";

import { revalidatePath } from "next/cache";
import { mergeDramas, mergePerformers } from "@/lib/duplicates";
import { requireAdmin } from "@/lib/auth";

export async function mergeDramasAction(keeperId: string, loserIds: string[]) {
  await requireAdmin();
  await mergeDramas(keeperId, loserIds);
  revalidatePath("/admin/duplicates");
  revalidatePath("/admin/dramas");
  revalidatePath("/dramas");
}

export async function mergePerformersAction(keeperId: string, loserIds: string[]) {
  await requireAdmin();
  await mergePerformers(keeperId, loserIds);
  revalidatePath("/admin/duplicates");
  revalidatePath("/admin/performers");
  revalidatePath("/performers");
}
