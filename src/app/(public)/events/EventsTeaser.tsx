import AppLink from "@/components/AppLink";
import EventAgendaRow from "@/components/EventAgendaRow";
import PremiumUpsell from "@/components/PremiumUpsell";
import { prisma } from "@/lib/prisma";
import { catalogOccurrencesWhere } from "@/lib/catalogEvents";
import { startOfDay } from "@/lib/dates";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getFavoritedEventIds } from "@/lib/favorites";
import { getT } from "@/lib/i18n";

// Тизер афиши для тех, у кого нет подписки (и для гостя без аккаунта).
//
// Раньше на этом месте стояла стена: гостю /events отдавал лендинг —
// дубль главной под другим адресом, — а залогиненному без подписки сразу
// пейволл. Со стороны это читалось как «тут всё платно», хотя лендинг
// обещает обратное. Теперь ближайшие события показаны ЧЕСТНО и целиком:
// название, дата, площадка, постер, состав и живая ссылка на страницу
// события (она тоже публичная). Заперта остаётся остальная лента —
// поиск по афише, фильтры, календарь и всё личное вокруг событий.

/** Сколько событий открыто без подписки. Два — «ближайшее и следующее»:
 *  одно выглядит случайностью, три уже заменяют ленту. */
const TEASER_SIZE = 2;

/** Сколько дат зачерпнуть, чтобы после схлопывания многодневных набрать
 *  TEASER_SIZE РАЗНЫХ событий (трёхдневный фестиваль — три подряд идущие
 *  даты одного и того же события). */
const OCCURRENCE_POOL = 12;

export default async function EventsTeaser({
  userId,
}: {
  /** Залогиненный без подписки — чтобы сердечки в тизере показывали
   *  настоящее состояние (избранное подпиской не ограничено). Гость —
   *  null, ему вместо кабинетных подсказок нужен вход. */
  userId: string | null;
}) {
  const { t } = await getT();
  const today = startOfDay(new Date());

  const occurrences = await prisma.eventOccurrence.findMany({
      // Тизер афиши — каталог (см. src/lib/catalogEvents.ts): встречу
      // сообщества сюда нельзя ни строкой, ни числом.
      where: { ...catalogOccurrencesWhere(), startsAt: { gte: today } },
      orderBy: { startsAt: "asc" },
      take: OCCURRENCE_POOL,
      include: {
        event: {
          include: {
            performers: {
              include: { performer: { select: { id: true, name: true, slug: true } } },
            },
          },
        },
      },
  });

  // Многодневное событие показываем один раз — ближайшей датой.
  const seen = new Set<string>();
  const rows = occurrences
    .filter((occ) => !seen.has(occ.eventId) && seen.add(occ.eventId))
    .slice(0, TEASER_SIZE)
    .map(flattenOccurrence);

  const favoritedIds = await getFavoritedEventIds(
    rows.map((r) => r.id),
    userId ?? undefined,
  );

  return (
    <div className="d-flex flex-column gap-4">
      {rows.length > 0 && (
        <div>
          <h2 className="section-heading mb-3">{t.events.list.teaserHeading}</h2>
          <div className="d-flex flex-column gap-3">
            {rows.map((row) => (
              <EventAgendaRow
                key={row.occurrenceId}
                event={row}
                isFavorited={favoritedIds.has(row.id)}
                showDate
              />
            ))}
          </div>
        </div>
      )}

      {/* Без строки-мостика «ещё N событий впереди» (правка владельца
          2026-09-09): под заголовком и так стоит перечень, что даёт
          подписка, а витринное число devальвируется само. */}
      <PremiumUpsell feature={t.events.list.paywallFeature} />

      {/* Гостю сначала нужен аккаунт, а не оплата: подписка привязывается
          к нему. Залогиненному эта пара кнопок не нужна. */}
      {!userId && (
        <div className="d-flex flex-wrap justify-content-center gap-2">
          <AppLink href="/signup" className="btn btn-primary">
            {t.landing.ctaSignup}
          </AppLink>
          <AppLink href="/login" className="btn btn-ghost">
            {t.nav.signIn}
          </AppLink>
        </div>
      )}
    </div>
  );
}
