import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { dateKey, endOfDay, formatShortDate, formatTime } from "@/lib/dates";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { deleteTrip } from "../actions";
import EmptyState from "@/components/EmptyState";
import EventCard from "@/components/EventCard";
import ConfirmForm from "@/components/ConfirmForm";
import AddPersonalEventButton from "../AddPersonalEventButton";
import CreateOwnPlaceButton from "../../lists/[id]/CreateOwnPlaceButton";
import { createTripOwnPlace } from "../actions";
import PersonalEventCard, { type PersonalEventData } from "../PersonalEventCard";
import TripTodos, { TodoRow } from "../TripTodos";
import TripMembersButton, { TripInviteActions } from "../TripMembersControls";
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
import TripBookings from "./TripBookings";

export const dynamic = "force-dynamic";

/** Подпись брони: у отеля «29 авг → 5 сент», у перелёта то же со
 *  временем, а если вылет и прилёт в один день — время без повтора
 *  даты («29 авг 14:20 → 18:05»). */
function bookingWhenLabel(b: {
  kind: "HOTEL" | "FLIGHT";
  startAt: Date | null;
  endAt: Date | null;
}): string | null {
  const withTime = b.kind === "FLIGHT";
  const one = (d: Date) =>
    withTime ? `${formatShortDate(d)} ${formatTime(d)}` : formatShortDate(d);
  if (!b.startAt && !b.endAt) return null;
  if (!b.startAt) return one(b.endAt!);
  if (!b.endAt) return one(b.startAt);
  const sameDay = dateKey(b.startAt) === dateKey(b.endAt);
  const end = withTime && sameDay ? formatTime(b.endAt) : one(b.endAt);
  return `${one(b.startAt)} → ${end}`;
}

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; mine?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: rawParam } = await params;
  const { view, mine } = await searchParams;
  // «Мой план» (по умолчанию) — только события, куда идёт владелец
  // поездки; ?view=all — вкладка «Афиша», все события этих дат из
  // афиши (без личных записей и дел); ?view=places — «что
  // посетить»: локации съёмок сериалов владельца. Для гостей план
  // владельца — и есть смысл расшаренной поездки.
  const showAll = view === "all";
  const showPlaces = view === "places";
  const showTodos = view === "todos";
  const trip = await prisma.trip.findFirst({
    where: slugOrIdWhere(rawParam),
    include: {
      personalEvents: {
        orderBy: { startsAt: "asc" },
        include: { location: { select: { id: true, name: true } } },
      },
      user: { select: { id: true, name: true } },
      // Брони жилья: показываются на вкладке плана рядом с событиями —
      // в день заселения не приходится искать письмо в почте.
      bookings: { orderBy: [{ startAt: "asc" }, { createdAt: "asc" }] },
      members: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!trip) notFound();

  // Доступ по видимости: PRIVATE — только владелец, FRIENDS — владелец и
  // его принятые друзья, PUBLIC — любой залогиненный. Чужому 404, а не
  // 403 — не подтверждаем само существование поездки.
  const isOwner = trip.userId === user.id;
  // Совместная поездка: принявшие инвайт участники (ACCEPTED) видят её
  // независимо от видимости и наравне с владельцем вносят события/дела.
  // PENDING — приглашение: видит страницу с баннером «принять/отклонить»,
  // но не личное/дела.
  const myMembership = trip.members.find((m) => m.userId === user.id);
  const isMember = myMembership?.status === "ACCEPTED";
  const isInvited = myMembership?.status === "PENDING";
  const acceptedMembers = trip.members.filter((m) => m.status === "ACCEPTED");
  const isParticipant = isOwner || isMember;
  const isShared = acceptedMembers.length > 0;
  // Управление поездкой (видимость, личные события) — часть платного
  // функционала; владелец без подписки видит свою поездку read-only.
  const canManage = isOwner && isPremiumActive(user);
  // Вносить события/дела могут все участники с подпиской.
  const canContribute = isParticipant && isPremiumActive(user);
  if (!isParticipant && !isInvited) {
    if (trip.visibility === "PRIVATE") notFound();
    if (trip.visibility === "FRIENDS") {
      const ownerFriendIds = await getFriendIds(trip.userId);
      if (!ownerFriendIds.includes(user.id)) notFound();
    }
  }

  const participantIds = [trip.userId, ...acceptedMembers.map((m) => m.userId)];
  const nameById = new Map<string, string | null>([
    [trip.userId, trip.user.name],
    ...acceptedMembers.map((m) => [m.userId, m.user.name] as [string, string | null]),
  ]);
  // Фильтр «Только моё» (совместные поездки): в плане остаются лишь мои
  // отметки «иду», мои личные события и мои дела.
  const onlyMine = isShared && isParticipant && mine === "1";
  // Автор записи для подписи в карточке (легаси-записи без createdById —
  // владельца); подписываем только в совместных поездках.
  const authorLabel = (createdById: string | null): string | null =>
    isShared ? (nameById.get(createdById ?? trip.userId) ?? null) : null;

  const rangeWhere = { startsAt: { gte: trip.startDate, lte: endOfDay(trip.endDate) } };
  const [occurrences, planCount, totalCount] = await Promise.all([
    prisma.eventOccurrence.findMany({
      where: {
        ...rangeWhere,
        // План совместной поездки — отметки «иду» всех участников;
        // «Только моё» сужает до текущего юзера.
        ...(showAll
          ? {}
          : {
              attendances: {
                some: { userId: onlyMine ? user.id : { in: participantIds } },
              },
            }),
      },
      include: { event: { include: { performers: { include: { performer: { select: { id: true, name: true, slug: true } } } } } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.eventOccurrence.count({
      where: { ...rangeWhere, attendances: { some: { userId: { in: participantIds } } } },
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

  // Билеты юзера к датам плана — 🎫 прямо в карточке события.
  const myTickets = await prisma.eventAttendance.findMany({
    where: { userId: user.id, occurrenceId: { in: occIds }, ticketUrl: { not: null } },
    select: { occurrenceId: true, ticketUrl: true },
  });
  const ticketByOccurrence = new Map(myTickets.map((t) => [t.occurrenceId, t.ticketUrl]));

  // Право менять конкретную запись: автор, владелец поездки или другой
  // участник, если автор разрешил галочкой (editableByOthers).
  const canTouch = (item: { createdById: string | null; editableByOthers: boolean }): boolean => {
    if (!canContribute) return false;
    const authorId = item.createdById ?? trip.userId;
    return authorId === user.id || isOwner || item.editableByOthers;
  };
  const isMine = (createdById: string | null): boolean =>
    (createdById ?? trip.userId) === user.id;

  // Публичные и личные события — одна хронологическая лента. Личные
  // видят только участники: даже в публичной поездке брони/встречи —
  // не для чужих глаз.
  const personal: PersonalEventData[] = (isParticipant ? trip.personalEvents : [])
    // Приватные записи видит только автор — даже другие участники.
    .filter((p) => !p.isPrivate || isMine(p.createdById))
    .filter((p) => !onlyMine || isMine(p.createdById))
    .map((p) => ({
      id: p.id,
      title: p.title,
      note: p.note,
      location: p.location,
      startsAt: p.startsAt,
      dateKey: dateKey(p.startsAt),
      timeValue: formatTime(p.startsAt),
      author: authorLabel(p.createdById),
      editableByOthers: p.editableByOthers,
      isPrivate: p.isPrivate,
      showOnHome: p.showOnHome,
      imageUrl: p.imageUrl,
      canEdit: canTouch(p),
    }));
  // Дела поездки — планирование участников, чужим не показываем.
  const todos = isParticipant
    ? await prisma.tripTodo.findMany({
        where: { tripId: trip.id },
        orderBy: [{ done: "asc" }, { date: "asc" }],
      })
    : [];
  const todoData = todos
    .filter((t) => !t.isPrivate || isMine(t.createdById))
    .filter((t) => !onlyMine || isMine(t.createdById))
    .map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
      date: t.date ? t.date.toISOString() : null,
      hasTime: t.hasTime,
      author: authorLabel(t.createdById),
      canEdit: canTouch(t),
      editableByOthers: t.editableByOthers,
      isPrivate: t.isPrivate,
    }));

  const timeline: (
    | { kind: "public"; startsAt: Date; key: string; event: (typeof events)[number] }
    | { kind: "personal"; startsAt: Date; key: string; personalEvent: PersonalEventData }
    | { kind: "todo"; startsAt: Date; key: string; todo: (typeof todoData)[number] }
  )[] = [
    ...events.map((ev) => ({ kind: "public" as const, startsAt: ev.startsAt, key: `pub-${ev.occurrenceId}`, event: ev })),
    // Вкладка «Афиша» — только события афиши: личные записи и дела там
    // мешали (просьба владельца). Они живут в «Плане».
    ...(showAll
      ? []
      : personal.map((p) => ({ kind: "personal" as const, startsAt: p.startsAt, key: `own-${p.id}`, personalEvent: p }))),
    // Датированные дела попадают в хронологию плана.
    ...(showAll
      ? []
      : todoData
          .filter((t) => t.date)
          .map((t) => ({ kind: "todo" as const, startsAt: new Date(t.date!), key: `todo-${t.id}`, todo: t }))),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // «Что посетить» (Г4): локации съёмок сериалов владельца + прикреплённые
  // списки мест + отдельные добавленные места.
  const [tripLists, tripPlaces, myLists] = showPlaces
    ? await Promise.all([
        prisma.tripPlaceList.findMany({
          where: { tripId: trip.id },
          include: { list: { include: { items: { include: { location: true } } } } },
        }),
        prisma.tripPlace.findMany({
          where: { tripId: trip.id },
          include: { location: true },
        }),
        isParticipant
          ? prisma.placeList.findMany({
              where: { userId: user.id },
              select: { id: true, title: true },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve([]),
      ])
    : [[], [], []];
  const attachedListIds = new Set(tripLists.map((t) => t.listId));
  const availableLists = myLists.filter((l) => !attachedListIds.has(l.id));

  // Кандидаты в участники — друзья владельца, которых ещё нет в поездке
  // (friendIds для владельца — его же друзья).
  const memberIdSet = new Set(trip.members.map((m) => m.userId));
  const availableFriends = isOwner
    ? await prisma.user.findMany({
        where: { id: { in: friendIds.filter((id) => !memberIdSet.has(id)) } },
        select: { id: true, name: true },
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
          <h1 className="display-1-tight mb-1 d-flex align-items-center gap-2" style={{ fontSize: "2.5rem" }}>
            {trip.title}
            {canManage && (
              <EditTripButton
                trip={{
                  id: trip.id,
                  title: trip.title,
                  startKey: dateKey(trip.startDate),
                  endKey: dateKey(trip.endDate),
                }}
              />
            )}
          </h1>
          <p className="text-secondary mb-0">
            {formatShortDate(trip.startDate)} – {formatShortDate(trip.endDate)}{" "}
            {trip.endDate.getFullYear()}
          </p>
        </div>
        {isParticipant ? (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {canManage && (
              <VisibilitySelect tripId={trip.id} visibility={trip.visibility} />
            )}
            <TripMembersButton
              tripId={trip.id}
              isOwner={isOwner}
              owner={{ id: trip.userId, name: trip.user.name }}
              members={trip.members.map((m) => ({
                id: m.userId,
                name: m.user.name,
                pending: m.status === "PENDING",
              }))}
              availableFriends={availableFriends}
            />
          </div>
        ) : (
          <Link href={`/users/${trip.user.id}`} className="small text-secondary text-decoration-none">
            Поездка {trip.user.name ? `пользователя ${trip.user.name}` : "друга"} →
          </Link>
        )}
      </div>

      {isInvited && (
        <div className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3 mb-4">
          <span>
            {trip.user.name ?? "Пользователь"} приглашает вас в эту поездку —
            вы будете видеть общий план и сможете добавлять свои события и дела.
          </span>
          <TripInviteActions tripId={trip.id} />
        </div>
      )}

      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={tripHref(trip)}
            prefetch={false}
            className={`tab-bar-item ${!showAll && !showPlaces && !showTodos ? "active" : ""}`}
          >
            {isShared ? "План" : isOwner ? "Мой план" : "План"} ({planCount})
          </Link>
          <Link
            href={`${tripHref(trip)}?view=all`}
            prefetch={false}
            className={`tab-bar-item ${showAll ? "active" : ""}`}
          >
            Афиша ({totalCount})
          </Link>
          {isParticipant && (
            <Link
              href={`${tripHref(trip)}?view=todos`}
              prefetch={false}
              className={`tab-bar-item ${showTodos ? "active" : ""}`}
            >
              Дела ({todoData.length})
            </Link>
          )}
          <Link
            href={`${tripHref(trip)}?view=places`}
            prefetch={false}
            className={`tab-bar-item ${showPlaces ? "active" : ""}`}
          >
            Что посетить
          </Link>
        </div>
        {isShared && isParticipant && !showAll && !showPlaces && (
          <Link
            href={`${tripHref(trip)}${showTodos ? "?view=todos" : ""}${onlyMine ? "" : showTodos ? "&mine=1" : "?mine=1"}`}
            prefetch={false}
            className={`btn btn-sm ${onlyMine ? "btn-primary" : "btn-ghost"}`}
          >
            Только моё
          </Link>
        )}
      </div>

      {/* Жильё и перелёты — только участникам: чужим бронь видеть
          незачем. Блок компактный: пустой — это одна строка заголовка,
          поэтому его видно и на вкладке афиши, и в плане. */}
      {!showTodos && !showPlaces && canContribute && (
        <TripBookings
          tripId={trip.id}
          leadingAction={
            <AddPersonalEventButton
              tripId={trip.id}
              showShareToggle={isShared}
              label="+ Событие"
              accent
            />
          }
          bookings={trip.bookings.map((b) => ({
            id: b.id,
            kind: b.kind,
            name: b.name,
            address: b.address,
            fromPlace: b.fromPlace,
            toPlace: b.toPlace,
            url: b.url,
            fileUrl: b.fileUrl,
            note: b.note,
            startDate: b.startAt ? dateKey(b.startAt) : null,
            endDate: b.endAt ? dateKey(b.endAt) : null,
            startTime: b.kind === "FLIGHT" && b.startAt ? formatTime(b.startAt) : null,
            endTime: b.kind === "FLIGHT" && b.endAt ? formatTime(b.endAt) : null,
            whenLabel: bookingWhenLabel(b),
          }))}
        />
      )}

      {showTodos ? (
        <TripTodos
          tripId={trip.id}
          todos={todoData}
          canAdd={canContribute}
          showShareToggle={isShared}
        />
      ) : showPlaces ? (
        (() => {
          const pinMap = new Map<string, { id: string; name: string; latitude: number; longitude: number }>();
          const addPin = (l: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
            if (l.latitude != null && l.longitude != null && !pinMap.has(l.id)) {
              pinMap.set(l.id, { id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude });
            }
          };
          tripLists.forEach((tl) => tl.list.items.forEach((i) => addPin(i.location)));
          tripPlaces.forEach((tp) => addPin(tp.location));
          const pins = Array.from(pinMap.values());
          const isEmpty =
            tripLists.length === 0 && tripPlaces.length === 0;
          return isEmpty && !isParticipant ? (
          <EmptyState
            emoji="📍"
            title="Пока здесь пусто"
            hint="Участники ещё не добавили места в эту поездку."
            compact
          />
        ) : (
          <>
            {canContribute && (
              <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <AddTripPlaceBox tripId={trip.id} />
                {/* Своё место прямо здесь: раньше ради одного места
                    нужно было сперва завести список. */}
                <CreateOwnPlaceButton
                  action={createTripOwnPlace.bind(null, trip.id)}
                  label="+ Своё место"
                />
                <AttachListSelect tripId={trip.id} availableLists={availableLists} />
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
                    className="section-heading text-decoration-none"
                  >
                    📋 {tl.list.title} ({tl.list.items.length})
                  </Link>
                  {canContribute && <DetachListButton tripId={trip.id} listId={tl.listId} />}
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
                <h2 className="section-heading mb-2">
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
                      {canContribute && <RemoveTripPlaceButton tripId={trip.id} locationId={tp.locationId} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isEmpty && isParticipant && (
              <EmptyState
                emoji="📍"
                title="Мест пока нет"
                hint="Создайте своё место по ссылке Google Maps, найдите готовое или прикрепите список — здесь соберётся, что посетить в поездке."
                compact
              />
            )}
          </>
        );
        })()
      ) : timeline.length === 0 ? (
        <EmptyState
          emoji="✈️"
          title={showAll ? "В эти даты событий нет" : "В плане пока пусто"}
          hint={
            showAll
              ? "В даты этой поездки не попадает ни одно событие из афиши."
              : isParticipant
                ? "Отметьте «я иду» на событиях (вкладка «Афиша») или добавьте личное — перелёт, бронь, встречу."
                : "Участники ещё ничего не добавили в план."
          }
          compact
        />
      ) : (
        <div className="d-flex flex-column gap-3">
          {timeline.map((item) =>
            item.kind === "public" ? (
              <EventCard
                key={item.key}
                event={item.event}
                isFavorited={favoritedIds.has(item.event.id)}
                isGoing={goingIds.has(item.event.occurrenceId)}
                friendsGoing={friendsGoingByEvent.get(item.event.occurrenceId) ?? []}
                ticketUrl={ticketByOccurrence.get(item.event.occurrenceId) ?? null}
              />
            ) : item.kind === "personal" ? (
              <PersonalEventCard
                key={item.key}
                tripId={trip.id}
                event={item.personalEvent}
                canEdit={item.personalEvent.canEdit}
                showShareToggle={isShared}
              />
            ) : (
              <TodoRow key={item.key} todo={item.todo} showDate showShareToggle={isShared} />
            ),
          )}
        </div>
      )}

      {/* Удаление — в самом низу страницы (просьба владельца): в шапке
          оно стояло рядом с обычными действиями и нажималось случайно,
          а операция необратимая. */}
      {isOwner && (
        <div className="mt-5 pt-4 border-top d-flex justify-content-end">
          <ConfirmForm action={boundDelete} confirmMessage={`Удалить поездку «${trip.title}»?`}>
            <button type="button" className="btn btn-outline-secondary btn-sm">
              Удалить поездку
            </button>
          </ConfirmForm>
        </div>
      )}
    </div>
  );
}
