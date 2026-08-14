// Client for themoviedb.org's official API (no scraping — TMDB's robots.txt
// explicitly disallows AI bots; the compliant path is their public API, see
// docs/features/tmdb-import.md). Pure fetch functions, no DB access, same
// split as src/lib/gmmtv.ts / src/lib/thaiticketmajor.ts.

import type { DramaStatus } from "@/generated/prisma/client";

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

function authHeaders(): HeadersInit {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!token) throw new Error("TMDB_API_READ_ACCESS_TOKEN is not set");
  return { Authorization: `Bearer ${token}`, accept: "application/json" };
}

async function tmdbFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`TMDB ${path} -> HTTP ${res.status}`);
  return res.json();
}

/** Full https URL for a poster_path/profile_path, or null if TMDB has none. */
export function tmdbImageUrl(path: string | null): string | null {
  return path ? `${IMAGE_BASE}${path}` : null;
}

/** Extracts a numeric TMDB person id from either a bare id or a
 *  themoviedb.org/person/{id}[-slug] URL. */
export function parseTmdbPersonId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/person\/(\d+)/);
  return match ? match[1] : null;
}

export type TmdbTvSearchResult = {
  id: number;
  name: string;
  year: number | null;
  isThaiOrigin: boolean;
  popularity: number;
};

export async function searchTmdbTvShows(query: string): Promise<TmdbTvSearchResult[]> {
  const data = await tmdbFetch<{
    results: {
      id: number;
      name: string;
      first_air_date: string | null;
      origin_country: string[];
      popularity: number;
    }[];
  }>(`/search/tv?query=${encodeURIComponent(query)}`);
  return data.results.map((r) => ({
    id: r.id,
    name: r.name,
    year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
    isThaiOrigin: r.origin_country.includes("TH"),
    popularity: r.popularity,
  }));
}

export type TmdbPersonSearchResult = {
  id: number;
  name: string;
  isActor: boolean;
  popularity: number;
};

export async function searchTmdbPeople(query: string): Promise<TmdbPersonSearchResult[]> {
  const data = await tmdbFetch<{
    results: { id: number; name: string; known_for_department: string | null; popularity: number }[];
  }>(`/search/person?query=${encodeURIComponent(query)}`);
  return data.results.map((r) => ({
    id: r.id,
    name: r.name,
    isActor: r.known_for_department === "Acting",
    popularity: r.popularity,
  }));
}

export type TmdbPerson = {
  id: number;
  name: string;
  biography: string | null;
  placeOfBirth: string | null;
  photoUrl: string | null;
  alsoKnownAs: string[];
};

export async function fetchTmdbPerson(personId: string): Promise<TmdbPerson> {
  const data = await tmdbFetch<{
    id: number;
    name: string;
    biography: string | null;
    place_of_birth: string | null;
    profile_path: string | null;
    also_known_as: string[];
  }>(`/person/${personId}`);
  return {
    id: data.id,
    name: data.name,
    biography: data.biography || null,
    placeOfBirth: data.place_of_birth || null,
    photoUrl: tmdbImageUrl(data.profile_path),
    alsoKnownAs: data.also_known_as ?? [],
  };
}

/** Thai fan nicknames aren't a TMDB concept, but they usually show up in
 *  `also_known_as` as "{Nickname} {Full Name}" (e.g. "Apo Nattawin
 *  Wattanagitiphat" for a person whose TMDB `name` is "Nattawin
 *  Wattanagitiphat") alongside unrelated variants (native-script name,
 *  ship-name mashups like "MileApo", partial-name variants). Looks for an
 *  entry that ends with the exact full name, is a short (<=2 word) Latin-
 *  script prefix once that's stripped off, and returns that prefix —  or
 *  null if nothing in the list fits that shape confidently. */
export function deriveNicknameFromAlsoKnownAs(personName: string, alsoKnownAs: string[]): string | null {
  const trimmedName = personName.trim();
  const normalizedName = trimmedName.toLowerCase();

  for (const aka of alsoKnownAs) {
    const trimmed = aka.trim();
    const lower = trimmed.toLowerCase();
    if (lower === normalizedName || !lower.endsWith(normalizedName)) continue;

    const prefix = trimmed.slice(0, trimmed.length - trimmedName.length).trim();
    if (!prefix) continue;
    if (prefix.split(/\s+/).length > 2) continue;
    if (!/^[A-Za-z0-9\s'.-]+$/.test(prefix)) continue;

    return prefix;
  }
  return null;
}

export type TmdbKnownForShow = {
  tvId: number;
  name: string;
  posterUrl: string | null;
  year: number | null;
  character: string;
  voteCount: number;
};

/** Approximates the "Known For" carousel shown on a person's TMDB page (the
 *  API itself doesn't expose that curated list directly): pulls the TV side
 *  of combined_credits, drops "Self"/host/guest appearances (reality/variety
 *  shows tend to outrank a person's actual scripted dramas on raw
 *  popularity), and ranks what's left by vote_count — a decent proxy for
 *  "notable", capped so a review screen stays manageable. */
export async function fetchTmdbPersonKnownForTv(
  personId: string,
  limit = 15,
): Promise<TmdbKnownForShow[]> {
  const data = await tmdbFetch<{
    cast: {
      media_type: string;
      id: number;
      name?: string;
      poster_path: string | null;
      first_air_date: string | null;
      character: string;
      vote_count: number;
    }[];
  }>(`/person/${personId}/combined_credits`);

  return data.cast
    .filter((c) => c.media_type === "tv" && c.character && !/^self\b/i.test(c.character.trim()))
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
    .slice(0, limit)
    .map((c) => ({
      tvId: c.id,
      name: c.name ?? "",
      posterUrl: tmdbImageUrl(c.poster_path),
      year: c.first_air_date ? Number(c.first_air_date.slice(0, 4)) : null,
      character: c.character,
      voteCount: c.vote_count,
    }));
}

const STATUS_MAP: Record<string, DramaStatus> = {
  "Returning Series": "RETURNING_SERIES",
  Planned: "PLANNED",
  "In Production": "IN_PRODUCTION",
  Ended: "ENDED",
  Canceled: "CANCELED",
  Pilot: "PILOT",
};

export type TmdbTvShow = {
  id: number;
  name: string;
  overview: string | null;
  posterUrl: string | null;
  year: number | null;
  status: DramaStatus | null;
};

export async function fetchTmdbTvShow(tvId: number): Promise<TmdbTvShow> {
  const data = await tmdbFetch<{
    id: number;
    name: string;
    overview: string | null;
    poster_path: string | null;
    first_air_date: string | null;
    status: string | null;
  }>(`/tv/${tvId}`);
  return {
    id: data.id,
    name: data.name,
    overview: data.overview || null,
    posterUrl: tmdbImageUrl(data.poster_path),
    year: data.first_air_date ? Number(data.first_air_date.slice(0, 4)) : null,
    status: data.status ? (STATUS_MAP[data.status] ?? null) : null,
  };
}

export type TmdbCastMember = {
  personId: number;
  name: string;
  character: string;
  photoUrl: string | null;
  order: number;
};

export async function fetchTmdbTvCredits(tvId: number): Promise<TmdbCastMember[]> {
  const data = await tmdbFetch<{
    cast: { id: number; name: string; character: string; profile_path: string | null; order: number }[];
  }>(`/tv/${tvId}/credits`);
  return data.cast
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      personId: c.id,
      name: c.name,
      character: c.character,
      photoUrl: tmdbImageUrl(c.profile_path),
      order: c.order,
    }));
}

/** Extracts a numeric TMDB company id from either a bare id or a
 *  themoviedb.org/company/{id}-slug URL (the "tv" suffix some company
 *  pages have, e.g. .../company/139832-studio-wabi-sabi/tv, is just a
 *  page-view filter and doesn't affect the id). */
export function parseTmdbCompanyId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/company\/(\d+)/);
  return match ? match[1] : null;
}

export type TmdbCompany = {
  id: number;
  name: string;
  logoUrl: string | null;
  description: string | null;
};

export async function fetchTmdbCompany(companyId: string): Promise<TmdbCompany> {
  const data = await tmdbFetch<{
    id: number;
    name: string;
    logo_path: string | null;
    description: string | null;
  }>(`/company/${companyId}`);
  return {
    id: data.id,
    name: data.name,
    logoUrl: tmdbImageUrl(data.logo_path),
    description: data.description || null,
  };
}

/** Every TV show TMDB credits to a production company — paginated via
 *  `/discover/tv`, the same endpoint themoviedb.org's own company "TV"
 *  tab is backed by (e.g. .../company/139832-studio-wabi-sabi/tv), so
 *  this returns the same list a person browsing that page would see. */
export async function fetchTmdbCompanyTvShows(companyId: string): Promise<{ id: number; name: string }[]> {
  const shows: { id: number; name: string }[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await tmdbFetch<{
      results: { id: number; name: string }[];
      total_pages: number;
    }>(`/discover/tv?with_companies=${companyId}&page=${page}`);
    shows.push(...data.results.map((r) => ({ id: r.id, name: r.name })));
    totalPages = data.total_pages;
    page += 1;
  } while (page <= totalPages);
  return shows;
}
