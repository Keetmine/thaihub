import { pageMetadata, JsonLd, tvSeriesJsonLd } from "@/lib/seo";
import ReviewsAndComments from "@/components/ReviewsAndComments";
import SourcesBlock from "@/components/SourcesBlock";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import DetailHero from "@/components/DetailHero";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import DramaStatusButton from "@/components/DramaStatusButton";
import EntityMiniCard from "@/components/EntityMiniCard";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import VisitedButton from "@/components/VisitedButton";
import {
  BuildingIcon,
  BookIcon,
  CalendarIcon,
  TagIcon,
  TvIcon,
  UserIcon,
  InfoIcon,
} from "@/components/icons";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence, groupByEvent } from "@/lib/eventOccurrences";
import { DRAMA_STATUS_LABELS } from "@/lib/dramaStatus";
import { performerHref } from "@/lib/performerSlug";
import {
  agencyHref,
  locationHref,
  novelHref,
  slugOrIdWhere,
} from "@/lib/slugHelpers";
import { isPremiumActive } from "@/lib/premium";
import { dramaHref } from "@/lib/dramaSlug";

const WEEKDAYS_RU: Record<string, string> = {
  Monday: "по понедельникам",
  Tuesday: "по вторникам",
  Wednesday: "по средам",
  Thursday: "по четвергам",
  Friday: "по пятницам",
  Saturday: "по субботам",
  Sunday: "по воскресеньям",
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const drama = await prisma.drama.findFirst({
    where: slugOrIdWhere(rawId),
    select: { title: true, year: true, synopsis: true, posterUrl: true },
  });
  if (!drama)
    return pageMetadata({ title: "Дорама", description: "Дорама не найдена." });
  return pageMetadata({
    title: `${drama.title}${drama.year ? ` (${drama.year})` : ""}`,
    description:
      drama.synopsis?.slice(0, 160) ??
      `${drama.title}: актёрский состав, локации съёмок, события и отзывы на MyBLHub.`,
    path: `/dramas/${rawId}`,
    image: drama.posterUrl,
    type: "article",
  });
}

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
      agencies: { include: { agency: true } },
      locations: {
        include: { location: true },
        orderBy: { location: { name: "asc" } },
      },
      novel: true,
      relatedFrom: { include: { related: true } },
      relatedTo: { include: { drama: true } },
    },
  });

  if (!drama) notFound();

  // Средняя оценка из наших отзывов — в шапку, рядом с MDL.
  const ratingAgg = await prisma.review.aggregate({
    where: { dramaId: drama.id },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const ourRating = ratingAgg._count.rating > 0 ? ratingAgg._avg.rating : null;
  const ourRatingCount = ratingAgg._count.rating;
  const id = drama.id;

  const dramaEvents = await prisma.event.findMany({
    where: { dramaId: id },
    include: {
      performers: { include: { performer: true } },
      occurrences: { orderBy: { startsAt: "asc" } },
    },
  });
  const eventsRows = groupByEvent(
    dramaEvents
      .flatMap((ev) =>
        ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  );
  const events = eventsRows.map((e) => e.row);

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

  // Related Content с MDL: связь направленная, показываем обе стороны.
  const relatedItems = [
    ...drama.relatedFrom.map((r) => ({
      drama: r.related,
      relation: r.relation,
    })),
    ...drama.relatedTo
      .filter((r) => !drama.relatedFrom.some((f) => f.relatedId === r.dramaId))
      .map((r) => ({ drama: r.drama, relation: r.relation })),
  ];

  const formatAired = (d: Date) =>
    d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

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

  // У сериала может быть несколько студий (DramaAgency); легаси-поле
  // agency подставляется, если связей ещё нет.
  const studios =
    drama.agencies.length > 0
      ? drama.agencies.map((a) => a.agency)
      : drama.agency
        ? [drama.agency]
        : [];
  // Все строки блока фактов условные — пустую панель не рисуем.
  const hasFacts =
    studios.length > 0 ||
    !!drama.novel ||
    drama.genres.length > 0 ||
    !!drama.episodes ||
    !!drama.duration ||
    !!drama.airedFrom ||
    !!drama.director ||
    !!drama.screenwriter ||
    !!drama.contentRating ||
    drama.mdlScore != null ||
    ourRating != null ||
    !!drama.synopsis;

  return (
    <div>
      <BackLink fallbackHref="/dramas" fallbackLabel="← Все дорамы" />
      {/* Иммерсивный hero (Э2): постер размытым фоном вместо прежней
          плоской шапки; постер и статус просмотра переехали сюда из
          левой колонки. */}
      <div className="mt-3">
        <DetailHero
          photoUrl={drama.posterUrl}
          photoAlt={drama.title}
          title={drama.title}
          subtitle={
            drama.nativeTitle || drama.alsoKnownAs
              ? [drama.nativeTitle, drama.alsoKnownAs]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
          chips={
            <>
              {drama.year && <span className="date-chip">{drama.year}</span>}
              {drama.status && (
                <span className="date-chip">
                  {DRAMA_STATUS_LABELS[drama.status]}
                </span>
              )}
              {drama.episodes != null && (
                <span className="date-chip">серий: {drama.episodes}</span>
              )}
              {ourRating != null && (
                <span className="date-chip">★ {ourRating.toFixed(1)}</span>
              )}
            </>
          }
          actions={
            /* Тот же статус-пикер, что на карточках дорам: его дропдаун
               позиционируется fixed и не режется overflow-ом hero (у
               WatchStatusSelect дропдаун absolute — здесь бы обрезался). */
            currentUser ? (
              <DramaStatusButton
                dramaId={drama.id}
                status={watchStatus?.status ?? null}
              />
            ) : undefined
          }
          footer={
            drama.mydramalistUrl ? (
              <p className="mb-0 mt-1">
                <a
                  href={drama.mydramalistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  MyDramaList ↗
                </a>
              </p>
            ) : undefined
          }
        />
      </div>

      {/* Факты и синопсис — свой блок, как на странице артиста. */}
      {hasFacts && (
        <div className="surface p-4 mb-4">
          {studios.length > 0 && (
            <p className="small text-secondary mb-2">
              <BuildingIcon />{" "}
              <span className="text-secondary">
                {studios.length > 1 ? "Студии:" : "Студия:"}
              </span>{" "}
              {studios.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <Link href={agencyHref(a)} className="link-body-emphasis">
                    {a.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {drama.novel && (
            <p className="small text-secondary mb-2">
              <BookIcon className="icon-inline" />{" "}
              <span className="text-secondary">По новелле:</span>{" "}
              <Link
                href={novelHref(drama.novel)}
                className="link-body-emphasis"
              >
                {drama.novel.title}
              </Link>
              {drama.novel.author ? ` (${drama.novel.author})` : ""}
            </p>
          )}

          {drama.genres.length > 0 && (
            <p className="small text-secondary mb-2 d-flex flex-wrap align-items-center gap-2">
              <span className="d-inline-flex align-items-center gap-1">
                <TagIcon /> <span className="text-secondary">Жанры:</span>
              </span>
              {drama.genres.map((g) => (
                <span key={g} className="tag-chip">
                  {g}
                </span>
              ))}
            </p>
          )}

          <div className="d-flex flex-column gap-1 mb-3">
            {(drama.episodes || drama.duration) && (
              <p className="small text-secondary mb-0">
                <TvIcon className="icon-inline" />{" "}
                <span className="text-secondary">Эпизоды:</span>{" "}
                {drama.episodes ? `${drama.episodes}` : "?"}
                {drama.duration ? ` × ${drama.duration}` : ""}
              </p>
            )}
            {drama.airedFrom && (
              <p className="small text-secondary mb-0">
                <CalendarIcon /> <span className="text-secondary">Эфир:</span>{" "}
                {formatAired(drama.airedFrom)}
                {drama.airedTo &&
                drama.airedTo.getTime() !== drama.airedFrom.getTime()
                  ? ` — ${formatAired(drama.airedTo)}`
                  : ""}
                {drama.airedOn
                  ? ` (${WEEKDAYS_RU[drama.airedOn] ?? drama.airedOn})`
                  : ""}
              </p>
            )}
            {drama.director && (
              <p className="small text-secondary mb-0">
                <UserIcon className="icon-inline" />{" "}
                <span className="text-secondary">Режиссёр:</span>{" "}
                {drama.director}
              </p>
            )}
            {drama.screenwriter && (
              <p className="small text-secondary mb-0">
                <UserIcon className="icon-inline" />{" "}
                <span className="text-secondary">Сценарий:</span>{" "}
                {drama.screenwriter}
              </p>
            )}
            {drama.contentRating && (
              <p className="small text-secondary mb-0">
                <InfoIcon /> <span className="text-secondary">Рейтинг:</span>{" "}
                {drama.contentRating}
              </p>
            )}
            {(drama.mdlScore != null || ourRating != null) && (
              <p className="small text-secondary mb-0">
                {ourRating != null && (
                  <>
                    <span className="text-secondary">Оценка MyBLHub:</span>{" "}
                    <span
                      style={{
                        color:
                          ourRating >= 7
                            ? "#3bb33b"
                            : ourRating >= 5
                              ? "inherit"
                              : "#e5484d",
                      }}
                    >
                      ★ {ourRating.toFixed(1)}
                    </span>{" "}
                    <span className="text-secondary">({ourRatingCount})</span>
                  </>
                )}
                {ourRating != null && drama.mdlScore != null && " · "}
                {drama.mdlScore != null && (
                  <>
                    <span className="text-secondary">MDL:</span> ★{" "}
                    {drama.mdlScore.toFixed(1)}
                  </>
                )}
              </p>
            )}
          </div>

          {drama.synopsis && (
            <p className="text-secondary mb-0">{drama.synopsis}</p>
          )}
        </div>
      )}

      {/* Пустой раздел не рисуем — ни заголовка, ни «состав не
          указан»: у дорам без каста это была строка ни о чём. */}
      {drama.performers.length > 0 && (
        <>
          <h2 className="section-heading mb-2">Актёрский состав</h2>
          <div className="d-flex flex-wrap gap-2">
            {drama.performers.map(({ performer, role }) => (
              <EntityMiniCard
                key={performer.id}
                href={performerHref(performer)}
                photoUrl={performer.photoUrl}
                name={performer.name}
                subtitle={role}
                style={{
                  flex: "1 1 10rem",
                  minWidth: "70px",
                  maxWidth: "15rem",
                }}
              />
            ))}
          </div>
        </>
      )}

      {relatedItems.length > 0 && (
        <>
          <h2 className="section-heading mb-2 mt-4">Связанные дорамы</h2>
          <div className="d-flex flex-wrap gap-2">
            {relatedItems.map(({ drama: rel, relation }) => (
              <EntityMiniCard
                key={rel.id}
                href={dramaHref(rel)}
                photoUrl={rel.posterUrl}
                name={rel.title}
                subtitle={relation}
                round={false}
              />
            ))}
          </div>
        </>
      )}

      {drama.locations.length > 0 && (
        <>
          <h2 className="section-heading mb-2 mt-4">Локации</h2>
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
                        loading="lazy"
                        decoding="async"
                        src={location.photoUrl}
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

      {events.length > 0 && (
        <div className="mt-4">
          <h2 className="section-heading mb-2">События</h2>
          <div className="d-flex flex-column gap-3 scroll-list thin-scroll">
            {eventsRows.map(({ row, extraDates }) =>
              isPremiumActive(currentUser) ? (
                <EventAgendaRow
                  key={row.id}
                  event={row}
                  isFavorited={favoritedEventIds.has(row.id)}
                  isGoing={goingEventIds.has(row.occurrenceId)}
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

      {/* Атрибуция: постер/синопсис пришли с MDL и blscene (см. /terms). */}
      <SourcesBlock
        links={[{ url: drama.mydramalistUrl }, { url: drama.blsceneUrl }]}
      />

      <div className="mt-4">
        <ReviewsAndComments kind="drama" id={drama.id} />
      </div>
      <JsonLd data={tvSeriesJsonLd(drama)} />
    </div>
  );
}
