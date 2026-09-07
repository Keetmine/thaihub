import AppLink from "@/components/AppLink";
import { CalendarIcon, PinIcon, UsersIcon } from "@/components/icons";
import { openMeetupsWhere } from "@/lib/catalogEvents";
import { formatHumanDate, formatTime, startOfDay } from "@/lib/dates";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { communityHref } from "@/lib/slugHelpers";

/** Сколько открытых встреч показывать. Блок — приглашение зайти в
 *  сообщества, а не вторая лента: длинный список тут перетянул бы на
 *  себя внимание с самой афиши. */
const LIMIT = 4;

/**
 * Открытые встречи сообществ в афише (АА25, этап 3).
 *
 * ОТДЕЛЬНЫЙ блок, а не строки в общей ленте, — решение осознанное:
 *
 * - домашняя встреча и концерт в Impact Arena не равны по смыслу, и
 *   одинаковая карточка в одной ленте врала бы читателю: он пришёл за
 *   афишей, а получил чей-то план на вечер;
 * - чтобы пустить встречи в ленту, пришлось бы ослабить условие внутри
 *   общего `fetchEventListPage` — ровно там, где одна неаккуратная
 *   правка выпускает наружу ВСЕ встречи, включая закрытые. Здесь же
 *   стоит явное `communityOnly: false`, и по умолчанию блок не
 *   показывает ничего.
 *
 * Отсюда и подпись: «их зовут такие же зрители, а не организаторы
 * концертов» — чтобы встречу не приняли за событие афиши.
 */
export default async function OpenMeetups() {
  const { locale, t } = await getT();
  const s = t.communities.meetups;
  const today = startOfDay(new Date());

  const occurrences = await prisma.eventOccurrence.findMany({
    where: { startsAt: { gte: today }, event: openMeetupsWhere() },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          venue: true,
          community: { select: { id: true, slug: true, title: true } },
        },
      },
    },
    orderBy: { startsAt: "asc" },
    take: LIMIT,
  });

  if (occurrences.length === 0) return null;

  return (
    <div className="surface p-3 mb-4">
      <h2 className="section-heading mb-1">
        <UsersIcon className="icon-inline" /> {s.inEventsHeading}
      </h2>
      <p className="small text-secondary mb-3">{s.inEventsHint}</p>
      <div className="d-flex flex-column gap-2">
        {occurrences.map((occ) => (
          <div key={occ.id} className="d-flex flex-wrap align-items-baseline gap-2">
            <AppLink href={`/event/${occ.event.id}`} className="fw-medium text-white text-decoration-none">
              {occ.event.title}
            </AppLink>
            <span className="small text-secondary">
              <CalendarIcon className="icon-inline" />{" "}
              <span className="text-capitalize">{formatHumanDate(occ.startsAt, locale)}</span>
              {occ.hasTime && ` · ${formatTime(occ.startsAt)}`}
            </span>
            <span className="small text-secondary">
              <PinIcon className="icon-inline" /> {occ.event.venue}
            </span>
            {occ.event.community && (
              <AppLink
                href={communityHref(occ.event.community)}
                className="small link-body-emphasis"
              >
                {occ.event.community.title}
              </AppLink>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
