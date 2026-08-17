import "dotenv/config";
import { unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { prisma } from "../src/lib/prisma";

/**
 * Чистка каталога сериалов от не-тайского мусора массовых TMDB-импортов.
 * Удаляется сериал, у которого ОДНОВРЕМЕННО:
 *   1) название японской/китайской письменностью (кана/иероглифы;
 *      хангыль сознательно не трогаем),
 *   2) нет страницы на MyDramaList (после полного mdl-синка
 *      mydramalistUrl null = «не нашёлся»),
 *   3) в касте нет ни одного актёра, привязанного к агентству.
 * ЛИБО это американский сериал: origin_country из TMDB содержит "US"
 * (определение по названию ненадёжно — берём точные данные API).
 *
 * Дополнительные предохранители (не удаляем ни при каком условии):
 * события, локации съёмок (blscene — только тайское), чьи-то статусы
 * просмотра, связи Related Content с оставшимися сериалами не считаем
 * блокером (каскад их удалит вместе с мусором).
 *
 * После сериалов — актёры-сироты: SOLO без единого сериала И без
 * агентств/событий/групп/пейрингов/избранного/маскотов.
 *
 * Вместе с записями удаляются их локальные картинки из public/uploads.
 * Запуск: npx tsx scripts/cleanup-foreign-dramas.ts [--apply]
 */

const CJK = /[぀-ヿㇰ-ㇿ㐀-䶿一-鿿]/;
const THAI = /[฀-๿]/;
const UPLOADS_ROOT = path.join(process.cwd(), "public");

const execFileAsync = promisify(execFile);

// Через curl, а не fetch: системный DNS отравлен (api.themoviedb.org →
// 127.0.0.1, провайдерская блокировка), curl же резолвит корректно.
async function tmdbOriginCountries(tmdbId: string): Promise<string[] | null> {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s",
      "--max-time",
      "20",
      "-H",
      `Authorization: Bearer ${token}`,
      "-H",
      "accept: application/json",
      `https://api.themoviedb.org/3/tv/${tmdbId}`,
    ]);
    const data = JSON.parse(stdout) as { origin_country?: string[] };
    return data.origin_country ?? [];
  } catch {
    return null;
  }
}

async function deleteLocalImages(urls: (string | null)[]): Promise<number> {
  let removed = 0;
  for (const url of urls) {
    if (!url || !url.startsWith("/uploads/")) continue;
    try {
      await unlink(path.join(UPLOADS_ROOT, url));
      removed += 1;
    } catch {
      // файла уже нет — не страшно
    }
  }
  return removed;
}

async function main() {
  const apply = process.argv.includes("--apply");
  // --thai: применить те же три правила и к тайским названиям;
  // --skip-us: не перепроверять origin_country (долгие TMDB-запросы).
  const includeThai = process.argv.includes("--thai");
  const skipUs = process.argv.includes("--skip-us");
  const matchesScript = (t: string) => CJK.test(t) || (includeThai && THAI.test(t));

  const candidates = await prisma.drama.findMany({
    where: { mydramalistUrl: null },
    select: {
      id: true,
      title: true,
      posterUrl: true,
      tmdbId: true,
      _count: { select: { events: true, locations: true, watchStatuses: true } },
      performers: {
        select: { performer: { select: { _count: { select: { agencies: true } } } } },
      },
    },
  });

  const guarded = (d: (typeof candidates)[number]) =>
    d._count.events > 0 || d._count.locations > 0 || d._count.watchStatuses > 0;
  const hasAgencyCast = (d: (typeof candidates)[number]) =>
    d.performers.some((p) => p.performer._count.agencies > 0);

  // 1) японские/китайские названия
  const byScript = candidates.filter(
    (d) => matchesScript(d.title) && !hasAgencyCast(d) && !guarded(d),
  );

  // 2) американские (по TMDB origin_country) — среди оставшихся latin-titled
  const byScriptIds = new Set(byScript.map((d) => d.id));
  const usCheck = skipUs
    ? []
    : candidates.filter(
        (d) => !byScriptIds.has(d.id) && d.tmdbId && !hasAgencyCast(d) && !guarded(d),
      );
  console.log(
    `Кандидаты без MDL: ${candidates.length}; CJK-названия: ${byScript.length}; ` +
      `проверяю origin_country у ${usCheck.length} с tmdbId…`,
  );
  const american: typeof usCheck = [];
  let checked = 0;
  for (const d of usCheck) {
    const countries = await tmdbOriginCountries(d.tmdbId!);
    checked += 1;
    if (checked % 100 === 0) process.stdout.write(`\r  …${checked}/${usCheck.length}`);
    if (countries?.includes("US")) american.push(d);
    await new Promise((r) => setTimeout(r, 60));
  }
  console.log();

  const toDelete = [...byScript, ...american];
  console.log(`\nК удалению: ${toDelete.length} (CJK ${byScript.length} + US ${american.length})`);
  console.log("Примеры CJK:", byScript.slice(0, 5).map((d) => d.title).join(" · "));
  console.log("Примеры US:", american.slice(0, 8).map((d) => d.title).join(" · "));

  const skippedGuard = candidates.filter(
    (d) => matchesScript(d.title) && (hasAgencyCast(d) || guarded(d)),
  ).length;
  console.log(`Пропущено из-за связей/каста с агентствами (CJK): ${skippedGuard}`);

  if (!apply) {
    console.log("\nDry-run. Запусти с --apply, чтобы удалить.");
    return;
  }

  // --- удаляем сериалы + постеры ---
  const dramaIds = toDelete.map((d) => d.id);
  let deletedDramas = 0;
  for (let i = 0; i < dramaIds.length; i += 500) {
    const res = await prisma.drama.deleteMany({ where: { id: { in: dramaIds.slice(i, i + 500) } } });
    deletedDramas += res.count;
    process.stdout.write(`\rСериалов удалено: ${deletedDramas}/${dramaIds.length}`);
  }
  const posterFiles = await deleteLocalImages(toDelete.map((d) => d.posterUrl));
  console.log(`\nПостеров-файлов удалено: ${posterFiles}`);

  // --- актёры-сироты ---
  const orphans = await prisma.performer.findMany({
    where: {
      type: "SOLO",
      dramas: { none: {} },
      agencies: { none: {} },
      events: { none: {} },
      memberOfBands: { none: {} },
      bandMembers: { none: {} },
      pairingsAsA: { none: {} },
      pairingsAsB: { none: {} },
      favoritedBy: { none: {} },
      mascotOwners: { none: {} },
      mascots: { none: {} },
    },
    select: { id: true, photoUrl: true },
  });
  console.log(`Актёров-сирот (без сериалов и любых связей): ${orphans.length}`);
  let deletedPerf = 0;
  for (let i = 0; i < orphans.length; i += 500) {
    const res = await prisma.performer.deleteMany({
      where: { id: { in: orphans.slice(i, i + 500).map((p) => p.id) } },
    });
    deletedPerf += res.count;
    process.stdout.write(`\rАктёров удалено: ${deletedPerf}/${orphans.length}`);
  }
  const photoFiles = await deleteLocalImages(orphans.map((p) => p.photoUrl));
  console.log(`\nФото-файлов удалено: ${photoFiles}`);

  console.log("\nГотово.");
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
