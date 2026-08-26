import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Возвращает на место даты, съехавшие на день назад.
 *
 * Откуда взялось. Даты-без-времени в этом проекте хранятся как полночь
 * UTC. Старые импорты разбирали строку вроде «Aug 26, 2001» в поясе
 * сервера — получалась локальная полночь, а в базу уходил её UTC-вид:
 * «Aug 25, 21:00». Календарное число при этом теряло день, и всё, что
 * считает «сегодня» по числу из базы, промахивалось: день рождения не
 * показывался в свой день, сериал «выходил» накануне.
 *
 * Разбор давно чинили (`parseMdlDate` берёт `new Date("… UTC")`), так
 * что новых таких записей не появляется — но накопленное осталось.
 *
 * Как чиним. Любое значение, у которого время не полночь, округляем к
 * ближайшей полуночи: вечернее время (20:00–23:59) — вперёд, к
 * следующему дню, утреннее — назад. Направление не гадаем по одному
 * известному поясу: правило работает и для отрицательных смещений,
 * если такие записи когда-нибудь появятся.
 *
 *   npx tsx --env-file=.env scripts/fix-shifted-dates.ts           # показать
 *   npx tsx --env-file=.env scripts/fix-shifted-dates.ts --apply   # починить
 */

const apply = process.argv.includes("--apply");

type Field = {
  table: string;
  column: string;
  /** Чем подписать строку в отчёте: у таблиц разные колонки с именем. */
  label: string;
  save: (id: string, value: Date) => Promise<unknown>;
};

const FIELDS: Field[] = [
  {
    table: "Performer",
    column: "birthDate",
    label: "name",
    save: (id, birthDate) => prisma.performer.update({ where: { id }, data: { birthDate } }),
  },
  {
    table: "Drama",
    column: "airedFrom",
    label: "title",
    save: (id, airedFrom) => prisma.drama.update({ where: { id }, data: { airedFrom } }),
  },
  {
    table: "Drama",
    column: "airedTo",
    label: "title",
    save: (id, airedTo) => prisma.drama.update({ where: { id }, data: { airedTo } }),
  },
  {
    table: "DramaEpisode",
    column: "airDate",
    label: "'серия ' || number",
    save: (id, airDate) => prisma.dramaEpisode.update({ where: { id }, data: { airDate } }),
  },
];

/** Ближайшая полночь UTC: вечер округляется вперёд, утро — назад. */
function toMidnight(d: Date): Date {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const forward = d.getUTCHours() >= 12;
  return new Date(forward ? day + 24 * 60 * 60 * 1000 : day);
}

async function main() {
  let total = 0;

  for (const field of FIELDS) {
    const rows = await prisma.$queryRawUnsafe<{ id: string; value: Date; label: string }[]>(
      `SELECT id, "${field.column}" AS value, ${field.label} AS label
         FROM "${field.table}"
        WHERE "${field.column}" IS NOT NULL
          AND "${field.column}"::time <> '00:00:00'
        ORDER BY 3`,
    );

    if (rows.length === 0) {
      console.log(`${field.table}.${field.column}: чисто`);
      continue;
    }
    console.log(`${field.table}.${field.column}: ${rows.length}`);
    for (const row of rows.slice(0, 3)) {
      const fixed = toMidnight(row.value);
      console.log(
        `  ${row.label.slice(0, 34).padEnd(34)} ${row.value.toISOString().slice(0, 16)} → ${fixed.toISOString().slice(0, 10)}`,
      );
    }
    if (rows.length > 3) console.log(`  … и ещё ${rows.length - 3}`);

    if (apply) {
      for (const row of rows) {
        await field.save(row.id, toMidnight(row.value));
      }
    }
    total += rows.length;
  }

  console.log(`\nВсего ${apply ? "исправлено" : "к исправлению"}: ${total}`);
  if (!apply) console.log("Это черновой прогон — добавьте --apply.");
}

main().finally(() => prisma.$disconnect());
