import type { EventWithPerformers } from "@/lib/types";

type OccurrenceWithEvent = {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  event: {
    id: string;
    title: string;
    venue: string;
    description: string | null;
    posterUrl: string | null;
    performers: { performer: { id: string; name: string } }[];
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
    venue: occ.event.venue,
    description: occ.event.description,
    posterUrl: occ.event.posterUrl,
    startsAt: occ.startsAt,
    endsAt: occ.endsAt,
    performers: occ.event.performers,
  };
}
