import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Режет выгрузку на пачки под отдельных исполнителей — шаг между
 * text-export.ts и текстами. Размер пачки подобран замером (2026-09-23):
 * накладные расходы агента (системный промпт, инструменты) — величина
 * постоянная, и на пачке из 30 записей они уже не доминируют, а контекст
 * ещё не раздут настолько, чтобы каждый ход стоил дорого.
 *
 *   npx tsx scripts/text-split.ts tmp/ru-all.json tmp/batches 30
 */
const [, , file, outDir, sizeArg] = process.argv;
const size = Number(sizeArg ?? 30);
const data = JSON.parse(readFileSync(file, "utf8")) as { kind: string; items: unknown[] };
mkdirSync(outDir, { recursive: true });

const pad = String(Math.ceil(data.items.length / size)).length;
let n = 0;
for (let i = 0; i < data.items.length; i += size) {
  n += 1;
  const name = `${String(n).padStart(pad, "0")}.json`;
  writeFileSync(
    join(outDir, name),
    JSON.stringify({ kind: data.kind, items: data.items.slice(i, i + size) }, null, 1),
  );
}
console.log(`${data.items.length} записей → ${n} пачек по ${size} в ${outDir}`);
