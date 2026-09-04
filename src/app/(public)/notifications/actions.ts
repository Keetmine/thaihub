"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

/** Отметить все уведомления прочитанными — гасит счётчик у колокольчика. */
export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/");
}

/**
 * Отметить ОДНО уведомление прочитанным — клик по строке в ленте.
 *
 * Владельца проверяет сам where: чужой или несуществующий id просто
 * ничего не обновит (updateMany вместо update — тот на «не нашлось»
 * бросает). Здесь нет revalidatePath намеренно: функцию зовёт рендер
 * страницы /notifications/go/[id], где revalidatePath запрещён — и не
 * нужен: лента force-dynamic, а счётчик колокольчик перепрашивает сам
 * при смене маршрута (см. NotificationBell).
 */
export async function markNotificationRead(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
}
