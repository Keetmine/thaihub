import { prisma } from "@/lib/prisma";
import { endOfDay } from "@/lib/dates";

/**
 * Прошло ли событие целиком (правка владельца 2026-09-08).
 *
 * Общее место для правила, потому что спрашивают о нём двое: страница
 * (прячет блок отзывов у будущего события) и серверный экшен
 * `saveReview` (не даёт его написать). Форма без кнопки — не защита:
 * server action вызывается напрямую, мимо любой страницы.
 *
 * Прошедшим считается событие, у которого закончилась ПОСЛЕДНЯЯ дата: у
 * двухдневного фестиваля второй день ещё впереди, и «уже прошедшим» он
 * не стал. Дата без времени кончается вместе с днём — `startsAt` у неё
 * 00:00, и сравнение с «сейчас» объявило бы её прошедшей в первую же
 * минуту суток.
 *
 * Событие без дат вовсе считаем НЕ прошедшим: даты обычно ещё не
 * объявили, и отзыв о нём писать не о чем.
 */
export async function isEventFinished(eventId: string): Promise<boolean> {
  const last = await prisma.eventOccurrence.findFirst({
    where: { eventId },
    orderBy: { startsAt: "desc" },
    select: { startsAt: true, endsAt: true, hasTime: true },
  });
  if (!last) return false;
  const finishedAt = last.hasTime ? (last.endsAt ?? last.startsAt) : endOfDay(last.startsAt);
  // new Date(), а не Date.now(): правило react-hooks запрещает второй в
  // рендере как нестабильный вызов (см. admin/errors/page.tsx).
  return finishedAt.getTime() < new Date().getTime();
}
