import ReviewsAndComments from "@/components/ReviewsAndComments";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCombinedDateList, formatHumanDate, formatTimeRangeWithZone, formatTimeWithZone } from "@/lib/dates";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import type { EventOccurrence } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import FavoriteButton from "@/components/FavoriteButton";
import EntityMiniCard from "@/components/EntityMiniCard";
import LetterAvatar from "@/components/LetterAvatar";
import { CalendarIcon, ClockIcon, InfoIcon, PinIcon, TicketIcon, TvIcon, UsersIcon } from "@/components/icons";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import PremiumUpsell from "@/components/PremiumUpsell";
import EventNoteSection, { type FriendNote } from "./EventNoteSection";
import GoingDateChips from "./GoingDateChips";
import TicketSection, { type TicketRow } from "./TicketSection";
import { getCoTravelerIds } from "@/lib/coTravelers";
import { isPremiumActive } from "@/lib/premium";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findFirst({
    where: slugOrIdWhere(id),
    select: {
      title: true,
      venue: true,
      description: true,
      posterUrl: true,
      slug: true,
      occurrences: { orderBy: { startsAt: "asc" }, take: 1, select: { startsAt: true } },
    },
  });
  if (!event) return pageMetadata({ title: "Событие", description: "Событие не найдено." });
  const date = event.occurrences[0]?.startsAt;
  const when = date ? formatHumanDate(date) : null;
  return pageMetadata({
    title: event.title,
    description:
      event.description?.slice(0, 160) ??
      `${event.title}${when ? `, ${when}` : ""} — ${event.venue}. Билеты, состав и детали события.`,
    path: `/event/${event.slug ?? id}`,
    image: event.posterUrl,
    type: "article",
  });
}


export const dynamic = "force-dynamic";

/** Groups occurrences that share the same start/end time-of-day (e.g. a
 *  run of shows all at "18:00–20:00" on consecutive dates) so they render
 *  as one combined date line instead of one full date per occurrence —
 *  occurrences with a distinct time of their own stay in their own
 *  single-item group and keep the full weekday date format. */
function groupOccurrencesByTime(occurrences: EventOccurrence[]): EventOccurrence[][] {
  const groups = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const timeOfDay = (d: Date) => `${d.getHours()}:${d.getMinutes()}`;
    const key = `${timeOfDay(occ.startsAt)}-${occ.endsAt ? timeOfDay(occ.endsAt) : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(occ);
  }
  return Array.from(groups.values());
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const event = await prisma.event.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      performers: {
        include: {
          performer: {
            include: {
              // Группа на событии → показываем и её участников (не
              // дублируя тех, кто привязан к событию отдельно).
              bandMembers: { include: { performer: true } },
            },
          },
        },
      },
      pairings: { include: { pairing: { include: { performerA: true, performerB: true } } } },
      drama: true,
      occurrences: {
        orderBy: { startsAt: "asc" },
        include: {
          lineup: { include: { performer: { select: { id: true, slug: true, name: true, photoUrl: true } } } },
        },
      },
    },
  });

  if (!event) notFound();

  // --- own block: current user's favorite/attendance state for this event ---
  const currentUser = await getCurrentUser();
  const viewerTz = currentUser?.timezone ?? DEFAULT_TIMEZONE;

  // События целиком за подпиской: без неё страница не раскрывает ничего,
  // кроме факта существования и дат (название/площадка/состав не
  // рендерятся вовсе — в HTML их нет).
  if (!isPremiumActive(currentUser)) {
    return (
      <div>
        <BackLink fallbackHref="/" fallbackLabel="← Все события" />
        <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2.25rem" }}>
          Событие
        </h1>
        <p className="text-secondary mb-4">
          {event.occurrences.map((o) => formatHumanDate(o.startsAt)).join(", ")}
        </p>
        <PremiumUpsell feature="Страницы событий" />
      </div>
    );
  }
  let isEventFavorited = false;
  let goingOccurrenceIds: string[] = [];
  let friendsGoing: { id: string; name: string | null; photoUrl: string | null }[] = [];
  let ownNote: { text: string; visibility: string } | null = null;
  let friendNotes: FriendNote[] = [];
  let ticketRows: TicketRow[] = [];
  if (currentUser) {
    const [favorite, attendances, friendIds, coTravelerIds] = await Promise.all([
      prisma.favoriteEvent.findUnique({
        where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
      }),
      prisma.eventAttendance.findMany({
        where: { userId: currentUser.id, eventId: event.id },
        select: { occurrenceId: true, ticketUrl: true },
      }),
      getFriendIds(currentUser.id),
      getCoTravelerIds(currentUser.id),
    ]);
    isEventFavorited = !!favorite;
    goingOccurrenceIds = attendances.map((a) => a.occurrenceId);
    // «Мои билеты»: строка на каждую дату с отметкой «иду».
    ticketRows = attendances
      .map((a) => {
        const occ = event.occurrences.find((o) => o.id === a.occurrenceId);
        return occ
          ? {
              occurrenceId: a.occurrenceId,
              dateLabel: formatHumanDate(occ.startsAt),
              ticketUrl: a.ticketUrl,
            }
          : null;
      })
      .filter((r): r is TicketRow => r !== null);
    if (friendIds.length > 0) {
      const attendances = await prisma.eventAttendance.findMany({
        where: { eventId: event.id, userId: { in: friendIds } },
        select: { user: { select: { id: true, name: true, photoUrl: true } } },
      });
      // «Иду» per-дата — у идущего на все 3 дня будет 3 строки; в блоке
      // «Друзья идут» человек выводится один раз.
      friendsGoing = Array.from(new Map(attendances.map((a) => [a.user.id, a.user])).values());
    }

    // Заметки (Г6): своя + друзей с видимостью FRIENDS + со-путешественников
    // по совместным поездкам с видимостью TRIP.
    const notes = await prisma.eventNote.findMany({
      where: {
        eventId: event.id,
        OR: [
          { userId: currentUser.id },
          ...(friendIds.length > 0
            ? [{ userId: { in: friendIds }, visibility: "FRIENDS" as const }]
            : []),
          ...(coTravelerIds.length > 0
            ? [{ userId: { in: coTravelerIds }, visibility: "TRIP" as const }]
            : []),
        ],
      },
      include: { user: { select: { name: true, photoUrl: true } } },
    });
    const own = notes.find((n) => n.userId === currentUser.id);
    ownNote = own ? { text: own.text, visibility: own.visibility } : null;
    friendNotes = notes
      .filter((n) => n.userId !== currentUser.id)
      .map((n) => ({ id: n.id, text: n.text, userName: n.user.name, userPhotoUrl: n.user.photoUrl }));
  }
  // --- end own block ---

  return (
    <div>
      <BackLink fallbackHref="/" fallbackLabel="← Все события" />
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mt-3 mb-3">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {event.title}
        </h1>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <FavoriteButton kind="event" id={event.id} isFavorited={isEventFavorited} variant="icon" />
          <a
            href={`/event/${event.id}/ics`}
            className="round-icon-btn"
            aria-label="Добавить в календарь"
            data-tooltip="Добавить в календарь"
          >
            <CalendarIcon />
          </a>
        </div>
      </div>
      <div className="row g-4 mb-3">
        {event.posterUrl && (
          <div className="col-12 col-sm-4 col-md-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src={event.posterUrl}
              alt={event.title}
              className="surface"
              style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover" }}
            />
            {event.presaleUrl && (
              <a
                href={event.presaleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary w-100 mt-2 d-inline-flex align-items-center justify-content-center gap-2"
              >
                <TicketIcon /> Билеты
              </a>
            )}
          </div>
        )}
        <div className={event.posterUrl ? "col-12 col-sm-8 col-md-9" : "col-12"}>
          <div className="surface p-4 h-100">
            <p className="mb-2">
              <PinIcon className="icon-inline" /> <span className="text-secondary">Локация:</span>{" "}
              {event.venue}
            </p>
            {groupOccurrencesByTime(event.occurrences).map((group) => {
              const first = group[0];
              return (
                <p key={group.map((o) => o.id).join("-")} className="mb-2">
                  <CalendarIcon /> <span className="text-secondary">Дата и время:</span>{" "}
                  {group.length === 1 ? (
                    <span className="text-capitalize">{formatHumanDate(first.startsAt)}</span>
                  ) : (
                    formatCombinedDateList(group.map((o) => o.startsAt))
                  )}
                  {first.hasTime && <> · {formatTimeRangeWithZone(first.startsAt, first.endsAt, viewerTz)}</>}
                </p>
              );
            })}
            {currentUser && (
              <div className="mb-2">
                <GoingDateChips
                  occurrences={event.occurrences.map((o) => ({ id: o.id, startsAt: o.startsAt }))}
                  goingIds={goingOccurrenceIds}
                />
              </div>
            )}
            {event.ticketPrice && (
              <p className="mb-0">
                <TicketIcon className="icon-inline" />{" "}
                <span className="text-secondary">Цена билетов:</span> {event.ticketPrice}
              </p>
            )}
            {(event.presaleAt || event.presaleUrl) && (
              <div className={event.drama ? "mt-3 mb-2" : "mt-3 mb-0"}>
                <p className="mb-2">
                  <ClockIcon className="icon-inline" />{" "}
                  <span className="text-secondary">Препродажа билетов:</span>{" "}
                  {event.presaleAt ? (
                    <>
                      <span className="text-capitalize">{formatHumanDate(event.presaleAt)}</span>{" "}
                      · {formatTimeWithZone(event.presaleAt, viewerTz)}
                    </>
                  ) : (
                    "уточняется"
                  )}
                </p>
                <div className="d-flex flex-wrap gap-2">
                  {/* Кнопка «Билеты» живёт под постером; без постера —
                      остаётся здесь, чтобы не потеряться. */}
                  {event.presaleUrl && !event.posterUrl && (
                    <a
                      href={event.presaleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      Билеты
                    </a>
                  )}
                  {/* Напоминание о препродаже имеет смысл только до её
                      старта — для уже прошедшей кнопку не показываем. */}
                  {event.presaleAt && event.presaleAt > new Date() && (
                    <a
                      href={`/event/${event.id}/ics?presale=1`}
                      className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
                    >
                      <CalendarIcon className="icon-inline" />
                      Добавить в календарь
                    </a>
                  )}
                </div>
              </div>
            )}
            {(event.performers.length > 0 || event.pairings.length > 0) && (
              <div className={event.drama ? "mt-3 mb-3" : "mt-3 mb-0"}>
                <p className="section-heading mb-2">
                  <UsersIcon className="icon-inline" /> Кто выступает
                </p>
                <div className="d-flex flex-wrap gap-2">
                  {/* До 8 артистов — крупные карточки; фестивальные
                      составы в 15–30 имён — компактными пиллами, иначе
                      блок раздувается на пол-экрана. */}
                  {event.performers.length <= 8 ? (
                    event.performers.map(({ performer }) => (
                      <EntityMiniCard
                        key={performer.id}
                        href={performerHref(performer)}
                        photoUrl={performer.photoUrl}
                        name={performer.name}
                      />
                    ))
                  ) : (
                    event.performers.map(({ performer }) => (
                      <Link
                        key={performer.id}
                        href={performerHref(performer)}
                        className="surface surface-hover text-decoration-none d-inline-flex align-items-center gap-2 py-1 ps-1 pe-3"
                        style={{ borderRadius: "2rem" }}
                      >
                        <LetterAvatar name={performer.name} photoUrl={performer.photoUrl} size={1.75} />
                        <span className="small text-white">{performer.name}</span>
                      </Link>
                    ))
                  )}
                  {(() => {
                    // Участники выступающих групп — сразу в общий список,
                    // без дублей с напрямую привязанными артистами.
                    const directIds = new Set(event.performers.map((ep) => ep.performer.id));
                    const seen = new Set<string>();
                    return event.performers.flatMap(({ performer }) =>
                      performer.bandMembers
                        .filter((bm) => {
                          if (directIds.has(bm.performer.id) || seen.has(bm.performer.id)) return false;
                          seen.add(bm.performer.id);
                          return true;
                        })
                        .map((bm) => (
                          <EntityMiniCard
                            key={`bm-${bm.performer.id}`}
                            href={performerHref(bm.performer)}
                            photoUrl={bm.performer.photoUrl}
                            name={bm.performer.name}
                            subtitle={performer.name}
                          />
                        )),
                    );
                  })()}
                  {event.pairings.map(({ pairing }) => (
                    <span key={pairing.id} className="event-chip">
                      {pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {event.occurrences.some((o) => o.lineup.length > 0) && (
              <div className="mt-3 mb-3">
                <p className="section-heading mb-2">
                  <CalendarIcon className="icon-inline" /> Лайнап по дням
                </p>
                <div className="d-flex flex-column gap-2">
                  {event.occurrences
                    .filter((o) => o.lineup.length > 0)
                    .map((o) => (
                      <div key={o.id}>
                        <p className="small text-secondary mb-1 text-capitalize">
                          {formatHumanDate(o.startsAt)}
                        </p>
                        <div className="d-flex flex-wrap gap-2">
                          {o.lineup.map((l) => (
                            <EntityMiniCard
                              key={l.performer.id}
                              href={performerHref(l.performer)}
                              photoUrl={l.performer.photoUrl}
                              name={l.performer.name}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {event.drama && (
              <p className="mb-0">
                <TvIcon className="icon-inline" /> <span className="text-secondary">Сериал:</span>{" "}
                <Link href={dramaHref(event.drama)} className="link-body-emphasis">
                  {event.drama.title}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      {friendsGoing.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2
            className="section-heading mb-2 d-flex align-items-center gap-2"
          >
            <UsersIcon /> {friendsGoing.length === 1 ? "Друг идёт" : "Друзья идут"}
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {friendsGoing.map((f) => (
              <EntityMiniCard key={f.id} href="/friends" photoUrl={f.photoUrl} name={f.name || "Без имени"} />
            ))}
          </div>
        </div>
      )}

      <TicketSection rows={ticketRows} />
      <EventNoteSection eventId={event.id} ownNote={ownNote} friendNotes={friendNotes} />

      {event.description && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-2">
            <InfoIcon className="icon-inline" /> Описание
          </h2>
          <p className="mb-0">{event.description}</p>
        </div>
      )}

      <ReviewsAndComments kind="event" id={event.id} />
    </div>
  );
}
