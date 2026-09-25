import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import type { KpPerson } from "./kprofiles-match";
import { kpPersonKey } from "../src/lib/kprofiles";

/**
 * Шаг 3 разового импорта с kprofiles.com: факты → пачки для
 * пересказа и перевода (см. docs/features/kprofiles-import.md).
 *
 * Факты идут через тот же конвейер, что русские описания сериалов
 * (docs/features/text-rewrite.md): пачка JSON → подагент с дешёвой
 * моделью пишет по tmp/PROMPT-facts.md → результат импортируется с
 * проверками. Здесь только сборка пачек.
 *
 * В пачку к фактам с сайта кладутся и НАШИ факты (trivia и русский
 * список из translations), если они у артиста есть: сливать их со
 * своими и убирать повторы — работа модели, ей видно оба списка
 * (просьба владельца: «если общие — совмести, если отличаются —
 * дополни»).
 *
 *   npx tsx -r dotenv/config scripts/kprofiles-export-facts.ts            # все
 *   npx tsx -r dotenv/config scripts/kprofiles-export-facts.ts --limit 20 # проба
 * Кто уже обработан (есть tmp/kprofiles/facts/done/<id>.json), в
 * пачки не попадает — прогон продолжается с места остановки.
 */

const PEOPLE = "tmp/kprofiles/people.json";
const OUT_DIR = "tmp/kprofiles/facts";
const BATCH = 12;

const argv = process.argv.slice(2);
const limitIdx = argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity;


async function main() {
  const people = JSON.parse(readFileSync(PEOPLE, "utf8")) as KpPerson[];
  mkdirSync(`${OUT_DIR}/batches`, { recursive: true });
  mkdirSync(`${OUT_DIR}/done`, { recursive: true });

  // Наши факты у сопоставленных — чтобы модель сливала, а не дублировала.
  const ids = people.map((p) => p.performerId).filter((x): x is string => !!x);
  const ours = new Map(
    (
      await prisma.performer.findMany({
        where: { id: { in: ids } },
        select: { id: true, trivia: true, translations: true },
      })
    ).map((r) => [
      r.id,
      {
        en: r.trivia,
        ru: ((r.translations as { ru?: { trivia?: string[] } } | null)?.ru?.trivia ?? []) as string[],
      },
    ]),
  );

  const { existsSync } = await import("node:fs");
  const todo = people
    .filter((p) => p.facts.length > 0 && p.match !== "ambiguous")
    .filter((p) => !existsSync(`${OUT_DIR}/done/${encodeURIComponent(kpPersonKey(p))}.json`))
    .slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);

  let batchNo = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    batchNo++;
    const items = todo.slice(i, i + BATCH).map((p) => {
      const mine = p.performerId ? ours.get(p.performerId) : undefined;
      return {
        id: kpPersonKey(p),
        name: p.stageName ?? p.birthName,
        realName: p.birthName,
        facts: p.facts,
        ...(mine && mine.en.length ? { existingEn: mine.en } : {}),
        ...(mine && mine.ru.length ? { existingRu: mine.ru } : {}),
      };
    });
    writeFileSync(
      `${OUT_DIR}/batches/b${String(batchNo).padStart(3, "0")}.json`,
      JSON.stringify({ kind: "performer-facts", items }, null, 1),
    );
  }
  const facts = todo.reduce((s, p) => s + p.facts.length, 0);
  const withOurs = todo.filter((p) => p.performerId && (ours.get(p.performerId)?.en.length ?? 0) > 0).length;
  console.log(`людей в работу: ${todo.length} (фактов ${facts}, у ${withOurs} уже есть наши факты) → пачек ${batchNo} по ${BATCH} в ${OUT_DIR}/batches/`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
