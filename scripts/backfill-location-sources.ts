import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Атрибуция локаций: все каталожные локации съёмок пришли с blscene.com
// (см. docs/features/blscene-import.md), и ссылка на источник должна
// стоять на каждой. Точную страницу берём у связанного сериала
// (Drama.blsceneUrl); где её нет — ставим сам сайт, чтобы атрибуция
// была в любом случае. Места, созданные пользователями, не трогаем.
const BLSCENE_HOME = "https://blscene.com";

async function main() {
  const locations = await prisma.location.findMany({
    where: { createdByUserId: null, sourceUrl: null },
    select: {
      id: true,
      name: true,
      dramas: {
        select: { drama: { select: { blsceneUrl: true } } },
      },
    },
  });
  console.log(`локаций без источника: ${locations.length}`);

  let exact = 0;
  let fallback = 0;
  for (const loc of locations) {
    const dramaUrl = loc.dramas.map((d) => d.drama.blsceneUrl).find((u) => !!u);
    const sourceUrl = dramaUrl ?? BLSCENE_HOME;
    if (dramaUrl) exact += 1;
    else fallback += 1;
    await prisma.location.update({ where: { id: loc.id }, data: { sourceUrl } });
  }

  console.log(`проставлено: ${exact} со страницей сериала, ${fallback} — ссылкой на сайт`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
