"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { assertRateLimit } from "@/lib/rateLimit";
import { notifyAdmins } from "@/lib/adminNotify";
import type { FeedbackKind } from "@/generated/prisma/client";

const KINDS = new Set(["QUESTION", "SUGGESTION", "CONTENT_REQUEST"]);

/**
 * Обращение из формы помощи/поиска: вопрос, предложение или запрос на
 * добавление сериала/актёра. Сохраняется в Feedback и выводится в
 * /admin/feedback, плюс уходит админам в Telegram (см.
 * docs/features/admin-notifications.md). TODO: дублировать на почту,
 * когда будут SMTP-доступы.
 */
export async function submitFeedback(formData: FormData): Promise<{ ok: boolean }> {
  // Форма открыта и анонимам (страница /help публичная) — тогда ответ
  // возможен только на оставленную почту.
  const user = await getCurrentUser();
  await assertRateLimit("signup"); // тот же лимит 10/10мин против спама

  const text = String(formData.get("text") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "QUESTION");
  const context = String(formData.get("context") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().slice(0, 320) || null;
  if (!text) throw new Error("Напишите текст обращения");
  if (text.length > 4000) throw new Error("Слишком длинный текст");
  if (!user && !email) throw new Error("Оставьте почту, чтобы мы могли ответить");

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
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Требуется вход");
  await assertRateLimit("signup");

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
