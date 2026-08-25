"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, localeHref } from "@/lib/i18n";

/** Онбординг: выбранные артисты — в избранное одним махом. */
export async function saveOnboardingFavorites(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  const ids = formData.getAll("performerIds").map(String).filter(Boolean);
  if (ids.length > 0) {
    await prisma.favoritePerformer.createMany({
      data: ids.map((performerId) => ({ userId: user.id, performerId })),
      skipDuplicates: true,
    });
  }
  redirect(localeHref("/", locale));
}
