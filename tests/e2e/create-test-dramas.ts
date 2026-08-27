import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { TEST_DRAMAS, TEST_FILTER_DRAMAS, TEST_GENRE, TEST_TAG } from "./testDramas";

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
  // Фикстуры фильтров: уникальный жанр + два разных года — чтобы
  // проверить и жанр, и диапазон года на любой базе.
  for (const d of Object.values(TEST_FILTER_DRAMAS)) {
    const ru = "titleRu" in d ? { titleRu: d.titleRu, synopsisRu: d.synopsisRu } : {};
    await prisma.drama.upsert({
      where: { slug: d.slug },
      update: { genres: [TEST_GENRE], tags: [TEST_TAG], year: d.year, country: d.country, ...ru },
      create: {
        slug: d.slug,
        title: d.title,
        genres: [TEST_GENRE],
        tags: [TEST_TAG],
        year: d.year,
        country: d.country,
        ...ru,
      },
    });
  }
  console.log("ok");
}

main().finally(() => prisma.$disconnect());
