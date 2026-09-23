import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { MdlClient } from "../src/lib/mdlClient";
import {
  buildDramaResolver,
  syncPerformerFromMdl,
  PERFORMER_SYNC_DELAY_MS,
} from "../src/lib/mdlPerformerSync";

/**
 * Обогащение исполнителей со страниц MyDramaList /people/ — ручной
 * прогон по выбранному срезу. Сам досбор карточки живёт в
 * lib/mdlPerformerSync.ts и общий с задачей по расписанию
 * («MyDramaList: биографии актёров»): ищет человека поиском или по
 * сохранённой ссылке, верифицирует кандидата пересечением фильмографии
 * с нашими сериалами (или полным совпадением настоящего имени), после
 * чего заполняет пустые поля, дописывает недостающие соцссылки и
 * проставляет роли в известных нам сериалах.
 *
 * Здесь остаётся только ОТБОР — какой срез прогоняем:
 *   npx tsx scripts/mdl-sync-performers.ts [--limit N] [--force]
 *     — артисты, привязанные к агентствам (исходная задача скрипта);
 *   npx tsx scripts/mdl-sync-performers.ts --with-mdl-url --limit 50
 *     — без биографии, но со ссылкой на MDL;
 *   npx tsx scripts/mdl-sync-performers.ts --performer <slug|имя>
 *     — точечно одного (игнорирует mdlSyncedAt).
 * Резюмится по mdlSyncedAt. Раздел /people/ за Cloudflare-челленджем —
 * поэтому MdlClient (на машине с дисплеем поднимет окно, если headless
 * челлендж не прошёл).
 *
 * Обычный путь для массового досбора — не этот скрипт, а страница
 * /admin/performers/bios: там та же работа идёт пачками, с кнопкой
 * «Остановить» и продолжением по расписанию.
 */

const PERFORMER_SELECT = {
  id: true,
  name: true,
  realName: true,
  bio: true,
  birthDate: true,
  photoUrl: true,
  mydramalistUrl: true,
  links: { select: { url: true } },
  dramas: { select: { dramaId: true } },
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  const force = process.argv.includes("--force");
  const performerArg = process.argv.indexOf("--performer");
  const onlyPerformer = performerArg >= 0 ? process.argv[performerArg + 1] : null;
  /** Кому не хватает биографии, но есть ссылка на MDL. */
  const withMdlUrl = process.argv.includes("--with-mdl-url");

  const performers = await prisma.performer.findMany({
    where: onlyPerformer
      ? {
          OR: [
            { slug: onlyPerformer },
            { name: { equals: onlyPerformer, mode: "insensitive" } },
          ],
        }
      : withMdlUrl
        ? {
            type: "SOLO",
            bio: null,
            mydramalistUrl: { not: null },
            ...(force ? {} : { mdlSyncedAt: null }),
          }
        : {
            type: "SOLO",
            agencies: { some: {} },
            ...(force ? {} : { mdlSyncedAt: null }),
          },
    orderBy: { name: "asc" },
    select: PERFORMER_SELECT,
  });
  console.log(`К синхронизации: ${Math.min(performers.length, limit)} из ${performers.length}`);

  const resolveDrama = await buildDramaResolver();
  const client = new MdlClient();
  await client.init();

  let done = 0;
  let notFound = 0;
  let failed = 0;
  let rolesSet = 0;
  let linksAdded = 0;

  try {
    for (const p of performers.slice(0, Number.isFinite(limit) ? limit : undefined)) {
      try {
        const res = await syncPerformerFromMdl(p, {
          fetchHtml: client.fetchHtml.bind(client),
          resolveDrama,
        });
        rolesSet += res.rolesSet;
        linksAdded += res.linksAdded;
        if (!res.matched) {
          notFound += 1;
          console.log(`  [не найден] ${p.name}${p.realName ? ` (${p.realName})` : ""}`);
        } else {
          done += 1;
          console.log(
            `  [ok] ${p.name} → ${res.url}${res.filled.length ? ` (${res.filled.join(", ")})` : ""}`,
          );
        }
      } catch (e) {
        failed += 1;
        console.log(`  [ошибка] ${p.name}: ${e instanceof Error ? e.message : e}`);
        if (failed > 30 && failed > done) {
          throw new Error("Слишком много ошибок подряд — останавливаюсь");
        }
      }
      await sleep(PERFORMER_SYNC_DELAY_MS);
    }
  } finally {
    await client.close();
  }

  console.log(
    `\nГотово: обновлено ${done}, не найдено ${notFound}, ошибок ${failed}, ролей ${rolesSet}, соцссылок ${linksAdded}.`,
  );
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
