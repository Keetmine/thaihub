import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

/**
 * Очередь фактов на проверку (/admin/facts): записи PENDING → пачки
 * для модели. Промпт — scripts/prompts/facts-review.md. Результат
 * загружает scripts/facts-review-import.ts.
 *
 *   npx tsx -r dotenv/config scripts/facts-review-export.ts [--limit N]
 * Пачки — tmp/facts-review/batches/*.json, по 12 записей.
 */
const BATCH = 12;
const argv = process.argv.slice(2);
const li = argv.indexOf("--limit");
const LIMIT = li >= 0 ? Number(argv[li + 1]) : undefined;

async function main() {
  const rows = await prisma.factsReview.findMany({
    where: { status: "PENDING" },
    include: { performer: { select: { name: true, realName: true, trivia: true, translations: true } } },
    orderBy: { createdAt: "asc" },
    take: LIMIT,
  });
  mkdirSync("tmp/facts-review/batches", { recursive: true });
  mkdirSync("tmp/facts-review/out", { recursive: true });
  let n = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    n++;
    const items = rows.slice(i, i + BATCH).map((r) => ({
      id: r.id,
      name: r.performer.name,
      realName: r.performer.realName,
      ourEn: r.performer.trivia,
      ourRu: ((r.performer.translations as { ru?: { trivia?: string[] } } | null)?.ru?.trivia ?? []) as string[],
      incoming: r.incoming,
    }));
    writeFileSync(`tmp/facts-review/batches/f${String(n).padStart(3, "0")}.json`, JSON.stringify({ items }, null, 1));
  }
  console.log(`записей PENDING: ${rows.length} → пачек ${n} в tmp/facts-review/batches/`);
}
main().finally(() => prisma.$disconnect());
