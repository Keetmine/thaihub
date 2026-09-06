import { slugify } from "@/lib/slug";

/**
 * Вернуть записи «чистый» слаг вместо нумерованного (правка владельца
 * 2026-09-06).
 *
 * Откуда берётся проблема: слаги нумеруются при создании — второй
 * «Ник» получает `nick-2`. Когда дубли потом сливают, `nick` уходит
 * вместе с проигравшей записью, а выжившая так и живёт по `nick-2`,
 * хотя красивый адрес освободился и занять его больше некому.
 *
 * Правило намеренно узкое. Меняем слаг ТОЛЬКО когда он выглядит как
 * нумерованный вариант собственного названия записи (`nick-2` при
 * названии «Ник») и базовый вариант свободен. Иначе пришлось бы
 * трогать переименованные записи, а слаг у нас стабилен при
 * переименовании — сохранённые ссылки не должны ломаться.
 *
 * Осторожно с названиями, которые сами кончаются цифрой: у «Blossom
 * Campus 2» слаг `blossom-campus-2` — это НЕ нумерация, и проверка
 * `slugify(название) === база` его не трогает.
 */

/** Минимальный набор методов модели — чтобы функция работала и с
 *  транзакционным клиентом, и с обычным, и в скрипте. */
type SlugDelegate = {
  findUnique: (q: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
  findFirst: (q: { where: { slug: string } }) => Promise<{ id: string } | null>;
  update: (q: { where: { id: string }; data: { slug: string } }) => Promise<unknown>;
};

/** База и номер из `nick-2`; null — слаг не нумерованный. */
export function splitNumberedSlug(slug: string): { base: string; n: number } | null {
  const m = slug.match(/^(.+)-(\d+)$/);
  if (!m) return null;
  return { base: m[1], n: Number(m[2]) };
}

/**
 * Какой слаг записи полагается — или null, если менять нечего.
 * Вынесено отдельно, чтобы одна и та же проверка работала и в слиянии,
 * и в разовом прогоне по проду (scripts/reclaim-slugs.ts).
 */
export function betterSlugFor(slug: string | null, name: string): string | null {
  if (!slug) return null;
  const numbered = splitNumberedSlug(slug);
  if (!numbered) return null;
  const desired = slugify(name);
  // Название само кончается цифрой («Blossom Campus 2») — «-2» тут не
  // нумерация, а часть имени.
  if (!desired || desired !== numbered.base) return null;
  return desired;
}

/**
 * Занять освободившийся базовый слаг. Возвращает новый слаг или null,
 * если ничего не поменялось (слаг не нумерованный, база занята живой
 * записью, названия не совпадают).
 */
export async function reclaimBaseSlug(
  delegate: SlugDelegate,
  id: string,
  nameField: string,
): Promise<string | null> {
  const row = await delegate.findUnique({ where: { id } });
  if (!row) return null;
  const slug = typeof row.slug === "string" ? row.slug : null;
  const name = typeof row[nameField] === "string" ? (row[nameField] as string) : "";
  const desired = betterSlugFor(slug, name);
  if (!desired) return null;
  // Занято другой живой записью — оставляем как есть: два одинаковых
  // слага уникальный индекс всё равно не пустит.
  const taken = await delegate.findFirst({ where: { slug: desired } });
  if (taken) return null;
  await delegate.update({ where: { id }, data: { slug: desired } });
  return desired;
}
