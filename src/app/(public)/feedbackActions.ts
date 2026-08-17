"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { assertRateLimit } from "@/lib/rateLimit";
import type { FeedbackKind } from "@/generated/prisma/client";

const KINDS = new Set(["QUESTION", "SUGGESTION", "CONTENT_REQUEST"]);

/**
 * Обращение из формы помощи/поиска: вопрос, предложение или запрос на
 * добавление сериала/актёра. Сохраняется в Feedback и выводится в
 * /admin/feedback. TODO (по просьбе владельца): дублировать обращения
 * на почту, когда будут SMTP-доступы.
 */
export async function submitFeedback(formData: FormData): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Требуется вход");
  await assertRateLimit("signup"); // тот же лимит 10/10мин против спама

  const text = String(formData.get("text") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "QUESTION");
  const context = String(formData.get("context") ?? "").trim();
  if (!text) throw new Error("Напишите текст обращения");
  if (text.length > 4000) throw new Error("Слишком длинный текст");

  await prisma.feedback.create({
    data: {
      userId: user.id,
      kind: (KINDS.has(kindRaw) ? kindRaw : "QUESTION") as FeedbackKind,
      text,
      context: context || null,
    },
  });
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
  return { ok: true };
}
