import AppLink from "@/components/AppLink";
import { locationHref } from "@/lib/slugHelpers";
import BackLink from "@/components/BackLink";
import DetailHero from "@/components/DetailHero";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
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
import { DRAMA_TITLE_SELECT, compareDramaTitles, dramaTitleForLocale } from "@/lib/dramaLocale";
import { isPremiumActive } from "@/lib/premium";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { pageMetadata, JsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { categoryEmoji } from "@/lib/locationCategories";
import { getT } from "@/lib/i18n";
import { cache } from "react";

// React.cache: generateMetadata и страница делят ОДИН запрос на
// HTTP-запрос (как getCurrentUser в lib/userAuth.ts) — раньше метадата
// ходила в базу отдельным узким select.
const getLocation = cache(async (rawId: string) =>
  prisma.location.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      links: { orderBy: { createdAt: "asc" } },
      dramas: {
        include: { drama: true },
        orderBy: { drama: { title: "asc" } },
      },
      events: {
        // Страница локации публичная — встречи сообществ на ней не
        // показываем (см. src/lib/catalogEvents.ts).
        where: catalogEventsWhere(),
        include: {
          performers: { include: { performer: true } },
          occurrences: { orderBy: { startsAt: "asc" } },
        },
      },
    },
  }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t } = await getT();
  const location = await getLocation(id);
  // notFound() именно здесь: метадата считается до флаша ответа, и
  // несуществующий slug получает настоящий HTTP 404 — иначе loading.tsx
  // успевал отдать 200-shell до notFound() в самой странице (soft-404).
  if (!location) notFound();
  return pageMetadata({
    title: location.name,
    description:
      location.description?.slice(0, 160) ??
      t.catalog.location.metaDescription(location.name),
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
  const { t, locale } = await getT();

  // Тот же React.cache-запрос, что и в generateMetadata, — Prisma
  // дёргается один раз на HTTP-запрос.
  const location = await getLocation(rawParam);

  if (!location) notFound();
  const id = location.id;

  const dramaIds = location.dramas.map((dl) => dl.dramaId);
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

  // Первая волна: соседние локации зависят только от самой локации, а
  // текущий пользователь — вообще ни от чего; раньше шли друг за другом.
  const [relatedLocations, currentUser] = await Promise.all([
    // Другие места съёмок тех же сериалов: с одной локации логично уйти
    // смотреть соседние — фанаты обходят их одной поездкой.
    dramaIds.length === 0
      ? []
      : prisma.location.findMany({
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
              select: { drama: { select: { id: true, ...DRAMA_TITLE_SELECT, slug: true } } },
              take: 1,
            },
          },
          orderBy: { name: "asc" },
          take: 12,
        }),
    getCurrentUser(),
  ]);

  // Вторая волна: пользовательские отметки — все ждут только currentUser.
  const [visit, myPlaceListsRaw, favoritedIds, goingIds, friendIds] =
    await Promise.all([
      currentUser
        ? prisma.locationVisit.findUnique({
            where: { userId_locationId: { userId: currentUser.id, locationId: id } },
          })
        : null,
      // Списки мест пользователя для «+ в список» рядом с «была здесь».
      // Кнопку показываем только при наличии списков: пустое состояние
      // AddToListButton написано про списки актёров.
      currentUser
        ? prisma.placeList.findMany({
            // Только личные списки: в список сообщества пишут по правам
            // сообщества, и предлагать его тут значило бы звать в
            // ошибку (АА25).
            where: { userId: currentUser.id, communityId: null },
            select: {
              id: true,
              title: true,
              items: { where: { locationId: id }, select: { locationId: true }, take: 1 },
            },
            orderBy: { title: "asc" },
          })
        : [],
      getFavoritedEventIds(eventIds, currentUser?.id),
      getGoingOccurrenceIds(occIds, currentUser?.id),
      getFriendIds(currentUser?.id),
    ]);
  const isVisited = !!visit;
  const myPlaceLists = myPlaceListsRaw.map((l) => ({
    id: l.id,
    title: l.title,
    hasPerformer: l.items.length > 0,
  }));
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(
    occIds,
    friendIds,
  );

  return (
    <div>
      <BackLink fallbackHref="/locations" fallbackLabel={t.catalog.location.back} />
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
                  {t.catalog.locationCategory[location.category]}
                </span>
              )}
              {location.dramas.length > 0 && (
                <span className="date-chip">
                  {t.catalog.location.filmedHere(location.dramas.length)}
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
              <h2 className="section-heading mb-2">{t.catalog.location.series}</h2>
              <div className="d-flex flex-wrap gap-2">
                {[...location.dramas]
                  .sort((a, b) => compareDramaTitles(a.drama, b.drama, locale))
                  .map(({ drama }) => (
                  <AppLink
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
                      {dramaTitleForLocale(drama, locale)}
                    </span>
                  </AppLink>
                ))}
              </div>
            </>
          )}

          {locationEvents.length > 0 && (
            <div className="mt-4">
              <h2 className="section-heading mb-2">{t.catalog.location.eventsHere}</h2>
              <div className="d-flex flex-column gap-3">
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
              <h2 className="section-heading mb-2">{t.catalog.location.onMap}</h2>
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
              <h2 className="section-heading mb-2">{t.catalog.location.nearby}</h2>
              <div className="d-flex flex-wrap gap-2">
                {relatedLocations.map((rel) => (
                  <AppLink
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
                          {dramaTitleForLocale(rel.dramas[0].drama, locale)}
                        </span>
                      )}
                    </span>
                  </AppLink>
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
                {t.catalog.sources}
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
      {/* Крошки: ступень раздела повторяет ссылку-возврат вверху
          страницы (адрес и подпись), последняя ступень — сама запись. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: t.catalog.breadcrumb.home, path: "/" },
            { name: t.catalog.breadcrumb.locations, path: "/locations" },
            {
              name: location.name,
              path: `/locations/${location.slug ?? rawParam}`,
            },
          ],
          locale,
        )}
      />
    </div>
  );
}
