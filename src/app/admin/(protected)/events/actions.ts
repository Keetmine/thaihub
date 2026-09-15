"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import type { Prisma } from "@/generated/prisma/client";
import { combineDateTime, normalizeTimeValue } from "@/lib/dates";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit, diffRecords } from "@/lib/audit";
import { notifyFavoritersAboutEventPerformers } from "@/lib/telegramNotifications";

function getPerformerIds(formData: FormData): string[] {
  return formData.getAll("performerIds").map(String).filter(Boolean);
}

function getPairingIds(formData: FormData): string[] {
  return formData.getAll("pairingIds").map(String).filter(Boolean);
}

/** Список строк из одного поля через запятую — та же манера, что у
 *  жанров/тегов сериала и новеллы. */
function getCsv(formData: FormData, field: string): string[] {
  return String(formData.get(field) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getPresaleAt(formData: FormData): Date | null {
  const presaleEnabled = String(formData.get("presaleEnabled") ?? "") === "on";
  if (!presaleEnabled) return null;

  const presaleDate = String(formData.get("presaleDate") ?? "");
  const presaleTime = String(formData.get("presaleTime") ?? "");
  // Время приводим к «ЧЧ:ММ» (см. normalizeTimeValue); пустое — значит
  // часа не назвали, а препродажи без часа не бывает.
  const time = normalizeTimeValue(presaleTime);
  if (!presaleDate || !time) return null;

  return combineDateTime(presaleDate, time);
}

/** Фото для покупающих билеты (Ж9) из JSON-поля формы
 *  (EventPhotosField): до трёх, sort — порядок в списке. Мусорный JSON
 *  молча пропускается — фото необязательны. */
function getEventPhotoInputs(formData: FormData): { url: string; sort: number }[] {
  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("photos") ?? "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (typeof row?.url === "string" ? row.url.trim() : ""))
    .filter(Boolean)
    .slice(0, 3)
    .map((url, i) => ({ url, sort: i }));
}

function getPresaleUrl(formData: FormData): string | null {
  const presaleEnabled = String(formData.get("presaleEnabled") ?? "") === "on";
  if (!presaleEnabled) return null;

  const presaleUrl = String(formData.get("presaleUrl") ?? "").trim();
  return presaleUrl || null;
}

/** Кто выступает в этот день: исполнитель, а при нём время и сцена
 *  строками, как на афише фестиваля («16:00-16:45», «Monster Stage»). */
type LineupInput = {
  performerId: string;
  timeText: string | null;
  stage: string | null;
};

/** One row of the repeatable date/time picker — see EventForm.tsx. */
type OccurrenceInput = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  lineup: LineupInput[];
};

/**
 * Лайнап дня приходит JSON-ом (`[{id, timeText, stage}]`): время и сцена
 * — свободный текст, csv-разделителем их не разнести. Строку из старых
 * вкладок и голый csv из тестов понимаем по-прежнему.
 */
function parseLineup(raw: string): LineupInput[] {
  const value = raw.trim();
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const rows: unknown = JSON.parse(value);
      if (!Array.isArray(rows)) return [];
      return rows
        .map((row) => {
          const r = (row ?? {}) as { id?: unknown; timeText?: unknown; stage?: unknown };
          const performerId = String(r.id ?? "").trim();
          const timeText = String(r.timeText ?? "").trim();
          const stage = String(r.stage ?? "").trim();
          return { performerId, timeText: timeText || null, stage: stage || null };
        })
        .filter((r) => r.performerId);
    } catch {
      return [];
    }
  }
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((performerId) => ({ performerId, timeText: null, stage: null }));
}

function getOccurrenceInputs(formData: FormData): OccurrenceInput[] {
  const ids = formData.getAll("occurrenceId").map(String);
  const dates = formData.getAll("occurrenceDate").map(String);
  const startTimes = formData.getAll("occurrenceStartTime").map(String);
  const endTimes = formData.getAll("occurrenceEndTime").map(String);
  const lineups = formData.getAll("occurrenceLineup").map(String);

  return dates
    .map((date, i) => ({
      id: ids[i] ?? "",
      date,
      startTime: startTimes[i] ?? "",
      endTime: endTimes[i] ?? "",
      lineup: parseLineup(lineups[i] ?? ""),
    }))
    // время теперь необязательно — достаточно даты
    .filter((row) => row.date);
}

/**
 * Асинхронный поиск для комбобокса выбора событий (PerformerForm):
 * список событий постоянно растёт — грузим варианты по мере ввода.
 */
export async function searchEventOptions(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  await requireCatalogEditor();
  const q = query.trim();
  if (q.length < 2) return [];

  const events = await prisma.event.findMany({
    // Комбобокс админки выбирает каталожное событие: встречи сообществ
    // админка не ведёт (см. src/lib/catalogEvents.ts).
    where: { ...catalogEventsWhere(), title: { contains: q, mode: "insensitive" } },
    select: { id: true, title: true, posterUrl: true },
    orderBy: { title: "asc" },
    take: 20,
  });
  return events.map((e) => ({ id: e.id, name: e.title, photoUrl: e.posterUrl }));
}

export async function createEvent(formData: FormData) {
  await requireCatalogEditor();
  const title = String(formData.get("title") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const organizer = String(formData.get("organizer") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const mapsUrl = String(formData.get("mapsUrl") ?? "").trim();
  const tags = getCsv(formData, "tags");
  const description = String(formData.get("description") ?? "").trim();
  const occurrences = getOccurrenceInputs(formData);
  const performerIds = getPerformerIds(formData);
  const pairingIds = getPairingIds(formData);
  const dramaId = String(formData.get("dramaId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const ticketPrice = String(formData.get("ticketPrice") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const presaleAt = getPresaleAt(formData);
  const presaleUrl = getPresaleUrl(formData);

  if (!title || !venue || occurrences.length === 0) {
    throw new Error("Заполните обязательные поля: название, место, дата");
  }

  const created = await prisma.event.create({
    data: {
      title,
      venue,
      organizer: organizer || null,
      address: address || null,
      mapsUrl: mapsUrl || null,
      tags,
      description: description || null,
      dramaId: dramaId || null,
      locationId: locationId || null,
      ticketPrice: ticketPrice || null,
      posterUrl: posterUrl || null,
      presaleAt,
      presaleUrl,
      occurrences: {
        create: occurrences.map((o) => ({
          startsAt: combineDateTime(o.date, normalizeTimeValue(o.startTime) ?? "00:00"),
          endsAt: normalizeTimeValue(o.endTime)
            ? combineDateTime(o.date, normalizeTimeValue(o.endTime)!)
            : null,
          hasTime: Boolean(normalizeTimeValue(o.startTime)),
          lineup: {
            create: o.lineup.map((l) => ({
              performerId: l.performerId,
              timeText: l.timeText,
              stage: l.stage,
            })),
          },
        })),
      },
      performers: {
        create: performerIds.map((performerId) => ({ performerId })),
      },
      pairings: {
        create: pairingIds.map((pairingId) => ({ pairingId })),
      },
      photos: { create: getEventPhotoInputs(formData) },
    },
  });

  await logAudit({
    action: "CREATE",
    entityType: "Event",
    entityId: created.id,
    entityLabel: created.title,
  });

  // «У избранного артиста новое событие» — избравшим кого-то из
  // состава. В состав идут и артисты ЛАЙНАПОВ ПО ДНЯМ: на фестивале
  // общий состав часто пуст, а люди стоят по дням, и уведомление не
  // уходило вовсе (правка владельца 2026-09-15). Ошибку рассылка ловит
  // сама, создание не роняет.
  await notifyFavoritersAboutEventPerformers(created.id, [
    ...new Set([...performerIds, ...occurrences.flatMap((o) => o.lineup.map((l) => l.performerId))]),
  ]);

  revalidatePath("/");
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

/** Creates/updates/deletes an Event's EventOccurrence rows to match the
 *  submitted list — existing rows (identified by occurrenceId) are
 *  updated in place, new rows (blank occurrenceId) are created, and any
 *  occurrence not present in the submission anymore is deleted. */
async function syncOccurrences(
  tx: Prisma.TransactionClient,
  eventId: string,
  occurrences: OccurrenceInput[],
) {
  const existing = await tx.eventOccurrence.findMany({
    where: { eventId },
    select: { id: true },
  });
  const keptIds = new Set<string>();

  for (const o of occurrences) {
    const startsAt = combineDateTime(o.date, normalizeTimeValue(o.startTime) ?? "00:00");
    const endTime = normalizeTimeValue(o.endTime);
    const endsAt = endTime ? combineDateTime(o.date, endTime) : null;
    const hasTime = Boolean(normalizeTimeValue(o.startTime));
    if (o.id) {
      await tx.eventOccurrence.update({
        where: { id: o.id },
        data: {
          startsAt,
          endsAt,
          hasTime,
          lineup: {
            deleteMany: {},
            create: o.lineup.map((l) => ({
              performerId: l.performerId,
              timeText: l.timeText,
              stage: l.stage,
            })),
          },
        },
      });
      keptIds.add(o.id);
    } else {
      const created = await tx.eventOccurrence.create({
        data: {
          eventId,
          startsAt,
          endsAt,
          hasTime,
          lineup: {
            create: o.lineup.map((l) => ({
              performerId: l.performerId,
              timeText: l.timeText,
              stage: l.stage,
            })),
          },
        },
      });
      keptIds.add(created.id);
    }
  }

  const toDelete = existing.map((e) => e.id).filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    await tx.eventOccurrence.deleteMany({ where: { id: { in: toDelete } } });
  }
}

export async function updateEvent(id: string, formData: FormData) {
  await requireCatalogEditor();
  const title = String(formData.get("title") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const organizer = String(formData.get("organizer") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const mapsUrl = String(formData.get("mapsUrl") ?? "").trim();
  const tags = getCsv(formData, "tags");
  const description = String(formData.get("description") ?? "").trim();
  const occurrences = getOccurrenceInputs(formData);
  const performerIds = getPerformerIds(formData);
  const pairingIds = getPairingIds(formData);
  const dramaId = String(formData.get("dramaId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const ticketPrice = String(formData.get("ticketPrice") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const presaleAt = getPresaleAt(formData);
  const presaleUrl = getPresaleUrl(formData);

  if (!title || !venue || occurrences.length === 0) {
    throw new Error("Заполните обязательные поля: название, место, дата");
  }

  const before = await prisma.event.findUnique({ where: { id } });
  // Состав ДО правки: форма пересобирает связи целиком, а «новым
  // событием» для избравших считается только ВПЕРВЫЕ привязанный артист
  // — про остальных уведомление ушло ещё при создании.
  const beforePerformerIds = new Set([
    ...(
      await prisma.eventPerformer.findMany({
        where: { eventId: id },
        select: { performerId: true },
      })
    ).map((p) => p.performerId),
    // И лайнапы дней: артист, добавленный в состав дня, — такая же
    // новость, как добавленный в общий (правка владельца 2026-09-15).
    ...(
      await prisma.occurrenceLineup.findMany({
        where: { occurrence: { eventId: id } },
        select: { performerId: true },
      })
    ).map((l) => l.performerId),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.eventPerformer.deleteMany({ where: { eventId: id } });
    await tx.eventPairing.deleteMany({ where: { eventId: id } });
    // Фото пересобираются целиком из присланного (Ж9) — как связи выше.
    await tx.eventPhoto.deleteMany({ where: { eventId: id } });
    await syncOccurrences(tx, id, occurrences);
    await tx.event.update({
      where: { id },
      data: {
        title,
        venue,
        organizer: organizer || null,
        address: address || null,
        mapsUrl: mapsUrl || null,
        tags,
        description: description || null,
        dramaId: dramaId || null,
        locationId: locationId || null,
        ticketPrice: ticketPrice || null,
        posterUrl: posterUrl || null,
        presaleAt,
        presaleUrl,
        performers: {
          create: performerIds.map((performerId) => ({ performerId })),
        },
        pairings: {
          create: pairingIds.map((pairingId) => ({ pairingId })),
        },
        photos: { create: getEventPhotoInputs(formData) },
      },
    });
  });

  if (before) {
    await logAudit({
      action: "UPDATE",
      entityType: "Event",
      entityId: id,
      entityLabel: title,
      changes: diffRecords(
        before,
        {
          title, venue, organizer, address, mapsUrl, tags, description,
          dramaId, locationId, ticketPrice, posterUrl, presaleAt, presaleUrl,
        },
        [
          "title", "venue", "organizer", "address", "mapsUrl", "tags", "description",
          "dramaId", "locationId", "ticketPrice", "posterUrl", "presaleAt", "presaleUrl",
        ],
      ),
    });
  }

  // Избравшим — про впервые привязанных артистов, и из общего состава,
  // и из лайнапов дней; анти-дубль (userId, eventId) страхует от
  // повторов при любом раскладе.
  await notifyFavoritersAboutEventPerformers(
    id,
    [
      ...new Set([
        ...performerIds,
        ...occurrences.flatMap((o) => o.lineup.map((l) => l.performerId)),
      ]),
    ].filter((pid) => !beforePerformerIds.has(pid)),
  );

  revalidatePath("/");
  revalidatePath("/admin/events");
  // Правка не закрывает страницу (просьба владельца): назад на
  // свою же форму с отметкой «Сохранено».
  redirect(`/admin/events/${id}/edit?saved=1`);
}

/**
 * Minimal event creation from a performer form's events picker — only the
 * fields createEvent already treats as required. The calling performer form
 * links the performer to this event itself (on its own submit), since at
 * create time the performer may not have an id yet.
 */
export async function createEventMinimal(
  title: string,
  venue: string,
  date: string,
  startTime: string,
): Promise<{ id: string; title: string }> {
  await requireCatalogEditor();
  const t = title.trim();
  const v = venue.trim();
  if (!t || !v || !date || !startTime) {
    throw new Error("Заполните название, место, дату и время начала");
  }

  const event = await prisma.event.create({
    data: {
      title: t,
      venue: v,
      occurrences: { create: { startsAt: combineDateTime(date, startTime) } },
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/events");
  return { id: event.id, title: event.title };
}

export async function deleteEvent(id: string) {
  await requireCatalogEditor();
  const existing = await prisma.event.findUnique({ where: { id }, select: { title: true } });
  await prisma.event.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "Event",
    entityId: id,
    entityLabel: existing?.title ?? id,
  });
  revalidatePath("/");
  revalidatePath("/admin/events");
  redirect("/admin/events");
}
