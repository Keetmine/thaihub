import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";

/**
 * «Видела вживую» — кого человек видел на каких событиях.
 *
 * ОДНО правило на три места: свод статистики профиля, глазик на странице
 * артиста и глазики в составе на странице события. До 2026-09-15 глазик
 * был одной строкой на артиста без события, и снять Jeff Satur с одного
 * фестиваля значило снять его со всех шести концертов (правка
 * владельца). Теперь факт «видела» живёт у СОБЫТИЯ.
 *
 * Как считается (чистая часть — `resolveSeen`, без базы):
 *
 * 1. Берутся ПРОШЕДШИЕ афишные даты с отметкой «иду». У даты свой состав
 *    (лайнап дня фестиваля) или, если своего нет, общий состав события.
 * 2. Умолчание зависит от вида даты:
 *    - обычный концерт (общий состав) — увидены ВСЕ: сходили, значит
 *      видели, лишнего снимаете;
 *    - день фестиваля со своим лайнапом — НИКТО: три сцены и тридцать
 *      групп, отметить троих проще, чем снять двадцать семь.
 * 3. Группа в составе раскрывается на участников, но только на тех, кто
 *    ещё и АКТЁР — у кого есть сериалы или фильмы (решение владельца:
 *    «группа из 15 человек, не актёры, мне они не нужны в списках»).
 *    Участник следует за группой: увидели группу — увидели и его.
 * 4. Поверх всего — решения человека по этому событию
 *    (`EventSeenPerformer`): «видела» или «не видела» конкретного
 *    артиста именно здесь. Решение по участнику сильнее решения по
 *    группе.
 *
 * Ключ — событие, не день: сходили на оба дня фестиваля, где артист
 * играл дважды, — всё равно «видели один раз».
 *
 * Отдельно и без правил выше: ЛИЧНЫЕ события поездок (артист на встрече,
 * которой нет в афише) и отметка «видели вне афиши» (`PerformerSeen`) —
 * их свод прибавляет сам, см. userStats.ts.
 */

/** Карточка артиста в списках «кого видели». */
export type SeenCard = { id: string; name: string; slug: string | null; photoUrl: string | null };

/** Артист в составе даты/события — с группой, раскрытой до актёров. */
export type SeenPerformer = SeenCard & {
  type: string;
  /** У группы — участники; `isActor` — есть сериалы или фильмы. */
  bandMembers?: { performer: SeenCard & { isActor: boolean } }[];
};

/** Отметка «иду» с тем, что нужно правилу. Типы структурные: у страниц
 *  свои (более широкие) select'ы, важно лишь, чтобы эти поля были. */
export type SeenAttendanceRow = {
  eventId: string;
  occurrence: { startsAt: Date; lineup: { performer: SeenPerformer }[] };
  event: { performers: { performer: SeenPerformer }[] };
};

export type SeenOverride = { eventId: string; performerId: string; seen: boolean };

/** Итог по одному артисту на одном событии. */
export type SeenEntry = {
  card: SeenCard;
  seen: boolean;
  /** true — так решило умолчание, false — человек. Страница события по
   *  этому показывает, где стоит своя отметка. */
  byDefault: boolean;
};

/**
 * Кто увиден на каждом событии: событие → артист → итог. В карте ВСЕ
 * кандидаты, и увиденные, и нет — страница события рисует глазик у
 * каждого, свод берёт только `seen`.
 */
export function resolveSeen(
  rows: SeenAttendanceRow[],
  overrides: SeenOverride[],
  now: Date,
): Map<string, Map<string, SeenEntry>> {
  const decided = new Map<string, boolean>();
  for (const o of overrides) decided.set(`${o.eventId}#${o.performerId}`, o.seen);

  // Первый проход: прямые участники состава с умолчанием. Один артист
  // на двух датах одного события — умолчания складываются через ИЛИ:
  // дата без лайнапа даёт «видели», и лайнап другого дня это не
  // отменяет.
  type Draft = { card: SeenCard; def: boolean; bands: string[] };
  const drafts = new Map<string, Map<string, Draft>>();
  const bandsByEvent = new Map<string, Map<string, SeenPerformer>>();

  for (const row of rows) {
    if (row.occurrence.startsAt >= now) continue;
    const dayHasLineup = row.occurrence.lineup.length > 0;
    const cast = dayHasLineup ? row.occurrence.lineup : row.event.performers;
    const def = !dayHasLineup;

    let byPerformer = drafts.get(row.eventId);
    if (!byPerformer) {
      byPerformer = new Map();
      drafts.set(row.eventId, byPerformer);
    }
    let bands = bandsByEvent.get(row.eventId);
    if (!bands) {
      bands = new Map();
      bandsByEvent.set(row.eventId, bands);
    }

    for (const { performer } of cast) {
      const cur = byPerformer.get(performer.id);
      if (cur) cur.def = cur.def || def;
      else byPerformer.set(performer.id, { card: toCard(performer), def, bands: [] });
      if (performer.type === "BAND") bands.set(performer.id, performer);
    }
  }

  // Второй проход: участники групп. Сначала решаем саму группу (умолчание
  // или решение человека), потом раздаём участникам-актёрам: у них своё
  // умолчание — «как у группы», а решение человека по участнику сильнее.
  const result = new Map<string, Map<string, SeenEntry>>();
  for (const [eventId, byPerformer] of drafts) {
    const bands = bandsByEvent.get(eventId) ?? new Map<string, SeenPerformer>();
    const bandSeen = new Map<string, boolean>();
    for (const [bandId, band] of bands) {
      const draft = byPerformer.get(bandId)!;
      bandSeen.set(bandId, decided.get(`${eventId}#${bandId}`) ?? draft.def);
      for (const { performer: member } of band.bandMembers ?? []) {
        if (!member.isActor) continue;
        const cur = byPerformer.get(member.id);
        if (cur) cur.bands.push(bandId);
        else byPerformer.set(member.id, { card: member, def: false, bands: [bandId] });
      }
    }

    const entries = new Map<string, SeenEntry>();
    for (const [performerId, draft] of byPerformer) {
      const own = decided.get(`${eventId}#${performerId}`);
      const viaBand = draft.bands.some((bandId) => bandSeen.get(bandId) === true);
      entries.set(performerId, {
        card: draft.card,
        seen: own ?? (draft.def || viaBand),
        byDefault: own === undefined,
      });
    }
    result.set(eventId, entries);
  }
  return result;
}

function toCard(p: SeenCard): SeenCard {
  return { id: p.id, name: p.name, slug: p.slug, photoUrl: p.photoUrl };
}

// ---------- База ----------

/**
 * «Актёр» — есть хотя бы один сериал или фильм. Шоу (Type: TV Program /
 * TV Show на MDL) не в счёт — решение владельца 2026-09-15: ведущий шоу
 * из группы в «увиденных актёрах» не нужен. Тип null — старые импорты
 * без типа, это сериалы (TMDB/blscene), считаем.
 */
export const ACTOR_DRAMA_WHERE: Prisma.PerformerDramaWhereInput = {
  drama: { OR: [{ type: null }, { type: { notIn: ["TV Program", "TV Show"] } }] },
};

/** Артист в составе — ровно то, что нужно `resolveSeen`, включая
 *  участников группы с признаком «актёр». Один select на все выборки
 *  отметок: свод, профиль, страница события. */
export const SEEN_PERFORMER_SELECT = {
  id: true,
  name: true,
  slug: true,
  photoUrl: true,
  type: true,
  bandMembers: {
    select: {
      performer: {
        select: {
          id: true,
          name: true,
          slug: true,
          photoUrl: true,
          _count: { select: { dramas: { where: ACTOR_DRAMA_WHERE } } },
        },
      },
    },
  },
} satisfies Prisma.PerformerSelect;

/** Артист прямо из Prisma — с `_count`, ещё не `isActor`. */
export type SeenPerformerRaw = Prisma.PerformerGetPayload<{ select: typeof SEEN_PERFORMER_SELECT }>;

/**
 * Отметка «иду» в сыром виде. Страницы выбирают её своим (более широким)
 * select'ом и передают как есть — маппинг делает `toSeenRows`, а не
 * каждый вызывающий.
 */
export type SeenAttendanceRowRaw = {
  eventId: string;
  occurrence: { startsAt: Date; lineup: { performer: SeenPerformerRaw }[] };
  event: { performers: { performer: SeenPerformerRaw }[] };
};

/** Сырые строки → форма правила. */
export function toSeenRows(rows: SeenAttendanceRowRaw[]): SeenAttendanceRow[] {
  return rows.map((r) => ({
    eventId: r.eventId,
    occurrence: {
      startsAt: r.occurrence.startsAt,
      lineup: r.occurrence.lineup.map((l) => ({ performer: toSeenPerformer(l.performer) })),
    },
    event: {
      performers: r.event.performers.map((ep) => ({ performer: toSeenPerformer(ep.performer) })),
    },
  }));
}

/**
 * Все артисты, которых человек видел, — id'шниками. Три источника, как в
 * своде: события афиши по правилу, личные события поездок и отметки
 * «вне афиши». Нужен там, где карточки и счётчики не важны, — выгрузка
 * своих данных.
 */
export async function loadSeenPerformerIds(userId: string): Promise<Set<string>> {
  const now = new Date();
  const [rows, overrides, outside, personal] = await Promise.all([
    loadSeenAttendances(userId),
    loadSeenOverrides(userId),
    prisma.performerSeen.findMany({ where: { userId }, select: { performerId: true } }),
    // По дням события (2026-09-18): артист дня засчитан, когда прошёл
    // именно его день.
    prisma.tripPersonalEventDayPerformer.findMany({
      where: {
        day: { startsAt: { lt: now }, personalEvent: { attendances: { some: { userId } } } },
      },
      select: { performerId: true },
    }),
  ]);
  const ids = new Set<string>();
  for (const entries of resolveSeen(rows, overrides, now).values()) {
    for (const entry of entries.values()) if (entry.seen) ids.add(entry.card.id);
  }
  for (const r of outside) ids.add(r.performerId);
  for (const r of personal) ids.add(r.performerId);
  return ids;
}

/** Строка Prisma → структура правила: `_count` превращается в `isActor`. */
export function toSeenPerformer(p: SeenPerformerRaw): SeenPerformer {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    photoUrl: p.photoUrl,
    type: p.type,
    bandMembers: p.bandMembers.map(({ performer: m }) => ({
      performer: {
        id: m.id,
        name: m.name,
        slug: m.slug,
        photoUrl: m.photoUrl,
        isActor: m._count.dramas > 0,
      },
    })),
  };
}

/** Отметки «иду» человека по афишным событиям — в форме правила. */
export async function loadSeenAttendances(userId: string): Promise<SeenAttendanceRow[]> {
  const rows = await prisma.eventAttendance.findMany({
    where: { userId, event: catalogEventsWhere() },
    select: {
      eventId: true,
      occurrence: {
        select: {
          startsAt: true,
          lineup: { select: { performer: { select: SEEN_PERFORMER_SELECT } } },
        },
      },
      event: {
        select: { performers: { select: { performer: { select: SEEN_PERFORMER_SELECT } } } },
      },
    },
  });
  return rows.map((r) => ({
    eventId: r.eventId,
    occurrence: {
      startsAt: r.occurrence.startsAt,
      lineup: r.occurrence.lineup.map((l) => ({ performer: toSeenPerformer(l.performer) })),
    },
    event: {
      performers: r.event.performers.map((ep) => ({ performer: toSeenPerformer(ep.performer) })),
    },
  }));
}

export async function loadSeenOverrides(
  userId: string,
  eventIds?: string[],
): Promise<SeenOverride[]> {
  if (eventIds && eventIds.length === 0) return [];
  return prisma.eventSeenPerformer.findMany({
    where: { userId, ...(eventIds ? { eventId: { in: eventIds } } : {}) },
    select: { eventId: true, performerId: true, seen: true },
  });
}

/**
 * Страница события: кого зритель видел ЗДЕСЬ. Только по своим отметкам
 * «иду» на ПРОШЕДШИЕ даты этого события — до события отмечать нечего,
 * и карта тогда пустая (глазиков страница не рисует).
 *
 * Отдельным запросом, а не из большого запроса страницы: правило требует
 * состав группы с признаком «актёр», и тащить его в общий select ради
 * одного залогиненного зрителя дороже, чем сходить точечно. Отметок у
 * человека на одно событие — единицы.
 */
export async function eventSeenState(
  userId: string,
  eventId: string,
): Promise<Map<string, SeenEntry>> {
  const now = new Date();
  const [rows, overrides] = await Promise.all([
    prisma.eventAttendance.findMany({
      where: { userId, eventId, event: catalogEventsWhere() },
      select: {
        eventId: true,
        occurrence: {
          select: {
            startsAt: true,
            lineup: { select: { performer: { select: SEEN_PERFORMER_SELECT } } },
          },
        },
        event: {
          select: { performers: { select: { performer: { select: SEEN_PERFORMER_SELECT } } } },
        },
      },
    }),
    loadSeenOverrides(userId, [eventId]),
  ]);
  return resolveSeen(toSeenRows(rows), overrides, now).get(eventId) ?? new Map();
}

/** Одно событие из списка «где видели» на странице артиста. */
export type PerformerSeenEvent = {
  id: string;
  slug: string | null;
  title: string;
  /** Последняя посещённая дата — ISO, список уезжает в клиентский компонент. */
  date: string;
  seen: boolean;
};

/** Личное событие поездки, где артист был в составе дня и человек
 *  отметился «я там буду» (правка владельца 2026-09-18: раньше был только
 *  счётчик — «иногда не вспомнишь, где там что было»). */
export type PerformerSeenPersonal = {
  id: string;
  title: string;
  /** Последний прошедший день с этим артистом — ISO. */
  date: string;
  trip: { id: string; slug: string | null; title: string };
};
/**
 * Страница артиста: на каких посещённых событиях он был в составе и где
 * человек его видел. Считает по ВСЕМ отметкам человека — их единицы, а
 * правило про группы требует состав целиком.
 */
export async function performerSeenEvents(
  userId: string,
  performerId: string,
): Promise<{ events: PerformerSeenEvent[]; outside: boolean; personalEvents: PerformerSeenPersonal[] }> {
  const now = new Date();
  const [rows, overrides, outside, personal] = await Promise.all([
    prisma.eventAttendance.findMany({
      where: { userId, event: catalogEventsWhere() },
      select: {
        eventId: true,
        occurrence: {
          select: {
            startsAt: true,
            lineup: { select: { performer: { select: SEEN_PERFORMER_SELECT } } },
          },
        },
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
            performers: { select: { performer: { select: SEEN_PERFORMER_SELECT } } },
          },
        },
      },
    }),
    loadSeenOverrides(userId),
    prisma.performerSeen.findUnique({
      where: { userId_performerId: { userId, performerId } },
      select: { id: true },
    }),
    // Личные события поездок — списком, по ДНЯМ: артист дня засчитан,
    // когда прошёл его день и человек отметился на событии.
    prisma.tripPersonalEventDayPerformer.findMany({
      where: {
        performerId,
        day: { startsAt: { lt: now }, personalEvent: { attendances: { some: { userId } } } },
      },
      select: {
        day: {
          select: {
            startsAt: true,
            personalEvent: {
              select: { id: true, title: true, trip: { select: { id: true, slug: true, title: true } } },
            },
          },
        },
      },
    }),
  ]);

  const resolved = resolveSeen(toSeenRows(rows), overrides, now);

  const latestByEvent = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = latestByEvent.get(r.eventId);
    if (!cur || r.occurrence.startsAt > cur.occurrence.startsAt) latestByEvent.set(r.eventId, r);
  }

  const events: PerformerSeenEvent[] = [];
  for (const [eventId, entries] of resolved) {
    const entry = entries.get(performerId);
    if (!entry) continue;
    const row = latestByEvent.get(eventId)!;
    events.push({
      id: row.event.id,
      slug: row.event.slug,
      title: row.event.title,
      date: row.occurrence.startsAt.toISOString(),
      seen: entry.seen,
    });
  }
  events.sort((a, b) => b.date.localeCompare(a.date));
  // Одно событие — одна строка, даже если артист был в составе трёх
  // его дней; дата — последнего прошедшего дня.
  const personalByEvent = new Map<string, PerformerSeenPersonal>();
  for (const row of personal) {
    const ev = row.day.personalEvent;
    const date = row.day.startsAt.toISOString();
    const cur = personalByEvent.get(ev.id);
    if (!cur || date > cur.date) personalByEvent.set(ev.id, { id: ev.id, title: ev.title, date, trip: ev.trip });
  }
  const personalEvents = [...personalByEvent.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { events, outside: !!outside, personalEvents };
}
