"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { scrapeEventByUrl } from "@/lib/eventTicketSites";
import { combineDateTime } from "@/lib/dates";
import { downloadRemoteImage } from "@/lib/localImage";
import { requireAdmin } from "@/lib/auth";

export type TtmImportArtist = {
  fullName: string;
  nickname: string;
  matchedPerformerId: string | null;
};

export type TtmImportPreview = {
  title: string;
  venue: string;
  date: string;
  startTime: string;
  /** Extra days detected in the page's date line (e.g. a 2-night run) —
   *  pre-filled here, still editable/removable in the review screen. */
  extraDates: string[];
  dateRangeText: string | null;
  ticketPrice: string;
  posterUrl: string;
  presaleDate: string;
  presaleTime: string;
  description: string;
  sourceUrl: string;
  artists: TtmImportArtist[];
  /** Событие с этим же sourceUrl уже в базе — экран предупредит, а не
   *  даст молча завести дубль. */
  existingEventId: string | null;
};

/**
 * Scrapes an event page (сайт распознаётся по домену — TTM, Eventpop,
 * Ticketmelon, AllTicket, Eventpass; см. lib/eventTicketSites.ts) and
 * matches its artist lineup against existing Performers (by exact,
 * case-insensitive nickname match — Performer.name is the nickname
 * field, see docs/features/catalog.md; состав отдаёт только TTM).
 * Writes nothing — this is the preview step; createEventFromTtmImport
 * does the actual writes once an admin has reviewed/edited the result.
 */
export async function scrapeTtmEventPreview(url: string): Promise<TtmImportPreview> {
  await requireAdmin();
  const scraped = await scrapeEventByUrl(url);
  const existing = await prisma.event.findFirst({
    where: { sourceUrl: scraped.sourceUrl },
    select: { id: true },
  });

  const existingPerformers = await prisma.performer.findMany({
    select: { id: true, name: true },
  });
  const byNickname = new Map(existingPerformers.map((p) => [p.name.toLowerCase().trim(), p.id]));

  const artists: TtmImportArtist[] = scraped.artists.map((a) => ({
    fullName: a.fullName,
    nickname: a.nickname,
    matchedPerformerId: byNickname.get(a.nickname.toLowerCase().trim()) ?? null,
  }));

  return {
    title: scraped.title,
    venue: scraped.venue ?? "",
    date: scraped.date ?? "",
    startTime: scraped.startTime ?? "",
    extraDates: scraped.extraDates,
    dateRangeText: scraped.dateRangeText,
    ticketPrice: scraped.ticketPrice ?? "",
    posterUrl: scraped.posterUrl ?? "",
    presaleDate: scraped.presaleDate ?? "",
    presaleTime: scraped.presaleTime ?? "",
    description: scraped.description ?? "",
    sourceUrl: scraped.sourceUrl,
    artists,
    existingEventId: existing?.id ?? null,
  };
}

export type TtmImportSubmission = {
  title: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  extraDates: string[];
  description: string;
  dramaId: string;
  ticketPrice: string;
  posterUrl: string;
  /** Ticket sale opening — both empty means "no presale block". */
  presaleDate: string;
  presaleTime: string;
  presaleUrl: string;
  /** Страница события на ThaiTicketMajor — в блок «Источники». */
  sourceUrl: string;
  /** Artists the admin kept checked in the review screen. */
  artists: { fullName: string; nickname: string; performerId: string | null }[];
  /** Additional existing performers picked manually (not from the scrape). */
  extraPerformerIds: string[];
};

/**
 * Creates the Event from a reviewed/edited import, creating a Performer
 * for any artist row that didn't match an existing one (name = nickname,
 * realName = full name — the scraper's two fields map directly onto
 * these). Runs in one transaction so a partial import can't happen.
 */
export async function createEventFromTtmImport(
  data: TtmImportSubmission,
): Promise<{ id: string }> {
  await requireAdmin();
  const title = data.title.trim();
  const venue = data.venue.trim();
  if (!title || !venue || !data.date || !data.startTime) {
    throw new Error("Заполните обязательные поля: название, место, дата, время начала");
  }

  const dates = Array.from(new Set([data.date, ...data.extraDates]));

  const presaleAt =
    data.presaleDate && data.presaleTime
      ? combineDateTime(data.presaleDate, data.presaleTime)
      : null;

  // Постер забираем к себе ДО записи — в базе не должно оставаться
  // ссылок на thaiticketmajor.com (см. «Local image storage» в
  // docs/features/tmdb-import.md). Качаем вне транзакции: сетевой поход
  // не должен держать её открытой. Уже локальный адрес (админ заменил
  // постер своим файлом) downloadRemoteImage вернёт как есть, а если
  // чужой хост не ответил — вернёт исходную ссылку, и событие всё равно
  // создастся.
  const posterUrl = await downloadRemoteImage(data.posterUrl.trim() || null, "posters");

  const event = await prisma.$transaction(async (tx) => {
    const performerIds: string[] = [...data.extraPerformerIds];

    for (const artist of data.artists) {
      if (artist.performerId) {
        performerIds.push(artist.performerId);
        continue;
      }
      const nickname = artist.nickname.trim();
      const fullName = artist.fullName.trim();
      if (!nickname) continue;

      const created = await tx.performer.create({
        data: { name: nickname, realName: fullName || null, type: "SOLO" },
      });
      performerIds.push(created.id);
    }

    const uniquePerformerIds = Array.from(new Set(performerIds));

    return tx.event.create({
      data: {
        title,
        venue,
        description: data.description.trim() || null,
        dramaId: data.dramaId || null,
        ticketPrice: data.ticketPrice.trim() || null,
        posterUrl,
        presaleAt,
        presaleUrl: data.presaleUrl.trim() || null,
        sourceUrl: data.sourceUrl.trim() || null,
        occurrences: {
          create: dates.map((dateStr) => ({
            startsAt: combineDateTime(dateStr, data.startTime),
            endsAt: data.endTime ? combineDateTime(dateStr, data.endTime) : null,
          })),
        },
        performers: {
          create: uniquePerformerIds.map((performerId) => ({ performerId })),
        },
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/admin/events");
  revalidatePath("/admin/performers");
  revalidatePath("/artists");

  return { id: event.id };
}
