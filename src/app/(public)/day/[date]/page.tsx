import AppLink from "@/components/AppLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { catalogOccurrencesWhere } from "@/lib/catalogEvents";
import {
  addDays,
  dateKey,
  endOfDay,
  formatCombinedDateList,
  formatHumanDate,
  parseDateKey,
  startOfDay,
} from "@/lib/dates";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import EventCard from "@/components/EventCard";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { getCurrentUser } from "@/lib/userAuth";
import PremiumUpsell from "@/components/PremiumUpsell";
import { isPremiumActive } from "@/lib/premium";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { locale, t } = await getT();
  const { date } = await params;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseDateKey(date) : null;
  if (!day || Number.isNaN(day.getTime()))
    return pageMetadata({
      title: t.events.day.metaTitleUnknown,
      description: t.events.day.metaDescriptionUnknown,
      noIndex: true,
    });
  // formatCombinedDateList для одной даты — «22 августа 2026»: без дня
  // недели (как в formatHumanDate) заголовок читается естественнее.
  const human = formatCombinedDateList([day], locale);
  return pageMetadata({
    title: t.events.day.metaTitle(human),
    description: t.events.day.metaDescription(human),
    path: `/day/${date}`,
    // День — часть платного календаря, гость видит пейволл. Раньше
    // страница была закрыта только в robots.txt, и Google держал её как
    // «indexed, though blocked»: запрет обхода не даёт увидеть noindex.
    // Теперь наоборот — обход открыт, а из индекса выводит эта мета.
    noIndex: true,
  });
}

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { locale, t } = await getT();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const day = parseDateKey(date);
  if (Number.isNaN(day.getTime())) notFound();

  // Дневной вид — часть календаря, т.е. платной функции.
  const currentUser = await getCurrentUser();
  if (!isPremiumActive(currentUser)) {
    return (
      <div>
        <AppLink href="/calendar" className="eyebrow text-decoration-none">
          {t.events.day.backToCalendar}
        </AppLink>
        <h1 className="display-1-tight text-capitalize mt-3 mb-5" style={{ fontSize: "2.25rem" }}>
          {formatHumanDate(day, locale)}
        </h1>
        <PremiumUpsell feature={t.events.calendar.paywallFeature} />
      </div>
    );
  }

  // И8: день — это не только афиша. Сюда ведут и ячейки вкладки
  // «Сериалы» в календаре, а серий на странице не было вовсе — клик по
  // числу уводил в пустоту.
  const [occurrences, episodes] = await Promise.all([
    prisma.eventOccurrence.findMany({
      // Страница дня — срез афиши, встречам сообществ тут не место
      // (см. src/lib/catalogEvents.ts).
      where: {
        ...catalogOccurrencesWhere(),
        startsAt: { gte: startOfDay(day), lte: endOfDay(day) },
      },
      include: { event: { include: { performers: { include: { performer: { select: { id: true, name: true, slug: true } } } } } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.dramaEpisode.findMany({
      where: { airDate: { gte: startOfDay(day), lte: endOfDay(day) } },
      select: {
        id: true,
        number: true,
        title: true,
        drama: { select: { id: true, title: true, titleRu: true, slug: true, posterUrl: true } },
      },
      orderBy: [{ drama: { title: "asc" } }, { number: "asc" }],
    }),
  ]);
  const events = occurrences.map(flattenOccurrence);

  const prevKey = dateKey(addDays(day, -1));
  const nextKey = dateKey(addDays(day, 1));
  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
    getFriendIds(currentUser?.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(occIds, friendIds);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-5">
        <div>
          <AppLink href="/calendar" className="eyebrow text-decoration-none">
            {t.events.day.backToCalendar}
          </AppLink>
          <h1 className="display-1-tight text-capitalize mt-3 mb-0" style={{ fontSize: "2.25rem" }}>
            {formatHumanDate(day, locale)}
          </h1>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <AppLink href={`/day/${prevKey}`} className="btn btn-ghost btn-sm">
            {t.events.day.prevDay}
          </AppLink>
          <AppLink href={`/day/${nextKey}`} className="btn btn-ghost btn-sm">
            {t.events.day.nextDay}
          </AppLink>
        </div>
      </div>

      {events.length === 0 && episodes.length === 0 ? (
        <p className="text-secondary">{t.events.day.empty}</p>
      ) : (
        <div className="d-flex flex-column gap-4">
          {events.length > 0 && (
            <section>
              {/* Заголовки секций — только когда на дне есть и то и то:
                  одному списку шапка ничего не добавляет. */}
              {episodes.length > 0 && (
                <h2 className="section-heading mb-2">{t.events.day.eventsHeading}</h2>
              )}
              <div className="d-flex flex-column gap-3">
                {events.map((ev) => (
                  <EventCard
                    key={ev.occurrenceId}
                    event={ev}
                    isFavorited={favoritedIds.has(ev.id)}
                    isGoing={goingIds.has(ev.occurrenceId)}
                    friendsGoing={friendsGoingByEvent.get(ev.occurrenceId) ?? []}
                  />
                ))}
              </div>
            </section>
          )}
          {episodes.length > 0 && (
            <section>
              {events.length > 0 && (
                <h2 className="section-heading mb-2">{t.events.day.seriesHeading}</h2>
              )}
              <div className="d-flex flex-column gap-2">
                {episodes.map((ep) => (
                  <AppLink
                    key={ep.id}
                    href={dramaHref(ep.drama)}
                    className="surface d-flex align-items-center gap-3 p-3 text-decoration-none text-reset"
                  >
                    <span className="fw-semibold flex-shrink-0">
                      {t.events.calendar.episodeShort(ep.number)}
                    </span>
                    <span className="text-truncate">
                      {dramaTitleForLocale(ep.drama, locale)}
                      {ep.title && <span className="text-secondary"> · {ep.title}</span>}
                    </span>
                  </AppLink>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
