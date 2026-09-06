"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, localeHref } from "@/lib/i18n";

// Тур по интерфейсу показывается один раз: отметка о прохождении живёт
// у пользователя, а не в браузере — иначе он всплывал бы на каждом
// новом устройстве.

export async function completeTour(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { tourCompletedAt: new Date() },
  });
}

/** Пройти заново — кнопкой из настроек.
 *
 *  Мало сбросить отметку: тур сам стартует только с главной, а кнопка
 *  живёт в настройках — раньше клик «ничего не делал» (человек
 *  оставался на месте, и даже уйдя на главную руками, не видел тура,
 *  потому что клиентский ProductTour решает про автозапуск один раз,
 *  при маунте). Поэтому уводим на главную с меткой ?tour=1 — её ловит
 *  ProductTour и стартует сразу же. */
export async function restartTour(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { tourCompletedAt: null } });
  const locale = await getLocale();
  redirect(`${localeHref("/", locale)}?tour=1`);
}

/**
 * «Потом» в предложении привязать Telegram: отметка живёт у
 * пользователя, а не в браузере — иначе попап всплывал бы на каждом
 * новом устройстве (та же причина, что у тура).
 *
 * Показываем его ровно один раз: спрашивать повторно — навязчивость, а
 * привязка никуда не девается, она в настройках.
 */
export async function dismissTelegramPrompt(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramPromptedAt: new Date() },
  });
}
