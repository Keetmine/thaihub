import { slugify } from "@/lib/slug";

// Единые построители публичных ссылок: чистый слаг из БД, без id.
// Фолбэки (по убыванию красоты): stored slug → легаси `{id}-{slug}` →
// голый id. Резолвер страниц принимает любой из трёх форматов, так что
// старые сохранённые ссылки продолжают работать.

type Sluggable = { id: string; slug?: string | null };

function href(prefix: string, entity: Sluggable, name: string): string {
  if (entity.slug) return `/${prefix}/${entity.slug}`;
  const legacy = slugify(name);
  return legacy ? `/${prefix}/${entity.id}-${legacy}` : `/${prefix}/${entity.id}`;
}

export const performerHref = (p: Sluggable & { name: string }) => href("artists", p, p.name);
export const dramaHref = (d: Sluggable & { title: string }) => href("dramas", d, d.title);
export const eventHref = (e: Sluggable & { title: string }) => href("event", e, e.title);
export const locationHref = (l: Sluggable & { name: string }) => href("locations", l, l.name);
export const novelHref = (n: Sluggable & { title: string }) => href("novels", n, n.title);
export const agencyHref = (a: Sluggable & { name: string }) => href("agencies", a, a.name);
export const tripHref = (t: Sluggable) => `/trips/${t.slug ?? t.id}`;
export const artistListHref = (l: Sluggable) => `/artist-lists/${l.slug ?? l.id}`;
export const listHref = (l: Sluggable) => `/lists/${l.slug ?? l.id}`;
export const communityHref = (c: Sluggable) => `/communities/${c.slug ?? c.id}`;

/**
 * Where-условие резолва параметра страницы: слаг ИЛИ id (голый cuid или
 * легаси-префикс `{cuid}-...`). cuid не содержит дефисов, поэтому
 * префикс до первого дефиса — кандидат в id.
 */
export function slugOrIdWhere(param: string): { OR: ({ slug: string } | { id: string })[] } {
  const idCandidate = param.includes("-") ? param.slice(0, param.indexOf("-")) : param;
  return { OR: [{ slug: param }, { id: idCandidate }, { id: param }] };
}
