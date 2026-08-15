import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import EntityMiniCard from "@/components/EntityMiniCard";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import VisitedButton from "@/components/VisitedButton";
import { BuildingIcon } from "@/components/icons";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { DRAMA_STATUS_LABELS } from "@/lib/dramaStatus";
import { performerHref } from "@/lib/performerSlug";
import { agencyHref, locationHref, slugOrIdWhere } from "@/lib/slugHelpers";
import { isPremiumActive } from "@/lib/premium";

export const dynamic = "force-dynamic";

export default async function DramaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;


  const drama = await prisma.drama.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      performers: { include: { performer: true } },
      agency: true,
      locations: { include: { location: true }, orderBy: { location: { name: "asc" } } },
    },
  });

  if (!drama) notFound();
  const id = drama.id;

  const dramaEvents = await prisma.event.findMany({
    where: { dramaId: id },
    include: {
      performers: { include: { performer: true } },
      occurrences: { orderBy: { startsAt: "asc" } },
    },
  });
  const events = dramaEvents
    .flatMap((ev) => ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const currentUser = await getCurrentUser();
  let watchStatus = null as Awaited<
    ReturnType<typeof prisma.dramaWatchStatus.findUnique>
  >;
  if (currentUser) {
    watchStatus = await prisma.dramaWatchStatus.findUnique({
      where: { userId_dramaId: { userId: currentUser.id, dramaId: id } },
    });
  }

  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);
  const [favoritedEventIds, goingEventIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
  ]);

  const visitedLocationIds = new Set<string>();
  if (currentUser && drama.locations.length > 0) {
    const visits = await prisma.locationVisit.findMany({
      where: {
        userId: currentUser.id,
        locationId: { in: drama.locations.map((dl) => dl.locationId) },
      },
      select: { locationId: true },
    });
    for (const v of visits) visitedLocationIds.add(v.locationId);
  }

  return (
    <div>
      <Link href="/dramas" className="eyebrow text-decoration-none">
        ← Все сериалы
      </Link>
      <h1 className="display-1-tight mt-3 mb-3 d-flex flex-wrap align-items-center gap-2" style={{ fontSize: "2.25rem" }}>
        {drama.title}{" "}
        {drama.year && (
          <span className="fs-5 fw-normal text-secondary">({drama.year})</span>
        )}
        {drama.status && (
          <span className="badge rounded-pill text-bg-secondary fs-6 fw-normal">
            {DRAMA_STATUS_LABELS[drama.status]}
          </span>
        )}
      </h1>

      <div className="row g-4">
        {(drama.posterUrl || currentUser) && (
          <div className="col-12 col-sm-4 col-md-3">
            {drama.posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={drama.posterUrl}
                alt={drama.title}
                className="surface"
                style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover" }}
              />
            )}
            {currentUser && (
              <div className="mt-3">
                <span className="small text-secondary d-block mb-1">Статус просмотра</span>
                <WatchStatusSelect dramaId={drama.id} status={watchStatus?.status ?? null} />
              </div>
            )}
          </div>
        )}

        <div className="col-12 col-sm-8 col-md-9">
          {drama.agency && (
            <p className="small text-secondary mb-2">
              <BuildingIcon /> <span className="text-secondary">Студия:</span>{" "}
              <Link href={agencyHref(drama.agency)} className="link-body-emphasis">
                {drama.agency.name}
              </Link>
            </p>
          )}

          {drama.synopsis && (
            <p className="text-secondary mb-3">{drama.synopsis}</p>
          )}

          {drama.mydramalistUrl && (
            <p className="mb-4">
              <a
                href={drama.mydramalistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                MyDramaList ↗
              </a>
            </p>
          )}

          <h2
            className="section-heading mb-2"
          >
            Актёрский состав
          </h2>
          {drama.performers.length === 0 ? (
            <p className="small text-secondary">Состав пока не указан.</p>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              {drama.performers.map(({ performer, role }) => (
                <EntityMiniCard
                  key={performer.id}
                  href={performerHref(performer)}
                  photoUrl={performer.photoUrl}
                  name={performer.name}
                  subtitle={role}
                />
              ))}
            </div>
          )}

          {drama.locations.length > 0 && (
            <>
              <h2
                className="section-heading mb-2 mt-4"
              >
                Локации
              </h2>
              <div className="d-flex flex-column gap-2">
                {drama.locations.map(({ location }) => (
                  <div
                    key={location.id}
                    className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
                  >
                    <Link
                      href={locationHref(location)}
                      className="text-decoration-none d-flex align-items-center gap-3"
                      style={{ minWidth: 0 }}
                    >
                      <div
                        style={{
                          width: "2.5rem",
                          height: "2.5rem",
                          borderRadius: "0.5rem",
                          background: "var(--bs-secondary-bg)",
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {location.photoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={location.photoUrl}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                      </div>
                      <span className="font-display fw-medium text-white text-truncate">
                        {location.name}
                      </span>
                    </Link>
                    <VisitedButton
                      locationId={location.id}
                      isVisited={visitedLocationIds.has(location.id)}
                      className="flex-shrink-0"
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {events.length > 0 && (
        <div className="mt-4">
          <h2
            className="section-heading mb-2"
          >
            События
          </h2>
          <div className="d-flex flex-column gap-3 scroll-list thin-scroll">
            {events.map((ev) => (
              isPremiumActive(currentUser) ? (

                <EventAgendaRow
                key={ev.occurrenceId}
                event={ev}
                isFavorited={favoritedEventIds.has(ev.id)}
                isGoing={goingEventIds.has(ev.occurrenceId)}
                showDate
              />

              ) : (

                <EventCardLocked key={ev.occurrenceId} startsAt={ev.startsAt} />

              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
