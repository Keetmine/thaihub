import EmptyState from "@/components/EmptyState";
import { dateKey, formatTime } from "@/lib/dates";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import { getT } from "@/lib/i18n";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { canEditMeetup, communityRights } from "@/lib/meetups";
import { prisma } from "@/lib/prisma";
import type { EventWithPerformers } from "@/lib/types";
import { getCurrentUser } from "@/lib/userAuth";
import MeetupCard from "./MeetupCard";
import EventCardLocked from "@/components/EventCardLocked";
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
 *
 * Рисуют встречи ТЕ ЖЕ карточки, что и афишу (`MeetupCard` → общий
 * `EventCard`) — просьба владельца 2026-09-08. Отсюда и форма данных:
 * карточке нужен `EventWithPerformers`, то есть плоская строка
 * «событие + одна дата», какую в афише собирает `flattenOccurrence`.
 */
export default async function MeetupsTab({
  communityId,
  canCreate,
  /** Зритель снаружи: карточки закрыты, как в афише без подписки —
   *  видна только дата (правка владельца 2026-09-09). За встречей стоит
   *  чей-то адрес, и показывать его человеку с улицы нельзя, а знать,
   *  что сообщество собирается, — полезно. */
  locked = false,
}: {
  communityId: string;
  canCreate: boolean;
  locked?: boolean;
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

  // Избранное и «иду» — теми же общими выборками, что кормят афишу:
  // карточка одна, и состояние её кнопок должно считаться одинаково.
  const [goingIds, favoritedIds] = await Promise.all([
    getGoingOccurrenceIds(
      meetups.flatMap((m) => m.occurrences.map((o) => o.id)),
      viewer?.id,
    ),
    getFavoritedEventIds(
      meetups.map((m) => m.id),
      viewer?.id,
    ),
  ]);

  const now = new Date();
  const rows = meetups
    // Дата у встречи ровно одна: её заводит `createMeetup` вместе с
    // событием, а `updateMeetup` правит ту же строку (см.
    // eventActions.ts). Строки без даты не бывает — но карточке афиши
    // нечего было бы показать в блоке дня, поэтому проверка явная.
    .flatMap((m) => {
      const occurrence = m.occurrences[0];
      if (!occurrence) return [];
      return [{ meetup: m, occurrence, startsAt: occurrence.startsAt }];
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
      dateKey: dateKey(occurrence.startsAt),
      timeValue: occurrence.hasTime ? formatTime(occurrence.startsAt) : "",
      drama: m.drama ? { id: m.drama.id, name: dramaTitleForLocale(m.drama, locale) } : null,
    };
    // Ровно та же плоская строка, что везёт афиша (см.
    // flattenOccurrence). Состав пустой — на домашней встрече артистов
    // не бывает; сообщество пустое намеренно: чип с его названием на
    // странице этого же сообщества повторял бы шапку.
    const event: EventWithPerformers = {
      id: m.id,
      occurrenceId: occurrence.id,
      title: m.title,
      slug: m.slug,
      venue: m.venue,
      description: m.description,
      posterUrl: m.posterUrl,
      startsAt: occurrence.startsAt,
      hasTime: occurrence.hasTime,
      endsAt: occurrence.endsAt,
      performers: [],
      community: null,
    };
    // Снаружи — закрытая карточка: та же, что показывает афиша без
    // подписки. Ни названия, ни площадки, ни адреса в разметку не
    // попадает вовсе. Подпись — «Для участников сообщества», а не
    // афишное «По подписке»: гейт здесь членство, участие бесплатное,
    // и звать человека платить было бы враньём (аудит 2026-09, п.2.1).
    if (locked) {
      return <EventCardLocked key={m.id} startsAt={occurrence.startsAt} membersOnly />;
    }
    return (
      <MeetupCard
        key={m.id}
        communityId={communityId}
        event={event}
        values={values}
        isFavorited={favoritedIds.has(m.id)}
        isGoing={goingIds.has(occurrence.id)}
        authorName={m.createdBy?.name ?? null}
        goingCount={m._count.attendees}
        canEdit={canEditMeetup(m, viewer?.id, rights)}
      />
    );
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h2 className="section-heading mb-0">{s.heading}</h2>
        {canCreate && !locked && <MeetupForm communityId={communityId} />}
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
