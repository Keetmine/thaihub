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
  // поездки; ?view=all — все события её дат. Для гостей план владельца —
  // и есть смысл расшаренной поездки.
  const showAll = view === "all";
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
  const canManage = isOwner && user.isPremium;
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
        </div>
      </div>

      {timeline.length === 0 ? (
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
