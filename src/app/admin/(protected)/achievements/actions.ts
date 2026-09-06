"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isMetricKey, METRICS } from "@/lib/achievements";
import { logAudit, diffRecords } from "@/lib/audit";

// CRUD определений ачивок (Э2ф). Раздел в группе «Коммьюнити» — только
// админ, без менеджера каталога.

function isUniqueKeyError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function parseAchievementForm(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const hint = String(formData.get("hint") ?? "").trim();
  const metric = String(formData.get("metric") ?? "").trim();
  const enabled = formData.get("enabled") === "on";
  const sort = Math.trunc(Number(formData.get("sort") ?? 0)) || 0;

  if (!key || !/^[a-z0-9-]+$/.test(key)) {
    throw new Error("Ключ обязателен: латиница в нижнем регистре, цифры и дефисы");
  }
  if (!emoji) throw new Error("Укажите эмодзи");
  if (!title) throw new Error("Укажите название");
  if (!hint) throw new Error("Укажите подсказку — как получить ачивку");
  if (!isMetricKey(metric)) throw new Error("Неизвестная метрика");

  // Флаговые метрики («было/не было») порога не имеют — threshold всегда 1.
  const threshold =
    METRICS[metric].kind === "flag"
      ? 1
      : Math.trunc(Number(formData.get("threshold") ?? 0));
  if (!Number.isFinite(threshold) || threshold < 1) {
    throw new Error("Порог должен быть целым числом от 1");
  }

  return { key, emoji, title, hint, metric, threshold, enabled, sort };
}

function revalidateAchievementPages() {
  revalidatePath("/admin/achievements");
  // Кабинет и публичные профили читают набор включённых ачивок.
  revalidatePath("/account");
}

export async function createAchievement(formData: FormData) {
  await requireAdmin();
  const data = parseAchievementForm(formData);

  let achievement;
  try {
    achievement = await prisma.achievement.create({ data });
  } catch (error) {
    if (isUniqueKeyError(error)) {
      throw new Error("Ачивка с таким ключом уже существует");
    }
    throw error;
  }

  await logAudit({
    action: "CREATE",
    entityType: "Achievement",
    entityId: achievement.id,
    entityLabel: `${achievement.emoji} ${achievement.title}`,
  });

  revalidateAchievementPages();
  redirect("/admin/achievements");
}

export async function updateAchievement(id: string, formData: FormData) {
  await requireAdmin();
  const data = parseAchievementForm(formData);

  const before = await prisma.achievement.findUnique({ where: { id } });
  if (!before) throw new Error("Ачивка не найдена");
  // Смена ключа отвязала бы уже выданные UserAchievement (связь по key
  // без FK) — форма шлёт key только для чтения, здесь страхуемся.
  if (data.key !== before.key) {
    throw new Error("Ключ менять нельзя — по нему привязаны уже полученные ачивки");
  }

  await prisma.achievement.update({ where: { id }, data });

  await logAudit({
    action: "UPDATE",
    entityType: "Achievement",
    entityId: id,
    entityLabel: `${data.emoji} ${data.title}`,
    changes: diffRecords(before, data, [
      "emoji",
      "title",
      "hint",
      "metric",
      "threshold",
      "enabled",
      "sort",
    ]),
  });

  revalidateAchievementPages();
  // Правка не закрывает страницу (просьба владельца): назад на
  // свою же форму с отметкой «Сохранено».
  redirect(`/admin/achievements/${id}/edit?saved=1`);
}

/** Быстрый тумблер из списка: enabled=false прячет ачивку отовсюду
 *  (кабинет, профили, подсчёт прогресса), выданные строки не трогая. */
export async function toggleAchievementEnabled(id: string) {
  await requireAdmin();
  const existing = await prisma.achievement.findUnique({ where: { id } });
  if (!existing) throw new Error("Ачивка не найдена");
  await prisma.achievement.update({
    where: { id },
    data: { enabled: !existing.enabled },
  });
  await logAudit({
    action: "UPDATE",
    entityType: "Achievement",
    entityId: id,
    entityLabel: `${existing.emoji} ${existing.title}`,
    changes: diffRecords(existing, { enabled: !existing.enabled }, ["enabled"]),
  });
  revalidateAchievementPages();
}

/** Удаление определения. UserAchievement-строки (факт получения) остаются —
 *  связь по key без FK, бейдж просто перестаёт показываться. */
export async function deleteAchievement(id: string) {
  await requireAdmin();
  const existing = await prisma.achievement.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.achievement.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "Achievement",
    entityId: id,
    entityLabel: `${existing.emoji} ${existing.title}`,
  });
  revalidateAchievementPages();
}

// Массовые действия списка (BulkList). Ачивок нет в общем
// bulkActions.ts — там каталог под менеджером каталога, а этот раздел
// админский, — но в историю пишем так же: одна строка BULK на действие.

/** Короткая сводка для истории: первые пять названий и «ещё N» — как в
 *  общем bulkActions.ts, история читается одинаково везде. */
function summarize(labels: string[]): string {
  const head = labels.slice(0, 5).join(", ");
  return labels.length > 5 ? `${head} и ещё ${labels.length - 5}` : head;
}

export async function bulkDeleteAchievements(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const rows = await prisma.achievement.findMany({
    where: { id: { in: ids } },
    select: { emoji: true, title: true },
  });
  await prisma.achievement.deleteMany({ where: { id: { in: ids } } });

  await logAudit({
    action: "BULK",
    entityType: "Achievement",
    // У массового действия нет одной записи-владельца — id первой строки
    // просто даёт ссылке куда указывать, смысл несёт note.
    entityId: ids[0],
    entityLabel: `${ids.length} ачивок`,
    note: `удалено: ${summarize(rows.map((a) => `${a.emoji} ${a.title}`))}`,
  });
  revalidateAchievementPages();
}

/** Массовый тумблер `enabled` — то же, что точечный, только пачкой.
 *  Уже стоящие в нужном положении не трогаем: иначе «Включить
 *  выбранные» на включённых ачивках писало бы в историю правку,
 *  которой не было. */
export async function bulkSetAchievementsEnabled(
  ids: string[],
  enabled: boolean,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const rows = await prisma.achievement.findMany({
    where: { id: { in: ids }, enabled: !enabled },
    select: { id: true, emoji: true, title: true },
  });
  if (rows.length === 0) return;
  await prisma.achievement.updateMany({
    where: { id: { in: rows.map((a) => a.id) } },
    data: { enabled },
  });

  await logAudit({
    action: "BULK",
    entityType: "Achievement",
    entityId: rows[0].id,
    entityLabel: `${rows.length} ачивок`,
    note: `${enabled ? "включено" : "выключено"}: ${summarize(
      rows.map((a) => `${a.emoji} ${a.title}`),
    )}`,
  });
  revalidateAchievementPages();
}
