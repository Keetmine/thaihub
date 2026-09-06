import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { betterSlugFor } from "../src/lib/slugReclaim";

/**
 * Разовый прогон: вернуть записям «чистые» слаги вместо нумерованных.
 *
 * Зачем (жалоба владельца 2026-09-06): слаги нумеруются при создании —
 * второй «Ник» получает `nick-2`. Когда дубли потом сливали, `nick`
 * уходил вместе с проигравшей записью, а выжившая оставалась жить по
 * `nick-2`, хотя красивый адрес освободился. Само слияние теперь
 * забирает его сразу (`reclaimBaseSlug` в `src/lib/duplicates.ts`), а
 * этот скрипт разбирает то, что накопилось раньше.
 *
 * Берём только очевидное: слаг вида `база-N`, название записи даёт
 * ровно `базу`, и база никем не занята. Названия, которые сами кончаются
 * цифрой («Blossom Campus 2»), под правило не попадают — там «-2» часть
 * имени, а не нумерация.
 *
 * ВНИМАНИЕ: смена слага меняет публичный адрес. Ссылки на старый
 * `нумерованный` адрес после прогона перестанут открываться (редиректов
 * по истории слагов у нас нет), зато чистый адрес наконец ведёт куда
 * надо. Поэтому сначала сухой прогон и глазами по списку.
 *
 *   npx tsx scripts/reclaim-slugs.ts            # план, ничего не пишем
 *   npx tsx scripts/reclaim-slugs.ts --apply    # записать
 *
 * На проде: docker compose exec app npx tsx scripts/reclaim-slugs.ts --apply
 */

const apply = process.argv.includes("--apply");

/** Каталожные модели со слагом и поле названия у каждой — тот же
 *  список, что в автослагах (`CATALOG_SLUG_MODELS` в src/lib/prisma.ts).
 *  Поездки и списки мест сюда не входят: у них слаг с коротким кодом,
 *  а не с нумерацией. */
const MODELS = [
  { name: "Performer", delegate: prisma.performer, field: "name" },
  { name: "Drama", delegate: prisma.drama, field: "title" },
  { name: "Event", delegate: prisma.event, field: "title" },
  { name: "Location", delegate: prisma.location, field: "name" },
  { name: "Agency", delegate: prisma.agency, field: "name" },
  { name: "Novel", delegate: prisma.novel, field: "title" },
  { name: "WikiArticle", delegate: prisma.wikiArticle, field: "title" },
] as const;

async function main() {
  let planned = 0;
  let done = 0;

  for (const model of MODELS) {
    // Кандидаты — только нумерованные слаги; читаем разом, записей с
    // ними немного на фоне каталога.
    const delegate = model.delegate as unknown as {
      findMany: (q: object) => Promise<Record<string, unknown>[]>;
      findFirst: (q: object) => Promise<{ id: string } | null>;
      update: (q: object) => Promise<unknown>;
    };
    const rows = await delegate.findMany({
      where: { slug: { not: null } },
      select: { id: true, slug: true, [model.field]: true },
    });

    for (const row of rows) {
      const slug = row.slug as string;
      const name = (row[model.field] as string) ?? "";
      const desired = betterSlugFor(slug, name);
      if (!desired) continue;
      // База занята живой записью — законный случай тёзок, не трогаем.
      const taken = await delegate.findFirst({ where: { slug: desired }, select: { id: true } });
      if (taken) continue;

      planned += 1;
      console.log(`${model.name}: ${slug} → ${desired}   (${name})`);
      if (apply) {
        await delegate.update({ where: { id: row.id as string }, data: { slug: desired } });
        done += 1;
      }
    }
  }

  console.log(
    apply
      ? `\nГотово: переименовано ${done} слагов.`
      : `\nСухой прогон: поменять можно ${planned}. Запуск с --apply запишет.`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
