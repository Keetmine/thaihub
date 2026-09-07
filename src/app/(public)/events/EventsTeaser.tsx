import AppLink from "@/components/AppLink";
import EventAgendaRow from "@/components/EventAgendaRow";
import PremiumUpsell from "@/components/PremiumUpsell";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere, catalogOccurrencesWhere } from "@/lib/catalogEvents";
import { startOfDay } from "@/lib/dates";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getFavoritedEventIds } from "@/lib/favorites";
import { getT, type Locale } from "@/lib/i18n";

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

/**
 * Округление вниз для витринного счётчика — как на лендинге: точное
 * число девальвируется само (вчера 137, сегодня 138), округлённое вверх
 * было бы враньём. Мелкие остатки показываем как есть: «0+ событий»
 * хуже честной тройки.
 *
 * Возвращает и подпись, и число, по которому склоняется «событие»: у
 * «100+» склонение считается по сотне, а не по исходной 101 («ещё 100+
 * событие»).
 */
function roundedDown(n: number, locale: Locale): { label: string; base: number } {
  const step = n >= 1000 ? 500 : n >= 100 ? 50 : 10;
  const floored = Math.floor(n / step) * step;
  const tag = locale === "ru" ? "ru-RU" : "en-US";
  return floored >= step
    ? { label: `${floored.toLocaleString(tag)}+`, base: floored }
    : { label: String(n), base: n };
}

export default async function EventsTeaser({
  userId,
}: {
  /** Залогиненный без подписки — чтобы сердечки в тизере показывали
   *  настоящее состояние (избранное подпиской не ограничено). Гость —
   *  null, ему вместо кабинетных подсказок нужен вход. */
  userId: string | null;
}) {
  const { t, locale } = await getT();
  const today = startOfDay(new Date());

  const [occurrences, upcomingEvents] = await Promise.all([
    prisma.eventOccurrence.findMany({
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
    }),
    // «Сколько ещё» — по СОБЫТИЯМ, а не датам: многодневный концерт для
    // читателя одно событие, тремя его считать нечестно.
    prisma.event.count({
      where: { ...catalogEventsWhere(), occurrences: { some: { startsAt: { gte: today } } } },
    }),
  ]);

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

  const rest = Math.max(upcomingEvents - rows.length, 0);
  const restCount = roundedDown(rest, locale);

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

      <PremiumUpsell
        feature={t.events.list.paywallFeature}
        intro={rest > 0 ? t.events.list.teaserIntro(restCount.label, restCount.base) : undefined}
      />

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
