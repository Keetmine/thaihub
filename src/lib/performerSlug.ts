// Pretty performer URLs, TMDB-style: /performers/{cuid}-{slug} — the id
// is always the real identifier, the slug is purely decorative and
// ignored on lookup (see parsePerformerIdFromParam), so a stale/short
// slug in a bookmarked link never breaks. Safe because a Prisma cuid()
// never contains a hyphen itself, so splitting on the first "-" always
// isolates the id cleanly.

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // strip combining diacritics ("é" -> "e") without a transliteration library
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Builds a performer's public URL. Falls back to a bare `/performers/{id}`
 *  when there's nothing slug-worthy to add — most commonly a Thai-script-
 *  only name with no Latin form, which `slugify` reduces to nothing. */
export function performerHref(performer: { id: string; name: string; realName?: string | null }): string {
  const nameLower = performer.name.trim().toLowerCase();
  const realNameLower = performer.realName?.trim().toLowerCase();
  const parts = [performer.name, realNameLower && realNameLower !== nameLower ? performer.realName : null].filter(
    (p): p is string => !!p,
  );
  const slug = slugify(parts.join(" "));
  return slug ? `/performers/${performer.id}-${slug}` : `/performers/${performer.id}`;
}

/** The inverse: pulls the real id back out of a `/performers/[id]` route
 *  param, whether or not it has a slug appended. */
export function parsePerformerIdFromParam(param: string): string {
  const hyphenIndex = param.indexOf("-");
  return hyphenIndex === -1 ? param : param.slice(0, hyphenIndex);
}
