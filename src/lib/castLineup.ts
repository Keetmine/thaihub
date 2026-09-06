import { prisma } from "@/lib/prisma";

/**
 * Общие правила ЛЮБОГО списка исполнителей на витрине (АА4 и АА14 из
 * списка владельца 2026-09-06). Лежат одним модулем, а не копией в
 * каждой странице: правила применяются к одним и тем же спискам на
 * страницах сериала, события и артистов, и первое же уточнение развело
 * бы копии.
 */

/** Ребро пейринга: кто с кем в паре (Pairing.performerAId/BId). */
export type PairingEdge = { performerAId: string; performerBId: string };

/**
 * АА4. Ставит участников пейринга РЯДОМ в уже отсортированном списке.
 *
 * Это правило про ПОРЯДОК, а не про новую сущность: сортировка списка
 * (по популярности, по алфавиту — как решила страница) остаётся, просто
 * пара не разъезжается по нему. Группа целиком встаёт на место своего
 * первого (то есть самого «сильного» по исходной сортировке) участника,
 * внутри группы исходный порядок сохраняется — так пара не тянет
 * малоизвестного человека в начало списка и не роняет известного вниз.
 *
 * Считается связными компонентами, а не «нашли пару — переставили»:
 * у человека может быть несколько пейрингов сразу (см. Pairing.status в
 * docs/features/catalog.md), и цепочка A×B + B×C должна собраться в одну
 * тройку, иначе перестановки зависели бы от порядка обхода.
 *
 * Статус пары (CURRENT/PAST) не учитывается намеренно: бывшая пара в
 * касте старого сериала — ровно тот случай, ради которого соседство и
 * заводилось.
 */
export function keepPairingsTogether<T>(
  items: T[],
  idOf: (item: T) => string,
  pairings: PairingEdge[],
): T[] {
  if (items.length < 2 || pairings.length === 0) return items;

  const parent = new Map<string, string>();
  for (const item of items) parent.set(idOf(item), idOf(item));

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Сжатие пути: списки короткие, но цикл дешевле копии дерева.
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  let united = false;
  for (const { performerAId, performerBId } of pairings) {
    if (!parent.has(performerAId) || !parent.has(performerBId)) continue;
    const rootA = find(performerAId);
    const rootB = find(performerBId);
    if (rootA === rootB) continue;
    parent.set(rootB, rootA);
    united = true;
  }
  if (!united) return items;

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const root = find(idOf(item));
    const group = groups.get(root);
    if (group) group.push(item);
    else groups.set(root, [item]);
  }
  return Array.from(groups.values()).flat();
}

/**
 * Пейринги, у которых ОБА участника есть в переданном списке. Запрос
 * симметричный (`A in ids AND B in ids`), поэтому порядок имён в паре
 * значения не имеет.
 */
export async function fetchPairingsAmong(performerIds: string[]): Promise<PairingEdge[]> {
  if (performerIds.length < 2) return [];
  return prisma.pairing.findMany({
    where: {
      performerAId: { in: performerIds },
      performerBId: { in: performerIds },
    },
    select: { performerAId: true, performerBId: true },
  });
}

/**
 * АА14. Убирает из списка участников тех групп, которые в этом же списке
 * стоят сами.
 *
 * Смысл: к событию/сериалу привязана и группа (Performer type BAND), и
 * её участники по отдельности — на странице это один и тот же состав
 * дважды. Показываем группу, участники «прячутся» внутрь неё.
 *
 * Чисто отображение: СВЯЗИ В БАЗЕ НЕ ТРОГАЕМ — на странице самого
 * участника это событие/сериал должен остаться.
 *
 * @param bandMemberIdsOf — для записи-группы её состав (id участников),
 *   для всех остальных `undefined`/пусто.
 */
export function hideMembersOfListedBands<T>(
  items: T[],
  idOf: (item: T) => string,
  bandMemberIdsOf: (item: T) => readonly string[] | undefined,
): T[] {
  const hidden = new Set<string>();
  for (const item of items) {
    const bandId = idOf(item);
    for (const memberId of bandMemberIdsOf(item) ?? []) {
      // Группу саму собой не спрятать (страховка от кривых данных:
      // группа, записанная в собственный состав).
      if (memberId !== bandId) hidden.add(memberId);
    }
  }
  if (hidden.size === 0) return items;
  return items.filter((item) => !hidden.has(idOf(item)));
}
