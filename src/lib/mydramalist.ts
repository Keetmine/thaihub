import type { DramaStatus } from "@/generated/prisma/client";

// Парсер страницы сериала на MyDramaList. Официального API у MDL нет
// (только форма запроса ключа для «партнёров»), но страницы отдаются
// обычным GET'ом с браузерным User-Agent и содержат schema.org JSON-LD
// (TVSeries: название, постер, описание, жанры, каст) плюс блок
// «Details» в HTML (родное название, даты эфира, канал, эпизоды).

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type MdlDrama = {
  url: string;
  title: string;
  nativeTitle: string | null;
  synopsis: string | null;
  posterUrl: string | null;
  genres: string[];
  network: string | null;
  episodes: number | null;
  airedFrom: Date | null;
  airedTo: Date | null;
  year: number | null;
  status: DramaStatus | null;
  rating: number | null;
};

type JsonLdTvSeries = {
  "@type"?: string;
  name?: string;
  image?: string;
  description?: string;
  genre?: string[];
  datePublished?: string;
  aggregateRating?: { ratingValue?: number };
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "|")
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/g, " ")
    .replace(/\|+/g, "|");
}

function parseMdlDate(s: string): Date | null {
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Статус выводится из дат эфира — на самой странице его нет отдельным полем. */
function deriveStatus(from: Date | null, to: Date | null): DramaStatus | null {
  const now = new Date();
  if (from && from > now) return "PLANNED";
  if (to && to < now) return "ENDED";
  if (from && from <= now) return "RETURNING_SERIES";
  return null;
}

export async function fetchMdlDrama(url: string): Promise<MdlDrama> {
  const parsed = new URL(url);
  if (parsed.hostname !== "mydramalist.com" && parsed.hostname !== "www.mydramalist.com") {
    throw new Error("Ожидается ссылка на mydramalist.com");
  }

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`MyDramaList ответил ${res.status}`);
  }
  const html = await res.text();

  let ld: JsonLdTvSeries | null = null;
  for (const m of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )) {
    try {
      const data = JSON.parse(m[1]) as JsonLdTvSeries;
      if (data["@type"] === "TVSeries" || data["@type"] === "Movie") {
        ld = data;
        break;
      }
    } catch {
      // не наш блок — пропускаем
    }
  }
  if (!ld?.name) {
    throw new Error("Не удалось разобрать страницу (нет JSON-LD с данными сериала)");
  }

  const text = stripTags(html);
  const detail = (label: string) =>
    text.match(new RegExp(`${label}:[|\\s]*([^|]+)`))?.[1]?.trim() || null;
  const nativeTitle = detail("Native Title");
  const network = detail("Original Network");
  const episodesRaw = detail("Episodes")?.match(/\d+/)?.[0];
  const airedRaw = detail("(?:Aired|Release Date)");

  let airedFrom: Date | null = null;
  let airedTo: Date | null = null;
  if (airedRaw) {
    const [fromPart, toPart] = airedRaw.split(/\s[-–]\s/);
    airedFrom = fromPart ? parseMdlDate(fromPart) : null;
    airedTo = toPart ? parseMdlDate(toPart) : airedFrom;
  }
  if (!airedFrom && ld.datePublished) airedFrom = parseMdlDate(ld.datePublished);

  return {
    url,
    title: ld.name,
    nativeTitle,
    synopsis: ld.description?.trim() || null,
    posterUrl: ld.image ?? null,
    genres: Array.isArray(ld.genre) ? ld.genre : [],
    network,
    episodes: episodesRaw ? Number(episodesRaw) : null,
    airedFrom,
    airedTo,
    year: airedFrom ? airedFrom.getFullYear() : null,
    status: deriveStatus(airedFrom, airedTo),
    rating: ld.aggregateRating?.ratingValue ?? null,
  };
}
