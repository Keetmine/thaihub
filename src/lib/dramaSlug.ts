// Pretty drama URLs, same TMDB-style scheme as performerSlug.ts:
// /dramas/{cuid}-{title-slug}. See that file for the full rationale — id
// is always the real identifier, the slug is decorative and ignored on
// lookup.
import { slugify } from "@/lib/slug";

export function dramaHref(drama: { id: string; title: string }): string {
  const slug = slugify(drama.title);
  return slug ? `/dramas/${drama.id}-${slug}` : `/dramas/${drama.id}`;
}

export function parseDramaIdFromParam(param: string): string {
  const hyphenIndex = param.indexOf("-");
  return hyphenIndex === -1 ? param : param.slice(0, hyphenIndex);
}
