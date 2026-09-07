import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchDoramaLandPage } from "../src/lib/doramaland";
import { verifyDoramaLandMatch } from "../src/lib/doramalandSync";

/**
 * Перепроверка того, что уже связано с dorama.land.
 *
 * Зачем (жалоба владельца 2026-09-07): нашему тайскому «Reset» (2025)
 * досталось русское название и описание китайского «Возрождения из
 * ледяного озера» (2026). Сопоставление ловило подстроку — их «Rebirth»
 * нашёлся внутри нашего «The Rebirth of a Star», — и не сверяло страну.
 * Само правило починено (`verifyDoramaLandMatch`), а этот прогон
 * разбирает то, что успело записаться по старому.
 *
 * Что делает: для каждой нашей записи с `doramalandUrl` открывает их
 * страницу заново и прогоняет через новую проверку. Не прошло —
 * отвязывает и убирает ровно то, что пришло оттуда:
 *
 *   - `titleRu` и `synopsisRu` — только если они дословно совпадают с
 *     их страницей (значит, оттуда и взялись; правленое руками не
 *     трогаем);
 *   - варианты названий, добавленные их страницей, — из `alsoKnownAs`;
 *   - сам `doramalandUrl`.
 *
 * По умолчанию сухой прогон со списком. Их сайт открываем с той же
 * паузой, что и обычный синк.
 *
 *   npx tsx scripts/recheck-doramaland.ts            # план
 *   npx tsx scripts/recheck-doramaland.ts --apply    # почистить
 *
 * На проде: docker compose exec app npx tsx scripts/recheck-doramaland.ts
 */

const apply = process.argv.includes("--apply");
const PAGE_DELAY_MS = 350;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Убрать из списка вариантов то, что принесла их страница. */
function stripPageVariants(alsoKnownAs: string | null, variants: string[]): string | null {
  if (!alsoKnownAs) return null;
  const drop = new Set(variants.map((v) => v.trim().toLowerCase()).filter(Boolean));
  const kept = alsoKnownAs
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v && !drop.has(v.toLowerCase()));
  return kept.length > 0 ? kept.join(", ") : null;
}

async function main() {
  const rows = await prisma.drama.findMany({
    where: { doramalandUrl: { not: null } },
    select: {
      id: true,
      slug: true,
      title: true,
      nativeTitle: true,
      alsoKnownAs: true,
      year: true,
      country: true,
      titleRu: true,
      synopsisRu: true,
      doramalandUrl: true,
    },
    orderBy: { title: "asc" },
  });
  console.log(`Связано с dorama.land: ${rows.length}\n`);

  let checked = 0;
  let bad = 0;
  let failedToOpen = 0;

  for (const drama of rows) {
    checked += 1;
    let page;
    try {
      page = await fetchDoramaLandPage(drama.doramalandUrl!);
    } catch {
      // Страница не открылась (удалили, переименовали, сеть) — это не
      // повод считать совпадение ложным и рвать связь.
      failedToOpen += 1;
      await sleep(PAGE_DELAY_MS);
      continue;
    }

    if (!verifyDoramaLandMatch(drama, page)) {
      bad += 1;
      console.log(
        `✗ ${drama.title} (${drama.year ?? "год?"}, ${drama.country ?? "страна?"})\n` +
          `    у них: ${page.titleRu ?? "?"} (${page.year ?? "год?"}, ${page.country ?? "страна?"})\n` +
          `    ${drama.doramalandUrl}`,
      );
      if (apply) {
        const variants = [
          ...(page.titleRu ? [page.titleRu] : []),
          ...page.altTitles,
          ...(page.original ? [page.original] : []),
        ];
        await prisma.drama.update({
          where: { id: drama.id },
          data: {
            titleRu: drama.titleRu === page.titleRu ? null : drama.titleRu,
            synopsisRu: drama.synopsisRu === page.descriptionRu ? null : drama.synopsisRu,
            alsoKnownAs: stripPageVariants(drama.alsoKnownAs, variants),
            doramalandUrl: null,
          },
        });
      }
    }

    if (checked % 100 === 0) console.log(`  …проверено ${checked} из ${rows.length}`);
    await sleep(PAGE_DELAY_MS);
  }

  console.log(
    `\nПроверено ${checked}, ложных совпадений ${bad}, не открылось ${failedToOpen}.` +
      (apply ? " Ложные отвязаны." : " Запуск с --apply почистит."),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
