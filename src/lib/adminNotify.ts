import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { getSetting } from "@/lib/siteSettings";

// Уведомления админам о том, что требует реакции: обращение, жалоба,
// упавший импорт, серверная ошибка, оплата. Без них об очереди узнаёшь,
// только зайдя в админку (см. docs/features/admin-notifications.md).
// Канал — Telegram: бот уже есть, и у админов есть telegramId. Почта
// добавится, когда появятся SMTP-доступы.

export type AdminNotifyKind = "feedback" | "report" | "import" | "error" | "payment";

/** Ключ настройки, которым канал отключается из /admin/settings. */
export const ADMIN_NOTIFY_SETTING = "admin_notify_kinds";

/** Значение по умолчанию: включено всё, кроме ошибок — их поток шумный,
 *  а счётчик в сайдбаре и так виден. */
const DEFAULT_KINDS: AdminNotifyKind[] = ["feedback", "report", "import", "payment"];

async function enabledKinds(): Promise<Set<AdminNotifyKind>> {
  const raw = await getSetting(ADMIN_NOTIFY_SETTING);
  if (raw === null) return new Set(DEFAULT_KINDS);
  if (raw.trim() === "") return new Set();
  return new Set(
    raw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean) as AdminNotifyKind[],
  );
}

// Дедуп: одна и та же ошибка может прилететь сотню раз за минуту, и
// каждая не должна становиться сообщением в чате.
const lastSentAt = new Map<string, number>();
const DEDUP_WINDOW_MS = 10 * 60 * 1000;

/**
 * Шлёт текст всем админам с привязанным Telegram. Ничего не бросает:
 * упавшее уведомление не должно ронять действие, которое его вызвало
 * (обращение пользователя, вебхук оплаты).
 */
export async function notifyAdmins(
  kind: AdminNotifyKind,
  text: string,
  options?: { dedupKey?: string },
): Promise<void> {
  try {
    if (!(await enabledKinds()).has(kind)) return;

    if (options?.dedupKey) {
      const key = `${kind}:${options.dedupKey}`;
      const previous = lastSentAt.get(key);
      const now = Date.now();
      if (previous && now - previous < DEDUP_WINDOW_MS) return;
      lastSentAt.set(key, now);
    }

    const admins = await prisma.user.findMany({
      where: { isAdmin: true, telegramId: { not: null } },
      select: { telegramId: true },
    });
    await Promise.all(
      admins.map((a) => sendTelegramMessage(a.telegramId!, text).catch(() => false)),
    );
  } catch (error) {
    console.error("admin notify failed", error);
  }
}

/** Счётчики-бейджи для сайдбара админки: всё, что ждёт разбора. */
export async function adminBadgeCounts(): Promise<Record<string, number>> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [feedback, reports, failedImports, errors] = await Promise.all([
    prisma.feedback.count({ where: { status: "NEW" } }),
    prisma.report.count({ where: { status: "NEW" } }),
    prisma.importRun.count({ where: { status: "FAILED" } }),
    prisma.errorLog.count({ where: { createdAt: { gte: dayAgo } } }),
  ]);
  return {
    "/admin/feedback": feedback,
    "/admin/moderation": reports,
    "/admin/imports": failedImports,
    "/admin/errors": errors,
  };
}
