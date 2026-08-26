import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { mdlIdFromUrl } from "../src/lib/mydramalist";

/**
 * Ищет сериалы, которых импорт с MyDramaList мог перепутать.
 *
 * Откуда взялось. Запасной поиск соответствия шёл по одному названию:
 * `findFirst({ where: { title } })`. Названия у сериалов повторяются
 * постоянно — римейки, продолжения, просто совпадения, — и страница
 * «Restart» 2026 года подтянулась к «Restart» 2021-го и обновила его.
 * Сверка теперь требует ещё и года и однозначности (см.
 * `findDramaForMdlPage`), но записи, испорченные до этого, остались.
 *
 * Признак. У сериала два адреса на MDL: `mydramalistUrl` правится
 * руками и питает атрибуцию, `mdlUrl` проставляет импорт. Если оба
 * заполнены и ведут на РАЗНЫЕ страницы — значит импорт связал запись с
 * чужой страницей. Это не доказательство порчи (адрес могли поправить
 * руками), но список короткий и просмотреть его глазами дёшево.
 *
 * Скрипт ничего не меняет: что делать с находкой — решать человеку,
 * автоматически «починить» тут нечего. Развести две записи может
 * только тот, кто знает, какой из сериалов настоящий.
 *
 *   npx tsx --env-file=.env scripts/find-mismatched-mdl.ts
 */

async function main() {
  const rows = await prisma.drama.findMany({
    where: { mdlUrl: { not: null }, mydramalistUrl: { not: null } },
    select: {
      title: true,
      year: true,
      slug: true,
      mdlUrl: true,
      mydramalistUrl: true,
      mdlSyncedAt: true,
    },
    orderBy: { title: "asc" },
  });

  const suspect = rows.filter((r) => {
    const a = mdlIdFromUrl(r.mdlUrl ?? "");
    const b = mdlIdFromUrl(r.mydramalistUrl ?? "");
    return a && b && a !== b;
  });

  console.log(`Сериалов с двумя адресами MDL: ${rows.length}`);
  if (suspect.length === 0) {
    console.log("Расхождений нет — перепутанных записей не видно.");
    return;
  }

  console.log(`Ведут на разные страницы: ${suspect.length}\n`);
  for (const r of suspect) {
    console.log(`${r.title} (${r.year ?? "год неизвестен"})  /dramas/${r.slug ?? "—"}`);
    console.log(`  импорт связал с: ${r.mdlUrl}`);
    console.log(`  в карточке было: ${r.mydramalistUrl}`);
    console.log(`  последняя синхронизация: ${r.mdlSyncedAt?.toISOString().slice(0, 16) ?? "—"}\n`);
  }
  console.log(
    "Проверьте эти карточки глазами: если импорт подтянул чужой сериал,\n" +
      "почистите у записи поля, пришедшие не от неё, и заведите второй сериал заново.",
  );
}

main().finally(() => prisma.$disconnect());
