import AppLink from "@/components/AppLink";
import { prisma } from "@/lib/prisma";
import { catalogOccurrencesWhere } from "@/lib/catalogEvents";
import {
  addMonths,
  dateKey,
  endOfDay,
  getMonthGrid,
  monthLabel,
  weekdayNames,
} from "@/lib/dates";
import { getT } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/userAuth";
import { getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import PremiumUpsell from "@/components/PremiumUpsell";
import EmptyState from "@/components/EmptyState";
import MonthYearJump from "./MonthYearJump";
import { isPremiumActive } from "@/lib/premium";
import LetterAvatar from "@/components/LetterAvatar";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.events.calendar.metaTitle,
    description: t.events.calendar.metaDescription,
    path: "/calendar",
    // Календарь — платная функция: робот и гость видят пейволл, в
    // выдаче такой странице делать нечего. Из sitemap она тоже убрана
    // (sitemapShards.ts), а в robots.txt НЕ закрыта намеренно — иначе
    // краулер не увидел бы сам noindex.
    noIndex: true,
  });
}


// Страница читает язык из заголовка запроса (getT), поэтому кэшировать
// её на сборке нельзя — рендерим на каждый запрос.
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string; mine?: string }>;
}) {
  const { locale, t } = await getT();
  const params = await searchParams;
  const now = new Date();

  // Календарь — платная функция (см. PremiumUpsell / /admin/users).
  const gateUser = await getCurrentUser();
  if (!isPremiumActive(gateUser)) {
    return (
      <div>
        <AppLink href="/" className="eyebrow text-decoration-none">
          {t.events.calendar.backToEvents}
        </AppLink>
        <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
          {t.events.calendar.title}
        </h1>
        <PremiumUpsell feature={t.events.calendar.paywallFeature} />
      </div>
    );
  }
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) - 1 : now.getMonth();
  // Default is "all" (every event) — ?view=mine narrows to events I'm going
  // to, ?view=birthdays switches to the performers-birthday calendar,
  // ?view=series to the episode air dates.
  const showBirthdays = params.view === "birthdays";
  const showSeries = params.view === "series";
  const showAll = !showBirthdays && !showSeries && params.view !== "mine";
  // И11: «Только мои» на вкладке сериалов — расписание лишь тех, у кого
  // у человека стоит ЛЮБОЙ статус просмотра. «view=mine» уже занят
  // событиями, поэтому отдельный параметр.
  const onlyMySeries = showSeries && params.mine === "1" && !!gateUser;

  const gridDays = getMonthGrid(year, month);
  const rangeStart = gridDays[0];
  // Конец последнего дня сетки — через endOfDay (UTC-сутки, как вся
  // работа с датами в проекте): местное setHours на сервере не в UTC
  // отрезало бы вечер последнего дня, да ещё и правило бы дату в самой
  // сетке — gridDays хранит те же объекты.
  const rangeEnd = endOfDay(gridDays[gridDays.length - 1]);

  const currentUser = gateUser;

  // Дни рождения: исполнители с датой рождения, СОСТОЯЩИЕ в агентствах
  // (без фильтра сетку заполняли тысячи случайных актёров из импортов),
  // в месяцах, попадающих в сетку (на краях — до трёх месяцев).
  type BirthdayRow = { id: string; name: string; slug: string | null; photoUrl: string | null; birthDate: Date };
  const birthdaysByDay = new Map<string, BirthdayRow[]>();
  if (showBirthdays) {
    const monthsInGrid = [...new Set(gridDays.map((d) => d.getMonth() + 1))];
    const rows = await prisma.$queryRaw<BirthdayRow[]>`
      SELECT id, name, slug, "photoUrl", "birthDate"
      FROM "Performer"
      WHERE "birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM "birthDate") = ANY(${monthsInGrid})
        AND EXISTS (
          SELECT 1 FROM "PerformerAgency" pa WHERE pa."performerId" = "Performer".id
        )
      ORDER BY name ASC
    `;
    for (const r of rows) {
      const key = `${String(r.birthDate.getMonth() + 1).padStart(2, "0")}-${String(r.birthDate.getDate()).padStart(2, "0")}`;
      if (!birthdaysByDay.has(key)) birthdaysByDay.set(key, []);
      birthdaysByDay.get(key)!.push(r);
    }
  }

  // Расписание серий: строки DramaEpisode с объявленной датой, попавшие
  // в сетку месяца. Без даты (airDate = null) серия в календарь не
  // попадает — её ещё не назначили.
  const episodes = showSeries
    ? await prisma.dramaEpisode.findMany({
        where: {
          airDate: { gte: rangeStart, lte: rangeEnd },
          ...(onlyMySeries
            ? { drama: { watchStatuses: { some: { userId: currentUser!.id } } } }
            : {}),
        },
        select: {
          id: true,
          number: true,
          airDate: true,
          title: true,
          drama: { select: { id: true, ...DRAMA_TITLE_SELECT, slug: true } },
        },
        // Внутри дня — по времени, потом по сериалу; номер серии последним
        // условием, иначе две серии одного сериала в один день встают в
        // случайном порядке (5-я перед 3-й).
        orderBy: [{ airDate: "asc" }, { drama: { title: "asc" } }, { number: "asc" }],
      })
    : [];

  const episodesByDay = new Map<string, typeof episodes>();
  for (const ep of episodes) {
    // airDate в выборке не null (условие where), но тип этого не знает.
    const key = dateKey(ep.airDate!);
    if (!episodesByDay.has(key)) episodesByDay.set(key, []);
    episodesByDay.get(key)!.push(ep);
  }

  const occurrences = showBirthdays || showSeries ? [] : await prisma.eventOccurrence.findMany({
    where: {
      // Календарь — про афишу: встречи сообществ в него не попадают ни
      // в режиме «все», ни в «моих» (см. src/lib/catalogEvents.ts). Своё
      // расписание встреч человек видит на странице сообщества — там
      // рядом и адрес, и кто ещё идёт.
      ...catalogOccurrencesWhere(),
      startsAt: { gte: rangeStart, lte: rangeEnd },
      // «Мои события» — по отметкам на конкретные даты.
      ...(!showAll && currentUser
        ? { attendances: { some: { userId: currentUser.id } } }
        : {}),
    },
    // Слим-выборка исполнителей: сетке месяца нужны только id/name/slug,
    // полные строки Performer (с био) раздували ответ на весь месяц.
    include: {
      event: {
        include: {
          performers: {
            include: { performer: { select: { id: true, name: true, slug: true } } },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });
  const events = occurrences.map(flattenOccurrence);

  const eventsByDay = new Map<string, typeof events>();
  for (const ev of events) {
    const key = dateKey(ev.startsAt);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(ev);
  }

  // In "all events" view, distinguish events the user is going to. In
  // "mine" view every visible event already qualifies, so skip the lookup.
  const goingIds = showAll
    ? await getGoingOccurrenceIds(events.map((ev) => ev.occurrenceId), currentUser?.id)
    : new Set(events.map((ev) => ev.occurrenceId));

  const prev = addMonths(new Date(year, month, 1), -1);
  const next = addMonths(new Date(year, month, 1), 1);
  const todayKey = dateKey(now);

  const viewQuery = showBirthdays
    ? "&view=birthdays"
    : showSeries
      ? `&view=series${onlyMySeries ? "&mine=1" : ""}`
      : showAll
        ? ""
        : "&view=mine";

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <AppLink href="/" className="eyebrow text-decoration-none">
            {t.events.calendar.backToEvents}
          </AppLink>
          <h1 className="display-1-tight text-capitalize mt-3 mb-0" style={{ fontSize: "2.75rem" }}>
            {monthLabel(year, month, locale)}
          </h1>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <MonthYearJump year={year} month={month} viewQuery={viewQuery} />
          <AppLink
            href={`/calendar?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}${viewQuery}`}
            className="btn btn-ghost btn-sm"
          >
            {t.events.calendar.prev}
          </AppLink>
          <AppLink
            href={`/calendar${viewQuery ? `?${viewQuery.slice(1)}` : ""}`}
            className="btn btn-ghost btn-sm"
          >
            {t.events.calendar.today}
          </AppLink>
          <AppLink
            href={`/calendar?year=${next.getFullYear()}&month=${next.getMonth() + 1}${viewQuery}`}
            className="btn btn-ghost btn-sm"
          >
            {t.events.calendar.next}
          </AppLink>
        </div>
      </div>

      {/* Четыре вкладки в русских подписях не влезают в ширину телефона,
          а .mode-toggle — одна строка на всех. Разрешаем перенос прямо
          здесь: на широком экране ряд как был, на узком — вторая строка
          вместо горизонтальной прокрутки всей страницы. */}
      <div className="mb-4">
        <div className="mode-toggle" style={{ flexWrap: "wrap" }}>
          <AppLink
            href={`/calendar?year=${year}&month=${month + 1}`}
            prefetch={false}
            className={`mode-toggle-option ${showAll ? "active" : ""}`}
          >
            {t.events.calendar.viewAll}
          </AppLink>
          <AppLink
            href={`/calendar?year=${year}&month=${month + 1}&view=mine`}
            prefetch={false}
            className={`mode-toggle-option ${!showAll && !showBirthdays && !showSeries ? "active" : ""}`}
          >
            {t.events.calendar.viewMine}
          </AppLink>
          <AppLink
            href={`/calendar?year=${year}&month=${month + 1}&view=birthdays`}
            prefetch={false}
            className={`mode-toggle-option ${showBirthdays ? "active" : ""}`}
          >
            {t.events.calendar.viewBirthdays}
          </AppLink>
          <AppLink
            href={`/calendar?year=${year}&month=${month + 1}&view=series`}
            prefetch={false}
            className={`mode-toggle-option ${showSeries ? "active" : ""}`}
          >
            {t.events.calendar.viewSeries}
          </AppLink>
        </div>
        {/* И11: второй ряд — только на вкладке сериалов и только для
            залогиненных (гостю фильтровать не по чему). */}
        {showSeries && gateUser && (
          <div className="mode-toggle mt-2" style={{ flexWrap: "wrap" }}>
            <AppLink
              href={`/calendar?year=${year}&month=${month + 1}&view=series`}
              prefetch={false}
              className={`mode-toggle-option ${onlyMySeries ? "" : "active"}`}
            >
              {t.events.calendar.seriesFilterAll}
            </AppLink>
            <AppLink
              href={`/calendar?year=${year}&month=${month + 1}&view=series&mine=1`}
              prefetch={false}
              className={`mode-toggle-option ${onlyMySeries ? "active" : ""}`}
            >
              {t.events.calendar.seriesFilterMine}
            </AppLink>
          </div>
        )}
      </div>

      {showSeries && episodes.length === 0 ? (
        <EmptyState
          emoji="📺"
          title={t.events.calendar.seriesEmptyTitle}
          hint={t.events.calendar.seriesEmptyHint}
          cta={{ href: "/dramas", label: t.events.calendar.seriesEmptyCta }}
        />
      ) : (
        <>
          {/* Ряд дней недели виден и на телефоне: без него семь колонок
              на 390px было не к чему привязать глазом (кегль на мобиле
              поджимает globals.css). Гэп — из .calendar-grid, а не
              инлайном: на узких экранах он меньше, и инлайновый ломал
              совпадение колонок с сеткой месяца. */}
          <div className="calendar-grid mb-2">
            {weekdayNames(locale).map((d) => (
              <div key={d} className="calendar-weekday">
                {d}
              </div>
            ))}
          </div>

          <div className="calendar-grid">
            {gridDays.map((day) => {
              const key = dateKey(day);
              const inMonth = day.getMonth() === month;
              const isToday = key === todayKey;

              if (showBirthdays) {
                const bdayKey = `${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                const celebrants = birthdaysByDay.get(bdayKey) ?? [];
                return (
                  <div key={key} className={`calendar-cell ${inMonth ? "" : "outside-month"}`}>
                    <span className={`calendar-day-num ${isToday ? "today" : ""}`}>
                      {day.getDate()}
                    </span>
                    <div className="d-flex flex-column gap-1">
                      {celebrants.slice(0, 3).map((p) => (
                        <AppLink
                          key={p.id}
                          href={performerHref(p)}
                          className="event-chip event-chip-birthday d-inline-flex align-items-center gap-1 text-decoration-none"
                          title={t.events.calendar.birthdayTitle(
                            p.name,
                            day.getFullYear() - p.birthDate.getFullYear(),
                          )}
                        >
                          <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={1.1} />
                          <span className="text-truncate">{p.name}</span>
                        </AppLink>
                      ))}
                      {celebrants.length > 3 && (
                        <span className="small text-secondary d-none d-sm-inline">
                          {t.events.calendar.more(celebrants.length - 3)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              if (showSeries) {
                const dayEpisodes = episodesByDay.get(key) ?? [];
                return (
                  <div key={key} className={`calendar-cell ${inMonth ? "" : "outside-month"}`}>
                    {/* И8: чипы заняты ссылками на сериалы, целиком ячейку
                        ссылкой не сделать (вложенные <a>) — днём-ссылкой
                        служит само число. На телефоне чипы схлопываются в
                        точки, и .calendar-day-link растягивается на всю
                        ячейку (::after в globals.css): тап по дню ведёт на
                        /day/…, где серии выписаны списком. */}
                    <AppLink
                      href={`/day/${key}`}
                      className={`calendar-day-num calendar-day-link text-decoration-none ${isToday ? "today" : ""}`}
                    >
                      {day.getDate()}
                    </AppLink>
                    <div className="d-flex flex-column gap-1">
                      {dayEpisodes.slice(0, 3).map((ep) => (
                        <AppLink
                          key={ep.id}
                          href={dramaHref(ep.drama)}
                          className="event-chip text-decoration-none"
                          title={t.events.calendar.episodeTitle(dramaTitleForLocale(ep.drama, locale), ep.number, ep.title)}
                        >
                          {/* Номер серии первым и жирным: в узкой клетке
                              название обрезается многоточием, и обрезаться
                              должно именно оно. */}
                          <span className="fw-semibold">
                            {t.events.calendar.episodeShort(ep.number)}
                          </span>{" "}
                          {dramaTitleForLocale(ep.drama, locale)}
                        </AppLink>
                      ))}
                      {dayEpisodes.length > 3 && (
                        <span className="small text-secondary d-none d-sm-inline">
                          {t.events.calendar.more(dayEpisodes.length - 3)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              const dayEvents = eventsByDay.get(key) ?? [];
              return (
                <AppLink
                  href={`/day/${key}`}
                  key={key}
                  className={`calendar-cell ${inMonth ? "" : "outside-month"}`}
                >
                  <span className={`calendar-day-num ${isToday ? "today" : ""}`}>
                    {day.getDate()}
                  </span>
                  <div className="d-flex flex-column gap-1">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span
                        key={ev.occurrenceId}
                        className={`event-chip ${goingIds.has(ev.occurrenceId) ? "event-chip-going" : ""}`}
                        title={ev.title}
                      >
                        {ev.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="small text-secondary d-none d-sm-inline">
                        {t.events.calendar.more(dayEvents.length - 3)}
                      </span>
                    )}
                  </div>
                </AppLink>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

