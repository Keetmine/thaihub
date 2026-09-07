import type { Prisma } from "@/generated/prisma/client";
import { viewerCommunitiesWhere } from "@/lib/communities";

/**
 * Что считается КАТАЛОЖНЫМ событием (АА25).
 *
 * С появлением сообществ у `Event` стало два разных смысла: афишные
 * события (концерты, фанмиты, премьеры — их заводит админка и
 * импортёры) и встречи сообществ («пью пиво и смотрю сериал», их
 * заводят люди). Модель одна намеренно: встреча получает карточку,
 * «я иду», комментарии, карту и календарь бесплатно.
 *
 * Цена этого решения — вот этот фильтр. Каждое место, где события
 * берутся скопом (афиша, главная, календарь, страницы артиста, локации,
 * сериала, карта сайта, поиск), обязано идти через него, иначе домашние
 * посиделки окажутся в общей афише рядом с концертом в Impact Arena.
 *
 * Правило простое: каталожное событие — то, у которого нет сообщества.
 *
 * ```ts
 * where: { ...catalogEventsWhere(), startsAt: { gte: now } }
 * ```
 */
export function catalogEventsWhere(): Prisma.EventWhereInput {
  return { communityId: null };
}

/** То же условие, но для выборок, которые идут от `EventOccurrence`. */
export function catalogOccurrencesWhere(): Prisma.EventOccurrenceWhereInput {
  return { event: { communityId: null } };
}

/**
 * Встречи сообществ, доступные ЗРИТЕЛЮ: только тех сообществ, где он
 * состоит.
 *
 * Отдельной вкладкой афиши, а не строками в общей ленте (правка
 * владельца 2026-09-08): встречу видят лишь участники, и в ленте,
 * которую видят все, ей делать нечего. Гостю и постороннему эта функция
 * не отдаёт ничего — по невозможному условию, а не по забытому `if`.
 */
export function viewerMeetupsWhere(userId: string | null | undefined): Prisma.EventWhereInput {
  if (!userId) return { id: { in: [] } };
  return {
    communityId: { not: null },
    // Само «где я состою» — общей функцией: тем же условием отбираются
    // обсуждения (главная), и две копии одного правила приватности
    // однажды разъехались бы молча.
    community: viewerCommunitiesWhere(userId),
  };
}

/**
 * Область видимости событий для зрителя: вся афиша плюс встречи ЕГО
 * сообществ. Нужна там, где смешивать можно и нужно, — например в «я
 * иду»: человек отметился на встрече, и она обязана быть в его списке
 * (правка владельца 2026-09-08: «можно смешивать, ничего страшного»).
 */
export function viewerEventsWhere(userId: string | null | undefined): Prisma.EventWhereInput {
  if (!userId) return catalogEventsWhere();
  return {
    OR: [{ communityId: null }, { community: viewerCommunitiesWhere(userId) }],
  };
}
