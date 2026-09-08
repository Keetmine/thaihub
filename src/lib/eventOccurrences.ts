import type { EventWithPerformers } from "@/lib/types";

type OccurrenceWithEvent = {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  hasTime?: boolean;
  event: {
    id: string;
    title: string;
    slug: string | null;
    venue: string;
    /** Онлайн-встреча сообщества — см. EventWithPerformers.isOnline. */
    isOnline?: boolean;
    description: string | null;
    posterUrl: string | null;
    performers: { performer: { id: string; name: string; slug: string | null } }[];
    /** Есть только там, где запрос его просит (афиша: вкладки
     *  «Сообщества» и «Я иду») — см. EventWithPerformers.community. */
    community?: { id: string; slug: string | null; title: string } | null;
  };
};

/** Flattens one EventOccurrence (+ its parent Event) into the shape
 *  EventAgendaRow and friends expect — see EventWithPerformers in
 *  lib/types.ts for why `id` stays the Event id. */
export function flattenOccurrence(occ: OccurrenceWithEvent): EventWithPerformers {
  return {
    id: occ.event.id,
    occurrenceId: occ.id,
    title: occ.event.title,
    slug: occ.event.slug,
    venue: occ.event.venue,
    isOnline: occ.event.isOnline ?? false,
    description: occ.event.description,
    posterUrl: occ.event.posterUrl,
    startsAt: occ.startsAt,
    hasTime: occ.hasTime ?? true,
    endsAt: occ.endsAt,
    performers: occ.event.performers,
    community: occ.event.community ?? null,
  };
}

/** Схлопывает строки-даты одного события в одну: ближайшая (первая по
 *  порядку) дата + сколько дат осталось. Для списков «события сущности»
 *  (артист, сериал, локация, поиск), где трёхдневный фестиваль не должен
 *  занимать три одинаковые строки. В афише/календаре, наоборот, нужна
 *  строка на дату — там эта функция не применяется. */
export function groupByEvent(
  rows: EventWithPerformers[],
): { row: EventWithPerformers; extraDates: number }[] {
  const byEvent = new Map<string, { row: EventWithPerformers; extraDates: number }>();
  for (const row of rows) {
    const existing = byEvent.get(row.id);
    if (existing) existing.extraDates += 1;
    else byEvent.set(row.id, { row, extraDates: 0 });
  }
  return [...byEvent.values()];
}
