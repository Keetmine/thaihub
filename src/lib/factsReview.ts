import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Очередь фактов артистов на проверку (просьба владельца 2026-09-26).
 *
 * Импортёры с фандома не пишут факты в карточку сами: раньше импорт
 * через группу писал их только в пустое и только по-английски, а
 * импорт со страницы артиста перезаписывал целиком (у Onglee так
 * пропали факты, заведённые руками). Теперь они ложатся в FactsReview,
 * а разбор — только руками в /admin/facts: таблица «до / после
 * объединения / перевод», строка на факт.
 */

/** Нормализация для сравнения: регистр, пробелы, конечная точка. */
export function normFact(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[.!…]+$/, "").trim();
}

/**
 * Поставить пришедшие факты в очередь. Факты, которые у нас уже есть
 * дословно, не ставятся; по артисту и источнику держится одна открытая
 * запись — повторный импорт дописывает в неё без повторов.
 */
export async function enqueueFacts(
  performerId: string,
  source: string,
  facts: string[],
  sourceUrl?: string | null,
): Promise<"queued" | "merged" | "nothing"> {
  const clean = facts.map((f) => f.replace(/\s+/g, " ").trim()).filter((f) => f.length >= 5);
  if (clean.length === 0) return "nothing";

  const performer = await prisma.performer.findUnique({
    where: { id: performerId },
    select: { trivia: true },
  });
  const have = new Set((performer?.trivia ?? []).map(normFact));
  const fresh = clean.filter((f) => !have.has(normFact(f)));
  if (fresh.length === 0) return "nothing";

  const open = await prisma.factsReview.findFirst({
    where: { performerId, source, status: "PENDING" },
  });
  if (open) {
    const known = new Set(open.incoming.map(normFact));
    const add = fresh.filter((f) => !known.has(normFact(f)));
    if (add.length === 0) return "nothing";
    await prisma.factsReview.update({
      where: { id: open.id },
      data: { incoming: [...open.incoming, ...add] },
    });
    return "merged";
  }
  await prisma.factsReview.create({
    data: { performerId, source, sourceUrl: sourceUrl ?? null, incoming: fresh },
  });
  return "queued";
}

/** Строка таблицы разбора: наш факт (или null, если он новый), что
 *  будет после объединения и перевод. */
export type FactRow = { original: string | null; en: string; ru: string };

/**
 * Черновик таблицы: сперва наши факты с их переводами (русский список
 * у нас выровнен с английским по номеру строки), потом пришедшие —
 * без перевода и без тех, что у нас уже есть.
 */
export function buildFactRows(ourEn: string[], ourRu: string[], incoming: string[]): FactRow[] {
  const have = new Set(ourEn.map(normFact));
  const rows: FactRow[] = ourEn.map((en, i) => ({ original: en, en, ru: ourRu[i] ?? "" }));
  for (const f of incoming) {
    if (have.has(normFact(f))) continue;
    have.add(normFact(f));
    rows.push({ original: null, en: f, ru: "" });
  }
  return rows;
}

/** Применить таблицу: списки — в карточку, прежние — в TextRewrite
 *  (если отметки ещё не было; иначе там уже лежит самый первый
 *  оригинал, и откат должен вести к нему). */
export async function applyFactsReview(id: string, en: string[], ru: string[]): Promise<void> {
  const r = await prisma.factsReview.findUnique({ where: { id } });
  if (!r) throw new Error("Запись не найдена");
  if (r.status !== "PENDING") throw new Error("Запись уже разобрана");
  if (en.length === 0) throw new Error("Список фактов пуст");
  if (en.length !== ru.length) throw new Error("Английский и русский списки не сходятся по числу строк");

  const p = await prisma.performer.findUnique({
    where: { id: r.performerId },
    select: { trivia: true, translations: true },
  });
  if (!p) throw new Error("Артист не найден");
  const tr = (p.translations as Record<string, Record<string, unknown>> | null) ?? {};
  const prevRu = (tr.ru?.trivia as string[] | undefined) ?? [];
  const key = { entity: "performer", entityId: r.performerId, field: "trivia" };

  await prisma.$transaction(async (tx) => {
    const rewritten = JSON.stringify({ en, ru });
    const mark = await tx.textRewrite.findUnique({ where: { entity_entityId_field: key } });
    if (mark) {
      await tx.textRewrite.update({ where: { entity_entityId_field: key }, data: { rewritten, model: "manual" } });
    } else {
      await tx.textRewrite.create({
        data: { ...key, original: JSON.stringify({ en: p.trivia, ru: prevRu }), rewritten, model: "manual" },
      });
    }
    await tx.performer.update({
      where: { id: r.performerId },
      data: {
        trivia: en,
        translations: { ...tr, ru: { ...(tr.ru ?? {}), trivia: ru } } as Prisma.InputJsonValue,
      },
    });
    await tx.factsReview.update({ where: { id }, data: { status: "APPLIED", reviewedAt: new Date() } });
  });
}
