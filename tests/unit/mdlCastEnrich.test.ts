import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { linkMdlCast } from "../../src/lib/mdlCastLink";

// Привязка каста заводит карточки актёров, которых у нас ещё нет. До
// 2026-09-23 массовые прогоны делали это «заготовкой» — имя и ссылка на
// MDL, больше ничего, — и таких записей накопилось 1673 (вопрос
// владельца: «откуда у нас записи со ссылкой, но без инфы?»). Теперь
// заведённому актёру сразу тянется карточка с его страницы
// (`enrich: "card"`). Интеграционный: без сети (страница подсовывается
// через шов fetchHtml), фикстуры с меткой убираются в finally. Запуск:
//
//   npx tsx tests/unit/mdlCastEnrich.test.ts

const MARK = "castenrich-test";

const personHtml = readFileSync(
  join(__dirname, "fixtures", "mdl-person-filmography.html"),
  "utf8",
);
const fetchHtml = async () => personHtml;

// Путь у второго случая свой: карточка ищется и по ссылке на MDL, и по
// имени, так что с тем же адресом второй вызов нашёл бы первого актёра
// вместо того, чтобы завести нового.
const castOf = (name: string, mdlPath = "/people/22234-khaotung") => [
  { mdlPath, name, role: "Khun", roleType: "Main Role" },
];

async function cleanup() {
  const performers = await prisma.performer.findMany({
    where: { name: { contains: MARK } },
    select: { id: true },
  });
  const ids = performers.map((p) => p.id);
  if (ids.length > 0) {
    await prisma.performerDrama.deleteMany({ where: { performerId: { in: ids } } });
    await prisma.performerLink.deleteMany({ where: { performerId: { in: ids } } });
  }
  await prisma.performer.deleteMany({ where: { name: { contains: MARK } } });
  await prisma.drama.deleteMany({ where: { title: { contains: MARK } } });
  await prisma.importRun.deleteMany({ where: { kind: MARK } });
}

async function main() {
  await cleanup();
  const drama = await prisma.drama.create({ data: { title: `Dragon ${MARK}` } });
  const run = await prisma.importRun.create({ data: { kind: MARK } });

  try {
    // 1. Лёгкий досбор: заведённому актёру сразу тянем карточку.
    const enrichedName = `Khaotung ${MARK}`;
    const linked = await linkMdlCast(drama.id, castOf(enrichedName), {
      runId: run.id,
      scope: "main-and-known-support",
      enrich: "card",
      fetchHtml,
    });
    assert.equal(linked.createdPerformers, 1, "незнакомый актёр главной роли заводится");
    assert.equal(linked.enriched, 1, "и тут же дозаполняется");

    const filled = await prisma.performer.findFirstOrThrow({
      where: { name: enrichedName },
    });
    assert.ok((filled.bio ?? "").length > 100, "биография пришла со страницы актёра");
    assert.ok(filled.mdlSyncedAt, "страницу отметили открытой — в очередь он не попадёт");
    assert.ok(filled.mydramalistUrl, "ссылка на MDL сохранена");

    const link = await prisma.performerDrama.findUnique({
      where: { performerId_dramaId: { performerId: filled.id, dramaId: drama.id } },
    });
    assert.equal(link?.role, "Khun", "связь с сериалом и роль на месте");

    // 2. Без досбора карточка остаётся заготовкой — так вели себя все
    //    массовые прогоны до правки, и так же ведёт себя `none`.
    const stubName = `Stub ${MARK}`;
    const stubDrama = await prisma.drama.create({ data: { title: `Stub drama ${MARK}` } });
    const stubLinked = await linkMdlCast(stubDrama.id, castOf(stubName, "/people/99999-stub"), {
      runId: run.id,
      scope: "main-and-known-support",
      enrich: "none",
    });
    assert.equal(stubLinked.createdPerformers, 1);
    assert.equal(stubLinked.enriched, 0, "без досбора на MDL никто не ходит");
    const stub = await prisma.performer.findFirstOrThrow({ where: { name: stubName } });
    assert.equal(stub.bio, null, "заготовка без биографии");
    assert.equal(stub.mdlSyncedAt, null, "и в очереди на досбор биографий");

    console.log("mdlCastEnrich: ok");
  } finally {
    await cleanup();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
