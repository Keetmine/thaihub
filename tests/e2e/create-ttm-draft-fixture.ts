import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Фикстуры для ttm-drafts.spec.ts: несколько черновиков события в
// очереди PENDING + совпавший исполнитель — на точечные кнопки и на
// массовые действия BulkList (отклонение выбранных, одобрение пачкой с
// пропуском «возможного дубля»). Всё помечено TTMDRAFT_E2E — убирает
// delete-ttm-draft-fixture.ts (запускается отдельным tsx-процессом —
// Prisma в спеки не импортировать, см. docs/testing.md).

const url = (slug: string) =>
  `https://www.thaiticketmajor.com/concert/ttmdraft-e2e-${slug}.html`;

// Пометка слабого совпадения матчинга дублей (eventDedupe.ts) — спек
// проверяет чип «Возможный дубль» и пропуск при массовом одобрении.
// Событие с таким id не существует нарочно: чип рисуется из самой
// пометки и битой ссылки не боится.
const DUPE_MARK = {
  possibleDuplicateOf: {
    eventId: "ttmdraft-e2e-missing-event",
    eventTitle: "TTMDRAFT_E2E Existing Event",
  },
};

function payload(title: string, extra: Record<string, unknown> = {}) {
  return {
    title,
    venue: "E2E Arena",
    date: "2030-01-05",
    startTime: "18:00",
    extraDates: ["2030-01-06"],
    dateRangeText: null,
    posterUrl: null,
    ticketPrice: "1,000 baht",
    artists: [{ fullName: "Full Name", nickname: "TTMDRAFT_E2E Nick" }],
    ...extra,
  };
}

async function main() {
  const performer = await prisma.performer.upsert({
    where: { slug: "ttmdraft-e2e-performer" },
    update: {},
    create: { slug: "ttmdraft-e2e-performer", name: "TTMDRAFT_E2E Nick" },
  });
  const matched = [{ performerId: performer.id, nickname: "TTMDRAFT_E2E Nick" }];

  // slug → [название, дополнение payload]. smoke — карточка с чипом и
  // точечное «Отклонить»; bulk1/bulk2 — массовое отклонение; approve —
  // массовое одобрение (постера нет — событие создаётся без сети);
  // dupe — «возможный дубль», пачка одобрения обязана его пропустить.
  const drafts: [string, string, Record<string, unknown>][] = [
    ["smoke", "TTMDRAFT_E2E Smoke Concert", DUPE_MARK],
    ["bulk1", "TTMDRAFT_E2E Bulk Reject One", {}],
    ["bulk2", "TTMDRAFT_E2E Bulk Reject Two", {}],
    ["approve", "TTMDRAFT_E2E Bulk Approve", {}],
    ["dupe", "TTMDRAFT_E2E Bulk Dupe", DUPE_MARK],
  ];
  for (const [slug, title, extra] of drafts) {
    await prisma.eventDraft.upsert({
      where: { sourceUrl: url(slug) },
      update: { status: "PENDING", reviewedAt: null, eventId: null },
      create: {
        sourceUrl: url(slug),
        status: "PENDING",
        payload: payload(title, { sourceUrl: url(slug), ...extra }),
        matchedPerformers: matched,
      },
    });
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
