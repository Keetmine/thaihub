import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

/**
 * Загрузка переписанных текстов обратно в базу — шаг 3 конвейера
 * (шаг 1 — scripts/text-export.ts, шаг 2 — сами тексты).
 *
 * Правила, из-за которых это отдельный скрипт, а не «запись по ходу»:
 *  - **оригинал сохраняется всегда** (TextRewrite.original), и откат —
 *    это запись его обратно (`--rollback`). Переписывание текста у
 *    пяти тысяч записей должно быть обратимым целиком;
 *  - **уже переписанное не трогаем**: строка в TextRewrite — отметка
 *    «наш текст», повторный прогон её пропускает (`--force`, если
 *    перегенерируем партию осознанно);
 *  - **проверки на входе**: пустой текст, текст короче оригинала вдвое
 *    и текст, дословно равный оригиналу, не записываются. Это ловит
 *    подагента, который «переписал» копипастой или обрезал текст;
 *  - **русский — в свою колонку**: у сериала это `synopsisRu`, у
 *    артиста — json `translations.ru.bio` (см. lib/entityTranslations.ts).
 *
 * Формат файла — тот же JSON, что отдавал экспорт, плюс поля с текстом:
 *   { "kind": "drama", "model": "haiku-4.5",
 *     "items": [{ "id": "...", "synopsis": "...", "synopsisRu": "..." }] }
 *
 * Запуск:
 *   npx tsx -r dotenv/config scripts/text-import.ts tmp/d.done.json
 *   npx tsx -r dotenv/config scripts/text-import.ts tmp/d.done.json --apply
 *   npx tsx -r dotenv/config scripts/text-import.ts --rollback drama
 * Без --apply это сухой прогон: печатает, что сделал бы.
 */

type DramaItem = { id: string; synopsis?: string | null; synopsisRu?: string | null };
type PerformerItem = { id: string; bio?: string | null; bioRu?: string | null };

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const FORCE = argv.includes("--force");
const file = argv.find((a) => !a.startsWith("--"));

/** Текст явно не годится — не пишем и говорим почему. */
function reject(next: string | null | undefined, original: string | null): string | null {
  if (!next || !next.trim()) return "пустой текст";
  const text = next.trim();
  if (original && text === original.trim()) return "дословно равен оригиналу";
  if (original && text.length < original.trim().length / 2) return "вдвое короче оригинала";
  if (text.length < 40) return "слишком короткий (меньше 40 знаков)";
  // Модель иногда отвечает рассуждением вместо текста — ловим по самым
  // частым зачинам, чтобы такое не уехало на витрину.
  if (/^(вот|here('| i)s|переписанн|rewritten|описание:)/i.test(text)) return "похоже на ответ модели, а не на текст";
  return null;
}

async function importDramas(items: DramaItem[], model: string) {
  let written = 0;
  const skipped: string[] = [];
  for (const item of items) {
    const drama = await prisma.drama.findUnique({
      where: { id: item.id },
      select: { id: true, title: true, synopsis: true, synopsisRu: true },
    });
    if (!drama) {
      skipped.push(`${item.id}: нет в базе`);
      continue;
    }
    for (const [field, next, original] of [
      ["synopsis", item.synopsis, drama.synopsis],
      ["synopsisRu", item.synopsisRu, drama.synopsisRu],
    ] as const) {
      if (next === undefined) continue;
      const bad = reject(next, original);
      if (bad) {
        skipped.push(`${drama.title} · ${field}: ${bad}`);
        continue;
      }
      const already = await prisma.textRewrite.findUnique({
        where: { entity_entityId_field: { entity: "drama", entityId: drama.id, field } },
      });
      if (already && !FORCE) {
        skipped.push(`${drama.title} · ${field}: уже переписано`);
        continue;
      }
      const text = next!.trim();
      if (APPLY) {
        await prisma.drama.update({ where: { id: drama.id }, data: { [field]: text } });
        await prisma.textRewrite.upsert({
          where: { entity_entityId_field: { entity: "drama", entityId: drama.id, field } },
          // Оригинал пишем только при ПЕРВОЙ правке: при перегенерации
          // (--force) «оригиналом» должен остаться текст источника, а не
          // наш прошлый вариант — иначе откат вернул бы нас же.
          create: { entity: "drama", entityId: drama.id, field, original, rewritten: text, model },
          update: { rewritten: text, model },
        });
      }
      written += 1;
    }
  }
  return { written, skipped };
}

async function importPerformers(items: PerformerItem[], model: string) {
  let written = 0;
  const skipped: string[] = [];
  for (const item of items) {
    const p = await prisma.performer.findUnique({
      where: { id: item.id },
      select: { id: true, name: true, bio: true, translations: true },
    });
    if (!p) {
      skipped.push(`${item.id}: нет в базе`);
      continue;
    }
    const translations = (p.translations as Record<string, Record<string, string>> | null) ?? {};
    const currentRu = translations.ru?.bio ?? null;

    for (const [field, next, original] of [
      ["bio", item.bio, p.bio],
      ["bioRu", item.bioRu, currentRu],
    ] as const) {
      if (next === undefined) continue;
      const bad = reject(next, original);
      if (bad) {
        skipped.push(`${p.name} · ${field}: ${bad}`);
        continue;
      }
      const already = await prisma.textRewrite.findUnique({
        where: { entity_entityId_field: { entity: "performer", entityId: p.id, field } },
      });
      if (already && !FORCE) {
        skipped.push(`${p.name} · ${field}: уже переписано`);
        continue;
      }
      const text = next!.trim();
      if (APPLY) {
        if (field === "bio") {
          await prisma.performer.update({ where: { id: p.id }, data: { bio: text } });
        } else {
          // Русский текст живёт в json-колонке переводов — рядом с
          // остальными переводимыми полями артиста, а не своей колонкой
          // (см. lib/entityTranslations.ts).
          await prisma.performer.update({
            where: { id: p.id },
            data: { translations: { ...translations, ru: { ...(translations.ru ?? {}), bio: text } } },
          });
        }
        await prisma.textRewrite.upsert({
          where: { entity_entityId_field: { entity: "performer", entityId: p.id, field } },
          create: { entity: "performer", entityId: p.id, field, original, rewritten: text, model },
          update: { rewritten: text, model },
        });
      }
      written += 1;
    }
  }
  return { written, skipped };
}

/** Откат партии: возвращаем оригиналы и убираем отметки. */
async function rollback(entity: string) {
  const rows = await prisma.textRewrite.findMany({ where: { entity } });
  console.log(`откат ${entity}: ${rows.length} записей${APPLY ? "" : " (сухой прогон)"}`);
  if (!APPLY) return;
  for (const row of rows) {
    if (entity === "drama") {
      await prisma.drama.update({
        where: { id: row.entityId },
        data: { [row.field]: row.original },
      });
    } else if (row.field === "bio") {
      await prisma.performer.update({ where: { id: row.entityId }, data: { bio: row.original } });
    } else {
      const p = await prisma.performer.findUnique({
        where: { id: row.entityId },
        select: { translations: true },
      });
      const tr = (p?.translations as Record<string, Record<string, string>> | null) ?? {};
      const ru: Record<string, string> = { ...(tr.ru ?? {}) };
      if (row.original) ru.bio = row.original;
      else delete ru.bio;
      await prisma.performer.update({
        where: { id: row.entityId },
        data: { translations: { ...tr, ru } },
      });
    }
  }
  await prisma.textRewrite.deleteMany({ where: { entity } });
  console.log("оригиналы возвращены");
}

async function main() {
  const rollbackIdx = argv.indexOf("--rollback");
  if (rollbackIdx >= 0) return rollback(argv[rollbackIdx + 1] ?? "drama");

  if (!file) throw new Error("укажите файл с текстами (или --rollback drama|performer)");
  const data = JSON.parse(readFileSync(file, "utf8")) as {
    kind: string;
    model?: string;
    items: (DramaItem & PerformerItem)[];
  };
  const model = data.model ?? "unknown";
  const { written, skipped } =
    data.kind === "performer"
      ? await importPerformers(data.items, model)
      : await importDramas(data.items, model);

  console.log(
    `${file}: ${data.items.length} записей · записано текстов ${written}` +
      `${APPLY ? "" : " (сухой прогон, добавьте --apply)"}`,
  );
  if (skipped.length > 0) {
    console.log(`пропущено ${skipped.length}:`);
    for (const s of skipped.slice(0, 20)) console.log("  ·", s);
    if (skipped.length > 20) console.log(`  … и ещё ${skipped.length - 20}`);
  }
}

main().finally(() => prisma.$disconnect());
