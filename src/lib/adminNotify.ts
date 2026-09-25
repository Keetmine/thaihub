import { pendingDuplicateCount } from "@/lib/duplicates";
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

export type AdminNotifyKind =
  | "feedback"
  | "report"
  | "import"
  | "error"
  | "payment"
  | "signup"
  // Кто-то завёл сообщество. Повод отдельный от «signup»: сообщество —
  // это чужой контент на нашем домене, и узнавать о новом владелица
  // должна сразу, а не при следующем заходе в админку.
  | "community";

/** Ключ настройки, которым канал отключается из /admin/settings. */
export const ADMIN_NOTIFY_SETTING = "admin_notify_kinds";
/** Почта, на которую дублируются те же уведомления (пусто — не слать). */
export const ADMIN_NOTIFY_EMAIL_SETTING = "admin_notify_email";

/** Значение по умолчанию: включено всё, кроме ошибок — их поток шумный,
 *  а счётчик в сайдбаре и так виден. */
const DEFAULT_KINDS: AdminNotifyKind[] = [
  "feedback",
  "report",
  "import",
  "payment",
  "signup",
  "community",
];

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

/**
 * Экранирование под `parse_mode: "HTML"` бота. Нужно там, где в текст
 * попадает ПОЛЬЗОВАТЕЛЬСКАЯ строка: название сообщества вида
 * «Лакорны <3» иначе не просто отвалится — Telegram отклонит всё
 * сообщение целиком, и уведомление молча не придёт.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const APP_URL = process.env.APP_URL ?? "https://myblhub.com";

/**
 * «Завели сообщество». Сообщества — чужой контент на нашем домене, и
 * владелица сайта отвечает за него перед всеми: закрытое сообщество не
 * видно ни в витрине, ни в поиске, поэтому единственный способ узнать о
 * нём вовремя — это сообщение в Telegram (решение владельца: до выкладки
 * сообществ на прод админка должна знать о них всё).
 *
 * В тексте ровно то, по чему принимается решение «идти смотреть или
 * нет»: название, кто завёл, видимость и прямая ссылка на страницу.
 *
 * Ничего не ждём и не бросаем — как у регистрации: создание сообщества
 * не должно ни тормозить из-за похода в Telegram, ни падать, если бот
 * недоступен.
 */
export function notifyAdminsAboutCommunity(community: {
  id: string;
  slug: string | null;
  title: string;
  visibility: "PUBLIC" | "PRIVATE";
  owner: { name: string | null; email: string | null };
}): void {
  const who = community.owner.name?.trim() || community.owner.email || "без имени";
  const visibility = community.visibility === "PRIVATE" ? "закрытое" : "открытое";
  const href = `${APP_URL}/communities/${community.slug ?? community.id}`;
  void notifyAdmins(
    "community",
    `👥 Новое сообщество (${visibility})\n\n` +
      `<b>${escapeHtml(community.title)}</b>\n` +
      `создал: ${escapeHtml(who)}\n` +
      href,
    // Дедуп по сообществу: повторов быть не должно, но двойная отправка
    // экшена не должна превращаться в два одинаковых сообщения.
    { dedupKey: community.id },
  );
}

/** Счётчики-бейджи для сайдбара админки: всё, что ждёт разбора. */
export async function adminBadgeCounts(): Promise<Record<string, number>> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [feedback, reports, failedImports, mdlRequests, eventDrafts, mascotDrafts, errors, facts, duplicates] = await Promise.all([
    prisma.feedback.count({ where: { status: "NEW" } }),
    prisma.report.count({ where: { status: "NEW" } }),
    // Только неразобранное: у записей есть отметка reviewedAt, иначе
    // счётчик горел бы вечно и его переставали замечать.
    prisma.importRun.count({ where: { status: "FAILED", reviewedAt: null } }),
    // Заявки «добавьте сериал» из пользовательского импорта списка MDL —
    // открытые (не резолвнутые и не отклонённые). Живут на той же
    // странице импортов, поэтому складываются в её бейдж с упавшими
    // запусками: и то и другое — «в импортах что-то ждёт разбора».
    prisma.mdlDramaRequest.count({ where: { resolvedAt: null, rejectedAt: null } }),
    // Черновики событий из краулера афиши TTM (вкладка «События» там
    // же) — ждут «Одобрить»/«Отклонить» владельца.
    prisma.eventDraft.count({ where: { status: "PENDING" } }),
    // Черновики маскотов из недельного обхода вики GMMTV (вкладка
    // «Маскоты» там же) — тоже ждут «Одобрить»/«Отклонить» владельца.
    prisma.mascotDraft.count({ where: { status: "PENDING" } }),
    prisma.errorLog.count({ where: { createdAt: { gte: dayAgo }, reviewedAt: null } }),
    // Факты на проверку (/admin/facts), ждут разбора владельцем.
    prisma.factsReview.count({ where: { status: "PENDING" } }),
    // Дубли — через кеш на 15 минут: подсчёт проходит весь каталог.
    pendingDuplicateCount().catch(() => 0),
  ]);
  return {
    "/admin/feedback": feedback,
    "/admin/moderation": reports,
    "/admin/imports": failedImports + mdlRequests + eventDrafts + mascotDrafts,
    "/admin/errors": errors,
    "/admin/facts": facts,
    "/admin/duplicates": duplicates,
  };
}
