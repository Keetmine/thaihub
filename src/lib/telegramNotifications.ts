import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatHumanDate, formatTime } from "@/lib/dates";
import { eventHref } from "@/lib/eventSlug";

const LOOKAHEAD_HOURS = 24;

/**
 * Шлёт телеграм-напоминания о датах событий, начинающихся в ближайшие
 * 24 часа, всем, кто отметил «я иду» или добавил событие в избранное и
 * привязал Telegram. Каждая пара (пользователь, дата события)
 * напоминается ровно один раз — дедуп через TelegramNotification.
 * Вызывается планировщиком из instrumentation.ts; безопасна к
 * параллельным/повторным запускам (upsert-семантика через create +
 * уникальный ключ).
 */
export async function sendUpcomingEventReminders(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const occurrences = await prisma.eventOccurrence.findMany({
    where: { startsAt: { gt: now, lte: until } },
    include: {
      event: {
        include: {
          attendees: { include: { user: true } },
          favoritedBy: { include: { user: true } },
        },
      },
      telegramNotifications: { select: { userId: true } },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const occ of occurrences) {
    const alreadyNotified = new Set(occ.telegramNotifications.map((n) => n.userId));
    // «Иду» и избранное складываем в одну карту — человек может быть в
    // обоих списках, напоминание всё равно одно.
    const recipients = new Map<string, { id: string; telegramId: string | null }>();
    for (const a of occ.event.attendees) recipients.set(a.user.id, a.user);
    for (const f of occ.event.favoritedBy) {
      if (!recipients.has(f.user.id)) recipients.set(f.user.id, f.user);
    }

    for (const user of recipients.values()) {
      if (!user.telegramId || alreadyNotified.has(user.id)) continue;

      const when = `${formatHumanDate(occ.startsAt)}, ${formatTime(occ.startsAt)}`;
      const appUrl = process.env.APP_URL || "";
      const link = appUrl ? `\n${appUrl}${eventHref(occ.event)}` : "";
      const text =
        `🎤 <b>${escapeHtml(occ.event.title)}</b>\n` +
        `Уже скоро: ${when} (тайское время)\n` +
        `📍 ${escapeHtml(occ.event.venue)}${link}`;

      try {
        const delivered = await sendTelegramMessage(user.telegramId, text);
        // Записываем факт и при 403 (человек не нажал Start) — иначе
        // каждый прогон будет впустую дёргать API ради того же отказа.
        await prisma.telegramNotification.create({
          data: { userId: user.id, occurrenceId: occ.id },
        });
        if (delivered) sent += 1;
        else skipped += 1;
      } catch (err) {
        // Не роняем весь прогон из-за одного получателя; без записи в
        // дедуп — попробуем этого человека в следующий раз.
        console.warn(
          `telegram reminder failed (user ${user.id}, occurrence ${occ.id}): ${err instanceof Error ? err.message : err}`,
        );
        skipped += 1;
      }
    }
  }

  return { sent, skipped };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const EXPIRY_WARN_DAYS = 3;

/**
 * Напоминание «подписка заканчивается через N дней» в Telegram. Дедуп —
 * premiumExpiryNotifiedFor: помним, для какого premiumUntil уже слали
 * (после продления дата меняется, и напоминание сработает снова).
 */
export async function sendPremiumExpiryReminders(): Promise<number> {
  const now = new Date();
  const warnBefore = new Date(now.getTime() + EXPIRY_WARN_DAYS * 24 * 60 * 60 * 1000);

  const expiring = await prisma.user.findMany({
    where: {
      telegramId: { not: null },
      premiumUntil: { gt: now, lte: warnBefore },
    },
  });

  let sent = 0;
  for (const user of expiring) {
    if (user.premiumExpiryNotifiedFor?.getTime() === user.premiumUntil!.getTime()) continue;
    try {
      const dateStr = user.premiumUntil!.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      });
      const appUrl = process.env.APP_URL || "";
      await sendTelegramMessage(
        user.telegramId!,
        `⏳ Подписка MyBLHub заканчивается ${dateStr}. Продлите, чтобы не потерять афишу, календарь и поездки.${appUrl ? `\n${appUrl}` : ""}`,
      );
      await prisma.user.update({
        where: { id: user.id },
        data: { premiumExpiryNotifiedFor: user.premiumUntil },
      });
      sent += 1;
    } catch (err) {
      console.warn(`premium expiry reminder failed (user ${user.id}): ${err instanceof Error ? err.message : err}`);
    }
  }
  return sent;
}
