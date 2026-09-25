"use server";

import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { requireCatalogEditor } from "@/lib/auth";
import { performerNameWhere, dramaTitleWhere, rankedMerge } from "@/lib/searchWhere";

export type QuickHit = {
  kind: "performer" | "drama" | "event" | "location" | "novel" | "agency";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** Миниатюра (просьба владельца 2026-09-26: «выводить в поиске фото
   *  и постеры»): фото артиста/локации, постер сериала/события, обложка
   *  новеллы, логотип агентства. */
  imageUrl: string | null;
  /** Постер/обложка — вытянутая по высоте, а не квадрат. */
  tall: boolean;
};

const KIND_LABELS: Record<QuickHit["kind"], string> = {
  performer: "исполнитель",
  drama: "сериал",
  event: "событие",
  location: "локация",
  novel: "новелла",
  agency: "агентство",
};

export async function quickSearchAdmin(
  query: string,
  /** Сузить до одного вида: живой поиск в списке раздела показывает
   *  записи этого раздела, а не всё подряд, как палитра Cmd+K. */
  onlyKind?: QuickHit["kind"],
): Promise<QuickHit[]> {
  await requireCatalogEditor();
  const q = query.trim();
  if (q.length < 2) return [];
  const want = (k: QuickHit["kind"]) => !onlyKind || onlyKind === k;
  const take = onlyKind ? 8 : 5;
  const takeSmall = onlyKind ? 8 : 3;

  const [performers, dramas, events, locations, novels, agencies] = await Promise.all([
    want("performer") ? (async () => {
      const fields = ["name", "realName", "musicAlias"] as const;
      const common = {
        select: { id: true, name: true, realName: true, photoUrl: true },
        orderBy: { name: "asc" as const },
        take,
      };
      const [exact, prefix, rest] = await Promise.all([
        prisma.performer.findMany({
          where: { OR: fields.map((f) => ({ [f]: { equals: q, mode: "insensitive" } })) },
          ...common,
        }),
        prisma.performer.findMany({
          where: { OR: fields.map((f) => ({ [f]: { startsWith: q, mode: "insensitive" } })) },
          ...common,
        }),
        prisma.performer.findMany({ where: performerNameWhere(q), ...common }),
      ]);
      return rankedMerge([exact, prefix, rest], take);
    })() : [],
    want("drama") ? (async () => {
      const common = {
        select: { id: true, title: true, year: true, posterUrl: true },
        orderBy: { title: "asc" as const },
        take,
      };
      const [exact, prefix, rest] = await Promise.all([
        prisma.drama.findMany({
          where: { title: { equals: q, mode: "insensitive" } },
          ...common,
        }),
        prisma.drama.findMany({
          where: { title: { startsWith: q, mode: "insensitive" } },
          ...common,
        }),
        prisma.drama.findMany({ where: dramaTitleWhere(q), ...common }),
      ]);
      return rankedMerge([exact, prefix, rest], take);
    })() : [],
    want("event") ? prisma.event.findMany({
      // Быстрый поиск админки — по каталогу (см. lib/catalogEvents.ts).
      where: { ...catalogEventsWhere(), title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, venue: true, posterUrl: true },
      orderBy: { title: "asc" },
      take,
    }) : [],
    want("location") ? prisma.location.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, photoUrl: true },
      orderBy: { name: "asc" },
      take: takeSmall,
    }) : [],
    want("novel") ? prisma.novel.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, author: true, coverUrl: true },
      orderBy: { title: "asc" },
      take: takeSmall,
    }) : [],
    want("agency") ? prisma.agency.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, logoUrl: true },
      orderBy: { name: "asc" },
      take: takeSmall,
    }) : [],
  ]);

  return [
    ...performers.map((p) => ({
      kind: "performer" as const,
      id: p.id,
      title: p.name,
      subtitle: p.realName ?? KIND_LABELS.performer,
      href: `/admin/performers/${p.id}/edit`,
      imageUrl: p.photoUrl,
      tall: false,
    })),
    ...dramas.map((d) => ({
      kind: "drama" as const,
      id: d.id,
      title: d.title,
      subtitle: d.year ? `сериал · ${d.year}` : KIND_LABELS.drama,
      href: `/admin/dramas/${d.id}/edit`,
      imageUrl: d.posterUrl,
      tall: true,
    })),
    ...events.map((e) => ({
      kind: "event" as const,
      id: e.id,
      title: e.title,
      subtitle: e.venue,
      href: `/admin/events/${e.id}/edit`,
      imageUrl: e.posterUrl,
      tall: true,
    })),
    ...locations.map((l) => ({
      kind: "location" as const,
      id: l.id,
      title: l.name,
      subtitle: KIND_LABELS.location,
      href: `/admin/locations/${l.id}/edit`,
      imageUrl: l.photoUrl,
      tall: false,
    })),
    ...novels.map((n) => ({
      kind: "novel" as const,
      id: n.id,
      title: n.title,
      subtitle: n.author ?? KIND_LABELS.novel,
      href: `/admin/novels/${n.id}/edit`,
      imageUrl: n.coverUrl,
      tall: true,
    })),
    ...agencies.map((a) => ({
      kind: "agency" as const,
      id: a.id,
      title: a.name,
      subtitle: KIND_LABELS.agency,
      href: `/admin/agencies/${a.id}/edit`,
      imageUrl: a.logoUrl,
      tall: false,
    })),
  ];
}
