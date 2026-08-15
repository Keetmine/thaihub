import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { dateKey, endOfDay, formatShortDate, formatTime } from "@/lib/dates";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { deleteTrip } from "../actions";
import EventCard from "@/components/EventCard";
import ConfirmForm from "@/components/ConfirmForm";
import AddPersonalEventButton from "../AddPersonalEventButton";
import PersonalEventCard, { type PersonalEventData } from "../PersonalEventCard";
import { VisibilitySelect } from "../TripVisibilityControls";
import EditTripButton from "../EditTripButton";
import LocationMapLoader from "@/components/LocationMapLoader";
import {
  AddTripPlaceBox,
  AttachListSelect,
  DetachListButton,
  RemoveTripPlaceButton,
} from "../TripPlacesControls";
import { isPremiumActive } from "@/lib/premium";
import { listHref, locationHref, slugOrIdWhere, tripHref } from "@/lib/slugHelpers";

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

  const { id: rawParam } = await params;
  const { view } = await searchParams;
  // «Мой план» (по умолчанию) — только события, куда идёт владелец
  // поездки; ?view=all — все события её дат; ?view=places — «что
  // посетить»: локации съёмок дорам владельца. Для гостей план
  // владельца — и есть смысл расшаренной поездки.
  const showAll = view === "all";
  const showPlaces = view === "places";
  const trip = await prisma.trip.findFirst({
    where: slugOrIdWhere(rawParam),
    include: {
      personalEvents: {
        orderBy: { startsAt: "asc" },
        include: { location: { select: { id: true, name: true } } },
      },
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
        ...(showAll ? {} : { attendances: { some: { userId: trip.userId } } }),
      },
      include: { event: { include: { performers: { include: { performer: true } } } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.eventOccurrence.count({
      where: { ...rangeWhere, attendances: { some: { userId: trip.userId } } },
    }),
    prisma.eventOccurrence.count({ where: rangeWhere }),
  ]);
  const events = occurrences.map(flattenOccurrence);

  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, user.id),
    getGoingOccurrenceIds(occIds, user.id),
    getFriendIds(user.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(occIds, friendIds);

  // Публичные и личные события — одна хронологическая лента. Личные
  // видит только владелец: даже в публичной поездке брони/встречи —
  // не для чужих глаз.
  const personal: PersonalEventData[] = (isOwner ? trip.personalEvents : []).map((p) => ({
    id: p.id,
    title: p.title,
    note: p.note,
    location: p.location,
    startsAt: p.startsAt,
    dateKey: dateKey(p.startsAt),
    timeValue: formatTime(p.startsAt),
  }));
  const timeline: ({ kind: "public"; startsAt: Date; key: string; event: (typeof events)[number] } | { kind: "personal"; startsAt: Date; key: string; personalEvent: PersonalEventData })[] = [
    ...events.map((ev) => ({ kind: "public" as const, startsAt: ev.startsAt, key: `pub-${ev.occurrenceId}`, event: ev })),
    ...personal.map((p) => ({ kind: "personal" as const, startsAt: p.startsAt, key: `own-${p.id}`, personalEvent: p })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // «Что посетить» (Г4): локации съёмок дорам владельца + прикреплённые
  // списки мест + отдельные добавленные места.
  const [placeLocations, tripLists, tripPlaces, myLists] = showPlaces
    ? await Promise.all([
        prisma.location.findMany({
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
        }),
        prisma.tripPlaceList.findMany({
          where: { tripId: trip.id },
          include: { list: { include: { items: { include: { location: true } } } } },
        }),
        prisma.tripPlace.findMany({
          where: { tripId: trip.id },
          include: { location: true },
        }),
        isOwner
          ? prisma.placeList.findMany({
              where: { userId: user.id },
              select: { id: true, title: true },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], []];
  const attachedListIds = new Set(tripLists.map((t) => t.listId));
  const availableLists = myLists.filter((l) => !attachedListIds.has(l.id));

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
                <EditTripButton
                  trip={{
                    id: trip.id,
                    title: trip.title,
                    startKey: dateKey(trip.startDate),
                    endKey: dateKey(trip.endDate),
                  }}
                />
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
            href={tripHref(trip)}
            prefetch={false}
            className={`tab-bar-item ${showAll ? "" : "active"}`}
          >
            {isOwner ? "Мой план" : "План"} ({planCount})
          </Link>
          <Link
            href={`${tripHref(trip)}?view=all`}
            prefetch={false}
            className={`tab-bar-item ${showAll ? "active" : ""}`}
          >
            Все события дат ({totalCount})
          </Link>
          <Link
            href={`${tripHref(trip)}?view=places`}
            prefetch={false}
            className={`tab-bar-item ${showPlaces ? "active" : ""}`}
          >
            Что посетить
          </Link>
        </div>
      </div>

      {showPlaces ? (
        (() => {
          const pinMap = new Map<string, { id: string; name: string; latitude: number; longitude: number }>();
          const addPin = (l: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
            if (l.latitude != null && l.longitude != null && !pinMap.has(l.id)) {
              pinMap.set(l.id, { id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude });
            }
          };
          placeLocations.forEach(addPin);
          tripLists.forEach((tl) => tl.list.items.forEach((i) => addPin(i.location)));
          tripPlaces.forEach((tp) => addPin(tp.location));
          const pins = Array.from(pinMap.values());
          const isEmpty =
            placeLocations.length === 0 && tripLists.length === 0 && tripPlaces.length === 0;
          return isEmpty && !isOwner ? (
          <p className="text-secondary">Пока здесь пусто.</p>
        ) : (
          <>
            {isOwner && (
              <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <AttachListSelect tripId={trip.id} availableLists={availableLists} />
                <AddTripPlaceBox tripId={trip.id} />
              </div>
            )}
            {pins.length > 0 && (
              <div className="mb-4">
                <LocationMapLoader locations={pins} height="22rem" />
              </div>
            )}

            {tripLists.map((tl) => (
              <div key={tl.listId} className="mb-4">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                  <Link
                    href={listHref(tl.list)}
                    className="small text-secondary text-uppercase text-decoration-none"
                    style={{ letterSpacing: "0.08em" }}
                  >
                    📋 {tl.list.title} ({tl.list.items.length})
                  </Link>
                  {isOwner && <DetachListButton tripId={trip.id} listId={tl.listId} />}
                </div>
                <div className="d-flex flex-column gap-2">
                  {tl.list.items.map((i) => (
                    <Link
                      key={i.locationId}
                      href={locationHref(i.location)}
                      className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-2 px-3"
                    >
                      <span className="text-white">{i.location.name}</span>
                      {i.note && <span className="small text-secondary text-truncate">— {i.note}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {tripPlaces.length > 0 && (
              <div className="mb-4">
                <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
                  Отдельные места
                </h2>
                <div className="d-flex flex-column gap-2">
                  {tripPlaces.map((tp) => (
                    <div
                      key={tp.locationId}
                      className="surface d-flex align-items-center justify-content-between gap-3 p-2 px-3"
                    >
                      <Link href={locationHref(tp.location)} className="text-decoration-none text-white">
                        {tp.location.name}
                      </Link>
                      {isOwner && <RemoveTripPlaceButton tripId={trip.id} locationId={tp.locationId} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isEmpty && isOwner && (
              <p className="text-secondary">
                Прикрепите список мест, добавьте отдельные места или отметьте
                статус просмотра на страницах дорам — здесь соберётся, что
                посетить в поездке.
              </p>
            )}
            {placeLocations.length > 0 && (
            <>
            <p className="small text-secondary mb-3">
              Локации съёмок сериалов{isOwner ? ", которые вы смотрите" : " владельца поездки"}:{" "}
              {placeLocations.length}.
            </p>
            <div className="d-flex flex-column gap-2">
              {placeLocations.map((l) => (
                <Link
                  key={l.id}
                  href={locationHref(l)}
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
            )}
          </>
        );
        })()
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
                friendsGoing={friendsGoingByEvent.get(item.event.occurrenceId) ?? []}
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
