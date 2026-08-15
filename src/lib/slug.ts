// Shared slugify used by performerSlug.ts/dramaSlug.ts/eventSlug.ts — every
// public detail URL follows the same TMDB-style `/{section}/{cuid}-{slug}`
// scheme (see performerSlug.ts for the full rationale).
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
