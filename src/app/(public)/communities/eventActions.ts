"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { combineDateTime, normalizeTimeValue } from "@/lib/dates";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import {
  MEETUP_DESCRIPTION_MAX,
  MEETUP_TITLE_MAX,
  MEETUP_VENUE_MAX,
  canEditMeetup,
  communityRights,
} from "@/lib/meetups";

/**
 * Встречи сообщества (АА25, этап 3).
 *
 * Встреча — это обычный `Event` с проставленным `communityId`: карточка,
 * «я иду», комментарии и карта достаются ей от афиши даром. Отдельный
 * файл экшенов (а не общий `actions.ts`) — потому что это единственное
 * место, где сайт пишет в `Event` из публичной части: всё остальное туда
 * пишет админка.
 *
 * Ошибки — значением, а не броском: в проде Next минифицирует текст
 * исключения из server action, и клиент видит generic error boundary
 * вместо причины (то же правило, что в communities/actions.ts).
 */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

/** Один день встречи из формы. `occurrenceId` пуст у новой строки. */
type MeetupDayInput = { occurrenceId: string; date: string; time: string };

type MeetupInput = {
  title: string;
  /** Дни встречи (правка владельца 2026-09-15): встреча одна, а
   *  идти она может не один вечер. Минимум одна заполненная строка. */
  days: MeetupDayInput[];
  venue: string;
  address: string;
  description: string;
  dramaId: string;
  /** Афиша встречи. Пусто — карточка рисует первую букву названия
   *  (правка владельца 2026-09-08). */
  posterUrl: string;
  /** Онлайн-встреча: адрес не нужен, venue храним пустым, на карточке —
   *  бейдж «Онлайн» (по языку зрителя, поэтому слово в базу не пишем). */
  isOnline: boolean;
};

function readForm(formData: FormData): MeetupInput {
  const str = (key: string) => String(formData.get(key) ?? "").trim();
  // Дни приходят параллельными массивами, как у каталожного события в
  // админке: строка формы = «id даты + дата + время». id нужен, чтобы
  // правка переносила СУЩЕСТВУЮЩУЮ дату, а не заводила вторую: иначе
  // за перенесённой встречей оставался бы призрак старой даты с чужими
  // отметками «иду».
  const ids = formData.getAll("occurrenceId").map(String);
  const dates = formData.getAll("date").map((v) => String(v).trim());
  const times = formData.getAll("time").map((v) => String(v).trim());
  const days: MeetupDayInput[] = dates
    .map((date, i) => ({ occurrenceId: (ids[i] ?? "").trim(), date, time: times[i] ?? "" }))
    .filter((d) => d.date);
  return {
    title: str("title").slice(0, MEETUP_TITLE_MAX),
    days,
    venue: str("venue").slice(0, MEETUP_VENUE_MAX),
    // Отдельного поля адреса в форме больше нет (правка владельца
    // 2026-09-09) — всё живёт в venue. Старые значения форма склеивает
    // при правке, поэтому здесь адрес всегда пуст: колонку не трогаем
    // ради встреч, которые ещё не правили.
    address: "",
    description: str("description").slice(0, MEETUP_DESCRIPTION_MAX),
    dramaId: str("dramaId"),
    posterUrl: str("posterUrl"),
    // Чекбокс: в FormData он есть только включённым. Включён — поле
    // адреса форма не отправляет вовсе, venue выше придёт пустым.
    isOnline: formData.get("isOnline") != null,
  };
}

/** Общая для создания и правки проверка полей + разбор даты. */
async function validate(input: MeetupInput) {
  const { t } = await getT();
  const s = t.communities.meetups.errors;
  if (!input.title) return { ok: false as const, error: s.titleRequired };
  // Онлайн-встрече адрес не нужен; офлайн — обязателен, как и раньше.
  if (!input.isOnline && !input.venue) return { ok: false as const, error: s.venueRequired };
  if (input.days.length === 0 || input.days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d.date))) {
    return { ok: false as const, error: s.dateRequired };
  }
  // Время приводим к «ЧЧ:ММ», а не требуем его в таком виде: половина
  // введённого («12» без минут) — это тоже время, а не повод ронять
  // форму (см. normalizeTimeValue). Пустое поле — законное «время не
  // назначено»; тогда startsAt хранит 00:00 при hasTime=false (иначе
  // полночь неотличима от «время не назначено», см. схему).
  const days = input.days
    .map((d) => {
      const time = normalizeTimeValue(d.time);
      return {
        occurrenceId: d.occurrenceId,
        startsAt: combineDateTime(d.date, time ?? "00:00"),
        hasTime: !!time,
      };
    })
    // Один и тот же момент дважды — две одинаковые карточки в списке.
    .filter((d, i, all) => all.findIndex((x) => +x.startsAt === +d.startsAt) === i)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return { ok: true as const, days };
}

/** Сериал существует? Привязка необязательная, поэтому мусор в поле —
 *  просто «не привязано», а не ошибка формы. */
async function resolveDramaId(dramaId: string): Promise<string | null> {
  if (!dramaId) return null;
  const drama = await prisma.drama.findUnique({ where: { id: dramaId }, select: { id: true } });
  return drama?.id ?? null;
}

/** Зона, в которой вводится время встречи: у сообщества, иначе — у
 *  автора (старые сообщества до бэкфила). */
async function meetupTimezone(communityId: string, fallback: string): Promise<string> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { timezone: true },
  });
  return community?.timezone ?? fallback;
}

/** Что перерисовать после изменения встречи. Открытая встреча попадает
 *  ещё и в блок афиши — его страницу тоже сбрасываем. */
function revalidateMeetup(communityId: string, eventId: string) {
  revalidatePath(`/communities/${communityId}`);
  revalidatePath(`/event/${eventId}`);
  revalidatePath("/events");
}

export async function createMeetup(
  communityId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));

  // Право проверяется НА СЕРВЕРЕ: кнопку рисуем участникам, но форму
  // можно отправить и мимо кнопки.
  const rights = await communityRights(communityId, user.id);
  if (!rights.isMember) {
    return { ok: false, error: t.communities.meetups.errors.notMember };
  }

  const input = readForm(formData);
  const parsed = await validate(input);
  if (!parsed.ok) return parsed;

  const event = await prisma.event.create({
    data: {
      communityId,
      createdById: user.id,
      // Время встречи введено по часам сообщества (правка владельца
      // 2026-09-17): зона — сообщества, а у старых записей без неё —
      // того, кто создаёт.
      timezone: await meetupTimezone(communityId, user.timezone),
      // Только наша же загрузка: адрес уходит прямо в <img src> на
      // странице встречи, и чужой хост тут был бы дырой.
      posterUrl: /^\/uploads\//.test(input.posterUrl) && !input.posterUrl.includes("..")
        ? input.posterUrl
        : null,
      title: input.title,
      // Онлайн-встреча: venue пустой, слово «Онлайн» рисуется бейджем на
      // языке зрителя, а не пишется в базу одним из языков.
      isOnline: input.isOnline,
      venue: input.isOnline ? "" : input.venue,
      address: input.address || null,
      description: input.description || null,
      dramaId: await resolveDramaId(input.dramaId),
      // Слаг встрече НЕ генерируем (расширение prisma.ts заполняет его
      // только когда поле undefined). Каталожный слаг — это название с
      // нумерацией -2/-3 в общем пространстве имён: домашняя встреча
      // заняла бы там место, а номер выдавал бы, сколько ещё событий
      // называются так же. Ссылка на встречу — /event/<id>.
      slug: null,
      occurrences: {
        create: parsed.days.map((d) => ({ startsAt: d.startsAt, hasTime: d.hasTime })),
      },
    },
    select: { id: true },
  });

  revalidateMeetup(communityId, event.id);
  return { ok: true };
}

export async function updateMeetup(eventId: string, formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const s = t.communities.meetups.errors;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      communityId: true,
      createdById: true,
      occurrences: { orderBy: { startsAt: "asc" }, select: { id: true } },
    },
  });
  // Каталожное событие этим путём не правится вовсе: у него нет
  // сообщества, и права взять неоткуда — оно живёт в админке.
  if (!event?.communityId) return { ok: false, error: s.notFound };

  const rights = await communityRights(event.communityId, user.id);
  if (!canEditMeetup(event, user.id, rights)) return { ok: false, error: s.forbidden };

  const input = readForm(formData);
  const parsed = await validate(input);
  if (!parsed.ok) return parsed;

  await prisma.event.update({
    where: { id: eventId },
    data: {
      // Зона пересчитывается при каждой правке: сменили зону сообщества
      // — следующая правка встречи её подхватит.
      timezone: await meetupTimezone(event.communityId, user.timezone),
      // Только наша же загрузка: адрес уходит прямо в <img src> на
      // странице встречи, и чужой хост тут был бы дырой.
      posterUrl: /^\/uploads\//.test(input.posterUrl) && !input.posterUrl.includes("..")
        ? input.posterUrl
        : null,
      title: input.title,
      // Переключили офлайн-встречу в онлайн — прежний адрес затирается
      // намеренно: чей-то домашний адрес не должен тихо лежать у
      // онлайн-встречи и вернуться при обратном переключении.
      isOnline: input.isOnline,
      venue: input.isOnline ? "" : input.venue,
      address: input.address || null,
      description: input.description || null,
      dramaId: await resolveDramaId(input.dramaId),
    },
  });

  // Дни синхронизируем, а не пересоздаём: строка с известным id
  // ПРАВИТСЯ на месте, новая заводится, пропавшая удаляется. Иначе
  // перенос встречи оставлял бы за собой призрак старой даты с чужими
  // отметками «иду» — или, наоборот, стирал их вместе со строкой.
  const known = new Set(event.occurrences.map((o) => o.id));
  const kept = new Set<string>();
  for (const day of parsed.days) {
    if (day.occurrenceId && known.has(day.occurrenceId)) {
      kept.add(day.occurrenceId);
      await prisma.eventOccurrence.update({
        where: { id: day.occurrenceId },
        data: { startsAt: day.startsAt, hasTime: day.hasTime },
      });
      continue;
    }
    const created = await prisma.eventOccurrence.create({
      data: { eventId, startsAt: day.startsAt, hasTime: day.hasTime },
    });
    kept.add(created.id);
  }
  const removed = [...known].filter((id) => !kept.has(id));
  if (removed.length > 0) {
    // Отметки «иду» на убранный день уходят каскадом — это и есть
    // смысл действия: дня больше нет.
    await prisma.eventOccurrence.deleteMany({ where: { id: { in: removed } } });
  }

  revalidateMeetup(event.communityId, eventId);
  return { ok: true };
}

export async function deleteMeetup(eventId: string): Promise<ActionResult> {
  const { t } = await getT();
  const s = t.communities.meetups.errors;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, communityId: true, createdById: true },
  });
  if (!event?.communityId) return { ok: false, error: s.notFound };

  const rights = await communityRights(event.communityId, user.id);
  if (!canEditMeetup(event, user.id, rights)) return { ok: false, error: s.forbidden };

  await prisma.event.delete({ where: { id: eventId } });
  revalidateMeetup(event.communityId, eventId);
  return { ok: true };
}

/**
 * Подсказки к полю «сериал» в форме встречи.
 *
 * Каталог сериалов — пять тысяч строк, целиком в выпадашку он не
 * помещается: общий комбобокс `EntitySelect` ищет на сервере по мере
 * ввода (так же устроен выбор артистов в личных событиях поездки).
 * Отсюда и форма ответа — `{ id, name }`, как ждёт комбобокс.
 */
export async function searchMeetupDramas(
  query: string,
): Promise<{ id: string; name: string }[]> {
  const q = query.trim();
  // Поиск доступен вошедшим: форму встречи и так открывает только
  // участник сообщества.
  const user = await getCurrentUser();
  if (!user || q.length < 2) return [];
  const { locale } = await getT();
  const rows = await prisma.drama.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { titleRu: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, ...DRAMA_TITLE_SELECT },
    orderBy: { title: "asc" },
    take: 8,
  });
  // Название на языке зрителя — как везде в витрине.
  return rows.map((d) => ({ id: d.id, name: dramaTitleForLocale(d, locale) }));
}
