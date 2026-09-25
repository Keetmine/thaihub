import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Очередь фактов артистов на проверку (просьба владельца 2026-09-26:
 * «когда парсятся дополнительные факты — открыть в админке, чьи они:
 * оригинал, что после, и перевод, три колонки, как на гитхабе с +»).
 *
 * Жизнь записи FactsReview:
 *  1. **PENDING** — импортёр положил, что пришло (`enqueueFacts`);
 *  2. **READY** — модель предложила слитый английский и русский список
 *     (scripts/facts-review-export.ts → подагент → facts-review-import.ts);
 *  3. **APPLIED** или **REJECTED** — решение владельца в /admin/facts.
 *
 * Почему не сразу в карточку: импорт с фандома писал факты только если
 * их не было, и только по-английски — у артиста с фактами пришедшее
 * пропадало, а без фактов на русской странице висел английский текст.
 */

/** Нормализация для сравнения: регистр, пробелы, конечная точка. */
function normFact(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[.!…]+$/, "").trim();
}

/**
 * Поставить пришедшие факты в очередь. Повторный импорт того же набора
 * записи не плодит: если по артисту и источнику уже есть необработанная
 * или ждущая решения запись — пришедшее дописывается в неё без повторов.
 * Пустое и то, что у нас уже есть дословно, не ставится вовсе.
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
    where: { performerId, source, status: { in: ["PENDING", "READY"] } },
  });
  if (open) {
    const known = new Set(open.incoming.map(normFact));
    const add = fresh.filter((f) => !known.has(normFact(f)));
    if (add.length === 0) return "nothing";
    // Набор изменился — прежнее предложение модели устарело.
    await prisma.factsReview.update({
      where: { id: open.id },
      data: { incoming: [...open.incoming, ...add], status: "PENDING", proposedEn: [], proposedRu: [] },
    });
    return "merged";
  }
  await prisma.factsReview.create({
    data: { performerId, source, sourceUrl: sourceUrl ?? null, incoming: fresh },
  });
  return "queued";
}

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/**
 * Построчное сравнение двух списков фактов — для колонки «после» в
 * стиле гитхаба. Списки не упорядочены по смыслу, поэтому это не
 * diff последовательностей, а сверка множеств с сохранением порядка:
 * строки из `after` идут как есть (оставшиеся — «same», новые — «add»),
 * пропавшие из `before` дописываются в конец как «del».
 */
export function diffFacts(before: string[], after: string[]): DiffLine[] {
  const was = new Set(before.map(normFact));
  const now = new Set(after.map(normFact));
  const lines: DiffLine[] = after.map((text) => ({ kind: was.has(normFact(text)) ? "same" : "add", text }));
  for (const text of before) if (!now.has(normFact(text))) lines.push({ kind: "del", text });
  return lines;
}

/** Применить предложение: списки — в карточку, прежние — в TextRewrite
 *  (если отметки ещё нет; иначе там уже лежит самый первый оригинал, и
 *  откат должен вести к нему). */
export async function applyFactsReview(id: string): Promise<void> {
  const r = await prisma.factsReview.findUnique({ where: { id } });
  if (!r) throw new Error("Запись не найдена");
  if (r.status !== "READY") throw new Error("Предложение ещё не готово или уже решено");
  if (r.proposedEn.length === 0 || r.proposedEn.length !== r.proposedRu.length) {
    throw new Error("Предложение неполное: английский и русский списки не сходятся");
  }
  const p = await prisma.performer.findUnique({
    where: { id: r.performerId },
    select: { trivia: true, translations: true },
  });
  if (!p) throw new Error("Артист не найден");
  const tr = (p.translations as Record<string, Record<string, unknown>> | null) ?? {};
  const prevRu = (tr.ru?.trivia as string[] | undefined) ?? [];

  await prisma.$transaction(async (tx) => {
    const mark = await tx.textRewrite.findUnique({
      where: { entity_entityId_field: { entity: "performer", entityId: r.performerId, field: "trivia" } },
    });
    const rewritten = JSON.stringify({ en: r.proposedEn, ru: r.proposedRu });
    if (mark) {
      await tx.textRewrite.update({
        where: { entity_entityId_field: { entity: "performer", entityId: r.performerId, field: "trivia" } },
        data: { rewritten, model: r.model ?? "unknown" },
      });
    } else {
      await tx.textRewrite.create({
        data: {
          entity: "performer",
          entityId: r.performerId,
          field: "trivia",
          original: JSON.stringify({ en: p.trivia, ru: prevRu }),
          rewritten,
          model: r.model ?? "unknown",
        },
      });
    }
    await tx.performer.update({
      where: { id: r.performerId },
      data: {
        trivia: r.proposedEn,
        translations: { ...tr, ru: { ...(tr.ru ?? {}), trivia: r.proposedRu } } as Prisma.InputJsonValue,
      },
    });
    await tx.factsReview.update({ where: { id }, data: { status: "APPLIED", reviewedAt: new Date() } });
  });
}
