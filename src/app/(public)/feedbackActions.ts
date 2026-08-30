"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { assertRateLimit } from "@/lib/rateLimit";
import { notifyAdmins } from "@/lib/adminNotify";
import { getT } from "@/lib/i18n";
import type { FeedbackKind } from "@/generated/prisma/client";

const KINDS = new Set(["QUESTION", "SUGGESTION", "CONTENT_REQUEST"]);

/**
 * Обращение из формы помощи/поиска: вопрос, предложение или запрос на
 * добавление сериала/актёра. Сохраняется в Feedback и выводится в
 * /admin/feedback, плюс уходит админам в Telegram (см.
 * docs/features/admin-notifications.md). TODO: дублировать на почту,
 * когда будут SMTP-доступы.
 */
export type FeedbackResult = { ok: true } | { ok: false; error: string };

export async function submitFeedback(formData: FormData): Promise<FeedbackResult> {
  // Форма открыта и анонимам (страница /help публичная) — тогда ответ
  // возможен только на оставленную почту.
  const user = await getCurrentUser();
  const { t } = await getT();
  await assertRateLimit("signup"); // тот же лимит 10/10мин против спама

  const text = String(formData.get("text") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "QUESTION");
  const context = String(formData.get("context") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().slice(0, 320) || null;
  // Ошибки возвращаем значением: текст исключения из server action до
  // клиента в проде не доезжает (см. promoActions.ts).
  if (!text) return { ok: false, error: t.widgets.feedback.errorEmpty };
  if (text.length > 4000) return { ok: false, error: t.widgets.feedback.errorTooLong };
  if (!user && !email) return { ok: false, error: t.widgets.feedback.errorEmail };

  await prisma.feedback.create({
    data: {
      userId: user?.id ?? null,
      email,
      kind: (KINDS.has(kindRaw) ? kindRaw : "QUESTION") as FeedbackKind,
      text,
      context: context || null,
    },
  });

  const from = user?.name ?? user?.email ?? email ?? "аноним";
  await notifyAdmins(
    "feedback",
    `📨 Новое обращение от ${from}\n\n${text.slice(0, 500)}${text.length > 500 ? "…" : ""}`,
  );
  return { ok: true };
}

/** Жалоба на пользовательский контент — очередь в /admin/moderation. */
export async function submitReport(
  targetType: string,
  targetId: string,
  reason: string,
): Promise<FeedbackResult> {
  const user = await getCurrentUser();
  const { t } = await getT();
  // Ошибки — значением, как в submitFeedback: текст исключения из
  // server action в проде до клиента не доезжает.
  if (!user) return { ok: false, error: t.widgets.promo.signInRequired };
  await assertRateLimit("signup");

  // Только известные типы: targetType приходит с клиента, и произвольная
  // строка засоряла бы очередь модерации нерезолвящимися записями.
  const KNOWN_TARGETS = ["placeList", "profile", "eventNote", "comment", "review"];
  if (!KNOWN_TARGETS.includes(targetType)) {
    return { ok: false, error: t.widgets.report.unknownType };
  }

  await prisma.report.create({
    data: {
      reporterId: user.id,
      targetType,
      targetId,
      reason: reason.trim() || null,
    },
  });

  await notifyAdmins(
    "report",
    `🚩 Жалоба на ${targetType} от ${user.name ?? user.email ?? user.id}` +
      (reason.trim() ? `\n\n${reason.trim().slice(0, 500)}` : ""),
  );
  return { ok: true };
}
