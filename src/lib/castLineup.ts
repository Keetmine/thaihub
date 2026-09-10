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
 * АА4. Ставит участников пейринга РЯДОМ и в порядке самого пейринга.
 *
 * Это правило про ПОРЯДОК, а не про новую сущность: сортировка списка
 * (по популярности, по алфавиту — как решила страница) остаётся, просто
 * пара не разъезжается по нему. Группа целиком встаёт на место своего
 * первого (то есть самого «сильного» по исходной сортировке) участника,
 * так пара не тянет малоизвестного человека в начало списка и не роняет
 * известного вниз.
 *
 * ВНУТРИ группы порядок задаёт САМ ПЕЙРИНГ — сначала `performerA`,
 * потом `performerB` (правка владельца 2026-09-10: «везде, где есть
 * вывод актёров, пара должна стоять вместе и всегда в том порядке, как
 * указано в пейринге»). Раньше внутри сохранялся порядок исходного
 * списка, и «Zee × NuNew» на одной странице выглядел как «NuNew × Zee»
 * на другой — по числу событий.
 *
 * `pairsFirst` поднимает пары в начало списка целиком: так каст сериала
 * открывается парами, ради которых его и смотрят, а одиночки идут
 * следом своим прежним порядком.
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
  options: { pairsFirst?: boolean } = {},
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

  // Порядок внутри группы — по самим пейрингам: идём по ним подряд и
  // выкладываем A, потом B. Кто в пейринги не попал (третий участник
  // цепочки, которого связали через кого-то) — следом, в порядке
  // исходного списка.
  const byId = new Map(items.map((item) => [idOf(item), item]));
  const ordered = new Map<string, T[]>();
  for (const [root, group] of groups) {
    if (group.length < 2) {
      ordered.set(root, group);
      continue;
    }
    const memberIds = new Set(group.map(idOf));
    const seen = new Set<string>();
    const out: T[] = [];
    const push = (id: string) => {
      if (!memberIds.has(id) || seen.has(id)) return;
      seen.add(id);
      out.push(byId.get(id)!);
    };
    for (const { performerAId, performerBId } of pairings) {
      if (!memberIds.has(performerAId) || !memberIds.has(performerBId)) continue;
      push(performerAId);
      push(performerBId);
    }
    for (const item of group) push(idOf(item));
    ordered.set(root, out);
  }

  const result = [...ordered.values()];
  if (!options.pairsFirst) return result.flat();
  // Пары вперёд, одиночки следом — и те, и другие своим прежним
  // относительным порядком.
  return [...result.filter((g) => g.length > 1), ...result.filter((g) => g.length === 1)].flat();
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
    // Порядок пейрингов задаёт порядок людей внутри группы (см.
    // keepPairingsTogether), поэтому он должен быть устойчивым, а не
    // «как легло из базы».
    orderBy: { createdAt: "asc" },
    select: { performerAId: true, performerBId: true },
  });
}

/** Слот расписания: когда и на какой сцене выступает исполнитель
 *  (OccurrenceLineup.timeText/stage — обе строки свободные). */
export type LineupSlot = { timeText?: string | null; stage?: string | null };

/**
 * Минуты от начала фестивального дня по строке времени с афиши
 * («16:00-16:45», «00:30»). Ночные слоты — это ещё вчерашний день
 * фестиваля, поэтому всё раньше шести утра уезжает за сутки: иначе
 * последнее выступление вставало бы первым в списке.
 */
function slotMinutes(timeText: string | null | undefined): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(timeText ?? "");
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes < 6 * 60 ? minutes + 24 * 60 : minutes;
}

/**
 * Раскладывает состав дня по сценам и выстраивает по времени — так
 * расписание фестиваля читается как афиша, а не как список имён.
 *
 * Сцены идут в порядке первого выступления, внутри сцены — по времени;
 * у кого времени нет, тот в конце своей сцены, а группа без сцены —
 * в конце дня. Если ни времени, ни сцен нет (обычный концерт), вернётся
 * одна группа с `stage: null` и исходным порядком: страница нарисует её
 * ровно так, как рисовала состав до расписаний.
 */
export function groupLineupByStage<T extends LineupSlot>(
  items: T[],
): { stage: string | null; items: T[] }[] {
  const groups = new Map<string, { stage: string | null; items: T[] }>();
  for (const item of items) {
    const stage = item.stage?.trim() || null;
    const key = stage ?? "";
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { stage, items: [item] });
  }

  const order = new Map([...groups.keys()].map((key, i) => [key, i]));
  const earliest = (rows: T[]) => {
    const times = rows.map((r) => slotMinutes(r.timeText)).filter((v): v is number => v !== null);
    return times.length > 0 ? Math.min(...times) : Number.POSITIVE_INFINITY;
  };

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items
        .map((item, i) => ({ item, i, at: slotMinutes(item.timeText) }))
        .sort((a, b) => (a.at ?? Number.POSITIVE_INFINITY) - (b.at ?? Number.POSITIVE_INFINITY) || a.i - b.i)
        .map((row) => row.item),
    }))
    .sort((a, b) => {
      // Безымянная сцена — всегда последней: это «остальные», а не
      // очередная площадка фестиваля.
      if ((a.stage === null) !== (b.stage === null)) return a.stage === null ? 1 : -1;
      const startA = earliest(a.items);
      const startB = earliest(b.items);
      if (startA !== startB) return startA - startB;
      return (order.get(a.stage ?? "") ?? 0) - (order.get(b.stage ?? "") ?? 0);
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
