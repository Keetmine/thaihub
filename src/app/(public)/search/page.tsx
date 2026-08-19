import Link from "next/link";
import { prisma } from "@/lib/prisma";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import EntityMiniCard from "@/components/EntityMiniCard";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { flattenOccurrence, groupByEvent } from "@/lib/eventOccurrences";
import { getCurrentUser } from "@/lib/userAuth";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { isPremiumActive } from "@/lib/premium";
import { agencyHref, locationHref } from "@/lib/slugHelpers";
import { dramaTitleWhere, performerNameWhere } from "@/lib/searchWhere";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Поиск",
  description:
    "Поиск по актёрам, сериалам, новеллам, событиям и локациям MyBLHub.",
  path: "/search",
});


export const dynamic = "force-dynamic";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  // Нативный details — секции сворачиваются без строчки JS.
  return (
    <details open className="mb-4 search-section">
      <summary className="section-heading mb-2 d-inline-flex align-items-center gap-2">
        <span className="search-section-chevron" aria-hidden>▸</span>
        {title} ({count})
      </summary>
      {children}
    </details>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const [matchedEvents, performers, dramas, agencies, locations, novels, wikiArticles] = query
    ? await Promise.all([
        prisma.event.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { venue: { contains: query, mode: "insensitive" } },
              { performers: { some: { performer: { name: { contains: query, mode: "insensitive" } } } } },
            ],
          },
          include: {
            performers: { include: { performer: true } },
            occurrences: { orderBy: { startsAt: "asc" } },
          },
        }),
        prisma.performer.findMany({
          where: {
            OR: [
              performerNameWhere(query),
            ],
          },
          orderBy: { name: "asc" },
          take: 24,
        }),
        prisma.drama.findMany({
          where: dramaTitleWhere(query),
          orderBy: { title: "asc" },
          take: 24,
        }),
        prisma.agency.findMany({
          where: { name: { contains: query, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: 24,
        }),
        prisma.location.findMany({
          where: {
            createdByUserId: null, name: { contains: query, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: 24,
        }),
        prisma.novel.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { author: { contains: query, mode: "insensitive" } },
            ],
          },
          orderBy: { title: "asc" },
          take: 24,
        }),
        prisma.wikiArticle.findMany({
          where: { published: true, title: { contains: query, mode: "insensitive" } },
          select: { id: true, slug: true, title: true },
          orderBy: { title: "asc" },
          take: 12,
        }),
      ])
    : [[], [], [], [], [], [], []];

  // Результаты поиска — про события, а не про их даты: многодневный
  // фестиваль одной строкой с «+N дат».
  const eventRows = groupByEvent(
    matchedEvents
      .flatMap((ev) => ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  );
  const events = eventRows.map((e) => e.row);

  const currentUser = await getCurrentUser();
  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
    getFriendIds(currentUser?.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(occIds, friendIds);

  const totalCount =
    events.length + performers.length + dramas.length + agencies.length + locations.length +
    novels.length + wikiArticles.length;

  return (
    <div>
      <span className="eyebrow">Поиск</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2.25rem" }}>
        {q || "Поиск"}
      </h1>
      {q && (
        <p className="text-secondary mb-5">
          Вы искали «{q}» — вот что нашлось по каталогу:
        </p>
      )}

      {!query ? (
        <p className="text-secondary">
          Введите название события, исполнителя, сериала, локации или агентства в поиске сверху.
        </p>
      ) : totalCount === 0 ? (
        <div>
          <p className="text-secondary">Ничего не найдено по запросу «{q}».</p>
          <SearchFeedbackCta q={q} />
        </div>
      ) : (
        <>
          <Section title="События" count={events.length}>
            <div className="d-flex flex-column gap-3">
              {eventRows.map(({ row, extraDates }) => (
                isPremiumActive(currentUser) ? (

                  <EventAgendaRow
                  key={row.id}
                  event={row}
                  isFavorited={favoritedIds.has(row.id)}
                  isGoing={goingIds.has(row.occurrenceId)}
                  friendsGoing={friendsGoingByEvent.get(row.occurrenceId) ?? []}
                  showDate
                  extraDates={extraDates}
                />

                ) : (

                  <EventCardLocked key={row.id} startsAt={row.startsAt} />

                )
              ))}
            </div>
          </Section>

          <Section title="Исполнители" count={performers.length}>
            <div className="d-flex flex-wrap gap-2">
              {performers.map((p) => (
                <EntityMiniCard
                  key={p.id}
                  href={performerHref(p)}
                  photoUrl={p.photoUrl}
                  name={p.name}
                />
              ))}
            </div>
          </Section>

          <Section title="Сериалы" count={dramas.length}>
            {/* Постер-карточки, как ряд сериалов на странице актёра. */}
            <div className="d-flex flex-wrap gap-3">
              {dramas.map((d) => (
                <Link key={d.id} href={dramaHref(d)} className="text-decoration-none" style={{ width: "8.5rem" }}>
                  <div
                    className="surface"
                    style={{ width: "100%", aspectRatio: "2 / 3", borderRadius: "0.5rem", overflow: "hidden" }}
                  >
                    {d.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                    loading="lazy"
                    decoding="async" src={d.posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div
                        className="d-flex align-items-center justify-content-center h-100 fw-semibold"
                        style={{ color: "var(--bs-secondary-color)", opacity: 0.7 }}
                      >
                        {d.title.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="d-block small text-white mt-1 text-truncate">{d.title}</span>
                  {d.year && <span className="d-block small text-secondary">{d.year}</span>}
                </Link>
              ))}
            </div>
          </Section>

          <Section title="Локации" count={locations.length}>
            <div className="d-flex flex-wrap gap-2">
              {locations.map((l) => (
                <EntityMiniCard
                  key={l.id}
                  href={locationHref(l)}
                  photoUrl={l.photoUrl}
                  name={l.name}
                  round={false}
                />
              ))}
            </div>
          </Section>

          <Section title="Агентства" count={agencies.length}>
            <div className="d-flex flex-wrap gap-2">
              {agencies.map((a) => (
                <EntityMiniCard
                  key={a.id}
                  href={agencyHref(a)}
                  photoUrl={a.logoUrl}
                  name={a.name}
                />
              ))}
            </div>
          </Section>
          <SearchFeedbackCta q={q} />
        </>
      )}
    </div>
  );
}

/** «Не нашли — напишите нам»: ведёт на форму обращений с контекстом
 *  поискового запроса (см. /help#feedback). */
function SearchFeedbackCta({ q }: { q: string }) {
  return (
    <div className="surface p-4 mt-4" style={{ maxWidth: "34rem" }}>
      <p className="small text-secondary mb-2">
        Не нашли сериал или актёра, которого искали? Напишите нам — добавим.
      </p>
      <Link
        href={`/help?fb=${encodeURIComponent(q)}#feedback`}
        className="btn btn-ghost btn-sm"
      >
        Написать нам
      </Link>
    </div>
  );
}
