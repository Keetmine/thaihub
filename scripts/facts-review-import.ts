import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

/**
 * Предложения модели → очередь фактов (/admin/facts). Каждая запись
 * получает proposedEn/proposedRu и снимок наших фактов на этот момент
 * (baseEn/baseRu — «оригинал» в сравнении) и уходит в READY, на решение
 * владельцу. В карточку ничего не пишется — это делает «Применить».
 *
 * Проверки: списки одной длины, наши факты перенесены дословно (иначе
 * сравнение покажет перефразировку как изменение), без «дорамы».
 *
 *   npx tsx -r dotenv/config scripts/facts-review-import.ts
 */
const OUT = "tmp/facts-review/out";
type Item = { id: string; en: string[]; ru: string[] };

async function main() {
  if (!existsSync(OUT)) return console.log("нет результатов");
  const items: Item[] = [];
  for (const f of readdirSync(OUT).filter((n) => n.endsWith(".json"))) {
    try {
      items.push(...(JSON.parse(readFileSync(`${OUT}/${f}`, "utf8")).items ?? []));
    } catch {
      console.log(`  [битый JSON] ${f}`);
    }
  }
  let ok = 0;
  const bad: string[] = [];
  for (const it of items) {
    const r = await prisma.factsReview.findUnique({
      where: { id: it.id },
      include: { performer: { select: { name: true, trivia: true, translations: true } } },
    });
    if (!r || r.status !== "PENDING") continue;
    const ourEn = r.performer.trivia;
    const ourRu = ((r.performer.translations as { ru?: { trivia?: string[] } } | null)?.ru?.trivia ?? []) as string[];
    const why =
      !Array.isArray(it.en) || !Array.isArray(it.ru) ? "нет списков"
      : it.en.length !== it.ru.length ? `en ${it.en.length} ≠ ru ${it.ru.length}`
      : ourEn.some((f, i) => it.en[i] !== f) ? "наши факты переписаны, а должны остаться дословно"
      : it.ru.some((f) => /(?<!кори)дорам/i.test(f)) ? "«дорама» в тексте"
      : null;
    if (why) {
      bad.push(`${r.performer.name}: ${why}`);
      continue;
    }
    await prisma.factsReview.update({
      where: { id: r.id },
      data: {
        proposedEn: it.en,
        proposedRu: it.ru,
        baseEn: ourEn,
        baseRu: ourRu,
        status: "READY",
        model: "haiku-4.5",
        processedAt: new Date(),
      },
    });
    ok++;
  }
  console.log(`готово к решению: ${ok}, не принято ${bad.length}`);
  for (const b of bad) console.log("  ·", b);
}
main().finally(() => prisma.$disconnect());
