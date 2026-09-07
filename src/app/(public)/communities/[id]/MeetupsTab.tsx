import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import GoingButton from "@/components/GoingButton";
import { CalendarIcon, PinIcon, TvIcon, UsersIcon } from "@/components/icons";
import { dateKey, formatHumanDate, formatTime } from "@/lib/dates";
import { dramaHref } from "@/lib/dramaSlug";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import { getT } from "@/lib/i18n";
import { getGoingOccurrenceIds } from "@/lib/favorites";
import { canEditMeetup, communityRights } from "@/lib/meetups";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import MeetupForm, { type MeetupFormValues } from "./MeetupForm";

/**
 * Вкладка «Встречи» — события сообщества (АА25, этап 3).
 *
 * Встреча — обычный `Event` с `communityId`, поэтому у неё бесплатно
 * есть карточка, «я иду», комментарии и карта. Сюда её приводит ровно
 * одно условие выборки (`communityId`), а из афиши держит подальше
 * `catalogEventsWhere()` — см. src/lib/catalogEvents.ts.
 *
 * Вкладка целиком живёт за `access.canSeeInside` (см. page.tsx): за
 * встречей стоит чей-то домашний адрес, и постороннему его тут не
 * показывают, даже если он знает ссылку на сообщество.
 */
export default async function MeetupsTab({
  communityId,
  canCreate,
}: {
  communityId: string;
  canCreate: boolean;
}) {
  const { locale, t } = await getT();
  const s = t.communities.meetups;
  const viewer = await getCurrentUser();

  const [meetups, rights] = await Promise.all([
    prisma.event.findMany({
      where: { communityId },
      include: {
        occurrences: { orderBy: { startsAt: "asc" } },
        drama: { select: { id: true, slug: true, ...DRAMA_TITLE_SELECT } },
        createdBy: { select: { id: true, name: true } },
        // Сколько народу идёт: у встречи одна дата, поэтому отметок
        // ровно столько же, сколько людей.
        _count: { select: { attendees: true } },
      },
    }),
    communityRights(communityId, viewer?.id),
  ]);

  const goingIds = await getGoingOccurrenceIds(
    meetups.flatMap((m) => m.occurrences.map((o) => o.id)),
    viewer?.id,
  );

  const now = new Date();
  const rows = meetups
    .map((m) => {
      const occurrence = m.occurrences[0];
      return {
        meetup: m,
        occurrence,
        startsAt: occurrence?.startsAt ?? m.createdAt,
      };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const upcoming = rows.filter((r) => r.startsAt >= now);
  // Прошедшие — ниже и свёрнутыми: они не мусорят вкладку, но и не
  // пропадают (по ним видно, что сообщество живое).
  const past = rows.filter((r) => r.startsAt < now).reverse();

  const card = (row: (typeof rows)[number]) => {
    const m = row.meetup;
    const occurrence = row.occurrence;
    const values: MeetupFormValues = {
      id: m.id,
      title: m.title,
      venue: m.venue,
      posterUrl: m.posterUrl,
      address: m.address,
      description: m.description,
      // Дата и время в форму уходят строками, посчитанными на сервере:
      // в браузере зрителя своя зона, и «19:00» уехало бы на несколько
      // часов (то же правило, что в личных событиях поездки).
      dateKey: occurrence ? dateKey(occurrence.startsAt) : "",
      timeValue: occurrence?.hasTime ? formatTime(occurrence.startsAt) : "",
      drama: m.drama ? { id: m.drama.id, name: dramaTitleForLocale(m.drama, locale) } : null,
    };
    return (
      <div key={m.id} className="surface p-3 d-flex flex-column gap-2">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <h3 className="h6 font-display mb-0">
            <AppLink href={`/event/${m.id}`} className="text-reset text-decoration-none">
              {m.title}
            </AppLink>
          </h3>
          <div className="d-flex align-items-center gap-2">
            {occurrence && (
              <GoingButton
                occurrenceId={occurrence.id}
                isGoing={goingIds.has(occurrence.id)}
                isPast={row.startsAt < now}
                variant="icon"
              />
            )}
            {canEditMeetup(m, viewer?.id, rights) && (
              <MeetupForm communityId={communityId} meetup={values} canDelete />
            )}
          </div>
        </div>

        <p className="small text-secondary mb-0 d-flex flex-wrap gap-3">
          <span>
            <CalendarIcon className="icon-inline" />{" "}
            <span className="text-capitalize">{formatHumanDate(row.startsAt, locale)}</span>
            {occurrence?.hasTime && ` · ${formatTime(occurrence.startsAt)}`}
          </span>
          <span>
            <PinIcon className="icon-inline" /> {m.venue}
            {m.address && ` · ${m.address}`}
          </span>
          {m._count.attendees > 0 && (
            <span>
              <UsersIcon className="icon-inline" /> {s.goingCount(m._count.attendees)}
            </span>
          )}
          {m.drama && (
            <span>
              <TvIcon className="icon-inline" />{" "}
              <AppLink href={dramaHref(m.drama)} className="link-body-emphasis">
                {dramaTitleForLocale(m.drama, locale)}
              </AppLink>
            </span>
          )}
        </p>

        {m.description && (
          <p className="small mb-0" style={{ whiteSpace: "pre-line" }}>
            {m.description}
          </p>
        )}

        <p className="small text-secondary mb-0 d-flex flex-wrap align-items-center gap-2">
          {/* Видимость видна всем участникам, а не только автору: по
              открытой встрече люди должны понимать, что адрес уехал в
              общую афишу. */}
          {m.createdBy?.name && <span>{s.author(m.createdBy.name)}</span>}
          <AppLink href={`/event/${m.id}`} className="link-body-emphasis">
            {s.openPage} →
          </AppLink>
        </p>
      </div>
    );
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h2 className="section-heading mb-0">{s.heading}</h2>
        {canCreate && <MeetupForm communityId={communityId} />}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          emoji="📅"
          title={s.emptyTitle}
          hint={canCreate ? s.emptyHint : s.emptyHintReadOnly}
          compact
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="d-flex flex-column gap-2">{upcoming.map(card)}</div>
          )}
          {past.length > 0 && (
            <details>
              {/* Счёт в подписи сворачивания — чтобы не открывать её
                  ради одной строки. */}
              <summary className="small text-secondary">{`${s.past} (${past.length})`}</summary>
              <div className="d-flex flex-column gap-2 mt-2">{past.map(card)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
