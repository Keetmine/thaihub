// One row in an event list — one EventOccurrence, flattened together
// with its parent Event's shared fields. `id` stays the Event id (so
// favorite/going toggles and the detail link keep working unchanged
// across every occurrence of the same event); `occurrenceId` is only for
// React list keys, since the same Event can legitimately appear more
// than once (a multi-day concert) and needs a key unique per date.
export type EventWithPerformers = {
  id: string;
  occurrenceId: string;
  title: string;
  slug: string | null;
  venue: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  posterUrl: string | null;
  performers: { performer: { id: string; name: string; slug: string | null } }[];
};
