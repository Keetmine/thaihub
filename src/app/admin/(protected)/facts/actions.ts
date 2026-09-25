"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { applyFactsReview } from "@/lib/factsReview";

// Раздел «Факты на проверку» — только для админа (просьба владельца
// 2026-09-26: «разреши только мне руками править»). Разбор только
// руками: владелец собирает таблицу и применяет её как есть.

export async function applyFacts(
  id: string,
  rows: { en: string; ru: string }[],
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const clean = rows
    .map((r) => ({ en: r.en.replace(/\s+/g, " ").trim(), ru: r.ru.replace(/\s+/g, " ").trim() }))
    .filter((r) => r.en || r.ru);
  // Перевод не обязателен (правка владельца 2026-09-26): пустая строка
  // держит выравнивание списков по номеру, а на русской странице такой
  // факт просто не показывается (translatedList отбрасывает пустые).
  const noEn = clean.findIndex((r) => !r.en && r.ru);
  if (noEn >= 0) return { ok: false, error: `У факта №${noEn + 1} есть перевод, но нет английского` };
  try {
    await applyFactsReview(id, clean.map((r) => r.en), clean.map((r) => r.ru));
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
