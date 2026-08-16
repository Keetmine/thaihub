import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Чистка каталога исполнителей от «мусора» массовых TMDB-импортов:
 * 1) имена тайской/японской/китайской/корейской письменностью (без
 *    латинской транскрипции такие карточки бесполезны в каталоге);
 * 2) место рождения из явного списка НЕ-тайских стран (корейцы,
 *    американцы и т.п., затянутые из общих кастов TMDB) — определять
 *    «американца» по имени ненадёжно (у тайцев западные ники), поэтому
 *    сигналом служит только place of birth.
 *
 * НИКОГДА не удаляем: связанных с агентством, с событиями, участников
 * групп (и сами группы), с пейрингами и добавленных кем-то в избранное.
 *
 * Запуск: npx tsx scripts/cleanup-foreign-performers.ts [--apply]
 * Без --apply — только отчёт (dry-run).
 */

const NON_LATIN = /[฀-๿぀-ヿㇰ-ㇿ一-鿿가-힯]/;

const FOREIGN_PLACE =
  /south korea|north korea|\bkorea\b|japan|china|taiwan|hong ?kong|philippines|vietnam|singapore|malaysia|indonesia|india\b|myanmar|cambodia|laos\b|usa|u\.s\.a|united states|america|canada|mexico|brazil|\buk\b|united kingdom|england|scotland|ireland|france|germany|italy|spain|sweden|norway|denmark|netherlands|belgium|austria|switzerland|poland|russia|ukraine|australia|new zealand|韩国|日本|中国|臺灣|台灣|香港|서울|한국|일본/i;

async function main() {
  const apply = process.argv.includes("--apply");

  const candidates = await prisma.performer.findMany({
    where: { agencies: { none: {} } },
    select: {
      id: true,
      name: true,
      placeOfBirth: true,
      _count: {
        select: {
          events: true,
          favoritedBy: true,
          memberOfBands: true,
          bandMembers: true,
          pairingsAsA: true,
          pairingsAsB: true,
        },
      },
    },
  });

  const isProtected = (p: (typeof candidates)[number]) =>
    Object.values(p._count).some((c) => c > 0);

  const byScript = candidates.filter((p) => NON_LATIN.test(p.name) && !isProtected(p));
  const byBirth = candidates.filter(
    (p) =>
      !NON_LATIN.test(p.name) &&
      p.placeOfBirth &&
      FOREIGN_PLACE.test(p.placeOfBirth) &&
      !isProtected(p),
  );
  const protectedCount = candidates.filter(
    (p) =>
      (NON_LATIN.test(p.name) || (p.placeOfBirth && FOREIGN_PLACE.test(p.placeOfBirth))) &&
      isProtected(p),
  ).length;

  console.log(`Кандидаты без агентства: ${candidates.length}`);
  console.log(`  не-латинские имена:    ${byScript.length}`);
  console.log(`  иностранное рождение:  ${byBirth.length}`);
  console.log(`  защищено связями:      ${protectedCount} (не трогаем)`);
  console.log("Примеры (имена):", byScript.slice(0, 5).map((p) => p.name).join(" · "));
  console.log(
    "Примеры (место):",
    byBirth.slice(0, 5).map((p) => `${p.name} — ${p.placeOfBirth}`).join(" · "),
  );

  if (!apply) {
    console.log("\nDry-run. Запусти с --apply, чтобы удалить.");
    return;
  }

  const ids = [...byScript, ...byBirth].map((p) => p.id);
  // Партиями, чтобы не упереться в лимиты параметров запроса.
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const res = await prisma.performer.deleteMany({
      where: { id: { in: ids.slice(i, i + 500) } },
    });
    deleted += res.count;
    process.stdout.write(`\rУдалено: ${deleted}/${ids.length}`);
  }
  console.log("\nГотово.");
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
