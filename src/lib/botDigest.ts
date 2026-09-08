import { prisma } from "@/lib/prisma";
import { catalogOccurrencesWhere } from "@/lib/catalogEvents";
import { endOfDay, formatShortDate, startOfDay } from "@/lib/dates";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import { dramaHref, eventHref, performerHref } from "@/lib/slugHelpers";
import { getDict, isLocale, localeHref, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

// Подборка для команд бота /today и /week (аудит 2026-09, раздел 7):
// серии моих сериалов, мои события и дни рождения избранных на день или
// неделю вперёд. Выборки — те же, что на сайте, чтобы бот и страницы не
// разъезжались в ответах:
// - серии «моих» — как вкладка сериалов календаря с фильтром «только
//   мои» (/calendar?view=series&mine=1): любой статус просмотра;
// - события — как телеграм-напоминания (sendUpcomingEventReminders):
//   «иду» на дату или событие в избранном, только афиша
//   (catalogOccurrencesWhere — встречи сообществ боту не место);
// - дни рождения — как поздравления З3: только избранные артисты,
//   месяц/день в UTC (даты-без-времени лежат полуночью UTC, приведение
//   к поясу сервера сдвигало бы день).
//
// Ответ строится на языке привязанного аккаунта (User.locale), как у
// notifyUser, и со ссылками на версию сайта этого языка.

const APP_URL = process.env.APP_URL ?? "https://myblhub.com";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Сколько строк показываем в каждой секции: у активного человека за
 *  неделю набегают десятки серий, а телеграм-сообщение — не простыня. */
const SECTION_LIMIT = 12;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Название-ссылка для строки подборки: адрес — на языке получателя. */
function link(href: string, label: string, locale: Locale): string {
  return `<a href="${APP_URL}${localeHref(href, locale)}">${escapeHtml(label)}</a>`;
}

/**
 * Текст подборки «что у меня сегодня / на неделе» — готовый HTML для
 * sendTelegramMessage. days: 1 — /today, 7 — /week. Пустые секции
 * пропускаются; совсем пустая подборка отвечает подсказкой, откуда ей
 * взяться (иначе бот молчал бы, как сломанный).
 */
export async function buildDigestMessage(
  user: { id: string; locale: string | null },
  days: 1 | 7,
): Promise<string> {
  const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
  const t = getDict(locale);
  const d = t.notifications.digest;

  const now = new Date();
  // Границы — UTC-сутки, как хранятся все даты проекта (см. lib/dates):
  // расписание серий и время событий лежат тайским настенным временем.
  const rangeStart = startOfDay(now);
  const rangeEnd = endOfDay(new Date(now.getTime() + (days - 1) * DAY_MS));

  const [episodes, occurrences, favorites] = await Promise.all([
    prisma.dramaEpisode.findMany({
      where: {
        airDate: { gte: rangeStart, lte: rangeEnd },
        // «Мои» — любой статус просмотра, как в календаре сериалов с
        // фильтром «только мои».
        drama: { watchStatuses: { some: { userId: user.id } } },
      },
      select: {
        number: true,
        airDate: true,
        drama: { select: { id: true, slug: true, ...DRAMA_TITLE_SELECT } },
      },
      orderBy: [{ airDate: "asc" }, { number: "asc" }],
      take: SECTION_LIMIT + 1,
    }),
    prisma.eventOccurrence.findMany({
      where: {
        ...catalogOccurrencesWhere(),
        startsAt: { gte: rangeStart, lte: rangeEnd },
        OR: [
          { attendances: { some: { userId: user.id } } },
          { event: { favoritedBy: { some: { userId: user.id } } } },
        ],
      },
      select: {
        startsAt: true,
        event: { select: { id: true, slug: true, title: true, venue: true } },
      },
      orderBy: { startsAt: "asc" },
      take: SECTION_LIMIT + 1,
    }),
    // Избранных у человека горстка — месяц/день отбираем в памяти, как
    // дни рождения друзей на главной.
    prisma.favoritePerformer.findMany({
      where: { userId: user.id, performer: { birthDate: { not: null } } },
      select: {
        performer: {
          select: { id: true, name: true, slug: true, birthDate: true },
        },
      },
    }),
  ]);

  // Дни рождения: каким дням диапазона соответствует месяц/день. Ключ —
  // «MM-DD» в UTC, значение — дата этого года для подписи в строке.
  const daysInRange = new Map<string, Date>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(rangeStart.getTime() + i * DAY_MS);
    const key = `${day.getUTCMonth() + 1}-${day.getUTCDate()}`;
    daysInRange.set(key, day);
  }
  const birthdays = favorites
    .map((f) => f.performer)
    .map((p) => ({
      performer: p,
      day: daysInRange.get(`${p.birthDate!.getUTCMonth() + 1}-${p.birthDate!.getUTCDate()}`),
    }))
    .filter((b): b is typeof b & { day: Date } => b.day !== undefined)
    .sort((a, b) => +a.day - +b.day || a.performer.name.localeCompare(b.performer.name));

  // Дата в строке нужна только у недельной подборки: у «сегодня» она
  // одна на всё сообщение.
  const datePrefix = (date: Date) => (days === 1 ? "" : `${formatShortDate(date, locale)} — `);
  const section = (header: string, lines: string[]): string | null => {
    if (lines.length === 0) return null;
    const shown = lines.slice(0, SECTION_LIMIT);
    const more = lines.length > shown.length ? `\n…` : "";
    return `<b>${escapeHtml(header)}</b>\n${shown.map((l) => `• ${l}`).join("\n")}${more}`;
  };

  const sections = [
    section(
      d.episodesHeader,
      episodes.map((ep) =>
        `${datePrefix(ep.airDate!)}${d.episodeLine(
          link(dramaHref(ep.drama), dramaTitleForLocale(ep.drama, locale), locale),
          ep.number,
        )}`,
      ),
    ),
    section(
      d.eventsHeader,
      occurrences.map(
        (occ) =>
          `${datePrefix(occ.startsAt)}${link(eventHref(occ.event), occ.event.title, locale)}, ${escapeHtml(occ.event.venue)}`,
      ),
    ),
    section(
      d.birthdaysHeader,
      birthdays.map(
        (b) => `${datePrefix(b.day)}🎂 ${link(performerHref(b.performer), b.performer.name, locale)}`,
      ),
    ),
  ].filter((s): s is string => s !== null);

  const title = `📅 <b>${escapeHtml(days === 1 ? d.todayTitle : d.weekTitle)}</b>`;
  if (sections.length === 0) return `${title}\n\n${escapeHtml(d.empty)}`;
  return `${title}\n\n${sections.join("\n\n")}`;
}
