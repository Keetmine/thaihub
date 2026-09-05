import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { logImportRun } from "../src/lib/importRun";
import {
  runMusicFestivalCrawl,
  summarizeMusicFestivalCrawl,
  type MusicFestivalCrawlResult,
} from "../src/lib/musicFestivalCrawl";

/**
 * Разовый импорт ПРОШЕДШИХ фестивалей с musicfestival.in.th
 * (/en/past-festivals) — тот же краулер, что у суточной задачи по
 * будущим (src/lib/musicFestivalCrawl.ts, docs/features/musicfestival-import.md):
 * события заводятся сразу, лайнап целиком, неизвестные артисты —
 * заготовками. Прошедшие они просто по датам: афиша сама кладёт их в архив.
 *
 * Уже известные адреса (Event.sourceUrl) пропускаются — скрипт безопасно
 * перезапускать: второй раз ничего не создаст.
 *
 *   npx tsx scripts/import-musicfestival-past.ts                 # сухой прогон: план
 *   npx tsx scripts/import-musicfestival-past.ts --limit 3       # только первые 3 новых
 *   npx tsx scripts/import-musicfestival-past.ts --apply         # завести всё
 *
 * На проде: docker compose exec app npx tsx scripts/import-musicfestival-past.ts --apply
 *
 * С --apply прогон пишется в журнал импортов (kind musicfestival-crawl —
 * тот же, что у задачи; виден на её вкладке в /admin/schedule).
 */

const apply = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;

function printPlan(result: MusicFestivalCrawlResult) {
  for (const p of result.plans) {
    const lineupNote =
      p.lineupCount !== null && p.lineupCount !== p.lineup
        ? ` (!! на сайте ${p.lineupCount})`
        : "";
    console.log(
      `${result.apply ? "создано" : "план"}: ${p.title} [${p.dates.join(", ")}] — ${p.venue ?? "площадка ?"}` +
        (p.eventId ? ` → ${p.eventId}` : ""),
    );
    console.log(
      `    состав ${p.lineup}${lineupNote}: совпало ${p.matched.length}` +
        (p.matched.length ? ` (${p.matched.join(", ")})` : "") +
        `, заготовок ${p.toCreate.length}` +
        (p.toCreate.length ? ` (${p.toCreate.join(", ")})` : "") +
        (p.ambiguous.length ? `; тёзки: ${p.ambiguous.join(", ")}` : "") +
        (p.possibleDuplicateOf ? `; похоже на «${p.possibleDuplicateOf}»` : ""),
    );
  }
}

async function main() {
  const log = (line: string) => console.log(line);
  const options = { listing: "past" as const, maxFestivals: limit ?? 1000, apply, log };

  let result: MusicFestivalCrawlResult | null;
  if (apply) {
    result = await logImportRun(
      "musicfestival-crawl",
      (runId) => runMusicFestivalCrawl({ ...options, runId }),
      summarizeMusicFestivalCrawl,
    );
  } else {
    console.log("Сухой прогон: ничего не пишется, страницы читаются. Применить — --apply.");
    result = await runMusicFestivalCrawl(options);
  }
  if (!result) {
    console.log("остановлено вручную");
    return;
  }
  printPlan(result);
  console.log("\n" + summarizeMusicFestivalCrawl(result));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
