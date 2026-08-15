import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { slugify, shortCode } from "../src/lib/slug";

/**
 * Одноразовый бэкфилл публичных слагов (см. src/lib/prisma.ts — новые
 * записи получают слаг автоматически). Каталожные модели: слаг из
 * названия, коллизии нумеруются в порядке createdAt (старейшая запись
 * получает «чистый» слаг). Поездки/списки: название + короткий код.
 * Безопасно перезапускать — записи со слагом пропускаются.
 *   npx tsx scripts/backfill-slugs.ts
 */
async function backfillCatalog(
  label: string,
  rows: { id: string; name: string; slug: string | null }[],
  update: (id: string, slug: string) => Promise<unknown>,
) {
  const taken = new Set(rows.map((r) => r.slug).filter(Boolean) as string[]);
  let done = 0;
  for (const row of rows) {
    if (row.slug) continue;
    const base = slugify(row.name);
    if (!base) continue;
    let candidate = base;
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
    taken.add(candidate);
    await update(row.id, candidate);
    done++;
  }
  console.log(`${label}: ${done} slugs`);
}

async function main() {
  await backfillCatalog(
    "Performers",
    (await prisma.performer.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, slug: true } })),
    (id, slug) => prisma.performer.update({ where: { id }, data: { slug } }),
  );
  await backfillCatalog(
    "Dramas",
    (await prisma.drama.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, title: true, slug: true } })).map((d) => ({ id: d.id, name: d.title, slug: d.slug })),
    (id, slug) => prisma.drama.update({ where: { id }, data: { slug } }),
  );
  await backfillCatalog(
    "Events",
    (await prisma.event.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, title: true, slug: true } })).map((e) => ({ id: e.id, name: e.title, slug: e.slug })),
    (id, slug) => prisma.event.update({ where: { id }, data: { slug } }),
  );
  await backfillCatalog(
    "Locations",
    (await prisma.location.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, slug: true } })),
    (id, slug) => prisma.location.update({ where: { id }, data: { slug } }),
  );
  await backfillCatalog(
    "Agencies",
    (await prisma.agency.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, slug: true } })),
    (id, slug) => prisma.agency.update({ where: { id }, data: { slug } }),
  );

  for (const [label, rows, update] of [
    ["Trips", await prisma.trip.findMany({ where: { slug: null }, select: { id: true, title: true } }),
      (id: string, slug: string) => prisma.trip.update({ where: { id }, data: { slug } })],
    ["PlaceLists", await prisma.placeList.findMany({ where: { slug: null }, select: { id: true, title: true } }),
      (id: string, slug: string) => prisma.placeList.update({ where: { id }, data: { slug } })],
  ] as const) {
    let done = 0;
    for (const row of rows as { id: string; title: string }[]) {
      const base = slugify(row.title);
      const slug = base ? `${base}-${shortCode()}` : `p-${shortCode()}${shortCode()}`;
      await (update as (id: string, slug: string) => Promise<unknown>)(row.id, slug);
      done++;
    }
    console.log(`${label}: ${done} slugs`);
  }
}

main().finally(() => prisma.$disconnect());
