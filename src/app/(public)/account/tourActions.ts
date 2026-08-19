"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

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

/** Пройти заново — кнопкой из настроек. */
export async function restartTour(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { tourCompletedAt: null } });
}
