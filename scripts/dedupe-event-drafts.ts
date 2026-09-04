/**
 * Разовая чистка очереди черновиков краулера афиши TTM от дублей
 * (docs/features/ttm-crawl.md, «Дубли и бэкфилл источника»): первый
 * живой прогон наплодил PENDING-черновиков на события, которые в
 * каталоге уже есть, — их sourceUrl пуст (импортированы до того, как
 * ссылка-источник начала сохраняться), и дедуп по URL их не видел.
 *
 * По всем PENDING-черновикам прогоняется тот же матчинг, что теперь
 * встроен в краулер (src/lib/eventDedupe.ts):
 *  - СИЛЬНОЕ совпадение → черновик закрывается APPROVED с eventId (тот
 *    же смысл, что у «Одобрить» при уже существующем событии, — краулер
 *    такие URL больше не трогает) + на событие бэкфилится sourceUrl,
 *    если он пуст, — быстрый путь по URL дальше работает сам;
 *  - СЛАБОЕ → черновик остаётся в очереди, но получает пометку
 *    possibleDuplicateOf в payload — карточка рисует чип
 *    «Возможный дубль», решает владелец.
 *
 * Запуск:
 *   npx tsx --env-file=.env scripts/dedupe-event-drafts.ts          # показать
 *   npx tsx --env-file=.env scripts/dedupe-event-drafts.ts --apply  # применить
 */
import { prisma } from "../src/lib/prisma";
import {
  findCatalogDuplicate,
  type DraftLikeEvent,
  type PossibleDuplicate,
} from "../src/lib/eventDedupe";

const apply = process.argv.includes("--apply");

async function main() {
  const drafts = await prisma.eventDraft.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  console.log(
    `PENDING-черновиков: ${drafts.length}${apply ? "" : " (черновой режим, ничего не меняем — применение с --apply)"}`,
  );

  let strong = 0;
  let weak = 0;
  let backfilled = 0;

  for (const draft of drafts) {
    const payload = draft.payload as Partial<DraftLikeEvent> & {
      possibleDuplicateOf?: PossibleDuplicate;
      [k: string]: unknown;
    };
    const title = typeof payload.title === "string" ? payload.title : "";
    const match = await findCatalogDuplicate({
      title,
      date: payload.date ?? null,
      extraDates: payload.extraDates ?? [],
    });

    if (!match) {
      console.log(`  —  ${title || draft.sourceUrl} · совпадений нет, остаётся в очереди`);
      continue;
    }

    const simText = `похожесть ${match.similarity.toFixed(2)}, общих дат ${match.sharedDates.length}`;
    if (match.strength === "strong") {
      strong++;
      const willBackfill = !match.eventSourceUrl;
      console.log(
        `  ДУБЛЬ  «${title}» → событие «${match.eventTitle}» (${match.eventId}; ${simText})\n` +
          `         → черновик закрыть (APPROVED, eventId)` +
          (willBackfill
            ? `, бэкфилл sourceUrl = ${draft.sourceUrl}`
            : `, sourceUrl у события уже есть: ${match.eventSourceUrl}`),
      );
      if (apply) {
        if (willBackfill) {
          await prisma.event.update({
            where: { id: match.eventId },
            data: { sourceUrl: draft.sourceUrl },
          });
          backfilled++;
        }
        await prisma.eventDraft.update({
          where: { id: draft.id },
          data: {
            status: "APPROVED",
            eventId: match.eventId,
            reviewedAt: new Date(),
          },
        });
      } else if (willBackfill) {
        backfilled++;
      }
    } else {
      weak++;
      console.log(
        `  ?      «${title}» похоже на «${match.eventTitle}» (${match.eventId}; ${simText})\n` +
          `         → остаётся PENDING, пометка «возможный дубль» на карточке`,
      );
      if (apply) {
        await prisma.eventDraft.update({
          where: { id: draft.id },
          data: {
            payload: JSON.parse(
              JSON.stringify({
                ...payload,
                possibleDuplicateOf: {
                  eventId: match.eventId,
                  eventTitle: match.eventTitle,
                } satisfies PossibleDuplicate,
              }),
            ),
          },
        });
      }
    }
  }

  console.log(
    `\nИтог: сильных дублей ${strong} (${apply ? "закрыты" : "будут закрыты"}), ` +
      `бэкфилл sourceUrl: ${backfilled}, возможных дублей ${weak} ` +
      `(${apply ? "помечены" : "будут помечены"} чипом).` +
      (apply ? "" : " Применить: тот же запуск с --apply."),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
