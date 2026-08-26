import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { TEST_DRAMAS } from "./testDramas";

// Убираем фикстуры за собой: база у разработчика — копия боевой, и два
// выдуманных сериала в каталоге после каждого прогона там лишние.
async function main() {
  const slugs = [TEST_DRAMAS.ended.slug, TEST_DRAMAS.airing.slug];
  const { count } = await prisma.drama.deleteMany({ where: { slug: { in: slugs } } });
  console.log(`удалено ${count}`);
}

main().finally(() => prisma.$disconnect());
