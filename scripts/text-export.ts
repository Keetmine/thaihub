import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Выгрузка пачки записей под уникализацию текстов (просьба владельца
 * 2026-09-23: «переписать все тексты, что у нас есть для сериалов и
 * актёров, добавить переводы — задача именно уникализировать»).
 *
 * Конвейер намеренно из ТРЁХ шагов, а не одного:
 *   1. этот скрипт кладёт в JSON всё, что нужно для текста (факты — и
 *      ничего кроме фактов: выдумывать про живых людей нельзя);
 *   2. текст пишется отдельно (подагенты дешёвой моделью — см.
 *      docs/features/text-rewrite.md);
 *   3. scripts/text-import.ts кладёт результат в базу, сохранив оригинал
 *      в TextRewrite.
 * Так прогон обрывается и продолжается где угодно, а на прод уезжает
 * файл, который можно прочитать глазами.
 *
 * Запуск:
 *   npx tsx -r dotenv/config scripts/text-export.ts --kind drama --limit 20 --out tmp/d.json
 *
 * Виды (`--kind`):
 *   drama-ru  — ТОЛЬКО русское описание сериала (решение владельца
 *               2026-09-23: «пока сделаем только переводы сериалов»).
 *               Выгрузка урезана до необходимого: без тегов и каста —
 *               замер пилота показал, что они и стоят дорого, и вредят
 *               (модель достраивала по тегам сюжет, которого в исходнике
 *               нет: «притворяется парнем» из тега Fake Relationship).
 *   drama     — описание сериала: и английское, и русское сразу
 *   performer — биография артиста: английская и русская
 *
 * Уже переписанное (есть строка в TextRewrite) пропускается — прогон
 * идемпотентен и продолжается с того места, где остановился.
 */

type Args = { kind: string; limit: number; out: string; offset: number; onlyMissing: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string, fallback?: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    kind: get("kind", "drama")!,
    limit: Number(get("limit", "20")),
    offset: Number(get("offset", "0")),
    out: get("out", "tmp/texts.json")!,
    // Только те, у кого текста НЕТ вовсе (а не «переписать имеющийся»).
    onlyMissing: argv.includes("--only-missing"),
  };
}

/** Что уже переписано — чтобы не платить за одно и то же дважды. */
async function doneIds(entity: string): Promise<Set<string>> {
  const rows = await prisma.textRewrite.findMany({
    where: { entity },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  return new Set(rows.map((r) => r.entityId));
}

async function exportDramas(args: Args) {
  const done = await doneIds("drama");
  const rows = await prisma.drama.findMany({
    where: args.onlyMissing ? { synopsisRu: null } : {},
    select: {
      id: true,
      title: true,
      titleRu: true,
      nativeTitle: true,
      year: true,
      type: true,
      country: true,
      genres: true,
      tags: true,
      episodes: true,
      status: true,
      network: true,
      synopsis: true,
      synopsisRu: true,
      // Актёры дают тексту опору: «в главных ролях X и Y» — это факт из
      // базы, а не догадка модели.
      performers: {
        select: { performer: { select: { name: true } }, role: true },
        take: 4,
      },
    },
    orderBy: { id: "asc" },
    skip: args.offset,
    take: args.limit + done.size,
  });
  const items = rows
    .filter((d) => !done.has(d.id))
    .slice(0, args.limit)
    .map((d) => ({
      id: d.id,
      title: d.title,
      titleRu: d.titleRu,
      nativeTitle: d.nativeTitle,
      year: d.year,
      type: d.type,
      country: d.country,
      genres: d.genres,
      tags: d.tags.slice(0, 8),
      episodes: d.episodes,
      status: d.status,
      network: d.network,
      cast: d.performers.map((p) =>
        p.role ? `${p.performer.name} — ${p.role}` : p.performer.name,
      ),
      synopsis: d.synopsis,
      synopsisRu: d.synopsisRu,
    }));
  return { kind: "drama", items };
}

/**
 * Только русское описание. Отдаём минимум фактов: английский синопсис —
 * источник сюжета, остальное (год, страна, тип, жанры, число серий) —
 * рамка. Ни тегов, ни каста: пилот показал, что по ним модель
 * дописывает сюжет от себя.
 *
 * `targetChars` — сколько знаков ждём. У кого русский текст уже есть,
 * целимся в его длину (уникализация не должна обеднять страницу: наши
 * русские описания в среднем 1970 знаков против 460 у английских);
 * у кого нет — считаем от английского с запасом, но не меньше 700.
 */
async function exportDramaRu(args: Args) {
  const done = await doneIds("drama");
  const rows = await prisma.drama.findMany({
    // Без английского синопсиса писать не из чего: 76 таких записей
    // ждут, пока у них появится хоть какой-то источник.
    where: { synopsis: { not: null }, ...(args.onlyMissing ? { synopsisRu: null } : {}) },
    select: {
      id: true,
      title: true,
      titleRu: true,
      year: true,
      type: true,
      country: true,
      genres: true,
      episodes: true,
      synopsis: true,
      synopsisRu: true,
    },
    orderBy: { id: "asc" },
    skip: args.offset,
    take: args.limit + done.size,
  });
  const items = rows
    .filter((d) => !done.has(d.id))
    .slice(0, args.limit)
    .map((d) => ({
      id: d.id,
      title: d.title,
      titleRu: d.titleRu,
      year: d.year,
      type: d.type,
      country: d.country,
      genres: d.genres.slice(0, 3),
      episodes: d.episodes,
      synopsis: d.synopsis,
      synopsisRu: d.synopsisRu,
      targetChars: d.synopsisRu
        ? Math.round(d.synopsisRu.length / 100) * 100
        : Math.max(700, Math.round(((d.synopsis?.length ?? 500) * 1.6) / 100) * 100),
    }));
  return { kind: "drama-ru", items };
}

async function exportPerformers(args: Args) {
  const done = await doneIds("performer");
  const rows = await prisma.performer.findMany({
    where: args.onlyMissing ? { bio: null } : { NOT: { bio: null } },
    select: {
      id: true,
      name: true,
      realName: true,
      alsoKnownAs: true,
      type: true,
      birthDate: true,
      placeOfBirth: true,
      nationality: true,
      occupation: true,
      trivia: true,
      bio: true,
      translations: true,
      agencies: { select: { agency: { select: { name: true } } }, take: 2 },
      dramas: {
        select: { drama: { select: { title: true, year: true } }, role: true },
        take: 6,
      },
    },
    orderBy: { id: "asc" },
    skip: args.offset,
    take: args.limit + done.size,
  });
  const items = rows
    .filter((p) => !done.has(p.id))
    .slice(0, args.limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      realName: p.realName,
      alsoKnownAs: p.alsoKnownAs,
      type: p.type,
      birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : null,
      placeOfBirth: p.placeOfBirth,
      nationality: p.nationality,
      occupation: p.occupation,
      trivia: p.trivia.slice(0, 6),
      agencies: p.agencies.map((a) => a.agency.name),
      roles: p.dramas.map((d) =>
        `${d.drama.title}${d.drama.year ? ` (${d.drama.year})` : ""}${
          d.role ? ` — ${d.role}` : ""
        }`,
      ),
      bio: p.bio,
      bioRu: (p.translations as { ru?: { bio?: string } } | null)?.ru?.bio ?? null,
    }));
  return { kind: "performer", items };
}

async function main() {
  const args = parseArgs();
  const data =
    args.kind === "performer"
      ? await exportPerformers(args)
      : args.kind === "drama-ru"
        ? await exportDramaRu(args)
        : await exportDramas(args);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(data, null, 1));
  console.log(`${args.out}: ${data.items.length} записей (${data.kind})`);
}

main().finally(() => prisma.$disconnect());
