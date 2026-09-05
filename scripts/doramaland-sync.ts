import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  runDoramaLandDaily,
  runDoramaLandFullSync,
  summarizeDoramaLandDaily,
} from "../src/lib/doramalandSync";

/**
 * Русские названия и описания с dorama.land (решение владельца, Ж4б).
 * Тонкая обёртка над src/lib/doramalandSync.ts — там же живёт и
 * ежедневная задача расписания «doramaland-sync».
 *
 * Полный обход (по умолчанию): один обход их каталога кормит оба
 * прогона. Страницы сериалов собираются из sitemap-ов, каждая
 * разбирается и кладётся в кэш на диске — прерванный прогон
 * продолжается с места обрыва, а не с нуля.
 *
 * Прогон 1 (всегда): каждой их странице ищется НАША запись — по
 * английскому/оригинальному названию плюс год (±1) и однозначности;
 * совпавшей пишутся titleRu, synopsisRu, doramalandUrl, а ВСЕ варианты
 * названий (русское, украинское, оригинал) доливаются в alsoKnownAs —
 * поиск по сайту читает его, и сериал становится находим по-русски.
 *
 * Прогон 2 (--import-missing): их сериалы, которых у нас нет, — но
 * только Таиланд или с яой/BL в жанрах (фильтр владельца). Сначала
 * сериал ищется на MDL (точное название + год) и заводится обычным
 * MDL-импортом — постер, синопсис, расписание серий, всё как всегда;
 * русские поля доливаются следом. Не нашёлся на MDL — в отчёт, руками:
 * заводить голую запись без постера и данных хуже, чем не заводить.
 *
 * «Нет ру перевода» в админке — это titleRu IS NULL, отдельной пометки
 * не нужно: не найденные на dorama.land так и остаются без titleRu.
 *
 *   npx tsx scripts/doramaland-sync.ts                # черновой прогон
 *   npx tsx scripts/doramaland-sync.ts --apply
 *   npx tsx scripts/doramaland-sync.ts --apply --import-missing
 *   [--limit N] [--overwrite]  # --overwrite переписывает уже взятое
 *
 * --daily — та же логика, что у ежедневной задачи расписания (только
 * незнакомые страницы, лимиты на прогон), для проверки руками:
 *
 *   npx tsx scripts/doramaland-sync.ts --daily --limit 10 [--mdl-limit 3]   # сухой
 *   npx tsx scripts/doramaland-sync.ts --daily --apply
 */

const apply = process.argv.includes("--apply");
const importMissing = process.argv.includes("--import-missing");
const overwrite = process.argv.includes("--overwrite");
const daily = process.argv.includes("--daily");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
const mdlLimitArg = process.argv.indexOf("--mdl-limit");
const mdlLimit = mdlLimitArg >= 0 ? Number(process.argv[mdlLimitArg + 1]) : undefined;

async function main() {
  if (daily) {
    const result = await runDoramaLandDaily({
      apply,
      maxPages: limit,
      // Без --import-missing ежедневный режим всё равно заводит
      // недостающее (как задача расписания); --limit ограничивает и
      // число MDL-поисков (или отдельно --mdl-limit N), чтобы проверка
      // руками не ушла далеко.
      maxMdlLookups: mdlLimit ?? limit,
      log: (m) => console.log(m),
    });
    console.log(`\n${summarizeDoramaLandDaily(result)}`);
    return;
  }

  const result = await runDoramaLandFullSync({
    apply,
    importMissing,
    overwrite,
    limit,
    log: (m) => console.log(m),
  });

  const withoutRu = await prisma.drama.count({ where: { titleRu: null } });
  console.log(
    `\nСведено с нашими записями: ${result.matched}; обновлено: ${result.enriched}${apply ? "" : " (ничего не записано)"}.`,
  );
  if (importMissing) {
    console.log(`Заведено с MDL: ${result.importedFromMdl}; не нашлись на MDL: ${result.noMdl.length}.`);
    for (const p of result.noMdl.slice(0, 30)) {
      console.log(`  [нет на MDL] «${p.titleRu}» (${p.year ?? "год?"}) ${p.sourceUrl}`);
    }
    if (result.noMdl.length > 30) console.log(`  … и ещё ${result.noMdl.length - 30}`);
  }
  console.log(`Наших записей без ру-перевода: ${withoutRu} (в админке — фильтр «Нет ру перевода»).`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
