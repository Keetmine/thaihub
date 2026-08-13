export type EventWithPerformers = {
  id: string;
  title: string;
  venue: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  performers: { performer: { id: string; name: string } }[];
};
