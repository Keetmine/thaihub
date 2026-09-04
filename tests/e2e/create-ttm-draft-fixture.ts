import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Фикстура для ttm-drafts.spec.ts: один черновик события в очереди
// PENDING + совпавший исполнитель. Всё помечено TTMDRAFT_E2E — убирает
// delete-ttm-draft-fixture.ts (запускается отдельным tsx-процессом —
// Prisma в спеки не импортировать, см. docs/testing.md).

const SOURCE_URL = "https://www.thaiticketmajor.com/concert/ttmdraft-e2e-smoke.html";

async function main() {
  const performer = await prisma.performer.upsert({
    where: { slug: "ttmdraft-e2e-performer" },
    update: {},
    create: { slug: "ttmdraft-e2e-performer", name: "TTMDRAFT_E2E Nick" },
  });
  await prisma.eventDraft.upsert({
    where: { sourceUrl: SOURCE_URL },
    update: { status: "PENDING", reviewedAt: null, eventId: null },
    create: {
      sourceUrl: SOURCE_URL,
      status: "PENDING",
      payload: {
        title: "TTMDRAFT_E2E Smoke Concert",
        venue: "E2E Arena",
        date: "2030-01-05",
        startTime: "18:00",
        extraDates: ["2030-01-06"],
        dateRangeText: null,
        posterUrl: null,
        ticketPrice: "1,000 baht",
        artists: [{ fullName: "Full Name", nickname: "TTMDRAFT_E2E Nick" }],
        sourceUrl: SOURCE_URL,
        // Пометка слабого совпадения матчинга дублей (eventDedupe.ts) —
        // спек проверяет чип «Возможный дубль». Событие с таким id не
        // существует нарочно: чип рисуется из самой пометки и битой
        // ссылки не боится.
        possibleDuplicateOf: {
          eventId: "ttmdraft-e2e-missing-event",
          eventTitle: "TTMDRAFT_E2E Existing Event",
        },
      },
      matchedPerformers: [{ performerId: performer.id, nickname: "TTMDRAFT_E2E Nick" }],
    },
  });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
