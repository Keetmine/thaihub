import type { Prisma } from "@/generated/prisma/client";

/**
 * Разделы каталога: сериалы, фильмы, шоу, новеллы (объединение вкладок
 * «Сериалы» и «Новеллы» в один «Каталог», решение владельца 2026-09-16).
 *
 * Зачем объединять: в меню «Новеллы» вели в раздел из пяти записей —
 * это не раздел, а вывеска над пустой комнатой. А фильмы и шоу и так
 * лежали в таблице Drama рядом с сериалами, просто с другим `type`, и
 * отдельного входа у них не было вовсе.
 *
 * Три первых раздела — ФИЛЬТР по `Drama.type` на /dramas, четвёртый —
 * своя страница /novels (у новеллы своя таблица и своя карточка).
 * Снаружи разницы нет: и то и другое — ссылка в одном ряду чипов.
 * Адреса менять нельзя (см. docs/features/seo.md — августовский переезд
 * языков ещё не отыгран), поэтому /dramas и /novels остались на месте,
 * поменялась только навигация.
 *
 * Модуль чистый: тем же разбором пользуются страница, чипы и тест.
 */

/**
 * Раздел каталога. `novels` живёт на своей странице, остальные — на
 * /dramas.
 *
 * `mine` — не тип записи, а «мой список»: то, что человек отметил
 * статусом просмотра. Стоит в том же ряду (правка владельца
 * 2026-09-16), потому что для читающего это такой же раздел каталога,
 * как «Фильмы»; показывается только залогиненному — гостю отмечать
 * нечего.
 */
export type CatalogKind = "series" | "movie" | "show" | "novels" | "mine";

/** Порядок в ряду чипов: от самого большого раздела к самому малому,
 *  «Мой список» — последним, за разделами каталога. */
export const CATALOG_KINDS: CatalogKind[] = ["series", "movie", "show", "novels", "mine"];

/** Разделы, которые видит гость: свой список ему показывать нечем. */
export const PUBLIC_CATALOG_KINDS: CatalogKind[] = CATALOG_KINDS.filter((k) => k !== "mine");

/** Раздел — это тип записи в `Drama` (а не новеллы и не «моё»): такой
 *  показывается списком с фильтрами и постраничной листалкой. */
export function isDramaKind(kind: CatalogKind): kind is "series" | "movie" | "show" {
  return kind === "series" || kind === "movie" || kind === "show";
}

/**
 * Значения `Drama.type`, которые относятся к разделу.
 *
 * MyDramaList различает «TV Show» и «TV Program», для зрителя это одно
 * и то же — оба переводятся словарём как «Шоу» (см. contentDictionary),
 * поэтому и раздел у них общий.
 */
const TYPES: Record<"series" | "movie" | "show", string[]> = {
  series: ["Drama"],
  movie: ["Movie"],
  show: ["TV Show", "TV Program"],
};

/**
 * Условие Prisma для раздела.
 *
 * Про `null`: с миграции 20260916T01 тип проставлен всем, и у колонки
 * есть умолчание «Drama», так что пустых быть не должно. «Сериалы» всё
 * равно ловят их — запись могли завести скриптом с явным `type: null`,
 * и тихо пропасть из каталога она не должна. Это же правило действует
 * в seenLive.ts, где «без типа» тоже значит «сериал».
 */
export function kindWhere(kind: CatalogKind): Prisma.DramaWhereInput {
  if (!isDramaKind(kind)) return {};
  const type = { in: TYPES[kind] };
  return kind === "series" ? { OR: [{ type }, { type: null }] } : { type };
}

/** Раздел из адреса (`?kind=movie`). Мусор и пустота — «Сериалы». */
export function parseKind(raw: string | undefined): CatalogKind {
  return CATALOG_KINDS.includes(raw as CatalogKind) ? (raw as CatalogKind) : "series";
}

/** Адрес раздела. Сериалы — без параметра: это умолчание, и лишний
 *  хвост в адресе главной страницы каталога ни к чему. */
export function kindHref(kind: CatalogKind): string {
  if (kind === "novels") return "/novels";
  return kind === "series" ? "/dramas" : `/dramas?kind=${kind}`;
}
