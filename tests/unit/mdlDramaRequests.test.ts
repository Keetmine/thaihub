import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import {
  upsertMdlDramaRequests,
  resolveMdlDramaRequests,
} from "../../src/lib/mdlDramaRequests";
import { importMdlRequestsBatch } from "../../src/app/admin/(protected)/imports/mdlRequestsBatch";

// Интеграционные проверки заявок «добавьте сериал» (MdlDramaRequest) —
// без сети: работаем напрямую с функциями и базой на фикстурных
// данных. Живой MDL не дёргается. Запуск:
//
//   npx tsx tests/unit/mdlDramaRequests.test.ts
//
// База — копия прода, поэтому все фикстуры с меткой MDLREQ_TEST и
// убираются в finally, что бы ни упало по дороге.

const MARK = "mdlreq-test";
// Несуществующий на MDL числовой id — в проде такого сериала нет.
const MDL_ID = "99900001";
const MDL_PATH = `/${MDL_ID}-${MARK}-drama`;
const MDL_URL = `https://mydramalist.com${MDL_PATH}`;

async function cleanup() {
  await prisma.notification.deleteMany({
    where: { user: { email: { contains: MARK } } },
  });
  await prisma.dramaWatchStatus.deleteMany({
    where: { user: { email: { contains: MARK } } },
  });
  // Все фикстурные адреса и названия содержат MARK — и одиночные, и
  // пачечные (99900002…4); лента спарсенного и журнал — по своим меткам.
  await prisma.importedItem.deleteMany({ where: { label: { contains: "MdlReq" } } });
  await prisma.importRun.deleteMany({ where: { kind: { contains: MARK } } });
  await prisma.mdlDramaRequest.deleteMany({ where: { mdlUrl: { contains: MARK } } });
  await prisma.drama.deleteMany({ where: { mdlUrl: { contains: MARK } } });
  await prisma.user.deleteMany({ where: { email: { contains: MARK } } });
}

async function main() {
  await cleanup(); // хвост упавшего прошлого прогона

  const userA = await prisma.user.create({
    data: { email: `${MARK}-a@example.test`, name: "MdlReq A", locale: "ru" },
  });
  const userB = await prisma.user.create({
    data: { email: `${MARK}-b@example.test`, name: "MdlReq B", locale: "en" },
  });

  // ---------- заявка создаётся при ненайденном ----------

  await upsertMdlDramaRequests(userA.id, [
    { mdlUrl: MDL_PATH, title: "MdlReq Test Drama", status: "WATCHING", seen: 7 },
  ]);
  // Повторный импорт того же юзера — идемпотентен, статус освежается.
  await upsertMdlDramaRequests(userA.id, [
    { mdlUrl: MDL_URL, title: "MdlReq Test Drama", status: "COMPLETED", seen: 10 },
  ]);
  // Второй юзер добавляется к СУЩЕСТВУЮЩЕЙ заявке (дедуп по mdlUrl).
  await upsertMdlDramaRequests(userB.id, [
    { mdlUrl: MDL_PATH, title: "MdlReq Test Drama", status: "PLAN_TO_WATCH", seen: null },
  ]);

  const requests = await prisma.mdlDramaRequest.findMany({
    where: { mdlUrl: { contains: MDL_ID } },
    include: { users: true },
  });
  assert.equal(requests.length, 1, "путь и полный URL — одна заявка (канонизация)");
  const request = requests[0];
  assert.equal(request.mdlUrl, MDL_URL, "mdlUrl хранится каноническим");
  assert.equal(request.users.length, 2, "оба просивших в одной заявке");
  const rowA = request.users.find((u) => u.userId === userA.id)!;
  assert.equal(rowA.status, "COMPLETED", "повторный импорт освежил статус");
  assert.equal(rowA.episodesWatched, 10);
  assert.equal(request.resolvedAt, null);
  assert.equal(request.notifiedAt, null);

  // ---------- резолв: статус дописывается, уведомление уходит ----------

  // У userB статус уже заведён руками — резолв НЕ должен его перетереть.
  await prisma.dramaWatchStatus.create({
    data: { userId: userB.id, dramaId: (await mkDrama()).id, status: "DROPPED" },
  });

  async function mkDrama() {
    const existing = await prisma.drama.findFirst({ where: { mdlUrl: MDL_URL } });
    if (existing) return existing;
    return prisma.drama.create({
      data: {
        title: "MdlReq Test Drama",
        mdlUrl: MDL_URL,
        mydramalistUrl: MDL_URL,
        episodes: 10,
      },
    });
  }
  const drama = await mkDrama();

  const res = await resolveMdlDramaRequests(drama, MDL_URL);
  assert.equal(res.resolved, 1);
  assert.equal(res.statusesWritten, 1, "дописан только userA: у userB статус уже был");
  assert.equal(res.notified, 2, "уведомлены оба просивших");

  const statusA = await prisma.dramaWatchStatus.findUnique({
    where: { userId_dramaId: { userId: userA.id, dramaId: drama.id } },
  });
  assert.equal(statusA?.status, "COMPLETED", "статус из заявки дописан");
  assert.equal(statusA?.episodesWatched, 10, "прогресс прошёл валидацию по episodes");
  assert.equal(statusA?.notifyEpisodes, false, "колокольчик включается только у WATCHING");

  const statusB = await prisma.dramaWatchStatus.findUnique({
    where: { userId_dramaId: { userId: userB.id, dramaId: drama.id } },
  });
  assert.equal(statusB?.status, "DROPPED", "заведённый руками статус не перетёрт");

  const notifA = await prisma.notification.findMany({ where: { userId: userA.id } });
  assert.equal(notifA.length, 1);
  assert.equal(notifA[0].kind, "DRAMA_ADDED");
  assert.equal(notifA[0].href, `/dramas/${drama.slug ?? drama.id}`, "href ведёт на сериал");
  assert.equal(notifA[0].subject, "MdlReq Test Drama");
  assert.match(notifA[0].title, /теперь в каталоге/, "фраза на языке получателя (ru)");
  const notifB = await prisma.notification.findMany({ where: { userId: userB.id } });
  assert.match(notifB[0].title, /is now in our catalog/, "фраза на языке получателя (en)");

  const after = await prisma.mdlDramaRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.ok(after.resolvedAt, "заявка закрыта");
  assert.ok(after.notifiedAt, "рассылка помечена");
  assert.equal(after.resolvedDramaId, drama.id);

  // ---------- повторный резолв не дублирует ----------

  const res2 = await resolveMdlDramaRequests(drama, MDL_URL);
  assert.deepEqual(res2, { resolved: 0, statusesWritten: 0, notified: 0 });
  assert.equal(
    await prisma.notification.count({ where: { userId: userA.id } }),
    1,
    "второго уведомления нет",
  );

  // ---------- отклонённая заявка не воскресает ----------

  const junk = await prisma.mdlDramaRequest.create({
    data: { mdlUrl: `https://mydramalist.com/${MDL_ID}-${MARK}-junk-x`, title: "junk" },
  });
  // -junk-x против -junk: contains по "/<id>-" у резолва не должен
  // цеплять чужой id, а тут проверяем rejectedAt.
  await prisma.mdlDramaRequest.update({
    where: { id: junk.id },
    data: { rejectedAt: new Date() },
  });
  await upsertMdlDramaRequests(userA.id, [
    { mdlUrl: `/${MDL_ID}-${MARK}-junk-x`, title: "junk", status: "WATCHING", seen: null },
  ]);
  const junkAfter = await prisma.mdlDramaRequest.findUniqueOrThrow({
    where: { id: junk.id },
    include: { users: true },
  });
  assert.equal(junkAfter.users.length, 0, "к отклонённой заявке юзеры не добавляются");

  // ---------- пачка: ошибка в середине не роняет остальных ----------

  // Импорт пачки — importMdlRequestsBatch с подсунутыми страницами
  // вместо похода на MDL (тестовый шов fetchHtml): три заявки, средняя
  // «не открывается». Успешные должны завестись сериалами и закрыться
  // хуком резолва, упавшая — остаться открытой на следующий заход.
  const B2 = `https://mydramalist.com/99900002-${MARK}-batch-two`;
  const B3 = `https://mydramalist.com/99900003-${MARK}-batch-three`;
  const B4 = `https://mydramalist.com/99900004-${MARK}-batch-four`;
  await upsertMdlDramaRequests(userA.id, [
    { mdlUrl: B2, title: "MdlReq Batch Two", status: "WATCHING", seen: null },
    { mdlUrl: B3, title: "MdlReq Batch Three", status: "COMPLETED", seen: null },
    { mdlUrl: B4, title: "MdlReq Batch Four", status: "PLAN_TO_WATCH", seen: null },
  ]);
  // Журналу нужен настоящий ImportRun: ImportedItem.runId — внешний ключ.
  const batchRun = await prisma.importRun.create({ data: { kind: `${MARK}-batch` } });

  // Минимальная страница тайтла: parseMdlDramaPage требует только
  // JSON-LD с типом и именем; каст и детали не обязательны.
  const pageHtml = (title: string) =>
    `<html><head><script type="application/ld+json">{"@type":"TVSeries","name":"${title}"}</script></head><body></body></html>`;
  const fetchHtml = async (url: string): Promise<string> => {
    // Подстраницы /episodes «не открываются» — импорт карточки это
    // глотает (у фильмов их нет вовсе), расписание просто не пишется.
    if (url.endsWith("/episodes")) throw new Error("нет расписания");
    if (url.includes("99900003")) throw new Error("MDL не отдал страницу");
    if (url.includes("99900002")) return pageHtml("MdlReq Batch Two");
    if (url.includes("99900004")) return pageHtml("MdlReq Batch Four");
    throw new Error(`неожиданный адрес в тесте: ${url}`);
  };

  const batch = await importMdlRequestsBatch(
    [
      { mdlUrl: B2, title: "MdlReq Batch Two" },
      { mdlUrl: B3, title: "MdlReq Batch Three" },
      { mdlUrl: B4, title: "MdlReq Batch Four" },
    ],
    { runId: batchRun.id, fetchHtml, delayMs: 0 },
  );
  assert.equal(batch.total, 3);
  assert.equal(batch.imported, 2, "упавшая середина не помешала следующему");
  assert.equal(batch.failed, 1);
  assert.deepEqual(batch.failedTitles, ["MdlReq Batch Three"]);
  assert.equal(batch.abortedAfter, null, "одна ошибка — не повод сдаваться");

  const req2 = await prisma.mdlDramaRequest.findUniqueOrThrow({ where: { mdlUrl: B2 } });
  const req3 = await prisma.mdlDramaRequest.findUniqueOrThrow({ where: { mdlUrl: B3 } });
  const req4 = await prisma.mdlDramaRequest.findUniqueOrThrow({ where: { mdlUrl: B4 } });
  assert.ok(req2.resolvedAt, "успешный импорт закрыл заявку хуком");
  assert.ok(req4.resolvedAt, "и после упавшей середины тоже");
  assert.equal(req3.resolvedAt, null, "упавшая заявка осталась открытой");
  assert.equal(req3.rejectedAt, null, "и не отклонённой — доберём следующей пачкой");

  const created2 = await prisma.drama.findFirst({ where: { mdlUrl: B2 } });
  assert.ok(created2, "сериал из пачки завёлся");
  const statusBatch = await prisma.dramaWatchStatus.findUnique({
    where: { userId_dramaId: { userId: userA.id, dramaId: created2!.id } },
  });
  assert.equal(statusBatch?.status, "WATCHING", "просившему дописан статус из заявки");

  const batchItems = await prisma.importedItem.findMany({ where: { runId: batchRun.id } });
  assert.equal(batchItems.length, 2, "в ленту спарсенного попали только удавшиеся");

  console.log("mdlDramaRequests.test.ts: ok");
}

main()
  .catch((e) => {
    process.exitCode = 1;
    console.error(e);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
