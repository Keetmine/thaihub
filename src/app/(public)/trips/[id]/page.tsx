import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { dateKey, endOfDay, formatShortDate, formatTime } from "@/lib/dates";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getFavoritedEventIds, getGoingEventIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByEvent } from "@/lib/friends";
import { deleteTrip } from "../actions";
import EventCard from "@/components/EventCard";
import ConfirmForm from "@/components/ConfirmForm";
import AddPersonalEventButton from "../AddPersonalEventButton";
import PersonalEventCard, { type PersonalEventData } from "../PersonalEventCard";
import { VisibilitySelect } from "../TripVisibilityControls";
import LocationMapLoader from "@/components/LocationMapLoader";
import { isPremiumActive } from "@/lib/premium";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { view } = await searchParams;
  // «Мой план» (по умолчанию) — только события, куда идёт владелец
  // поездки; ?view=all — все события её дат; ?view=places — «что
  // посетить»: локации съёмок дорам владельца. Для гостей план
  // владельца — и есть смысл расшаренной поездки.
  const showAll = view === "all";
  const showPlaces = view === "places";
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      personalEvents: { orderBy: { startsAt: "asc" } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!trip) notFound();

  // Доступ по видимости: PRIVATE — только владелец, FRIENDS — владелец и
  // его принятые друзья, PUBLIC — любой залогиненный. Чужому 404, а не
  // 403 — не подтверждаем само существование поездки.
  const isOwner = trip.userId === user.id;
  // Управление поездкой (видимость, личные события) — часть платного
  // функционала; владелец без подписки видит свою поездку read-only.
  const canManage = isOwner && isPremiumActive(user);
  if (!isOwner) {
    if (trip.visibility === "PRIVATE") notFound();
    if (trip.visibility === "FRIENDS") {
      const ownerFriendIds = await getFriendIds(trip.userId);
      if (!ownerFriendIds.includes(user.id)) notFound();
    }
  }

  const rangeWhere = { startsAt: { gte: trip.startDate, lte: endOfDay(trip.endDate) } };
  const [occurrences, planCount, totalCount] = await Promise.all([
    prisma.eventOccurrence.findMany({
      where: {
        ...rangeWhere,
        ...(showAll ? {} : { event: { attendees: { some: { userId: trip.userId } } } }),
      },
      include: { event: { include: { performers: { include: { performer: true } } } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.eventOccurrence.count({
      where: { ...rangeWhere, event: { attendees: { some: { userId: trip.userId } } } },
    }),
    prisma.eventOccurrence.count({ where: rangeWhere }),
  ]);
  const events = occurrences.map(flattenOccurrence);

  const eventIds = events.map((ev) => ev.id);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, user.id),
    getGoingEventIds(eventIds, user.id),
    getFriendIds(user.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByEvent(eventIds, friendIds);

  // Публичные и личные события — одна хронологическая лента. Личные
  // видит только владелец: даже в публичной поездке брони/встречи —
  // не для чужих глаз.
  const personal: PersonalEventData[] = (isOwner ? trip.personalEvents : []).map((p) => ({
    id: p.id,
    title: p.title,
    note: p.note,
    startsAt: p.startsAt,
    dateKey: dateKey(p.startsAt),
    timeValue: formatTime(p.startsAt),
  }));
  const timeline: ({ kind: "public"; startsAt: Date; key: string; event: (typeof events)[number] } | { kind: "personal"; startsAt: Date; key: string; personalEvent: PersonalEventData })[] = [
    ...events.map((ev) => ({ kind: "public" as const, startsAt: ev.startsAt, key: `pub-${ev.occurrenceId}`, event: ev })),
    ...personal.map((p) => ({ kind: "personal" as const, startsAt: p.startsAt, key: `own-${p.id}`, personalEvent: p })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // «Что посетить» (Г4): локации съёмок дорам, которые владелец смотрит/
  // смотрел (DramaWatchStatus) — приоритетный шорт-лист паломничества.
  const placeLocations = showPlaces
    ? await prisma.location.findMany({
        where: {
          dramas: {
            some: { drama: { watchStatuses: { some: { userId: trip.userId } } } },
          },
        },
        include: {
          dramas: {
            where: { drama: { watchStatuses: { some: { userId: trip.userId } } } },
            include: { drama: { select: { id: true, title: true } } },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const boundDelete = deleteTrip.bind(null, trip.id);

  return (
    <div>
      <Link href="/trips" className="eyebrow text-decoration-none">
        ← Все поездки
      </Link>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <div>
          <h1 className="display-1-tight mb-1" style={{ fontSize: "2.5rem" }}>
            {trip.title}
          </h1>
          <p className="text-secondary mb-0">
            {formatShortDate(trip.startDate)} – {formatShortDate(trip.endDate)}{" "}
            {trip.endDate.getFullYear()}
          </p>
        </div>
        {isOwner ? (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {canManage && (
              <>
                <VisibilitySelect tripId={trip.id} visibility={trip.visibility} />
                <AddPersonalEventButton tripId={trip.id} />
              </>
            )}
            <ConfirmForm action={boundDelete} confirmMessage={`Удалить поездку «${trip.title}»?`}>
              <button type="button" className="btn btn-outline-secondary btn-sm">
                Удалить поездку
              </button>
            </ConfirmForm>
          </div>
        ) : (
          <Link href={`/users/${trip.user.id}`} className="small text-secondary text-decoration-none">
            Поездка {trip.user.name ? `пользователя ${trip.user.name}` : "друга"} →
          </Link>
        )}
      </div>

      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={`/trips/${trip.id}`}
            prefetch={false}
            className={`tab-bar-item ${showAll ? "" : "active"}`}
          >
            {isOwner ? "Мой план" : "План"} ({planCount})
          </Link>
          <Link
            href={`/trips/${trip.id}?view=all`}
            prefetch={false}
            className={`tab-bar-item ${showAll ? "active" : ""}`}
          >
            Все события дат ({totalCount})
          </Link>
          <Link
            href={`/trips/${trip.id}?view=places`}
            prefetch={false}
            className={`tab-bar-item ${showPlaces ? "active" : ""}`}
          >
            Что посетить
          </Link>
        </div>
      </div>

      {showPlaces ? (
        placeLocations.length === 0 ? (
          <p className="text-secondary">
            Здесь появятся локации съёмок ваших сериалов — отметьте статус
            просмотра на страницах дорам, и мы соберём, что посетить в
            поездке.
          </p>
        ) : (
          <>
            <p className="small text-secondary mb-3">
              Локации съёмок сериалов{isOwner ? ", которые вы смотрите" : " владельца поездки"}:{" "}
              {placeLocations.length}.
            </p>
            <div className="mb-4">
              <LocationMapLoader
                locations={placeLocations
                  .filter((l) => l.latitude != null && l.longitude != null)
                  .map((l) => ({ id: l.id, name: l.name, latitude: l.latitude!, longitude: l.longitude! }))}
                height="22rem"
              />
            </div>
            <div className="d-flex flex-column gap-2">
              {placeLocations.map((l) => (
                <Link
                  key={l.id}
                  href={`/locations/${l.id}`}
                  className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3"
                >
                  {l.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.photoUrl}
                      alt=""
                      style={{ width: "3rem", height: "3rem", borderRadius: "0.6rem", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{ width: "3rem", height: "3rem", borderRadius: "0.6rem", background: "var(--bs-secondary-bg)", flexShrink: 0 }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p className="font-display fw-medium text-white mb-0 text-truncate">{l.name}</p>
                    <p className="small text-secondary mb-0 text-truncate">
                      {l.dramas.map((d) => d.drama.title).join(", ")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )
      ) : timeline.length === 0 ? (
        <p className="text-secondary">
          {showAll
            ? "В даты этой поездки не попадает ни одно событие."
            : isOwner
              ? "В плане пока пусто: отметьте «я иду» на событиях (вкладка «Все события дат») или добавьте личное — перелёт, бронь, встречу."
              : "В плане этой поездки пока пусто."}
        </p>
      ) : (
        <div className="d-flex flex-column gap-3">
          {timeline.map((item) =>
            item.kind === "public" ? (
              <EventCard
                key={item.key}
                event={item.event}
                isFavorited={favoritedIds.has(item.event.id)}
                isGoing={goingIds.has(item.event.id)}
                friendsGoing={friendsGoingByEvent.get(item.event.id) ?? []}
              />
            ) : (
              <PersonalEventCard
                key={item.key}
                tripId={trip.id}
                event={item.personalEvent}
                canEdit={canManage}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
