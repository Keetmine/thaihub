import { prisma } from "@/lib/prisma";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import EntityMiniCard from "@/components/EntityMiniCard";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getCurrentUser } from "@/lib/userAuth";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { isPremiumActive } from "@/lib/premium";
import { agencyHref, locationHref } from "@/lib/slugHelpers";

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
      <h2 className="section-heading mb-2">
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
          where: {
            createdByUserId: null, name: { contains: query, mode: "insensitive" } },
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
  const occIds = events.map((ev) => ev.occurrenceId);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
    getFriendIds(currentUser?.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(occIds, friendIds);

  const totalCount =
    events.length + performers.length + dramas.length + agencies.length + locations.length;

  return (
    <div>
      <span className="eyebrow">Поиск</span>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.25rem" }}>
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
            <div className="d-flex flex-column gap-3">
              {events.map((ev) => (
                isPremiumActive(currentUser) ? (

                  <EventAgendaRow
                  key={ev.occurrenceId}
                  event={ev}
                  isFavorited={favoritedIds.has(ev.id)}
                  isGoing={goingIds.has(ev.occurrenceId)}
                  friendsGoing={friendsGoingByEvent.get(ev.occurrenceId) ?? []}
                  showDate
                />

                ) : (

                  <EventCardLocked key={ev.occurrenceId} startsAt={ev.startsAt} />

                )
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
                  href={dramaHref(d)}
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
                  href={locationHref(l)}
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
                  href={agencyHref(a)}
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
