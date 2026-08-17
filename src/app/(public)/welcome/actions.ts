"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

/** Онбординг: выбранные артисты — в избранное одним махом. */
export async function saveOnboardingFavorites(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ids = formData.getAll("performerIds").map(String).filter(Boolean);
  if (ids.length > 0) {
    await prisma.favoritePerformer.createMany({
      data: ids.map((performerId) => ({ userId: user.id, performerId })),
      skipDuplicates: true,
    });
  }
  redirect("/");
}
