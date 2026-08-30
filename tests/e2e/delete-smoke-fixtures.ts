import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import {
  SIMILAR_CANDIDATES,
  SIMILAR_PERFORMERS,
  SIMILAR_SOURCE,
  TODAY_DRAMA,
} from "./testSmokeFixtures";

// Убираем фикстуры за собой: база у разработчика — копия боевой, и
// выдуманные сериалы с актёрами там после прогона лишние. Связи
// PerformerDrama и серии удаляются каскадом (onDelete: Cascade).
async function main() {
  const dramaSlugs = [
    SIMILAR_SOURCE.slug,
    ...SIMILAR_CANDIDATES.map((d) => d.slug),
    TODAY_DRAMA.slug,
  ];
  const dramas = await prisma.drama.deleteMany({
    where: { slug: { in: dramaSlugs } },
  });
  const performers = await prisma.performer.deleteMany({
    where: { slug: { in: SIMILAR_PERFORMERS.map((p) => p.slug) } },
  });
  console.log(`удалено: сериалов ${dramas.count}, артистов ${performers.count}`);
}

main().finally(() => prisma.$disconnect());
