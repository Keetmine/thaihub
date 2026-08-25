"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { isLocale } from "@/lib/i18n";

/**
 * Запомнить выбранный язык в профиле.
 *
 * Куки для интерфейса хватает, но она живёт в одном браузере — а язык
 * нужен ещё и там, где браузера рядом нет: уведомления в Telegram,
 * название календарной подписки. Поэтому у залогиненных выбор дублируется
 * в профиль, и он же кладётся в куку при следующем входе.
 *
 * Гостю просто нечего запоминать — это не ошибка, у него остаётся кука.
 */
export async function rememberLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const user = await getCurrentUser();
  if (!user) return;
  if (user.locale === locale) return;
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
}
