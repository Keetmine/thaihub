import { prisma } from "@/lib/prisma";
import { downloadRemoteImage } from "@/lib/localImage";
import { fetchMdlDrama, type MdlDrama } from "@/lib/mydramalist";

export type MdlDramaUpsert = {
  id: string;
  title: string;
  created: boolean;
  /** Какие поля дозаполнили у уже существующей записи. */
  filled: string[];
  /** Разобранная страница — вызывающий решает, что делать с кастом. */
  mdl: MdlDrama;
};

/**
 * Создаёт или дозаполняет сериал по странице MyDramaList.
 *
 * Каст здесь НЕ трогаем намеренно: этим же кодом пользуется импорт
 * фильмографии актёра, и если бы новый сериал тянул за собой свой
 * состав, а каждый актёр — свою фильмографию, один импорт уходил бы в
 * бесконечную цепочку по половине каталога MDL. Кто хочет каст —
 * разбирает `mdl.cast` сам (так делает импорт сериала из /admin/imports).
 *
 * Занесённое руками не переписываем: у существующей записи заполняются
 * только пустые поля. Исключение — статус: он выводится из дат эфира и
 * освежается всегда.
 */
export async function upsertDramaFromMdl(url: string): Promise<MdlDramaUpsert> {
  const mdl = await fetchMdlDrama(url);
  const existing = await prisma.drama.findFirst({
    where: { OR: [{ mydramalistUrl: url }, { title: mdl.title }] },
  });

  const poster = mdl.posterUrl ? await downloadRemoteImage(mdl.posterUrl, "mdl") : null;
  const base = {
    mydramalistUrl: url,
    nativeTitle: mdl.nativeTitle,
    alsoKnownAs: mdl.alsoKnownAs,
    synopsis: mdl.synopsis,
    posterUrl: poster,
    genres: mdl.genres,
    director: mdl.director,
    screenwriter: mdl.screenwriter,
    network: mdl.network,
    episodes: mdl.episodes,
    airedFrom: mdl.airedFrom,
    airedTo: mdl.airedTo,
    airedOn: mdl.airedOn,
    duration: mdl.duration,
    contentRating: mdl.contentRating,
    year: mdl.year,
    status: mdl.status,
    mdlScore: mdl.rating,
    mdlSyncedAt: new Date(),
  };

  if (!existing) {
    const created = await prisma.drama.create({ data: { title: mdl.title, ...base } });
    return { id: created.id, title: created.title, created: true, filled: [], mdl };
  }

  const data: Record<string, unknown> = {
    mydramalistUrl: url,
    mdlScore: mdl.rating,
    mdlSyncedAt: new Date(),
  };
  const filled: string[] = [];
  const fill = (key: keyof typeof base, label: string) => {
    const current = (existing as unknown as Record<string, unknown>)[key];
    const next = base[key];
    const isEmpty =
      current === null || current === undefined || (Array.isArray(current) && current.length === 0);
    if (isEmpty && next !== null && next !== undefined) {
      data[key] = next;
      filled.push(label);
    }
  };
  fill("nativeTitle", "оригинальное название");
  fill("alsoKnownAs", "другие названия");
  fill("synopsis", "описание");
  fill("posterUrl", "постер");
  fill("genres", "жанры");
  fill("director", "режиссёр");
  fill("screenwriter", "сценарист");
  fill("network", "канал");
  fill("episodes", "серии");
  fill("airedFrom", "начало эфира");
  fill("airedTo", "конец эфира");
  fill("airedOn", "день выхода");
  fill("duration", "длительность");
  fill("contentRating", "возрастной рейтинг");
  fill("year", "год");
  // Статус выводится из дат эфира — освежаем всегда.
  if (mdl.status && mdl.status !== existing.status) {
    data.status = mdl.status;
    filled.push("статус");
  }

  const updated = await prisma.drama.update({ where: { id: existing.id }, data });
  return { id: updated.id, title: updated.title, created: false, filled, mdl };
}
