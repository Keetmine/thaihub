import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import {
  collectDoramaLandSeriesUrls,
  doramaLandMatchTitles,
  fetchDoramaLandPage,
  isWantedForImport,
  mergeTitleVariants,
  type DoramaLandPage,
} from "../src/lib/doramaland";
import { MdlRunFetcher } from "../src/lib/mdlClient";
import { absMdlUrl, mdlSearchUrl, parseMdlSearchTitles } from "../src/lib/mydramalist";
import { upsertDramaFromMdl } from "../src/lib/mdlDramaImport";

/**
 * Русские названия и описания с dorama.land (решение владельца, Ж4б).
 *
 * Один обход их каталога кормит оба прогона: страницы сериалов
 * собираются из sitemap-ов, каждая разбирается и кладётся в кэш на
 * диске — прерванный прогон продолжается с места обрыва, а не с нуля.
 *
 * Прогон 1 (всегда): каждой их странице ищется НАША запись — по
 * английскому/оригинальному названию плюс год (±1) и однозначности;
 * совпавшей пишутся titleRu, synopsisRu, doramalandUrl, а ВСЕ варианты
 * названий (русское, украинское, оригинал) доливаются в alsoKnownAs —
 * поиск по сайту читает его, и сериал становится находим по-русски.
 *
 * Прогон 2 (--import-missing): их сериалы, которых у нас нет, — но
 * только Таиланд или с яой/BL в жанрах (фильтр владельца). Сначала
 * сериал ищется на MDL (точное название + год) и заводится обычным
 * MDL-импортом — постер, синопсис, каст, всё как всегда; русские поля
 * доливаются следом. Не нашёлся на MDL — в отчёт, руками: заводить
 * голую запись без постера и данных хуже, чем не заводить.
 *
 * «Нет ру перевода» в админке — это titleRu IS NULL, отдельной пометки
 * не нужно: не найденные на dorama.land так и остаются без titleRu.
 *
 *   npx tsx scripts/doramaland-sync.ts                # черновой прогон
 *   npx tsx scripts/doramaland-sync.ts --apply
 *   npx tsx scripts/doramaland-sync.ts --apply --import-missing
 *   [--limit N] [--overwrite]  # --overwrite переписывает уже взятое
 */

const apply = process.argv.includes("--apply");
const importMissing = process.argv.includes("--import-missing");
const overwrite = process.argv.includes("--overwrite");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const DELAY_MS = 350;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Кэш разобранных страниц: повторный прогон не ходит за уже взятым. */
const CACHE_FILE = path.join(process.cwd(), "private-uploads", "doramaland-cache.json");

async function loadCache(): Promise<Record<string, DoramaLandPage>> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveCache(cache: Record<string, DoramaLandPage>) {
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache));
}

/**
 * Наша запись для их страницы. Правила — как в закалённом MDL-сведении:
 * год обязателен (окно ±1: даты анонсов плавают), совпадение должно
 * быть однозначным. Оригинальное тайское название сверяем с нашим
 * nativeTitle — у тайских сериалов это самый надёжный ключ.
 */
async function findOurDrama(page: DoramaLandPage) {
  const titles = doramaLandMatchTitles(page);
  const thaiOriginal = page.original && /[฀-๿]/.test(page.original) ? page.original : null;
  if (titles.length === 0 && !thaiOriginal) return null;

  const yearWhere = page.year ? { year: { gte: page.year - 1, lte: page.year + 1 } } : {};
  const candidates = await prisma.drama.findMany({
    where: {
      OR: [
        ...titles.flatMap((title) => [
          { title: { equals: title, mode: "insensitive" as const } },
          { alsoKnownAs: { contains: title, mode: "insensitive" as const } },
        ]),
        ...(thaiOriginal ? [{ nativeTitle: thaiOriginal.replace(/\s*Special$/i, "").trim() }] : []),
      ],
      ...yearWhere,
    },
    select: { id: true, slug: true, title: true, nativeTitle: true, alsoKnownAs: true, titleRu: true, synopsisRu: true, doramalandUrl: true },
    take: 2,
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/** Поиск страницы MDL для их сериала: точное название + год, однозначно. */
async function findMdlUrl(fetcher: MdlRunFetcher, page: DoramaLandPage): Promise<string | null> {
  for (const title of doramaLandMatchTitles(page)) {
    try {
      const html = await fetcher.fetchHtml(mdlSearchUrl(title));
      const results = parseMdlSearchTitles(html);
      const exact = results.filter((r) => r.title.trim().toLowerCase() === title.toLowerCase());
      const pool = exact.length > 0 ? exact : [];
      const withYear = page.year
        ? pool.filter((r) => r.year != null && Math.abs(r.year - page.year!) <= 1)
        : pool;
      const pick = (withYear.length > 0 ? withYear : pool).slice(0, 2);
      if (pick.length === 1) return absMdlUrl(pick[0].path);
    } catch {
      // поиск по одному из названий не удался — пробуем следующее
    }
    await sleep(DELAY_MS);
  }
  return null;
}

async function applyRuFields(
  drama: { id: string; title: string; nativeTitle: string | null; alsoKnownAs: string | null; titleRu: string | null; synopsisRu: string | null },
  page: DoramaLandPage,
) {
  const titleRu = overwrite ? page.titleRu : (drama.titleRu ?? page.titleRu);
  const synopsisRu = overwrite ? page.descriptionRu : (drama.synopsisRu ?? page.descriptionRu);
  const alsoKnownAs = mergeTitleVariants(
    drama.alsoKnownAs,
    [...(page.titleRu ? [page.titleRu] : []), ...page.altTitles, ...(page.original ? [page.original] : [])],
    [drama.title, drama.nativeTitle, titleRu],
  );
  await prisma.drama.update({
    where: { id: drama.id },
    data: { titleRu, synopsisRu, alsoKnownAs, doramalandUrl: page.sourceUrl },
  });
}

async function main() {
  console.log("Собираю страницы сериалов из sitemap…");
  const urls = (await collectDoramaLandSeriesUrls()).slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(`Страниц сериалов: ${urls.length}${apply ? "" : " (черновой прогон)"}`);

  const cache = await loadCache();
  let fetched = 0;
  let matched = 0;
  let enriched = 0;
  let importedFromMdl = 0;
  const unmatchedWanted: DoramaLandPage[] = [];
  const noMdl: DoramaLandPage[] = [];
  const fetcher = importMissing ? new MdlRunFetcher() : null;

  try {
    for (const [i, url] of urls.entries()) {
      let page = cache[url];
      if (!page) {
        try {
          page = await fetchDoramaLandPage(url);
        } catch (e) {
          console.log(`  [ошибка] ${url}: ${e instanceof Error ? e.message : e}`);
          continue;
        }
        cache[url] = page;
        fetched += 1;
        if (fetched % 50 === 0) await saveCache(cache);
        await sleep(DELAY_MS);
      }

      const ours = await findOurDrama(page);
      if (ours) {
        matched += 1;
        const hasNew =
          (!ours.titleRu && page.titleRu) ||
          (!ours.synopsisRu && page.descriptionRu) ||
          ours.doramalandUrl !== page.sourceUrl ||
          overwrite;
        if (hasNew) {
          enriched += 1;
          if (apply) await applyRuFields(ours, page);
          if (enriched <= 5 || enriched % 50 === 0) {
            console.log(`  «${page.titleRu}» → ${ours.slug ?? ours.id}`);
          }
        }
      } else if (isWantedForImport(page)) {
        unmatchedWanted.push(page);
      }

      if ((i + 1) % 100 === 0) console.log(`  …${i + 1} из ${urls.length}`);
    }
    await saveCache(cache);

    // Прогон 2: заводим недостающее — сперва MDL, затем русские поля.
    if (importMissing && fetcher) {
      console.log(`\nИх сериалов без нашей записи (Таиланд или яой/BL): ${unmatchedWanted.length}`);
      for (const page of unmatchedWanted) {
        const mdlUrl = await findMdlUrl(fetcher, page);
        if (!mdlUrl) {
          noMdl.push(page);
          continue;
        }
        if (!apply) {
          importedFromMdl += 1;
          console.log(`  [заведём] «${page.titleRu}» ← ${mdlUrl}`);
          continue;
        }
        try {
          const result = await upsertDramaFromMdl(mdlUrl, {
            fetchHtml: (u) => fetcher.fetchHtml(u),
          });
          const fresh = await prisma.drama.findUnique({
            where: { id: result.id },
            select: { id: true, slug: true, title: true, nativeTitle: true, alsoKnownAs: true, titleRu: true, synopsisRu: true, doramalandUrl: true },
          });
          if (fresh) await applyRuFields(fresh, page);
          importedFromMdl += 1;
          console.log(`  [заведён] «${page.titleRu}» → ${fresh?.slug ?? result.id}`);
        } catch (e) {
          console.log(`  [ошибка импорта] «${page.titleRu}»: ${e instanceof Error ? e.message : e}`);
        }
        await sleep(DELAY_MS);
      }
    }
  } finally {
    await fetcher?.close();
    await saveCache(cache);
  }

  const withoutRu = await prisma.drama.count({ where: { titleRu: null } });
  console.log(`\nСведено с нашими записями: ${matched}; обновлено: ${enriched}${apply ? "" : " (ничего не записано)"}.`);
  if (importMissing) {
    console.log(`Заведено с MDL: ${importedFromMdl}; не нашлись на MDL: ${noMdl.length}.`);
    for (const p of noMdl.slice(0, 30)) {
      console.log(`  [нет на MDL] «${p.titleRu}» (${p.year ?? "год?"}) ${p.sourceUrl}`);
    }
    if (noMdl.length > 30) console.log(`  … и ещё ${noMdl.length - 30}`);
  }
  console.log(`Наших записей без ру-перевода: ${withoutRu} (в админке — фильтр «Нет ру перевода»).`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
