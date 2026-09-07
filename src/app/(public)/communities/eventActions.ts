"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { combineDateTime, optionalFormTime } from "@/lib/dates";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import {
  MEETUP_ADDRESS_MAX,
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

type MeetupInput = {
  title: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  description: string;
  dramaId: string;
  /** Афиша встречи. Пусто — карточка рисует первую букву названия
   *  (правка владельца 2026-09-08). */
  posterUrl: string;
};

function readForm(formData: FormData): MeetupInput {
  const str = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    title: str("title").slice(0, MEETUP_TITLE_MAX),
    date: str("date"),
    time: str("time"),
    venue: str("venue").slice(0, MEETUP_VENUE_MAX),
    address: str("address").slice(0, MEETUP_ADDRESS_MAX),
    description: str("description").slice(0, MEETUP_DESCRIPTION_MAX),
    dramaId: str("dramaId"),
    posterUrl: str("posterUrl"),
  };
}

/** Общая для создания и правки проверка полей + разбор даты. */
async function validate(input: MeetupInput) {
  const { t } = await getT();
  const s = t.communities.meetups.errors;
  if (!input.title) return { ok: false as const, error: s.titleRequired };
  if (!input.venue) return { ok: false as const, error: s.venueRequired };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false as const, error: s.dateRequired };
  // Время приводим к «ЧЧ:ММ», а не требуем его в таком виде: половина
  // введённого («12» без минут) — это тоже время, а не повод ронять
  // форму. «00:00» здесь значит «не назначено» — так устроено умолчание
  // поля, см. optionalFormTime.
  const time = optionalFormTime(input.time);
  // Время не указано — startsAt хранит 00:00 при hasTime=false (иначе
  // полночь неотличима от «время не назначено», см. схему).
  return {
    ok: true as const,
    startsAt: combineDateTime(input.date, time ?? "00:00"),
    hasTime: !!time,
  };
}

/** Сериал существует? Привязка необязательная, поэтому мусор в поле —
 *  просто «не привязано», а не ошибка формы. */
async function resolveDramaId(dramaId: string): Promise<string | null> {
  if (!dramaId) return null;
  const drama = await prisma.drama.findUnique({ where: { id: dramaId }, select: { id: true } });
  return drama?.id ?? null;
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
      // Только наша же загрузка: адрес уходит прямо в <img src> на
      // странице встречи, и чужой хост тут был бы дырой.
      posterUrl: /^\/uploads\//.test(input.posterUrl) && !input.posterUrl.includes("..")
        ? input.posterUrl
        : null,
      title: input.title,
      venue: input.venue,
      address: input.address || null,
      description: input.description || null,
      dramaId: await resolveDramaId(input.dramaId),
      // Слаг встрече НЕ генерируем (расширение prisma.ts заполняет его
      // только когда поле undefined). Каталожный слаг — это название с
      // нумерацией -2/-3 в общем пространстве имён: домашняя встреча
      // заняла бы там место, а номер выдавал бы, сколько ещё событий
      // называются так же. Ссылка на встречу — /event/<id>.
      slug: null,
      occurrences: { create: { startsAt: parsed.startsAt, hasTime: parsed.hasTime } },
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
      occurrences: { orderBy: { startsAt: "asc" }, select: { id: true }, take: 1 },
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
      // Только наша же загрузка: адрес уходит прямо в <img src> на
      // странице встречи, и чужой хост тут был бы дырой.
      posterUrl: /^\/uploads\//.test(input.posterUrl) && !input.posterUrl.includes("..")
        ? input.posterUrl
        : null,
      title: input.title,
      venue: input.venue,
      address: input.address || null,
      description: input.description || null,
      dramaId: await resolveDramaId(input.dramaId),
    },
  });

  // Дата у встречи одна — правим ту же строку, а не заводим вторую:
  // иначе перенос встречи оставлял бы за собой призрак старой даты с
  // чужими отметками «иду».
  const occurrenceId = event.occurrences[0]?.id;
  if (occurrenceId) {
    await prisma.eventOccurrence.update({
      where: { id: occurrenceId },
      data: { startsAt: parsed.startsAt, hasTime: parsed.hasTime },
    });
  } else {
    await prisma.eventOccurrence.create({
      data: { eventId, startsAt: parsed.startsAt, hasTime: parsed.hasTime },
    });
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
