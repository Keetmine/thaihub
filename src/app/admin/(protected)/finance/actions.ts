"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { refundStarPayment } from "@/lib/telegram";
import { logAudit } from "@/lib/audit";

/**
 * Возврат оплаты: Telegram возвращает звёзды пользователю, а мы
 * снимаем подписку, которую та оплата дала, и помечаем платёж
 * возвращённым (в выручке он больше не считается).
 */
export async function refundPayment(paymentId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: { select: { id: true, name: true, email: true, telegramId: true } } },
  });
  // Причины возвращаем значением: текст исключения из server action Next
  // в проде клиенту не отдаёт, и админ видел бы «Не удалось выполнить».
  if (!payment) return { error: "Оплата не найдена" };
  if (payment.refundedAt) return { error: "Эта оплата уже возвращена" };
  if (!payment.telegramChargeId) {
    return { error: "У оплаты нет charge id — вернуть через API нельзя" };
  }
  if (!payment.user?.telegramId) return { error: "У пользователя не привязан Telegram" };

  try {
    await refundStarPayment(payment.user.telegramId, payment.telegramChargeId);
  } catch (e) {
    return { error: e instanceof Error ? `Telegram отказал: ${e.message}` : "Telegram отказал" };
  }

  await prisma.$transaction([
    prisma.payment.update({ where: { id: paymentId }, data: { refundedAt: new Date() } }),
    // Оплаченный месяц снимаем: подписка была выдана именно за него.
    prisma.user.update({ where: { id: payment.user.id }, data: { premiumUntil: null } }),
  ]);

  await logAudit({
    action: "UPDATE",
    entityType: "Payment",
    entityId: paymentId,
    entityLabel: `${payment.amount} Stars`,
    note: `возврат: ${payment.user.name ?? payment.user.email ?? payment.user.id}`,
  });

  revalidatePath("/admin/finance");
  return {};
}
