import ReviewsAndComments from "@/components/ReviewsAndComments";
import SourcesBlock from "@/components/SourcesBlock";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import DetailHero from "@/components/DetailHero";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCombinedDateList, formatHumanDate, formatShortDate, formatTimeRangeWithZone, formatTimeWithZone } from "@/lib/dates";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import type { EventOccurrence } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import FavoriteButton from "@/components/FavoriteButton";
import EntityMiniCard from "@/components/EntityMiniCard";
import CastGrid from "@/components/CastGrid";
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
              // _count.events (и у участников групп) — маркер
              // популярности для сортировки каст-сетки (Э2ф).
              bandMembers: {
                include: {
                  performer: {
                    include: { _count: { select: { events: true } } },
                  },
                },
              },
              _count: { select: { events: true } },
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

  // Чип даты в hero: ближайшая будущая дата, а для прошедших событий —
  // первая (даты отсортированы по возрастанию при загрузке).
  const heroOccurrence =
    event.occurrences.find((o) => o.startsAt >= new Date()) ??
    event.occurrences[0];
  // Чип цены: короткую строку показываем как есть, а прайс-лист концерта
  // («7,900 / … / 1,500 baht») сжимаем до «от 1,500 baht» — полный
  // перечень остаётся строкой «Цена билетов» в карточке ниже.
  const priceChip = (() => {
    const p = event.ticketPrice?.trim();
    if (!p) return null;
    if (p.length <= 30) return p;
    const tokens = p.match(/\d[\d,.]*/g);
    if (!tokens || tokens.length < 2) return null;
    const min = tokens.reduce((best, t) =>
      Number(t.replace(/,/g, "")) < Number(best.replace(/,/g, "")) ? t : best,
    );
    const unit = p.match(/[^\d\s/,.]+\s*$/)?.[0].trim();
    return `от ${min}${unit ? ` ${unit}` : ""}`;
  })();

  // Э2ф: свой осмысленный порядок у состава события не хранится —
  // сортируем по популярности (числу событий у артиста), при равенстве
  // по имени; первые ~14 видимых в сетке — самые популярные.
  const performersSorted = [...event.performers].sort(
    (a, b) =>
      b.performer._count.events - a.performer._count.events ||
      a.performer.name.localeCompare(b.performer.name),
  );

  // Э2ф: якорные чипы под hero — только на существующие секции и только
  // если их набралось хотя бы три (иначе ряд не помогает навигации).
  const hasLineupSection =
    event.performers.length > 0 || event.pairings.length > 0;
  const anchors = [
    ...(hasLineupSection ? [{ href: "#lineup", label: "Состав" }] : []),
    ...(event.description
      ? [{ href: "#description", label: "Описание" }]
      : []),
    { href: "#reviews", label: "Отзывы" },
  ];

  return (
    <div>
      <BackLink fallbackHref="/" fallbackLabel="← Все события" />
      {/* Иммерсивный hero (Э2): постер и титул с чипами вместо плоской
          шапки; постер из колонки слева переехал сюда. */}
      <div className="mt-3">
        <DetailHero
          photoUrl={event.posterUrl}
          photoAlt={event.title}
          title={event.title}
          subtitle={event.venue}
          chips={
            <>
              {heroOccurrence && (
                <span className="date-chip">
                  {formatShortDate(heroOccurrence.startsAt)}
                </span>
              )}
              {event.occurrences.length > 1 && (
                <span className="date-chip">дат: {event.occurrences.length}</span>
              )}
              {priceChip && <span className="date-chip">{priceChip}</span>}
            </>
          }
          actions={
            <>
              <FavoriteButton kind="event" id={event.id} isFavorited={isEventFavorited} variant="icon" />
              <a
                href={`/event/${event.id}/ics`}
                className="round-icon-btn"
                aria-label="Добавить в календарь"
                data-tooltip="Добавить в календарь"
              >
                <CalendarIcon />
              </a>
            </>
          }
        />
      </div>
      {anchors.length >= 3 && (
        <div className="section-anchors">
          {anchors.map((a) => (
            <a key={a.href} href={a.href} className="chip-link">
              {a.label}
            </a>
          ))}
        </div>
      )}
      <div className="mb-3">
          <div className="surface p-4">
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
                  {/* Постер переехал в hero, кнопка «Билеты» — сюда. */}
                  {event.presaleUrl && (
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

      {/* Э2ф: билеты — сразу под датами, состав — фото-сеткой ниже,
          описание и отзывы в конце. */}
      <TicketSection rows={ticketRows} />

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

      {/* Кто выступает — адаптивной каст-сеткой (Э2ф): раньше блок жил
          внутри карточки дат и раздувал её; фестивальные составы в
          15–30 имён складываются за «Показать всех». Пейринги остаются
          чипами под сеткой. */}
      {hasLineupSection && (
        <div id="lineup" className="anchor-target surface p-4 mb-3">
          <h2 className="section-heading mb-3">
            <UsersIcon className="icon-inline" /> Кто выступает
          </h2>
          {event.performers.length > 0 && (
            <CastGrid compact>
              {performersSorted.map(({ performer }) => (
                <EntityMiniCard
                  key={performer.id}
                  variant="grid"
                  href={performerHref(performer)}
                  photoUrl={performer.photoUrl}
                  name={performer.name}
                />
              ))}
              {(() => {
                // Участники выступающих групп — сразу в общий список,
                // без дублей с напрямую привязанными артистами; внутри
                // группы — тоже по популярности.
                const directIds = new Set(event.performers.map((ep) => ep.performer.id));
                const seen = new Set<string>();
                return performersSorted.flatMap(({ performer }) =>
                  [...performer.bandMembers]
                    .sort(
                      (a, b) =>
                        b.performer._count.events - a.performer._count.events ||
                        a.performer.name.localeCompare(b.performer.name),
                    )
                    .filter((bm) => {
                      if (directIds.has(bm.performer.id) || seen.has(bm.performer.id)) return false;
                      seen.add(bm.performer.id);
                      return true;
                    })
                    .map((bm) => (
                      <EntityMiniCard
                        key={`bm-${bm.performer.id}`}
                        variant="grid"
                        href={performerHref(bm.performer)}
                        photoUrl={bm.performer.photoUrl}
                        name={bm.performer.name}
                        subtitle={performer.name}
                      />
                    )),
                );
              })()}
            </CastGrid>
          )}
          {event.pairings.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mt-3">
              {event.pairings.map(({ pairing }) => (
                <span key={pairing.id} className="event-chip">
                  {pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {event.occurrences.some((o) => o.lineup.length > 0) && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-2">
            <CalendarIcon className="icon-inline" /> Лайнап по дням
          </h2>
          <div className="d-flex flex-column gap-3">
            {event.occurrences
              .filter((o) => o.lineup.length > 0)
              .map((o) => (
                <div key={o.id}>
                  <p className="small text-secondary mb-2 text-capitalize">
                    {formatHumanDate(o.startsAt)}
                  </p>
                  <div className="cast-grid">
                    {o.lineup.map((l) => (
                      <EntityMiniCard
                        key={l.performer.id}
                        variant="grid"
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

      <EventNoteSection eventId={event.id} ownNote={ownNote} friendNotes={friendNotes} />

      {event.description && (
        <div id="description" className="anchor-target surface p-4 mb-3">
          <h2 className="section-heading mb-2">
            <InfoIcon className="icon-inline" /> Описание
          </h2>
          <p className="mb-0">{event.description}</p>
        </div>
      )}

      <SourcesBlock links={[{ url: event.sourceUrl }]} />

      <div id="reviews" className="anchor-target">
        <ReviewsAndComments kind="event" id={event.id} />
      </div>
    </div>
  );
}
