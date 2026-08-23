import Link from "next/link";
import { locationHref } from "@/lib/slugHelpers";
import BackLink from "@/components/BackLink";
import DetailHero from "@/components/DetailHero";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import VisitedButton from "@/components/VisitedButton";
import AddToListButton from "@/components/AddToListButton";
import { addPlaceToList } from "@/app/(public)/lists/actions";
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
import { categoryEmoji, categoryLabel } from "@/lib/locationCategories";

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
      links: { orderBy: { createdAt: "asc" } },
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

  // Другие места съёмок тех же сериалов: с одной локации логично уйти
  // смотреть соседние — фанаты обходят их одной поездкой.
  const dramaIds = location.dramas.map((dl) => dl.dramaId);
  const relatedLocations =
    dramaIds.length === 0
      ? []
      : await prisma.location.findMany({
          where: {
            id: { not: id },
            createdByUserId: null,
            dramas: { some: { dramaId: { in: dramaIds } } },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            photoUrl: true,
            dramas: {
              where: { dramaId: { in: dramaIds } },
              select: { drama: { select: { id: true, title: true, slug: true } } },
              take: 1,
            },
          },
          orderBy: { name: "asc" },
          take: 12,
        });

  const currentUser = await getCurrentUser();
  let isVisited = false;
  if (currentUser) {
    const visit = await prisma.locationVisit.findUnique({
      where: { userId_locationId: { userId: currentUser.id, locationId: id } },
    });
    isVisited = !!visit;
  }
  // Списки мест пользователя для «+ в список» рядом с «была здесь».
  // Кнопку показываем только при наличии списков: пустое состояние
  // AddToListButton написано про списки актёров.
  const myPlaceLists = currentUser
    ? (
        await prisma.placeList.findMany({
          where: { userId: currentUser.id },
          select: {
            id: true,
            title: true,
            items: { where: { locationId: id }, select: { locationId: true }, take: 1 },
          },
          orderBy: { title: "asc" },
        })
      ).map((l) => ({ id: l.id, title: l.title, hasPerformer: l.items.length > 0 }))
    : [];

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
      {/* Иммерсивный hero (Э2): фото места и чипы вместо плоской шапки с
          фото-колонкой. Категория переехала из бейджа в чип; description
          (у каталожных локаций это район/город, ≤100 символов) — из
          абзаца в подзаголовок. */}
      <div className="mt-3">
        <DetailHero
          photoUrl={location.photoUrl}
          photoAlt={location.name}
          title={location.name}
          subtitle={location.description}
          chips={
            <>
              {location.category && (
                <span className="date-chip">
                  {categoryEmoji(location.category)}{" "}
                  {categoryLabel(location.category)}
                </span>
              )}
              {location.dramas.length > 0 && (
                <span className="date-chip">
                  сериалов снималось: {location.dramas.length}
                </span>
              )}
            </>
          }
          actions={
            <>
              <VisitedButton locationId={location.id} isVisited={isVisited} />
              {myPlaceLists.length > 0 && (
                <AddToListButton
                  lists={myPlaceLists}
                  onAdd={async (listId: string) => {
                    "use server";
                    await addPlaceToList(listId, location.id);
                  }}
                />
              )}
            </>
          }
        />
      </div>

      <div>
          {/* Ссылки заведения: инстаграм, сайт, канал. */}
          {location.links.length > 0 && (
            <p className="d-flex flex-wrap gap-2 mb-4">
              {location.links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  {l.label} ↗
                </a>
              ))}
            </p>
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

          {relatedLocations.length > 0 && (
            <div className="mt-4">
              <h2 className="section-heading mb-2">Другие места этих съёмок</h2>
              <div className="d-flex flex-wrap gap-2">
                {relatedLocations.map((rel) => (
                  <Link
                    key={rel.id}
                    href={locationHref(rel)}
                    className="surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2"
                    style={{ width: "13rem" }}
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
                      {rel.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          loading="lazy"
                          decoding="async"
                          src={rel.photoUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )}
                    </div>
                    <span style={{ minWidth: 0 }}>
                      <span className="font-display fw-medium text-white d-block text-truncate">
                        {rel.name}
                      </span>
                      {rel.dramas[0] && (
                        <span className="small text-secondary d-block text-truncate">
                          {rel.dramas[0].drama.title}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
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
  );
}
