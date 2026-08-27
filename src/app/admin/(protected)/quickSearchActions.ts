"use server";

import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { performerNameWhere, dramaTitleWhere } from "@/lib/searchWhere";

export type QuickHit = {
  kind: "performer" | "drama" | "event" | "location" | "novel" | "agency";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
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
    want("performer") ? prisma.performer.findMany({
      where: performerNameWhere(q),
      select: { id: true, name: true, realName: true },
      orderBy: { name: "asc" },
      take,
    }) : [],
    want("drama") ? prisma.drama.findMany({
      where: dramaTitleWhere(q),
      select: { id: true, title: true, year: true },
      orderBy: { title: "asc" },
      take,
    }) : [],
    want("event") ? prisma.event.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, venue: true },
      orderBy: { title: "asc" },
      take,
    }) : [],
    want("location") ? prisma.location.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: takeSmall,
    }) : [],
    want("novel") ? prisma.novel.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, author: true },
      orderBy: { title: "asc" },
      take: takeSmall,
    }) : [],
    want("agency") ? prisma.agency.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true },
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
    })),
    ...dramas.map((d) => ({
      kind: "drama" as const,
      id: d.id,
      title: d.title,
      subtitle: d.year ? `сериал · ${d.year}` : KIND_LABELS.drama,
      href: `/admin/dramas/${d.id}/edit`,
    })),
    ...events.map((e) => ({
      kind: "event" as const,
      id: e.id,
      title: e.title,
      subtitle: e.venue,
      href: `/admin/events/${e.id}/edit`,
    })),
    ...locations.map((l) => ({
      kind: "location" as const,
      id: l.id,
      title: l.name,
      subtitle: KIND_LABELS.location,
      href: `/admin/locations/${l.id}/edit`,
    })),
    ...novels.map((n) => ({
      kind: "novel" as const,
      id: n.id,
      title: n.title,
      subtitle: n.author ?? KIND_LABELS.novel,
      href: `/admin/novels/${n.id}/edit`,
    })),
    ...agencies.map((a) => ({
      kind: "agency" as const,
      id: a.id,
      title: a.name,
      subtitle: KIND_LABELS.agency,
      href: `/admin/agencies/${a.id}/edit`,
    })),
  ];
}
