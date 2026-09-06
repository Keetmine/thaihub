import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { logImportRun } from "../src/lib/importRun";
import { runAsiapoiskSync, summarizeAsiapoiskSync } from "../src/lib/asiapoiskSync";

/**
 * Разовый прогон по asiapoisk.com: русские названия и страны для тех
 * наших сериалов, у кого их нет (см. docs/features/asiapoisk-import.md).
 * Тот же код, что у суточной задачи «asiapoisk-sync», просто без
 * потолка в 200 карточек за раз.
 *
 * Сайт просит паузу в 2 секунды между запросами, и мы её держим: полный
 * прогон по всем совпадениям идёт примерно сорок минут. Прерванный
 * прогон продолжать безопасно — разобранные карточки помечены
 * `Drama.asiapoiskUrl` и второй раз не читаются.
 *
 *   npx tsx scripts/asiapoisk-sync.ts                 # сухой прогон: план
 *   npx tsx scripts/asiapoisk-sync.ts --limit 50      # только первые 50
 *   npx tsx scripts/asiapoisk-sync.ts --apply         # записать
 *
 * На проде: docker compose exec app npx tsx scripts/asiapoisk-sync.ts --apply
 */

const apply = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 5000;

async function main() {
  const options = { limit, apply, log: (line: string) => console.log(line) };
  const result = apply
    ? await logImportRun("asiapoisk-sync", (runId) => runAsiapoiskSync({ ...options, runId }), summarizeAsiapoiskSync)
    : await (async () => {
        console.log("Сухой прогон: ничего не пишется, страницы читаются. Применить — --apply.");
        return runAsiapoiskSync(options);
      })();
  if (!result) {
    console.log("остановлено вручную");
    return;
  }
  console.log("\n" + summarizeAsiapoiskSync(result));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
