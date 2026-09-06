import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { logImportRun } from "../src/lib/importRun";
import {
  refreshMusicFestivalEvents,
  type MusicFestivalRefreshResult,
} from "../src/lib/musicFestivalCrawl";

/**
 * Разовый прогон по УЖЕ заведённым событиям musicfestival.in.th: читает
 * их страницы заново и дозаполняет то, чего у старых событий нет —
 * организатора, адрес, ссылку на карту, теги, афиши расписания и состав
 * по дням со временем и сценами (просьба владельца 2026-09-06: события
 * заводились до того, как всё это появилось, и обход их не перечитывает).
 *
 * ТОЛЬКО ДОЗАПОЛНЯЕТ: заполненное поле не перезаписывается, фотоблок не
 * трогается, если в нём уже что-то есть, у строки состава проставляются
 * лишь пустые время и сцена. Удалять скрипт не умеет вовсе, так что
 * перезапуск безопасен — второй раз он просто ничего не найдёт.
 *
 *   npx tsx scripts/refresh-musicfestival-events.ts             # сухой прогон: план
 *   npx tsx scripts/refresh-musicfestival-events.ts --limit 3   # только первые 3 события
 *   npx tsx scripts/refresh-musicfestival-events.ts --apply     # применить
 *
 * На проде: docker compose exec app npx tsx scripts/refresh-musicfestival-events.ts --apply
 *
 * С --apply прогон пишется в журнал импортов (kind musicfestival-crawl —
 * тот же, что у суточной задачи).
 */

const apply = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;

export function summarizeRefresh(r: MusicFestivalRefreshResult): string {
  return (
    `${r.apply ? "Обновлено" : "План"}: событий просмотрено ${r.events}, ` +
    `полей дозаполнено у ${r.fieldsFilled}, афиш +${r.photosAdded}, ` +
    `строк состава дня +${r.slotsCreated}, время и сцена у ${r.slotsTimed}, ` +
    `заготовок +${r.performersCreated}` +
    (r.failed ? `, не открылось ${r.failed}` : "")
  );
}

async function main() {
  const options = { limit, apply, log: (line: string) => console.log(line) };

  let result: MusicFestivalRefreshResult | null;
  if (apply) {
    result = await logImportRun(
      "musicfestival-crawl",
      (runId) => refreshMusicFestivalEvents({ ...options, runId }),
      summarizeRefresh,
    );
  } else {
    console.log("Сухой прогон: ничего не пишется, страницы читаются. Применить — --apply.");
    result = await refreshMusicFestivalEvents(options);
  }
  if (!result) {
    console.log("остановлено вручную");
    return;
  }
  console.log("\n" + summarizeRefresh(result));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
