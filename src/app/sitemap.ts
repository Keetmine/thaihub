import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";

// Sitemap открытого каталога: сериалы, артисты, новеллы, локации,
// агентства, вики. События опущены — их страницы за премиум-гейтом.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [dramas, performers, novels, locations, agencies, wiki] = await Promise.all([
    prisma.drama.findMany({ select: { slug: true, id: true, updatedAt: true }, where: { slug: { not: null } } }),
    prisma.performer.findMany({ select: { slug: true, id: true, updatedAt: true }, where: { slug: { not: null } } }),
    prisma.novel.findMany({ select: { slug: true, id: true, updatedAt: true }, where: { slug: { not: null } } }),
    prisma.location.findMany({ select: { slug: true, id: true }, where: { slug: { not: null }, createdByUserId: null } }),
    prisma.agency.findMany({ select: { slug: true, id: true, updatedAt: true }, where: { slug: { not: null } } }),
    prisma.wikiArticle.findMany({ select: { slug: true, id: true, updatedAt: true }, where: { published: true } }),
  ]);

  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    ...(lastModified ? { lastModified } : {}),
  });

  return [
    entry("/"),
    entry("/about"),
    entry("/dramas"),
    entry("/artists"),
    entry("/novels"),
    entry("/locations"),
    entry("/wiki"),
    ...dramas.map((d) => entry(`/dramas/${d.slug}`, d.updatedAt)),
    ...performers.map((p) => entry(`/artists/${p.slug}`, p.updatedAt)),
    ...novels.map((n) => entry(`/novels/${n.slug}`, n.updatedAt)),
    ...locations.map((l) => entry(`/locations/${l.slug}`)),
    ...agencies.map((a) => entry(`/agencies/${a.slug}`, a.updatedAt)),
    ...wiki.map((w) => entry(`/wiki/${w.slug ?? w.id}`, w.updatedAt)),
  ];
}
