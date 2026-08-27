"use server";

import { prisma } from "@/lib/prisma";
import { dramaTitleWhere, performerNameWhere } from "@/lib/searchWhere";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { eventHref } from "@/lib/eventSlug";
import { locationHref, novelHref } from "@/lib/slugHelpers";
import { performerPhoto, FALLBACK_COVER_SELECT } from "@/lib/performerPhoto";

/**
 * Живая выдача под полем поиска (шапка и мобильная шторка).
 *
 * Отдаёт немного и быстро: это подсказка на каждое нажатие клавиши, а
 * не полная выдача — за полной человек уходит на /search. Секция
 * сужает и выдачу, и число запросов: выбрал «Артисты» — база получает
 * один запрос вместо пяти.
 *
 * href отдаём без языкового префикса — клиент рисует ссылки через
 * AppLink, который префикс подставит сам.
 */

export type LiveSection = "all" | "dramas" | "performers" | "events" | "locations" | "novels";

export type LiveHit = {
  kind: Exclude<LiveSection, "all">;
  name: string;
  subtitle: string | null;
  href: string;
  photoUrl: string | null;
  /** Круглая миниатюра — у людей; у постеров и мест — скруглённый квадрат. */
  round: boolean;
};

/** По сколько строк на раздел в режиме «везде» и в одном разделе. */
const PER_KIND_ALL = 3;
const PER_KIND_ONE = 8;

export async function searchLive(rawQuery: string, section: LiveSection): Promise<LiveHit[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  const take = section === "all" ? PER_KIND_ALL : PER_KIND_ONE;
  const want = (s: Exclude<LiveSection, "all">) => section === "all" || section === s;

  const [dramas, performers, events, locations, novels] = await Promise.all([
    want("dramas")
      ? prisma.drama.findMany({
          where: dramaTitleWhere(query),
          select: { id: true, slug: true, title: true, year: true, posterUrl: true },
          orderBy: [{ year: { sort: "desc", nulls: "last" } }, { title: "asc" }],
          take,
        })
      : [],
    want("performers")
      ? prisma.performer.findMany({
          where: performerNameWhere(query),
          include: { albums: FALLBACK_COVER_SELECT },
          orderBy: { name: "asc" },
          take,
        })
      : [],
    want("events")
      ? prisma.event.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { venue: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { id: true, slug: true, title: true, venue: true, posterUrl: true },
          orderBy: { createdAt: "desc" },
          take,
        })
      : [],
    want("locations")
      ? prisma.location.findMany({
          where: { createdByUserId: null, name: { contains: query, mode: "insensitive" } },
          select: { id: true, slug: true, name: true, photoUrl: true },
          orderBy: { name: "asc" },
          take,
        })
      : [],
    want("novels")
      ? prisma.novel.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { author: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { id: true, slug: true, title: true, author: true, coverUrl: true },
          orderBy: { title: "asc" },
          take,
        })
      : [],
  ]);

  return [
    ...dramas.map(
      (d): LiveHit => ({
        kind: "dramas",
        name: d.title,
        subtitle: d.year ? String(d.year) : null,
        href: dramaHref(d),
        photoUrl: d.posterUrl,
        round: false,
      }),
    ),
    ...performers.map(
      (p): LiveHit => ({
        kind: "performers",
        name: p.name,
        subtitle: null,
        href: performerHref(p),
        photoUrl: performerPhoto(p),
        round: true,
      }),
    ),
    ...events.map(
      (e): LiveHit => ({
        kind: "events",
        name: e.title,
        subtitle: e.venue,
        href: eventHref(e),
        photoUrl: e.posterUrl,
        round: false,
      }),
    ),
    ...locations.map(
      (l): LiveHit => ({
        kind: "locations",
        name: l.name,
        subtitle: null,
        href: locationHref(l),
        photoUrl: l.photoUrl,
        round: false,
      }),
    ),
    ...novels.map(
      (n): LiveHit => ({
        kind: "novels",
        name: n.title,
        subtitle: n.author,
        href: novelHref(n),
        photoUrl: n.coverUrl,
        round: false,
      }),
    ),
  ];
}
