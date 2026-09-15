"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { catalogEventsWhere } from "@/lib/catalogEvents";

// «Видела вживую» живёт у СОБЫТИЯ (правка владельца 2026-09-15): решение
// «видела / не видела этого артиста именно здесь» — строка
// EventSeenPerformer поверх умолчания правила (lib/seenLive.ts). Раньше
// решение было одно на артиста, и снять его с одного фестиваля значило
// снять со всех концертов. Отметку «иду» на событии ничто из этого не
// трогает.
//
// Строка хранится ВСЕГДА, даже если решение совпало с умолчанием: у дня
// фестиваля «никто» — это умолчание, но человек, отметивший артиста и
// снявший обратно, сделал выбор, и он не должен «отклеиваться», если
// владелец потом допишет дню лайнап и умолчание сменится.

export type SeenResult = { seen: boolean };

/** Переключить «видела» у артиста на событии. Доступно только тому, у
 *  кого на этом событии стоит «иду» на прошедшую дату — иначе нечего
 *  и снимать. */
export async function toggleEventSeen(eventId: string, performerId: string): Promise<SeenResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.eventSeenPerformer.findUnique({
    where: { userId_eventId_performerId: { userId: user.id, eventId, performerId } },
    select: { seen: true },
  });
  // Умолчание — то, что показывал глазик до клика: страница передаёт
  // его сама, здесь нужен только следующий шаг. Без строки — считаем от
  // умолчания правила: день с лайнапом → false, иначе true.
  const current = existing ? existing.seen : await defaultSeen(user.id, eventId, performerId);
  const next = !current;

  await prisma.eventSeenPerformer.upsert({
    where: { userId_eventId_performerId: { userId: user.id, eventId, performerId } },
    create: { userId: user.id, eventId, performerId, seen: next },
    update: { seen: next },
  });

  revalidateSeen(eventId);
  return { seen: next };
}

/** «Видели всех» / «никого» на одном дне фестиваля: строка на каждого
 *  из лайнапа дня. У дня без своего лайнапа — на весь состав события. */
export async function setDaySeen(
  eventId: string,
  occurrenceId: string,
  seen: boolean,
): Promise<{ ok: true }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { id: occurrenceId, eventId, event: catalogEventsWhere() },
    select: {
      lineup: { select: { performerId: true } },
      event: { select: { performers: { select: { performerId: true } } } },
    },
  });
  if (!occurrence) return { ok: true };
  const ids = (occurrence.lineup.length > 0 ? occurrence.lineup : occurrence.event.performers).map(
    (r) => r.performerId,
  );

  await prisma.$transaction(
    ids.map((performerId) =>
      prisma.eventSeenPerformer.upsert({
        where: { userId_eventId_performerId: { userId: user.id, eventId, performerId } },
        create: { userId: user.id, eventId, performerId, seen },
        update: { seen },
      }),
    ),
  );

  revalidateSeen(eventId);
  return { ok: true };
}

/** «Видели вне афиши» — отметка на артиста без события (концерт до
 *  регистрации, встреча, которой у нас нет). Одна на человека. */
export async function toggleOutsideSeen(performerId: string): Promise<SeenResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.performerSeen.findUnique({
    where: { userId_performerId: { userId: user.id, performerId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.performerSeen.delete({ where: { id: existing.id } });
  } else {
    await prisma.performerSeen.create({ data: { userId: user.id, performerId } });
  }

  revalidatePath("/account");
  return { seen: !existing };
}

/** Умолчание правила для одного артиста на событии: есть ли у человека
 *  посещённая дата этого события, где артист в составе дня БЕЗ своего
 *  лайнапа (у дня с лайнапом умолчание «никто»). Группы здесь не
 *  раскрываются — участник, которого нет в составе напрямую, получает
 *  «нет», и первый клик ставит ему «да»; это и есть ожидаемое. */
async function defaultSeen(userId: string, eventId: string, performerId: string): Promise<boolean> {
  const plainDay = await prisma.eventAttendance.count({
    where: {
      userId,
      eventId,
      occurrence: {
        startsAt: { lt: new Date() },
        lineup: { none: {} },
        event: { performers: { some: { performerId } } },
      },
    },
  });
  return plainDay > 0;
}

function revalidateSeen(eventId: string) {
  revalidatePath("/account");
  revalidatePath(`/event/${eventId}`);
}
