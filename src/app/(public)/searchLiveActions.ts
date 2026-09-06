"use server";

import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { prisma } from "@/lib/prisma";
import {
  dramaTitleWhere,
  performerNameWhere,
  performerRealNameParen,
  rankedMerge,
} from "@/lib/searchWhere";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { eventHref } from "@/lib/eventSlug";
import { locationHref, novelHref } from "@/lib/slugHelpers";
import { performerPhoto, FALLBACK_COVER_SELECT } from "@/lib/performerPhoto";
import { getT } from "@/lib/i18n";
import { dramaTitleForLocale } from "@/lib/dramaLocale";

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
  /** Настоящее имя артиста — рисуется серым в скобках сразу за ником
   *  (АА21). Отдельным полем, а не внутри `name`: скобки должны быть
   *  тише имени, а не одной с ним строкой в цвет. */
  nameSuffix?: string | null;
};

/** По сколько строк на раздел в режиме «везде» и в одном разделе. */
const PER_KIND_ALL = 3;
const PER_KIND_ONE = 8;

export async function searchLive(rawQuery: string, section: LiveSection): Promise<LiveHit[]> {
  const viewer = await getCurrentUser();
  const viewerPremium = isPremiumActive(viewer);

  const query = rawQuery.trim();
  if (query.length < 2) return [];
  // Язык зрителя — из заголовка запроса (server actions его видят):
  // русская версия показывает русские названия сериалов, когда они есть.
  const { locale } = await getT();
  const take = section === "all" ? PER_KIND_ALL : PER_KIND_ONE;
  const want = (s: Exclude<LiveSection, "all">) => section === "all" || section === s;

  const [dramas, performers, events, locations, novels] = await Promise.all([
    want("dramas")
      ? (async () => {
          const select = { id: true, slug: true, title: true, titleRu: true, year: true, posterUrl: true };
          const orderBy = [
            { year: { sort: "desc" as const, nulls: "last" as const } },
            { title: "asc" as const },
          ];
          const [exact, prefix, rest] = await Promise.all([
            prisma.drama.findMany({
              where: {
                OR: [
                  { title: { equals: query, mode: "insensitive" } },
                  { nativeTitle: { equals: query, mode: "insensitive" } },
                ],
              },
              select, orderBy, take,
            }),
            prisma.drama.findMany({
              where: { title: { startsWith: query, mode: "insensitive" } },
              select, orderBy, take,
            }),
            prisma.drama.findMany({ where: dramaTitleWhere(query), select, orderBy, take }),
          ]);
          return rankedMerge([exact, prefix, rest], take);
        })()
      : [],
    want("performers")
      ? (async () => {
          // Три яруса: «Gun» → сперва те, кого ТАК ЗОВУТ, потом те, чьё
          // имя так начинается, и только затем Balogun с Gundon.
          const fields = ["name", "realName", "musicAlias"] as const;
          const common = {
            include: { albums: FALLBACK_COVER_SELECT },
            orderBy: { name: "asc" as const },
            take,
          };
          const [exact, prefix, rest] = await Promise.all([
            prisma.performer.findMany({
              where: { OR: fields.map((f) => ({ [f]: { equals: query, mode: "insensitive" } })) },
              ...common,
            }),
            prisma.performer.findMany({
              where: { OR: fields.map((f) => ({ [f]: { startsWith: query, mode: "insensitive" } })) },
              ...common,
            }),
            prisma.performer.findMany({ where: performerNameWhere(query), ...common }),
          ]);
          return rankedMerge([exact, prefix, rest], take);
        })()
      : [],
    // События в подсказках — только с подпиской: живой поиск это тоже
    // список, и без гейта он раздавал всю афишу артиста по имени
    // (обход пейволла, пойман владельцем 2026-09-05). Карточка события
    // по прямой ссылке публична — но подсказки её не раздают.
    want("events") && viewerPremium
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
        name: dramaTitleForLocale(d, locale),
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
        // «Babe (Tanatat Phanviriyakool)»: ник и настоящее имя часто
        // помнят вразнобой, и без подсказки человек не уверен, что нашёл
        // того самого (АА21). Совпадающее с ником имя помощник не
        // вернёт.
        nameSuffix: performerRealNameParen(p),
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
