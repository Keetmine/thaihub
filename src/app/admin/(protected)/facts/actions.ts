"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { applyFactsReview } from "@/lib/factsReview";

// Раздел «Факты на проверку» — только для админа (просьба владельца
// 2026-09-26: «разреши только мне руками править исходный вариант и
// перевод»). Менеджер каталога сюда не ходит: это правка текстов,
// которые уйдут на витрину на двух языках.

/** Список «по факту на строку» из textarea. */
function lines(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Ручная правка предложения: английский список и перевод. Сохранение
 * переводит запись в READY — применять можно и то, что модель ещё не
 * обрабатывала, если владелец написала всё сама.
 */
export async function saveFactsProposal(
  id: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const en = lines(formData, "en");
  const ru = lines(formData, "ru");
  if (en.length === 0) return { ok: false, error: "Английский список пуст" };
  if (en.length !== ru.length) {
    return {
      ok: false,
      error: `Строк в английском ${en.length}, в переводе ${ru.length}: по строке на факт, в одном порядке`,
    };
  }
  await prisma.factsReview.update({
    where: { id },
    data: { proposedEn: en, proposedRu: ru, status: "READY", model: "manual" },
  });
  revalidatePath(`/admin/facts/${id}`);
  revalidatePath("/admin/facts");
  return { ok: true };
}

export async function applyFacts(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  try {
    await applyFactsReview(id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/admin/facts/${id}`);
  revalidatePath("/admin/facts");
  return { ok: true };
}

export async function rejectFacts(id: string): Promise<void> {
  await requireAdmin();
  await prisma.factsReview.update({ where: { id }, data: { status: "REJECTED", reviewedAt: new Date() } });
  revalidatePath(`/admin/facts/${id}`);
  revalidatePath("/admin/facts");
}
