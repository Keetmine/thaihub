import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { getSetting } from "@/lib/siteSettings";
import { isMailerConfigured, sendMail } from "@/lib/mailer";

// Уведомления админам о том, что требует реакции: обращение, жалоба,
// упавший импорт, серверная ошибка, оплата. Без них об очереди узнаёшь,
// только зайдя в админку (см. docs/features/admin-notifications.md).
// Каналы: Telegram (бот уже есть, у админов есть telegramId) и почта —
// письмо уходит, только если настроен SMTP и задан адрес получателя,
// иначе канал молча пропускается.

export type AdminNotifyKind = "feedback" | "report" | "import" | "error" | "payment" | "signup";

/** Ключ настройки, которым канал отключается из /admin/settings. */
export const ADMIN_NOTIFY_SETTING = "admin_notify_kinds";
/** Почта, на которую дублируются те же уведомления (пусто — не слать). */
export const ADMIN_NOTIFY_EMAIL_SETTING = "admin_notify_email";

/** Значение по умолчанию: включено всё, кроме ошибок — их поток шумный,
 *  а счётчик в сайдбаре и так виден. */
const DEFAULT_KINDS: AdminNotifyKind[] = ["feedback", "report", "import", "payment", "signup"];

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

    // Почтовый дубль — то же сообщение, первой строкой в теме.
    const mailTo = (await getSetting(ADMIN_NOTIFY_EMAIL_SETTING))?.trim();
    if (mailTo && isMailerConfigured()) {
      const subject = text.split("\n")[0].slice(0, 120);
      await sendMail(mailTo, `MyBLHub: ${subject}`, text).catch((e) =>
        console.error("admin notify mail failed", e),
      );
    }
  } catch (error) {
    console.error("admin notify failed", error);
  }
}

/** Каким способом человек завёл аккаунт — для строки «через …». */
export type SignupVia = "email" | "google" | "telegram";

const SIGNUP_VIA_LABEL: Record<SignupVia, string> = {
  email: "почту",
  google: "Google",
  telegram: "Telegram",
};

/**
 * «У нас новый человек». Зовётся из всех трёх путей регистрации, формат
 * сообщения держим здесь, чтобы он не разъехался по местам вызова.
 *
 * Ничего не ждём и не бросаем: регистрация не должна ни тормозить из-за
 * похода в Telegram, ни падать, если бот недоступен, — notifyAdmins
 * внутри себя уже всё глотает, а вызывающему остаётся не ждать промис.
 *
 * Идентификатор в тексте — то, по чему человека реально найти в
 * /admin/users: имя, если назвался, иначе почта или телеграм-ник.
 */
export function notifyAdminsAboutSignup(user: {
  id: string;
  name: string | null;
  email: string | null;
  telegramUsername: string | null;
}, via: SignupVia): void {
  const who =
    user.name?.trim() ||
    user.email ||
    (user.telegramUsername ? `@${user.telegramUsername}` : null) ||
    "без имени";
  void notifyAdmins(
    "signup",
    `🙋 Новая регистрация через ${SIGNUP_VIA_LABEL[via]}\n\n${who}`,
    // Дедуп по пользователю: повторов быть не должно, но если
    // обработчик вдруг выполнится дважды, второе сообщение не уйдёт.
    { dedupKey: user.id },
  );
}

/** Счётчики-бейджи для сайдбара админки: всё, что ждёт разбора. */
export async function adminBadgeCounts(): Promise<Record<string, number>> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [feedback, reports, failedImports, errors] = await Promise.all([
    prisma.feedback.count({ where: { status: "NEW" } }),
    prisma.report.count({ where: { status: "NEW" } }),
    // Только неразобранное: у записей есть отметка reviewedAt, иначе
    // счётчик горел бы вечно и его переставали замечать.
    prisma.importRun.count({ where: { status: "FAILED", reviewedAt: null } }),
    prisma.errorLog.count({ where: { createdAt: { gte: dayAgo }, reviewedAt: null } }),
  ]);
  return {
    "/admin/feedback": feedback,
    "/admin/moderation": reports,
    "/admin/imports": failedImports,
    "/admin/errors": errors,
  };
}
