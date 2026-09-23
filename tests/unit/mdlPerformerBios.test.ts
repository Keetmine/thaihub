import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { buildDramaResolver, syncPerformerFromMdl } from "../../src/lib/mdlPerformerSync";

// Досбор карточки артиста с MDL (src/lib/mdlPerformerSync.ts) — тот же
// код, которым ходит задача «MyDramaList: биографии актёров» и страница
// /admin/performers/bios. Интеграционный, как performerMatching.test.ts:
// без сети (страницы подсовываются через шов fetchHtml), фикстуры с
// меткой убираются в finally. Запуск:
//
//   npx tsx tests/unit/mdlPerformerBios.test.ts

const MARK = "mdlbio-test";
const PERSON_URL = "https://mydramalist.com/people/22234-khaotung";
const DRAMA_MDL_URL = "https://mydramalist.com/802908-the-invisible-dragon";

const personHtml = readFileSync(
  join(__dirname, "fixtures", "mdl-person-filmography.html"),
  "utf8",
);

/** Страницы без сети: человека отдаём фикстурой, поиск — пустой
 *  выдачей (случай «никого не нашли»). */
const fetchHtml = async (url: string): Promise<string> => {
  if (url.includes("/people/")) return personHtml;
  return "<html><body></body></html>";
};

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
}

async function main() {
  await cleanup();

  // Сериал из фильмографии фикстуры — чтобы тесту было что опознавать и
  // на пустой базе (на копии прод-базы он уже есть под тем же адресом).
  await prisma.drama.create({
    data: { title: `Invisible Dragon ${MARK}`, mydramalistUrl: DRAMA_MDL_URL },
  });
  // Указатель «страница MDL → наш сериал» строится один раз на прогон,
  // поэтому после создания фикстуры.
  const resolver = await buildDramaResolver();

  // 1. Ссылка на MDL уже сохранена: страница открывается напрямую,
  //    опознавать никого не надо.
  const withUrl = await prisma.performer.create({
    data: {
      name: `Khaotung ${MARK}`,
      mydramalistUrl: PERSON_URL,
      // Фото ставим своё: иначе досбор полез бы качать картинку с MDL,
      // а тест ходить в сеть не должен.
      photoUrl: "/uploads/mdl/fixture.webp",
    },
  });

  // 2. Ни ссылки, ни настоящего имени: ищем по имени, выдача пустая.
  const noMatch = await prisma.performer.create({
    data: { name: `Nobody ${MARK}`, photoUrl: "/uploads/mdl/fixture.webp" },
  });

  try {
    const rowFor = (id: string) =>
      prisma.performer.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          name: true,
          realName: true,
          bio: true,
          birthDate: true,
          photoUrl: true,
          mydramalistUrl: true,
          links: { select: { url: true } },
          dramas: { select: { dramaId: true } },
        },
      });

    const okResult = await syncPerformerFromMdl(await rowFor(withUrl.id), {
      fetchHtml,
      resolveDrama: resolver,
      delayMs: 0,
    });
    assert.equal(okResult.matched, true, "по сохранённой ссылке человек берётся без поиска");
    assert.ok(okResult.filled.includes("биография"), "биография дописана");

    const saved = await prisma.performer.findUniqueOrThrow({ where: { id: withUrl.id } });
    assert.ok((saved.bio ?? "").length > 100, "биография лежит в карточке");
    assert.ok(saved.mdlSyncedAt, "отметка «смотрели» проставлена");
    assert.equal(saved.photoUrl, "/uploads/mdl/fixture.webp", "своё фото не перезаписано");

    // Какому именно сериалу досталась роль, решает указатель: на пустой
    // базе это фикстура, на копии прод-базы — настоящая карточка «The
    // Invisible Dragon», которая уже лежит в каталоге под тем же
    // адресом MDL. Проверяем связь у того, кого указатель и выбрал.
    const dragonId = resolver("/802908-the-invisible-dragon", "The Invisible Dragon");
    assert.ok(dragonId, "сериал из фильмографии опознан в каталоге");
    const link = await prisma.performerDrama.findUnique({
      where: { performerId_dramaId: { performerId: withUrl.id, dramaId: dragonId! } },
    });
    assert.equal(link?.role, "Khun", "роль из фильмографии проставлена нашему сериалу");

    // Повторный прогон не должен перезаписывать уже заполненное.
    const again = await syncPerformerFromMdl(await rowFor(withUrl.id), {
      fetchHtml,
      resolveDrama: resolver,
      delayMs: 0,
    });
    assert.equal(again.filled.includes("биография"), false, "занятое поле не трогаем");

    const missResult = await syncPerformerFromMdl(await rowFor(noMatch.id), {
      fetchHtml,
      resolveDrama: resolver,
      delayMs: 0,
    });
    assert.equal(missResult.matched, false, "пустая выдача — никого не приписываем");
    const missed = await prisma.performer.findUniqueOrThrow({ where: { id: noMatch.id } });
    assert.equal(missed.bio, null, "карточка осталась пустой");
    assert.ok(
      missed.mdlSyncedAt,
      "ненайденному тоже ставим отметку — иначе очередь упрётся в него навсегда",
    );

    console.log("mdlPerformerBios: ok");
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
