import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { TEST_DRAMAS } from "./testDramas";

/**
 * Два сериала для episode-progress.spec.ts.
 *
 * Спека раньше брала слаги из каталога владельца (`the-queen`,
 * `mr-kill`) — локально они есть, а в CI база одноразовая и сериалов в
 * ней нет вовсе (`prisma/seed.ts` заводит только события и артистов).
 * Отсюда и падали два последних прогона.
 *
 * Различие между ними существенное, а не косметическое: правило «дошёл
 * до последней серии — сериал закрывается» действует только у вышедшего
 * целиком. У выходящего последняя вышедшая серия ничего не закрывает,
 * и проверять это надо на сериале с подходящим статусом.
 */

async function main() {
  await prisma.drama.upsert({
    where: { slug: TEST_DRAMAS.ended.slug },
    update: { episodes: TEST_DRAMAS.ended.episodes, status: "ENDED" },
    create: {
      slug: TEST_DRAMAS.ended.slug,
      title: TEST_DRAMAS.ended.title,
      episodes: TEST_DRAMAS.ended.episodes,
      status: "ENDED",
    },
  });
  await prisma.drama.upsert({
    where: { slug: TEST_DRAMAS.airing.slug },
    update: { episodes: TEST_DRAMAS.airing.episodes, status: "RETURNING_SERIES" },
    create: {
      slug: TEST_DRAMAS.airing.slug,
      title: TEST_DRAMAS.airing.title,
      episodes: TEST_DRAMAS.airing.episodes,
      status: "RETURNING_SERIES",
    },
  });
  console.log("ok");
}

main().finally(() => prisma.$disconnect());
