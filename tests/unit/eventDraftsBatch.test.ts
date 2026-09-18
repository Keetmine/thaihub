import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import {
  approveEventDraftsBatch,
  summarizeEventDraftsBatch,
  ttmDraftSubmission,
} from "../../src/app/admin/(protected)/imports/eventDraftsBatch";
import type { TtmImportSubmission } from "../../src/app/admin/(protected)/events/importActions";

// Пачка одобрения черновиков событий (eventDraftsBatch.ts). Главное —
// черновик с пометкой «возможный дубль» массовое одобрение ПРОПУСКАЕТ
// (он остаётся PENDING), а ошибка одного черновика не роняет пачку.
// Интеграционный, как performerMatching.test.ts: БД настоящая, сети нет —
// вместо createEventFromTtmImport (поход за постером + requireAdmin)
// подсовывается тестовый шов opts.createEvent, по образцу fetchHtml-шва
// у mdlRequestsBatch. Запуск:
//
//   npx tsx tests/unit/eventDraftsBatch.test.ts

const MARK = "ttmbatch-test";
const url = (slug: string) =>
  `https://www.thaiticketmajor.com/concert/${MARK}-${slug}.html`;

async function cleanup() {
  await prisma.importedItem.deleteMany({ where: { label: { contains: "TTMBATCH" } } });
  await prisma.eventDraft.deleteMany({ where: { sourceUrl: { contains: MARK } } });
  await prisma.event.deleteMany({ where: { title: { contains: "TTMBATCH" } } });
  await prisma.importRun.deleteMany({ where: { kind: `${MARK}-run` } });
}

/** PENDING-черновик с минимальным payload краулера. */
function draftData(slug: string, extraPayload: Record<string, unknown> = {}) {
  return {
    sourceUrl: url(slug),
    status: "PENDING" as const,
    payload: {
      title: `TTMBATCH ${slug}`,
      venue: "Batch Arena",
      date: "2030-02-01",
      startTime: "19:00",
      extraDates: [],
      sourceUrl: url(slug),
      ...extraPayload,
    },
    matchedPerformers: [{ performerId: `perf-${MARK}`, nickname: "Nick" }],
  };
}

async function main() {
  await cleanup();
  const run = await prisma.importRun.create({ data: { kind: `${MARK}-run` } });

  // Очередь пачки: обычный черновик, «возможный дубль», уже разобранный
  // и черновик, чьё событие успели завести руками (тот же sourceUrl).
  const plain = await prisma.eventDraft.create({ data: draftData("plain") });
  const dupe = await prisma.eventDraft.create({
    data: draftData("dupe", {
      possibleDuplicateOf: { eventId: "whatever", eventTitle: "TTMBATCH existing" },
    }),
  });
  const rejected = await prisma.eventDraft.create({
    data: { ...draftData("rejected"), status: "REJECTED" },
  });
  const manual = await prisma.eventDraft.create({ data: draftData("manual") });
  const manualEvent = await prisma.event.create({
    data: { title: "TTMBATCH manual event", venue: "Batch Arena", sourceUrl: url("manual") },
  });

  const submissions: TtmImportSubmission[] = [];
  const fakeCreate = async (data: TtmImportSubmission) => {
    submissions.push(data);
    const event = await prisma.event.create({
      data: { title: data.title, venue: data.venue, sourceUrl: data.sourceUrl },
    });
    return { id: event.id };
  };

  try {
    const result = await approveEventDraftsBatch(
      [plain.id, dupe.id, rejected.id, manual.id],
      { runId: run.id, createEvent: fakeCreate, delayMs: 0 },
    );

    assert.equal(result.total, 4);
    assert.equal(result.created, 1, "создан только обычный черновик");
    assert.equal(result.skippedDupes, 1, "возможный дубль пропущен, не одобрен");
    assert.equal(result.skippedResolved, 1, "REJECTED в пачку не попадает");
    assert.equal(result.linked, 1, "существующее событие — линковка, не дубль");
    assert.equal(result.failed, 0);

    // Пропущенный дубль остался PENDING — очередь его не потеряла.
    const dupeAfter = await prisma.eventDraft.findUniqueOrThrow({ where: { id: dupe.id } });
    assert.equal(dupeAfter.status, "PENDING", "возможный дубль ждёт точечного решения");
    assert.equal(dupeAfter.eventId, null);

    // Обычный — APPROVED с созданным событием и следом в журнале.
    const plainAfter = await prisma.eventDraft.findUniqueOrThrow({ where: { id: plain.id } });
    assert.equal(plainAfter.status, "APPROVED");
    assert.ok(plainAfter.eventId, "черновик ссылается на созданное событие");
    assert.ok(plainAfter.reviewedAt, "reviewedAt проставлен");
    const items = await prisma.importedItem.findMany({ where: { runId: run.id } });
    assert.equal(items.length, 1, "ImportedItem — только на реально созданное");
    assert.equal(items[0].entityId, plainAfter.eventId);

    // Линковка: черновик привязан к событию, заведённому руками.
    const manualAfter = await prisma.eventDraft.findUniqueOrThrow({ where: { id: manual.id } });
    assert.equal(manualAfter.status, "APPROVED");
    assert.equal(manualAfter.eventId, manualEvent.id);

    // Через шов уехал корректный сабмишен (общий маппинг с точечным
    // «Одобрить» — ttmDraftSubmission): только совпавшие артисты.
    assert.equal(submissions.length, 1);
    assert.deepEqual(submissions[0].extraPerformerIds, [`perf-${MARK}`]);
    assert.deepEqual(submissions[0].artists, [], "новые артисты пачкой не заводятся");

    const summary = summarizeEventDraftsBatch(result);
    assert.match(summary, /создано 1/);
    assert.match(summary, /пропущено как возможные дубли: 1 — одобряйте точечно/);

    // Ошибка одного черновика пачку не роняет: он остаётся PENDING и
    // попадает в «не вышло».
    const broken = await prisma.eventDraft.create({ data: draftData("broken") });
    const second = await prisma.eventDraft.create({ data: draftData("second") });
    const result2 = await approveEventDraftsBatch([broken.id, second.id], {
      runId: run.id,
      delayMs: 0,
      createEvent: async (data) =>
        data.sourceUrl === url("broken")
          ? Promise.reject(new Error("нет даты"))
          : fakeCreate(data),
    });
    assert.equal(result2.created, 1, "второй черновик создан несмотря на ошибку первого");
    assert.equal(result2.failed, 1);
    assert.deepEqual(result2.failedTitles, ["TTMBATCH broken"]);
    const brokenAfter = await prisma.eventDraft.findUniqueOrThrow({ where: { id: broken.id } });
    assert.equal(brokenAfter.status, "PENDING", "упавший черновик остаётся в очереди");

    // Маппинг пресейла: обе половины есть — ссылка ведёт на страницу TTM.
    const withPresale = ttmDraftSubmission({
      sourceUrl: url("presale"),
      payload: { title: "T", presaleDate: "2030-01-01", presaleTime: "10:00" },
      matchedPerformers: [],
    });
    assert.equal(withPresale.presaleUrl, url("presale"));

    // Черновик ThaiStarX: своя ссылка на продажи и часовой пояс едут в
    // событие; нет билетной ссылки — пусто, а не адрес самого поста.
    const tsx = ttmDraftSubmission({
      sourceUrl: "https://thaistarx.com/en/some-post/",
      payload: { title: "T", presaleDate: "2030-01-01", presaleTime: "10:00", presaleUrl: null, timezone: "Asia/Taipei" },
      matchedPerformers: [],
    });
    assert.equal(tsx.presaleUrl, "", "без билетной ссылки — пусто, не сам пост");
    assert.equal(tsx.timezone, "Asia/Taipei");
    const tsxLink = ttmDraftSubmission({
      sourceUrl: "https://thaistarx.com/en/some-post/",
      payload: { title: "T", presaleUrl: "https://kktix.com/x", timezone: null },
      matchedPerformers: [],
    });
    assert.equal(tsxLink.presaleUrl, "https://kktix.com/x", "билетная ссылка — и без даты старта продаж");

    console.log("ok: eventDraftsBatch");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
