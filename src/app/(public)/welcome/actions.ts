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
    // Оставляем только существующих артистов: id приходят из формы, и
    // подделанный ронял createMany на внешнем ключе — 500 на весь
    // онбординг. Несуществующих отбрасываем молча: остальной выбор
    // человека должен сохраниться, а сообщать тут не о чем.
    const existing = await prisma.performer.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length > 0) {
      await prisma.favoritePerformer.createMany({
        data: existing.map(({ id }) => ({ userId: user.id, performerId: id })),
        skipDuplicates: true,
      });
    }
  }
  redirect(localeHref("/", locale));
}
