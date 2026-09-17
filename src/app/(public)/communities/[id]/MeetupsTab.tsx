import EmptyState from "@/components/EmptyState";
import { dateKey, formatTime } from "@/lib/dates";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import { getT } from "@/lib/i18n";
import {
  getFavoritedEventIds,
  getGoingOccurrenceIds,
  getMaybeOccurrenceIds,
} from "@/lib/favorites";
import { canEditMeetup, communityRights } from "@/lib/meetups";
import { prisma } from "@/lib/prisma";
import type { EventWithPerformers } from "@/lib/types";
import { getCurrentUser } from "@/lib/userAuth";
import MeetupCard from "./MeetupCard";
import EventCardLocked from "@/components/EventCardLocked";
import MeetupForm, { type MeetupFormValues } from "./MeetupForm";
import { DEFAULT_TIMEZONE, TIMEZONES } from "@/lib/timezones";

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

  const [meetups, rights, communityZone] = await Promise.all([
    prisma.event.findMany({
      where: { communityId },
      include: {
        drama: { select: { id: true, slug: true, ...DRAMA_TITLE_SELECT } },
        createdBy: { select: { id: true, name: true } },
        // Сколько народу идёт — по КАЖДОМУ дню отдельно: у встречи с
        // двумя вечерами один человек мог отметиться на оба, и общее
        // число отметок сказало бы «идут двое» про одного (правка
        // владельца 2026-09-15, когда у встреч появились дни).
        occurrences: {
          orderBy: { startsAt: "asc" },
          include: { _count: { select: { attendances: true } } },
        },
      },
    }),
    communityRights(communityId, viewer?.id),
    // Зона встреч — подсказка «По часам: Минск» под полем времени в
    // форме (правка владельца 2026-09-17).
    prisma.community.findUnique({ where: { id: communityId }, select: { timezone: true } }),
  ]);
  const zoneValue = communityZone?.timezone ?? DEFAULT_TIMEZONE;
  const timezoneLabel = TIMEZONES.find((z) => z.value === zoneValue)?.label[locale] ?? zoneValue;

  // Избранное и «иду» — теми же общими выборками, что кормят афишу:
  // карточка одна, и состояние её кнопок должно считаться одинаково.
  const [goingIds, maybeIds, favoritedIds] = await Promise.all([
    getGoingOccurrenceIds(
      meetups.flatMap((m) => m.occurrences.map((o) => o.id)),
      viewer?.id,
    ),
    getMaybeOccurrenceIds(
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
    // Дней у встречи может быть несколько (правка владельца
    // 2026-09-15) — в списке она встаёт в каждый свой день, как
    // каталожное событие со своими датами. Встречи без дат не бывает,
    // но карточке афиши нечего было бы показать в блоке дня, поэтому
    // проверка явная.
    .flatMap((m) => m.occurrences.map((occurrence) => ({ meetup: m, occurrence, startsAt: occurrence.startsAt })))
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
      // Дни в форму уходят строками, посчитанными на сервере: в
      // браузере зрителя своя зона, и «19:00» уехало бы на несколько
      // часов. В форме — ВСЕ дни встречи, а не тот, в котором стоит эта
      // карточка: правка идёт по записи целиком.
      dates: m.occurrences.map((o) => ({
        id: o.id,
        dateKey: dateKey(o.startsAt),
        timeValue: o.hasTime ? formatTime(o.startsAt) : "",
      })),
      drama: m.drama ? { id: m.drama.id, name: dramaTitleForLocale(m.drama, locale) } : null,
      isOnline: m.isOnline,
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
      // Онлайн-встреча: карточка рисует бейдж «Онлайн» на месте
      // площадки (venue у неё пустой).
      isOnline: m.isOnline,
      description: m.description,
      posterUrl: m.posterUrl,
      startsAt: occurrence.startsAt,
      hasTime: occurrence.hasTime,
      endsAt: occurrence.endsAt,
      timezone: m.timezone,
      performers: [],
      community: null,
    };
    // Снаружи — закрытая карточка: та же, что показывает афиша без
    // подписки. Ни названия, ни площадки, ни адреса в разметку не
    // попадает вовсе. Подпись — «Для участников сообщества», а не
    // афишное «По подписке»: гейт здесь членство, участие бесплатное,
    // и звать человека платить было бы враньём (аудит 2026-09, п.2.1).
    if (locked) {
      return <EventCardLocked key={occurrence.id} startsAt={occurrence.startsAt} membersOnly />;
    }
    return (
      <MeetupCard
        key={occurrence.id}
        communityId={communityId}
        event={event}
        values={values}
        isFavorited={favoritedIds.has(m.id)}
        isGoing={goingIds.has(occurrence.id)}
        isMaybe={maybeIds.has(occurrence.id)}
        authorName={m.createdBy?.name ?? null}
        goingCount={occurrence._count.attendances}
        canEdit={canEditMeetup(m, viewer?.id, rights)}
        timezoneLabel={timezoneLabel}
      />
    );
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h2 className="section-heading mb-0">{s.heading}</h2>
        {canCreate && !locked && <MeetupForm communityId={communityId} timezoneLabel={timezoneLabel} />}
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
