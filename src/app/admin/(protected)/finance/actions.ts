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
export async function refundPayment(paymentId: string): Promise<void> {
  await requireAdmin();
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: { select: { id: true, name: true, email: true, telegramId: true } } },
  });
  if (!payment) throw new Error("Оплата не найдена");
  if (payment.refundedAt) throw new Error("Эта оплата уже возвращена");
  if (!payment.telegramChargeId) throw new Error("У оплаты нет charge id — вернуть через API нельзя");
  if (!payment.user?.telegramId) throw new Error("У пользователя не привязан Telegram");

  await refundStarPayment(payment.user.telegramId, payment.telegramChargeId);

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
}
