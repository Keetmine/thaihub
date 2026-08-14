"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { scrapeTtmEvent } from "@/lib/thaiticketmajor";

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
  dateRangeText: string | null;
  ticketPrice: string;
  posterUrl: string;
  presaleDate: string;
  presaleTime: string;
  sourceUrl: string;
  artists: TtmImportArtist[];
};

/**
 * Scrapes a ThaiTicketMajor event page and matches its artist lineup
 * against existing Performers (by exact, case-insensitive nickname match
 * — Performer.name is the nickname field, see docs/features/catalog.md).
 * Writes nothing — this is the preview step; createEventFromTtmImport
 * does the actual writes once an admin has reviewed/edited the result.
 */
export async function scrapeTtmEventPreview(url: string): Promise<TtmImportPreview> {
  const scraped = await scrapeTtmEvent(url);

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
    dateRangeText: scraped.dateRangeText,
    ticketPrice: scraped.ticketPrice ?? "",
    posterUrl: scraped.posterUrl ?? "",
    presaleDate: scraped.presaleDate ?? "",
    presaleTime: scraped.presaleTime ?? "",
    sourceUrl: scraped.sourceUrl,
    artists,
  };
}

export type TtmImportSubmission = {
  title: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
  dramaId: string;
  ticketPrice: string;
  posterUrl: string;
  /** Ticket sale opening — both empty means "no presale block". */
  presaleDate: string;
  presaleTime: string;
  presaleUrl: string;
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
  const title = data.title.trim();
  const venue = data.venue.trim();
  if (!title || !venue || !data.date || !data.startTime) {
    throw new Error("Заполните обязательные поля: название, место, дата, время начала");
  }

  const [h, m] = data.startTime.split(":").map(Number);
  const [y, mo, d] = data.date.split("-").map(Number);
  const startsAt = new Date(y, mo - 1, d, h, m);
  let endsAt: Date | null = null;
  if (data.endTime) {
    const [eh, em] = data.endTime.split(":").map(Number);
    endsAt = new Date(y, mo - 1, d, eh, em);
  }

  let presaleAt: Date | null = null;
  if (data.presaleDate && data.presaleTime) {
    const [ph, pm] = data.presaleTime.split(":").map(Number);
    const [py, pmo, pd] = data.presaleDate.split("-").map(Number);
    presaleAt = new Date(py, pmo - 1, pd, ph, pm);
  }

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

    return tx.event.create({
      data: {
        title,
        venue,
        description: data.description.trim() || null,
        startsAt,
        endsAt,
        dramaId: data.dramaId || null,
        ticketPrice: data.ticketPrice.trim() || null,
        posterUrl: data.posterUrl.trim() || null,
        presaleAt,
        presaleUrl: data.presaleUrl.trim() || null,
        performers: {
          create: Array.from(new Set(performerIds)).map((performerId) => ({ performerId })),
        },
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/performers");
  revalidatePath("/performers");

  return { id: event.id };
}
