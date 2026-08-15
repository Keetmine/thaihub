// Pretty event URLs, same TMDB-style scheme as performerSlug.ts:
// /event/{cuid}-{title-slug}. See that file for the full rationale — id
// is always the real identifier, the slug is decorative and ignored on
// lookup.
import { slugify } from "@/lib/slug";

export function eventHref(event: { id: string; title: string }): string {
  const slug = slugify(event.title);
  return slug ? `/event/${event.id}-${slug}` : `/event/${event.id}`;
}

export function parseEventIdFromParam(param: string): string {
  const hyphenIndex = param.indexOf("-");
  return hyphenIndex === -1 ? param : param.slice(0, hyphenIndex);
}
