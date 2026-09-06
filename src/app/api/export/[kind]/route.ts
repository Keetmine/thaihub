import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { csvFileName, formatDate, formatDateTime, toCsv } from "@/lib/csv";
import { getDict } from "@/lib/i18n";

/**
 * Выгрузка СВОИХ данных таблицей (АА16): по файлу на раздел — сериалы,
 * события, поездки, записи поездок, артисты, места.
 *
 * Роут, а не серверное действие: браузер должен получить файл со своим
 * именем, а это заголовок ответа. Отдаём ровно то, что принадлежит
 * текущему пользователю, — чужие id в адресе не принимаются вовсе, тут
 * их просто негде указать.
 *
 * Подписка НЕ требуется намеренно: забрать свои данные человек должен
 * мочь всегда, даже если платный доступ кончился.
 */

type Kind = "dramas" | "events" | "trips" | "trip-items" | "artists" | "places";

const KINDS: Kind[] = ["dramas", "events", "trips", "trip-items", "artists", "places"];

/** Русские подписи разделов в имени файла: он попадает к человеку на
 *  диск, и «trip-items» там ничего не объясняет. */
const FILE_LABELS: Record<Kind, string> = {
  dramas: "сериалы",
  events: "события",
  trips: "поездки",
  "trip-items": "записи-поездок",
  artists: "артисты",
  places: "места",
};

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) {
    return new NextResponse("Unknown export", { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });

  const csv = await buildCsv(kind as Kind, user.id);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        csvFileName(FILE_LABELS[kind as Kind]),
      )}`,
      // Личные данные: ни браузеру, ни промежуточным кэшам хранить их
      // не нужно.
      "Cache-Control": "no-store",
    },
  });
}

async function buildCsv(kind: Kind, userId: string): Promise<string> {
  // Заголовки колонок и подписи статусов — по-русски: выгрузка уходит
  // файлом на диск, языка интерфейса у него нет, а аудитория сайта
  // русскоязычная (то же решение, что у админки).
  const t = getDict("ru");
  switch (kind) {
    case "dramas": {
      const rows = await prisma.dramaWatchStatus.findMany({
        where: { userId },
        include: {
          drama: {
            select: {
              title: true, titleRu: true, nativeTitle: true, year: true,
              country: true, type: true, episodes: true, slug: true, id: true,
              mdlScore: true, mydramalistUrl: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
      return toCsv(
        ["Название", "Русское название", "Оригинальное название", "Год", "Страна", "Тип",
         "Статус", "Просмотрено серий", "Всего серий", "Оценка MDL", "Ссылка на сайте", "MyDramaList"],
        rows.map((r) => [
          r.drama.title, r.drama.titleRu, r.drama.nativeTitle, r.drama.year, r.drama.country,
          r.drama.type, t.catalog.watchStatus[r.status] ?? r.status,
          r.episodesWatched, r.drama.episodes, r.drama.mdlScore,
          `https://myblhub.com/dramas/${r.drama.slug ?? r.drama.id}`, r.drama.mydramalistUrl,
        ]),
      );
    }
    case "events": {
      // «Иду» — по датам, избранное — по событию; собираем в одну
      // таблицу с колонкой «что отмечено».
      const [going, favorites] = await Promise.all([
        prisma.eventAttendance.findMany({
          where: { userId },
          include: { event: true, occurrence: true },
          orderBy: { occurrence: { startsAt: "asc" } },
        }),
        prisma.favoriteEvent.findMany({
          where: { userId },
          include: { event: { include: { occurrences: { orderBy: { startsAt: "asc" }, take: 1 } } } },
        }),
      ]);
      const goingIds = new Set(going.map((g) => g.eventId));
      return toCsv(
        ["Событие", "Дата", "Время", "Площадка", "Адрес", "Отметка", "Ссылка"],
        [
          ...going.map((g) => [
            g.event.title, formatDate(g.occurrence.startsAt),
            g.occurrence.hasTime ? formatDateTime(g.occurrence.startsAt).slice(11) : "",
            g.event.venue, g.event.address, "иду",
            `https://myblhub.com/event/${g.event.slug ?? g.event.id}`,
          ]),
          // Избранное, на которое не отмечен поход, — отдельными строками.
          ...favorites
            .filter((f) => !goingIds.has(f.eventId))
            .map((f) => [
              f.event.title,
              f.event.occurrences[0] ? formatDate(f.event.occurrences[0].startsAt) : "",
              "", f.event.venue, f.event.address, "в избранном",
              `https://myblhub.com/event/${f.event.slug ?? f.event.id}`,
            ]),
        ],
      );
    }
    case "trips": {
      const trips = await prisma.trip.findMany({
        where: {
          OR: [{ userId }, { members: { some: { userId, status: "ACCEPTED" } } }],
        },
        include: {
          stays: { where: { userId }, select: { startDate: true, endDate: true } },
          members: { where: { status: "ACCEPTED" }, select: { userId: true } },
        },
        orderBy: { startDate: "asc" },
      });
      return toCsv(
        ["Поездка", "Начало", "Конец", "Мои даты с", "Мои даты по", "Моя роль", "Участников", "Ссылка"],
        trips.map((t) => [
          t.title, formatDate(t.startDate), formatDate(t.endDate),
          t.stays[0] ? formatDate(t.stays[0].startDate) : "",
          t.stays[0] ? formatDate(t.stays[0].endDate) : "",
          t.userId === userId ? "организатор" : "участник",
          t.members.length + 1,
          `https://myblhub.com/trips/${t.slug ?? t.id}`,
        ]),
      );
    }
    case "trip-items": {
      // Записи поездок одной таблицей: дела, чемодан, покупки, встречи и
      // брони — с колонкой «что это». Только СВОИ: чужие записи человек
      // видел в поездке, но выгружает он себя.
      const trips = await prisma.trip.findMany({
        where: {
          OR: [{ userId }, { members: { some: { userId, status: "ACCEPTED" } } }],
        },
        select: {
          title: true,
          todos: { where: { createdById: userId }, select: { text: true, kind: true, done: true, date: true } },
          personalEvents: { where: { createdById: userId }, select: { title: true, note: true, startsAt: true } },
          bookings: {
            where: { createdById: userId },
            select: { name: true, kind: true, address: true, note: true, startAt: true, endAt: true },
          },
        },
        orderBy: { startDate: "asc" },
      });
      const kindLabels: Record<string, string> = {
        TODO: "дело", PACKING: "чемодан", SHOPPING: "покупка",
        HOTEL: "жильё", FLIGHT: "перелёт",
      };
      const rows: unknown[][] = [];
      for (const trip of trips) {
        for (const todo of trip.todos) {
          rows.push([trip.title, kindLabels[todo.kind] ?? todo.kind, todo.text, "",
            todo.date ? formatDate(todo.date) : "", "", todo.done ? "готово" : ""]);
        }
        for (const e of trip.personalEvents) {
          rows.push([trip.title, "встреча", e.title, e.note ?? "", formatDate(e.startsAt), "", ""]);
        }
        for (const b of trip.bookings) {
          rows.push([trip.title, kindLabels[b.kind] ?? b.kind, b.name, b.note ?? "",
            b.startAt ? formatDate(b.startAt) : "", b.endAt ? formatDate(b.endAt) : "", b.address ?? ""]);
        }
      }
      return toCsv(
        ["Поездка", "Что это", "Название", "Заметка", "Дата с", "Дата по", "Ещё"],
        rows,
      );
    }
    case "artists": {
      const [favorites, seen] = await Promise.all([
        prisma.favoritePerformer.findMany({
          where: { userId },
          include: { performer: { select: { name: true, realName: true, type: true, slug: true, id: true } } },
        }),
        prisma.performerSeen.findMany({
          where: { userId, seen: true },
          include: { performer: { select: { name: true, realName: true, type: true, slug: true, id: true } } },
        }),
      ]);
      const seenIds = new Set(seen.map((s) => s.performerId));
      const typeLabels: Record<string, string> = {
        SOLO: "человек", BAND: "группа", MASCOT: "маскот",
      };
      return toCsv(
        ["Имя", "Настоящее имя", "Кто это", "В избранном", "Видел(а) вживую", "Ссылка"],
        [
          ...favorites.map((f) => [
            f.performer.name, f.performer.realName, typeLabels[f.performer.type] ?? f.performer.type,
            "да", seenIds.has(f.performerId) ? "да" : "",
            `https://myblhub.com/artists/${f.performer.slug ?? f.performer.id}`,
          ]),
          ...seen
            .filter((s) => !favorites.some((f) => f.performerId === s.performerId))
            .map((s) => [
              s.performer.name, s.performer.realName, typeLabels[s.performer.type] ?? s.performer.type,
              "", "да",
              `https://myblhub.com/artists/${s.performer.slug ?? s.performer.id}`,
            ]),
        ],
      );
    }
    case "places": {
      const [visits, lists] = await Promise.all([
        prisma.locationVisit.findMany({
          where: { userId },
          include: { location: { select: { name: true, category: true, slug: true, id: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.placeList.findMany({
          where: { userId },
          include: {
            items: { include: { location: { select: { name: true, category: true, slug: true, id: true } } } },
          },
        }),
      ]);
      return toCsv(
        ["Место", "Категория", "Откуда", "Список", "Ссылка"],
        [
          ...visits.map((v) => [
            v.location.name, v.location.category, "была здесь", "",
            `https://myblhub.com/locations/${v.location.slug ?? v.location.id}`,
          ]),
          ...lists.flatMap((list) =>
            list.items.map((i) => [
              i.location.name, i.location.category, "в списке", list.title,
              `https://myblhub.com/locations/${i.location.slug ?? i.location.id}`,
            ]),
          ),
        ],
      );
    }
  }
}
