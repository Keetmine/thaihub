import ReviewsAndComments from "@/components/ReviewsAndComments";
import SourcesBlock from "@/components/SourcesBlock";
import AppLink from "@/components/AppLink";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCombinedDateList, formatHumanDate, formatTimeRangeWithZone, formatTimeWithZone } from "@/lib/dates";
import { getT, localeHref } from "@/lib/i18n";
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
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import PremiumUpsell from "@/components/PremiumUpsell";
import EventNoteSection, { type FriendNote } from "./EventNoteSection";
import EventPhotoGallery from "./EventPhotoGallery";
import GoingDateChips from "./GoingDateChips";
import TicketSection, { type TicketRow } from "./TicketSection";
import { getCoTravelerIds } from "@/lib/coTravelers";
import { isPremiumActive } from "@/lib/premium";
import { pageMetadata, eventJsonLd, JsonLd } from "@/lib/seo";
import { cache } from "react";

// React.cache: generateMetadata и страница делят ОДИН запрос на
// HTTP-запрос (как getCurrentUser в lib/userAuth.ts) — раньше метадата
// ходила в базу отдельным узким select.
const getEvent = cache(async (rawId: string) =>
  prisma.event.findFirst({
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
      photos: { orderBy: { sort: "asc" } },
      occurrences: {
        orderBy: { startsAt: "asc" },
        include: {
          lineup: { include: { performer: { select: { id: true, slug: true, name: true, photoUrl: true } } } },
        },
      },
    },
  }),
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { locale, t } = await getT();
  const { id } = await params;
  const event = await getEvent(id);
  // notFound() именно здесь: метадата считается до флаша ответа, и
  // несуществующий slug получает настоящий HTTP 404 — иначе loading.tsx
  // успевал отдать 200-shell до notFound() в самой странице (soft-404).
  if (!event) notFound();
  const date = event.occurrences[0]?.startsAt;
  const when = date ? formatHumanDate(date, locale) : null;
  return pageMetadata({
    title: event.title,
    description:
      event.description?.slice(0, 160) ??
      t.events.detail.metaDescription(event.title, when, event.venue),
    path: `/event/${event.slug ?? id}`,
    image: event.posterUrl,
    type: "article",
    // noIndex здесь БОЛЬШЕ НЕТ: карточка события (что, когда, где, кто)
    // открыта всем, robots.txt её тоже пускает — противоречия
    // «robots запрещает, а мета разрешает» быть не должно. За подпиской
    // остались только личные блоки страницы, в разметку они не идут.
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
  const { locale, t } = await getT();
  const { id: rawId } = await params;
  // Тот же React.cache-запрос, что и в generateMetadata, — Prisma
  // дёргается один раз на HTTP-запрос.
  const event = await getEvent(rawId);

  if (!event) notFound();

  // --- own block: current user's favorite/attendance state for this event ---
  const currentUser = await getCurrentUser();
  const viewerTz = currentUser?.timezone ?? DEFAULT_TIMEZONE;

  // Карточка события ПУБЛИЧНАЯ: что, когда, где, кто выступает, постер,
  // описание, цена и ссылка на билеты — видно всем, включая поисковики
  // (эти же поля уходят в Event-разметку ниже). За подпиской остались
  // только личные планы вокруг события: отметки «иду», свои билеты,
  // заметки, «друзья идут», напоминание о препродаже и выгрузка в
  // календарь (маршрут /ics и сам отвечает 403 без подписки).
  const isPremium = isPremiumActive(currentUser);
  let isEventFavorited = false;
  let goingOccurrenceIds: string[] = [];
  let friendsGoing: { id: string; name: string | null; photoUrl: string | null }[] = [];
  let ownNote: { text: string; visibility: string } | null = null;
  let friendNotes: FriendNote[] = [];
  let ticketRows: TicketRow[] = [];
  // Избранное — бесплатное: сердечко работает у любого залогиненного,
  // подписка на него не влияет (как на страницах артистов и сериалов).
  if (currentUser && !isPremium) {
    isEventFavorited = !!(await prisma.favoriteEvent.findUnique({
      where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
    }));
  }
  if (currentUser && isPremium) {
    // Первая волна: всё, что зависит только от юзера и события, — включая
    // билеты, раньше ждавшие отдельным await.
    const [favorite, attendances, friendIds, coTravelerIds, myTickets] =
      await Promise.all([
        prisma.favoriteEvent.findUnique({
          where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
        }),
        prisma.eventAttendance.findMany({
          where: { userId: currentUser.id, eventId: event.id },
          select: { occurrenceId: true },
        }),
        getFriendIds(currentUser.id),
        getCoTravelerIds(currentUser.id),
        // «Мои билеты»: строка на каждую дату с отметкой «иду». Сами билеты
        // — из EventTicket: они живут отдельно от отметок и переживают их.
        prisma.eventTicket.findMany({
          where: { userId: currentUser.id, eventId: event.id },
          select: { occurrenceId: true, fileUrl: true },
        }),
      ]);
    isEventFavorited = !!favorite;
    goingOccurrenceIds = attendances.map((a) => a.occurrenceId);
    const ticketByOccurrence = new Map(
      myTickets.filter((t) => t.occurrenceId).map((t) => [t.occurrenceId!, t.fileUrl]),
    );
    ticketRows = attendances
      .map((a) => {
        const occ = event.occurrences.find((o) => o.id === a.occurrenceId);
        return occ
          ? {
              occurrenceId: a.occurrenceId,
              dateLabel: formatHumanDate(occ.startsAt, locale),
              ticketUrl: ticketByOccurrence.get(a.occurrenceId) ?? null,
            }
          : null;
      })
      .filter((r): r is TicketRow => r !== null);

    // Вторая волна: обе ждут только списков друзей/попутчиков из первой.
    const [friendAttendances, notes] = await Promise.all([
      friendIds.length > 0
        ? prisma.eventAttendance.findMany({
            where: { eventId: event.id, userId: { in: friendIds } },
            select: { user: { select: { id: true, name: true, photoUrl: true } } },
          })
        : [],
      // Заметки (Г6): своя + друзей с видимостью FRIENDS + со-путешественников
      // по совместным поездкам с видимостью TRIP.
      prisma.eventNote.findMany({
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
      }),
    ]);
    // «Иду» per-дата — у идущего на все 3 дня будет 3 строки; в блоке
    // «Друзья идут» человек выводится один раз.
    friendsGoing = Array.from(
      new Map(friendAttendances.map((a) => [a.user.id, a.user])).values(),
    );
    const own = notes.find((n) => n.userId === currentUser.id);
    ownNote = own ? { text: own.text, visibility: own.visibility } : null;
    friendNotes = notes
      .filter((n) => n.userId !== currentUser.id)
      .map((n) => ({ id: n.id, text: n.text, userName: n.user.name, userPhotoUrl: n.user.photoUrl }));
  }
  // --- end own block ---

  // Э2ф: свой осмысленный порядок у состава события не хранится —
  // сортируем по популярности (числу событий у артиста), при равенстве
  // по имени; первые ~14 видимых в сетке — самые популярные.
  const performersSorted = [...event.performers].sort(
    (a, b) =>
      b.performer._count.events - a.performer._count.events ||
      a.performer.name.localeCompare(b.performer.name),
  );

  // Полный состав одним списком: артисты события + участники их групп
  // (без дублей), ЕДИНОЙ сортировкой по популярности — самые известные
  // лица первыми независимо от того, пришли они напрямую или из группы.
  const directIds = new Set(event.performers.map((ep) => ep.performer.id));
  const seenBandMembers = new Set<string>();
  const castPool = [
    ...performersSorted.map(({ performer }) => ({
      id: performer.id,
      href: performerHref(performer),
      photoUrl: performer.photoUrl,
      name: performer.name,
      subtitle: null as string | null,
      eventsCount: performer._count.events,
    })),
    ...performersSorted.flatMap(({ performer }) =>
      [...performer.bandMembers]
        .sort(
          (a, b) =>
            b.performer._count.events - a.performer._count.events ||
            a.performer.name.localeCompare(b.performer.name),
        )
        .filter((bm) => {
          if (directIds.has(bm.performer.id) || seenBandMembers.has(bm.performer.id)) return false;
          seenBandMembers.add(bm.performer.id);
          return true;
        })
        .map((bm) => ({
          id: bm.performer.id,
          href: performerHref(bm.performer),
          photoUrl: bm.performer.photoUrl,
          name: bm.performer.name,
          subtitle: performer.name as string | null,
          eventsCount: bm.performer._count.events,
        })),
    ),
  ];
  const castCards = [...castPool].sort(
    (a, b) => b.eventsCount - a.eventsCount || a.name.localeCompare(b.name),
  );
  // Обычный концерт (до 12 человек) — состав капсулами прямо в карточке
  // дат, как в первой версии страницы: всё важное в один экран. Большой
  // фестивальный состав — отдельной секцией сеткой со свёрткой.
  // Состав ЛЮБОГО размера живёт плашками в инфо-блоке (просьба
  // владельца — как на сериалах): большой прячет хвост за «показать
  // всех» через CastGrid chips, отдельной секции больше нет.
  const castInCard = castCards.length > 0;

  // В разметке сериал зовётся так же, как на видимой странице: на /ru —
  // русским названием, если оно есть.
  const eventLd = eventJsonLd({
    ...event,
    drama: event.drama ? { ...event.drama, title: dramaTitleForLocale(event.drama, locale) } : null,
  });

  return (
    <div>
      <BackLink fallbackHref="/" fallbackLabel={t.events.detail.backToEvents} />
      {/* Классическая шапка (по просьбе владельца): заголовок сверху,
          постер слева с кнопкой «Билеты», инфо-карта справа. */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-2 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {event.title}
        </h1>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <FavoriteButton kind="event" id={event.id} isFavorited={isEventFavorited} variant="icon" />
          {/* Выгрузка в календарь — по подписке: маршрут /ics отвечает
              403 без неё, кнопка-обманка была бы хуже её отсутствия. */}
          {isPremium && (
            <a
              href={localeHref(`/event/${event.id}/ics`, locale)}
              className="round-icon-btn"
              aria-label={t.events.detail.addToCalendar}
              data-tooltip={t.events.detail.addToCalendar}
            >
              <CalendarIcon />
            </a>
          )}
        </div>
      </div>

      <div className="d-flex flex-column flex-sm-row gap-4 mb-3">
        {event.posterUrl && (
          <div className="flex-shrink-0 d-flex flex-column gap-2" style={{ width: "15rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="eager"
              decoding="async"
              src={event.posterUrl}
              alt={event.title}
              className="rounded-4 w-100"
              style={{ aspectRatio: "3 / 4", objectFit: "cover" }}
            />
            {event.presaleUrl && (
              <a
                href={event.presaleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                <TicketIcon className="icon-inline" /> {t.events.detail.tickets}
              </a>
            )}
          </div>
        )}
        {/* Без подложки-surface (просьба владельца). */}
        <div className="flex-fill" style={{ minWidth: 0 }}>
            <p className="mb-2">
              <PinIcon className="icon-inline" />{" "}
              <span className="text-secondary">{t.events.detail.venue}</span> {event.venue}
            </p>
            {groupOccurrencesByTime(event.occurrences).map((group) => {
              const first = group[0];
              return (
                <p key={group.map((o) => o.id).join("-")} className="mb-2">
                  <CalendarIcon />{" "}
                  <span className="text-secondary">{t.events.detail.dateAndTime}</span>{" "}
                  {group.length === 1 ? (
                    <span className="text-capitalize">
                      {formatHumanDate(first.startsAt, locale)}
                    </span>
                  ) : (
                    formatCombinedDateList(
                      group.map((o) => o.startsAt),
                      locale,
                    )
                  )}
                  {first.hasTime && <> · {formatTimeRangeWithZone(first.startsAt, first.endsAt, viewerTz)}</>}
                </p>
              );
            })}
            {currentUser && isPremium && (
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
                <span className="text-secondary">{t.events.detail.ticketPrice}</span>{" "}
                {event.ticketPrice}
              </p>
            )}
            {(event.presaleAt || event.presaleUrl) && (
              <div className={event.drama ? "mt-3 mb-2" : "mt-3 mb-0"}>
                <p className="mb-2">
                  <ClockIcon className="icon-inline" />{" "}
                  <span className="text-secondary">{t.events.detail.presale}</span>{" "}
                  {event.presaleAt ? (
                    <>
                      <span className="text-capitalize">
                        {formatHumanDate(event.presaleAt, locale)}
                      </span>{" "}
                      · {formatTimeWithZone(event.presaleAt, viewerTz)}
                    </>
                  ) : (
                    t.events.detail.presaleTba
                  )}
                </p>
                <div className="d-flex flex-wrap gap-2">
                  {/* Кнопка «Билеты» живёт под постером; здесь — только
                      напоминание, и лишь до старта препродажи. Само
                      напоминание — часть подписки (ics + телеграм). */}
                  {isPremium && event.presaleAt && event.presaleAt > new Date() && (
                    <a
                      href={localeHref(`/event/${event.id}/ics?presale=1`, locale)}
                      className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
                    >
                      <CalendarIcon className="icon-inline" />
                      {t.events.detail.addToCalendar}
                    </a>
                  )}
                </div>
              </div>
            )}
            {event.drama && (
              <p className="mb-0">
                <TvIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.events.detail.series}</span>{" "}
                <AppLink href={dramaHref(event.drama)} className="link-body-emphasis">
                  {dramaTitleForLocale(event.drama, locale)}
                </AppLink>
              </p>
            )}
            {castInCard && (
              <div className="mt-3">
                <p
                  className="small text-secondary text-uppercase mb-2"
                  style={{ letterSpacing: "0.08em" }}
                >
                  <UsersIcon className="icon-inline" /> {t.events.detail.lineup}
                </p>
                <CastGrid chips clampRows={2}>
                  {castCards.map((c) => (
                    <EntityMiniCard
                      key={c.id}
                      href={c.href}
                      photoUrl={c.photoUrl}
                      name={c.name}
                      subtitle={c.subtitle ?? undefined}
                    />
                  ))}
                </CastGrid>
                {event.pairings.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {event.pairings.map(({ pairing }) => (
                      <span key={pairing.id} className="event-chip">
                        {pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
      </div>

      {/* Описание — НАД тремя фото (правка владельца 2026-09-05); без
          подложки-surface (прежняя просьба). */}
      {event.description && (
        <div id="description" className="anchor-target mb-4">
          <h2 className="section-heading mb-2">
            <InfoIcon className="icon-inline" /> {t.events.detail.description}
          </h2>
          {/* pre-line: описания приходят с абзацами (и из формы, и из
              импорта по ссылке) — без него переносы схлопывались в
              сплошной текст (жалоба владельца). */}
          <p className="mb-0" style={{ whiteSpace: "pre-line" }}>{event.description}</p>
        </div>
      )}

      {/* Ж9: до трёх фото для покупающих билеты (схема зала, цены,
          бенефиты) одним рядом над «Моими билетами» — без заголовков и
          подписей, клик поднимает фото попапом (правки владельца). */}
      <EventPhotoGallery photos={event.photos.map((p) => ({ id: p.id, url: p.url }))} />

      {/* Э2ф: билеты — сразу под датами, состав — фото-сеткой ниже,
          описание и отзывы в конце. */}
      <TicketSection rows={ticketRows} />

      {/* Без подписки на месте личных блоков (иду / мои билеты / друзья
          / заметки / напоминание о препродаже) — объяснение, что они
          дают. Сама карточка события выше при этом открыта целиком. */}
      {!isPremium && (
        <div className="mb-4">
          <PremiumUpsell
            feature={t.events.detail.paywallFeature}
            intro={t.events.detail.premiumIntro}
          />
        </div>
      )}

      {friendsGoing.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2
            className="section-heading mb-2 d-flex align-items-center gap-2"
          >
            <UsersIcon />{" "}
            {friendsGoing.length === 1
              ? t.events.detail.friendGoing
              : t.events.detail.friendsGoing}
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {friendsGoing.map((f) => (
              <EntityMiniCard
                key={f.id}
                href="/friends"
                photoUrl={f.photoUrl}
                name={f.name || t.events.detail.unnamedFriend}
              />
            ))}
          </div>
        </div>
      )}

      {event.occurrences.some((o) => o.lineup.length > 0) && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-2">
            <CalendarIcon className="icon-inline" /> {t.events.detail.lineupByDay}
          </h2>
          <div className="d-flex flex-column gap-3">
            {event.occurrences
              .filter((o) => o.lineup.length > 0)
              .map((o) => (
                <div key={o.id}>
                  <p className="small text-secondary mb-2 text-capitalize">
                    {formatHumanDate(o.startsAt, locale)}
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

      {/* Заметки — личный блок (свои + друзей/попутчиков), по подписке. */}
      {isPremium && (
        <EventNoteSection eventId={event.id} ownNote={ownNote} friendNotes={friendNotes} />
      )}

      <div id="reviews" className="anchor-target">
        <ReviewsAndComments kind="event" id={event.id} />
      </div>

      {/* Атрибуция — всегда самым нижним блоком страницы (просьба
          владельца). */}
      <SourcesBlock links={[{ url: event.sourceUrl }]} />

      {/* Event-разметка: только публичные поля страницы, и только когда
          у события есть хотя бы одна дата (без startDate разметка
          невалидна). Данные — из того же запроса, что и сама страница. */}
      {eventLd && <JsonLd data={eventLd} />}
    </div>
  );
}
