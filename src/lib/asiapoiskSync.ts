import { prisma } from "@/lib/prisma";
import { checkImportCancelled } from "@/lib/importRun";
import {
  ASIAPOISK_SITEMAP_URL,
  hasCyrillic,
  matchKey,
  normalizeCountry,
  parseAsiapoiskPage,
  parseAsiapoiskSitemap,
  parseSitemapIndex,
  sitemapKeys,
  type AsiapoiskPage,
} from "@/lib/asiapoisk";

/**
 * Русские названия и страны с asiapoisk.com (решение владельца
 * 2026-09-06). Второй источник переводов после dorama.land: он
 * закрывает то, до чего тот не дотянулся, и — что не менее ценно —
 * знает СТРАНУ, которой у трёх тысяч наших записей нет.
 *
 * Как это работает и почему так:
 *
 * 1. Список карточек берём из карты сайта, а не листалкой: постраничная
 *    навигация закрыта в их robots.txt, карта — нет.
 * 2. Сводим по КАРТЕ, не открывая страниц: в их слаге лежит английское
 *    название (иногда с годом), и его хватает, чтобы найти пару нашему
 *    `Drama.title`. Открываем только совпавшие — это разница между
 *    27 000 запросов и примерно 1200.
 * 3. Каждое совпадение ПРОВЕРЯЕМ по заголовку карточки: страна и год
 *    должны сойтись с нашими. Без этого наш тайский «Why R U» получил
 *    бы русское название корейского ремейка — поймано на разведке.
 *    Если проверить нечем (нет ни страны, ни года у нас) — пропускаем:
 *    угадывать чужой перевод нельзя.
 * 4. Пишем только ПУСТОЕ: русское название, если его нет, и страну,
 *    если её нет. Уже проставленное руками или другим источником не
 *    трогаем.
 */

/** Пауза между запросами — сайт просит 2 секунды (Crawl-delay). */
const PAGE_DELAY_MS = 2000;
/** Сколько карточек читаем за прогон: суточная задача добирает остаток
 *  назавтра, а разовый скрипт задаёт лимит сам. */
const DEFAULT_LIMIT = 200;

const UA = "Mozilla/5.0 (compatible; MyBLHubBot/1.0; +https://myblhub.com)";

export type AsiapoiskSyncResult = {
  apply: boolean;
  /** Карточек в их карте сайта. */
  cards: number;
  /** Наших записей, которым нашлась пара. */
  candidates: number;
  fetched: number;
  /** Дописано русских названий. */
  titles: number;
  /** Дописано стран. */
  countries: number;
  /** Совпадения, отвергнутые проверкой страны/года. */
  rejected: number;
  /** Карточек без русского названия (там просто дубль латиницы). */
  noTranslation: number;
  failed: number;
  notes: string[];
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ru,en" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/** Все адреса карточек из карты сайта (индекс → вложенные карты). */
export async function collectAsiapoiskCards(log: (line: string) => void): Promise<string[]> {
  const index = await fetchText(ASIAPOISK_SITEMAP_URL);
  const parts = parseSitemapIndex(index);
  const urls = new Set<string>();
  for (const part of parts) {
    await pause(PAGE_DELAY_MS);
    try {
      for (const url of parseAsiapoiskSitemap(await fetchText(part))) urls.add(url);
    } catch (e) {
      log(`карта ${part} не открылась: ${e instanceof Error ? e.message : e}`);
    }
  }
  log(`карточек в карте сайта: ${urls.size}`);
  return [...urls];
}

/**
 * Сходится ли их карточка с нашей записью. Возвращает причину отказа
 * или null, если всё в порядке.
 *
 * Год у них бывает списком (у многосезонных — год начала и конца), наш
 * должен быть среди них. Страну сверяем, только когда она есть у обоих:
 * у трёх тысяч наших записей её нет вовсе — как раз их мы и хотим
 * заполнить.
 */
export function rejectReason(
  ours: { year: number | null; country: string | null },
  page: AsiapoiskPage,
): string | null {
  const theirCountry = normalizeCountry(page.countryRu);
  if (ours.country && theirCountry && ours.country !== theirCountry) {
    return `страна ${ours.country} ≠ ${theirCountry}`;
  }
  if (ours.year && page.years.length > 0 && !page.years.includes(ours.year)) {
    return `год ${ours.year} ≠ ${page.years.join("/")}`;
  }
  // Нечем проверить — не рискуем: одинаковых названий у ремейков полно.
  if (!ours.country && !ours.year) return "нечем проверить совпадение";
  return null;
}

export async function runAsiapoiskSync(
  opts: {
    runId?: string | null;
    limit?: number;
    apply?: boolean;
    log?: (line: string) => void;
  } = {},
): Promise<AsiapoiskSyncResult> {
  const runId = opts.runId ?? null;
  const apply = opts.apply ?? true;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const log = opts.log ?? (() => {});

  const result: AsiapoiskSyncResult = {
    apply,
    cards: 0,
    candidates: 0,
    fetched: 0,
    titles: 0,
    countries: 0,
    rejected: 0,
    noTranslation: 0,
    failed: 0,
    notes: [],
  };

  const cards = await collectAsiapoiskCards(log);
  result.cards = cards.length;
  const byKey = new Map<string, string>();
  for (const url of cards) for (const key of sitemapKeys(url)) byKey.set(key, url);

  // Кого ищем: у кого нет русского названия ИЛИ нет страны. Уже
  // разобранные карточки (asiapoiskUrl) второй раз не читаем.
  const dramas = await prisma.drama.findMany({
    where: {
      asiapoiskUrl: null,
      OR: [{ titleRu: null }, { country: null }],
    },
    select: { id: true, title: true, year: true, country: true, titleRu: true },
  });

  const queue: { drama: (typeof dramas)[number]; url: string }[] = [];
  const taken = new Set(
    (
      await prisma.drama.findMany({
        where: { asiapoiskUrl: { not: null } },
        select: { asiapoiskUrl: true },
      })
    ).map((r) => r.asiapoiskUrl!),
  );
  for (const drama of dramas) {
    const url =
      byKey.get(matchKey(drama.title)) ??
      (drama.year ? byKey.get(matchKey(`${drama.title} ${drama.year}`)) : undefined);
    // Одна их карточка — один наш сериал: занятую второй раз не берём.
    if (url && !taken.has(url)) {
      queue.push({ drama, url });
      taken.add(url);
    }
  }
  result.candidates = queue.length;
  log(`наших записей с парой: ${queue.length}, читаем до ${limit}`);

  for (const { drama, url } of queue.slice(0, Math.max(0, limit))) {
    await checkImportCancelled(runId);
    if (result.fetched > 0) await pause(PAGE_DELAY_MS);

    let page: AsiapoiskPage;
    try {
      page = parseAsiapoiskPage(await fetchText(url), url);
      result.fetched++;
    } catch (e) {
      result.fetched++;
      result.failed++;
      log(`не открылась: ${url} — ${e instanceof Error ? e.message : e}`);
      continue;
    }

    const reason = rejectReason(drama, page);
    if (reason) {
      result.rejected++;
      log(`мимо: ${drama.title} — ${reason}`);
      continue;
    }

    // «Русское» название бывает продублированной латиницей — это не
    // перевод, и записывать его нельзя.
    const titleRu = page.titleRu && hasCyrillic(page.titleRu) ? page.titleRu : null;
    const country = normalizeCountry(page.countryRu);
    const data: { titleRu?: string; country?: string; asiapoiskUrl: string } = {
      asiapoiskUrl: url,
    };
    if (!drama.titleRu && titleRu) data.titleRu = titleRu;
    if (!drama.country && country) data.country = country;
    if (!titleRu) result.noTranslation++;

    const wrote: string[] = [];
    if (data.titleRu) wrote.push(`«${data.titleRu}»`);
    if (data.country) wrote.push(data.country);
    if (wrote.length === 0) {
      // Нечего дописать — но адрес запомним, чтобы не приходить сюда
      // снова.
      if (apply) await prisma.drama.update({ where: { id: drama.id }, data: { asiapoiskUrl: url } });
      continue;
    }

    if (data.titleRu) result.titles++;
    if (data.country) result.countries++;
    const note = `${drama.title} → ${wrote.join(", ")}`;
    result.notes.push(note);
    log(`${apply ? "записано" : "план"}: ${note}`);

    if (apply) {
      await prisma.drama.update({ where: { id: drama.id }, data });
      if (runId) {
        await prisma.importedItem.create({
          data: { runId, entityType: "drama", entityId: drama.id, action: "updated", label: note },
        });
      }
    }
  }

  return result;
}

export function summarizeAsiapoiskSync(r: AsiapoiskSyncResult): string {
  return (
    `${r.apply ? "Записано" : "План"}: карточек у них ${r.cards}, пар с нашими ${r.candidates}, ` +
    `прочитано ${r.fetched}; переводов +${r.titles}, стран +${r.countries}` +
    (r.rejected ? `, отвергнуто по стране/году ${r.rejected}` : "") +
    (r.noTranslation ? `, без перевода ${r.noTranslation}` : "") +
    (r.failed ? `, не открылось ${r.failed}` : "")
  );
}
