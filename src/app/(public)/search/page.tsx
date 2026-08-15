import { prisma } from "@/lib/prisma";
import EventAgendaRow from "@/components/EventAgendaRow";
import EntityMiniCard from "@/components/EntityMiniCard";
import { getFavoritedEventIds, getGoingEventIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByEvent } from "@/lib/friends";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getCurrentUser } from "@/lib/userAuth";
import { performerHref } from "@/lib/performerSlug";

export const dynamic = "force-dynamic";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-4">
      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        {title} ({count})
      </h2>
      {children}
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const [matchedEvents, performers, dramas, agencies, locations] = query
    ? await Promise.all([
        prisma.event.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { venue: { contains: query, mode: "insensitive" } },
              { performers: { some: { performer: { name: { contains: query, mode: "insensitive" } } } } },
            ],
          },
          include: {
            performers: { include: { performer: true } },
            occurrences: { orderBy: { startsAt: "asc" } },
          },
        }),
        prisma.performer.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { realName: { contains: query, mode: "insensitive" } },
            ],
          },
          orderBy: { name: "asc" },
          take: 24,
        }),
        prisma.drama.findMany({
          where: { title: { contains: query, mode: "insensitive" } },
          orderBy: { title: "asc" },
          take: 24,
        }),
        prisma.agency.findMany({
          where: { name: { contains: query, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: 24,
        }),
        prisma.location.findMany({
          where: { name: { contains: query, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: 24,
        }),
      ])
    : [[], [], [], [], []];

  const events = matchedEvents
    .flatMap((ev) => ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const currentUser = await getCurrentUser();
  const eventIds = events.map((ev) => ev.id);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingEventIds(eventIds, currentUser?.id),
    getFriendIds(currentUser?.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByEvent(eventIds, friendIds);

  const totalCount =
    events.length + performers.length + dramas.length + agencies.length + locations.length;

  return (
    <div>
      <span className="eyebrow">Поиск</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        {q ? `«${q}»` : "Поиск"}
      </h1>

      {!query ? (
        <p className="text-secondary">
          Введите название события, исполнителя, сериала, локации или агентства в поиске сверху.
        </p>
      ) : totalCount === 0 ? (
        <p className="text-secondary">Ничего не найдено по запросу «{q}».</p>
      ) : (
        <>
          <Section title="События" count={events.length}>
            <div className="d-flex flex-column gap-2">
              {events.map((ev) => (
                <EventAgendaRow
                  key={ev.occurrenceId}
                  event={ev}
                  isFavorited={favoritedIds.has(ev.id)}
                  isGoing={goingIds.has(ev.id)}
                  friendsGoing={friendsGoingByEvent.get(ev.id) ?? []}
                  showDate
                />
              ))}
            </div>
          </Section>

          <Section title="Исполнители" count={performers.length}>
            <div className="d-flex flex-wrap gap-2">
              {performers.map((p) => (
                <EntityMiniCard
                  key={p.id}
                  href={performerHref(p)}
                  photoUrl={p.photoUrl}
                  name={p.name}
                />
              ))}
            </div>
          </Section>

          <Section title="Сериалы" count={dramas.length}>
            <div className="d-flex flex-wrap gap-2">
              {dramas.map((d) => (
                <EntityMiniCard
                  key={d.id}
                  href={`/dramas/${d.id}`}
                  photoUrl={d.posterUrl}
                  name={d.title}
                  round={false}
                />
              ))}
            </div>
          </Section>

          <Section title="Локации" count={locations.length}>
            <div className="d-flex flex-wrap gap-2">
              {locations.map((l) => (
                <EntityMiniCard
                  key={l.id}
                  href={`/locations/${l.id}`}
                  photoUrl={l.photoUrl}
                  name={l.name}
                  round={false}
                />
              ))}
            </div>
          </Section>

          <Section title="Агентства" count={agencies.length}>
            <div className="d-flex flex-wrap gap-2">
              {agencies.map((a) => (
                <EntityMiniCard
                  key={a.id}
                  href={`/agencies/${a.id}`}
                  photoUrl={a.logoUrl}
                  name={a.name}
                />
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
