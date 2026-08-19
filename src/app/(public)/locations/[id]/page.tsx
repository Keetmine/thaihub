import Link from "next/link";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import VisitedButton from "@/components/VisitedButton";
import LocationMap from "@/components/LocationMapLoader";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { flattenOccurrence, groupByEvent } from "@/lib/eventOccurrences";
import { dramaHref } from "@/lib/dramaSlug";
import { isPremiumActive } from "@/lib/premium";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const location = await prisma.location.findFirst({
    where: slugOrIdWhere(id),
    select: { name: true, description: true, photoUrl: true, slug: true },
  });
  if (!location)
    return pageMetadata({
      title: "Локация",
      description: "Локация не найдена.",
    });
  return pageMetadata({
    title: location.name,
    description:
      location.description?.slice(0, 160) ??
      `${location.name}: место съёмок тайских BL-сериалов — как добраться и что здесь снимали.`,
    path: `/locations/${location.slug ?? id}`,
    image: location.photoUrl,
  });
}

export const dynamic = "force-dynamic";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawParam } = await params;

  const location = await prisma.location.findFirst({
    where: slugOrIdWhere(rawParam),
    include: {
      dramas: {
        include: { drama: true },
        orderBy: { drama: { title: "asc" } },
      },
      events: {
        include: {
          performers: { include: { performer: true } },
          occurrences: { orderBy: { startsAt: "asc" } },
        },
      },
    },
  });

  if (!location) notFound();
  const id = location.id;

  const currentUser = await getCurrentUser();
  let isVisited = false;
  if (currentUser) {
    const visit = await prisma.locationVisit.findUnique({
      where: { userId_locationId: { userId: currentUser.id, locationId: id } },
    });
    isVisited = !!visit;
  }

  const locationEventsRows = groupByEvent(
    location.events
      .flatMap((ev) =>
        ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  );
  const locationEvents = locationEventsRows.map((e) => e.row);
  const eventIds = locationEvents.map((ev) => ev.id);
  const occIds = locationEvents.map((ev) => ev.occurrenceId);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
    getFriendIds(currentUser?.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(
    occIds,
    friendIds,
  );

  return (
    <div>
      <BackLink fallbackHref="/locations" fallbackLabel="← Все локации" />
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          {location.name}
        </h1>
        <VisitedButton locationId={location.id} isVisited={isVisited} />
      </div>

      <div className="row g-4">
        {location.photoUrl && (
          <div className="col-12 col-sm-4 col-md-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src={location.photoUrl}
              alt={location.name}
              className="surface"
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
              }}
            />
          </div>
        )}

        <div
          className={location.photoUrl ? "col-12 col-sm-8 col-md-9" : "col-12"}
        >
          {location.description && (
            <p className="text-secondary mb-4">{location.description}</p>
          )}

          {/* Раздел без содержимого не рисуем вовсе. */}
          {location.dramas.length > 0 && (
            <>
              <h2 className="section-heading mb-2">Сериалы</h2>
              <div className="d-flex flex-wrap gap-2">
                {location.dramas.map(({ drama }) => (
                  <Link
                    key={drama.id}
                    href={dramaHref(drama)}
                    className="surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2"
                    style={{ width: "11rem" }}
                  >
                    <div
                      style={{
                        width: "2.5rem",
                        height: "3.4rem",
                        borderRadius: "0.375rem",
                        background: "var(--bs-secondary-bg)",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                    >
                      {drama.posterUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          loading="lazy"
                          decoding="async"
                          src={drama.posterUrl}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      )}
                    </div>
                    <span className="font-display fw-medium text-white text-truncate">
                      {drama.title}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {locationEvents.length > 0 && (
            <div className="mt-4">
              <h2 className="section-heading mb-2">События здесь</h2>
              <div className="d-flex flex-column gap-3 scroll-list thin-scroll">
                {locationEventsRows.map(({ row, extraDates }) =>
                  isPremiumActive(currentUser) ? (
                    <EventAgendaRow
                      key={row.id}
                      event={row}
                      isFavorited={favoritedIds.has(row.id)}
                      isGoing={goingIds.has(row.occurrenceId)}
                      friendsGoing={
                        friendsGoingByEvent.get(row.occurrenceId) ?? []
                      }
                      showDate
                      extraDates={extraDates}
                    />
                  ) : (
                    <EventCardLocked key={row.id} startsAt={row.startsAt} />
                  ),
                )}
              </div>
            </div>
          )}

          {location.latitude != null && location.longitude != null && (
            <div className="mt-4">
              <h2 className="section-heading mb-2">На карте</h2>
              <LocationMap
                locations={[
                  {
                    id: location.id,
                    name: location.name,
                    latitude: location.latitude,
                    longitude: location.longitude,
                  },
                ]}
                height="16rem"
              />
            </div>
          )}

          {/* Атрибуция: каталог локаций съёмок собран с blscene.com,
              ссылка на первоисточник обязательна (см.
              features/blscene-import.md). У мест, добавленных
              пользователями, источника нет — блок не рисуется. */}
          {location.sourceUrl && (
            <div className="mt-4 sources-block">
              <h2 className="section-heading mb-2" style={{ opacity: 0.55 }}>
                Источники
              </h2>
              <p className="small mb-0">
                <a
                  href={location.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {new URL(location.sourceUrl).hostname.replace(/^www\./, "")}
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
