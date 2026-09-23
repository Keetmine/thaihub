import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Выгрузка переписанных текстов ДЛЯ ПЕРЕНОСА НА ПРОД — последний шаг
 * конвейера (см. docs/features/text-rewrite.md).
 *
 * Тексты пишутся на локальной копии прод-базы, а на сервер едут файлом:
 * локальную базу на прод не льют никогда (см. docs/deploy.md), да и
 * прогон длится часами — за это время на проде успевают появиться новые
 * отметки просмотра, поездки и заявки, и заливка дампа их стёрла бы.
 *
 * Файл — тот же формат, что понимает text-import.ts, поэтому на проде
 * применяется тем же скриптом, с теми же проверками и с сохранением
 * прод-оригинала в TextRewrite (а значит, и с возможностью отката).
 * Идентификаторы совпадают: база на ноутбуке — копия прод-базы.
 *
 *   npx tsx -r dotenv/config scripts/text-dump.ts --field synopsisRu --out tmp/to-prod.json
 *   # на сервере:
 *   docker compose cp to-prod.json app:/tmp/to-prod.json
 *   docker compose exec app npx tsx scripts/text-import.ts /tmp/to-prod.json --apply
 */
const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

async function main() {
  const field = arg("field", "synopsisRu");
  const entity = field === "bio" || field === "bioRu" ? "performer" : "drama";
  const out = arg("out", `tmp/to-prod-${field}.json`);

  const rows = await prisma.textRewrite.findMany({
    where: { entity, field },
    select: { entityId: true, rewritten: true },
    orderBy: { entityId: "asc" },
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        kind: entity === "performer" ? "performer" : "drama-ru",
        model: "haiku-4.5",
        items: rows.map((r) => ({ id: r.entityId, [field]: r.rewritten })),
      },
      null,
      1,
    ),
  );
  console.log(`${out}: ${rows.length} текстов (${entity}.${field})`);
}

main().finally(() => prisma.$disconnect());
