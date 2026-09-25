import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
// Разбор страницы — в библиотеке (src/lib/kprofiles.ts), там же тест.
import { parseKpPage, type KpProfile } from "../src/lib/kprofiles";

/**
 * Разовый сбор профилей тайских актёров с kprofiles.com (просьба
 * владельца 2026-09-26: «стянем всю инфу, переведём и дозаполним то,
 * чего у нас нет»). Не парсер по расписанию — один проход, результат
 * в tmp/kprofiles/raw.json, дальше сопоставление с каталогом и
 * импорт отдельными шагами (см. docs/features/kprofiles-import.md).
 *
 * Что берём: список актёров и актрис (/thai-actors-actresses-list/) —
 * по странице на человека — и страницы групп (Domundi, DEXX, DMD
 * trainee), где участники идут блоками на одной странице; у части
 * участников есть и своя страница, её тоже забираем.
 *
 * Разбор страницы — parseKpPage в src/lib/kprofiles.ts (чистая функция,
 * под тестом); здесь только обход и кэш.
 *
 *   npx tsx -r dotenv/config scripts/kprofiles-collect.ts            # всё
 *   npx tsx -r dotenv/config scripts/kprofiles-collect.ts --limit 5  # проба
 * Уже скачанные страницы лежат в tmp/kprofiles/html/ и повторно не
 * тянутся — прогон можно прерывать и продолжать.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const LIST_URL = "https://kprofiles.com/thai-actors-actresses-list/";
const GROUP_URLS = [
  "https://kprofiles.com/domundi-members-profile-facts/",
  "https://kprofiles.com/dexx-members-profile/",
  "https://kprofiles.com/dmd-trainee-profile/",
];
const OUT_DIR = "tmp/kprofiles";
const PAUSE_MS = 900;

const argv = process.argv.slice(2);
const limitIdx = argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string, cacheName: string): Promise<string> {
  const path = `${OUT_DIR}/html/${cacheName}.html`;
  if (existsSync(path)) return readFileSync(path, "utf8");
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  writeFileSync(path, html);
  await sleep(PAUSE_MS);
  return html;
}

function slugOf(url: string): string {
  return url.replace(/^https?:\/\/kprofiles\.com\//, "").replace(/\/+$/, "").replace(/[^a-z0-9-]/gi, "_");
}

async function main() {
  mkdirSync(`${OUT_DIR}/html`, { recursive: true });

  // 1. Список: ссылки на страницы людей.
  const listHtml = await fetchHtml(LIST_URL, "_list");
  const start = listHtml.indexOf('class="entry-content');
  const listBody = listHtml.slice(start, start + 300000);
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const m of listBody.matchAll(/href="(https:\/\/kprofiles\.com\/[^"#?]+\/)"/g)) {
    const u = m[1];
    if (seen.has(u) || /\/(tag|category|about-us|privacy-policy|disclaimer|contact)\//.test(u)) continue;
    seen.add(u);
    urls.push(u);
  }
  console.log(`в списке ссылок: ${urls.length}`);

  const profiles: KpProfile[] = [];
  let done = 0;
  let failed = 0;

  // 2. Страницы групп — сначала: из них берём и ссылки на профили
  //    участников, которых нет в общем списке.
  for (const gu of GROUP_URLS) {
    try {
      const html = await fetchHtml(gu, slugOf(gu));
      const got = parseKpPage(html, gu);
      profiles.push(...got);
      console.log(`  группа ${slugOf(gu)}: участников ${got.length}`);
      const gs = html.indexOf('class="entry-content');
      for (const m of html.slice(gs, gs + 400000).matchAll(/href="(https:\/\/kprofiles\.com\/[^"#?]+profile[^"#?]*\/)"/g)) {
        const u = m[1];
        if (!seen.has(u) && !GROUP_URLS.includes(u) && !/members-profile|trainee/i.test(u)) {
          seen.add(u);
          urls.push(u);
        }
      }
    } catch (e) {
      failed++;
      console.log(`  [ошибка] ${gu}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`страниц людей к обходу: ${urls.length}`);

  // 3. Страницы людей.
  for (const u of urls.slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined)) {
    try {
      const html = await fetchHtml(u, slugOf(u));
      const got = parseKpPage(html, u);
      if (got.length === 0) console.log(`  [пусто] ${slugOf(u)}`);
      profiles.push(...got);
      done++;
    } catch (e) {
      failed++;
      console.log(`  [ошибка] ${slugOf(u)}: ${e instanceof Error ? e.message : e}`);
    }
  }

  writeFileSync(`${OUT_DIR}/raw.json`, JSON.stringify(profiles, null, 1));
  const withSig = profiles.filter((p) => p.signatureUrl).length;
  const withFacts = profiles.filter((p) => p.facts.length > 0).length;
  const fieldKeys = new Map<string, number>();
  for (const p of profiles) for (const k of Object.keys(p.fields)) fieldKeys.set(k, (fieldKeys.get(k) ?? 0) + 1);
  console.log(
    `\nстраниц скачано ${done}, ошибок ${failed}; профилей ${profiles.length}: с фактами ${withFacts}, с подписью ${withSig}`,
  );
  console.log("поля (сколько раз встретились):");
  for (const [k, v] of [...fieldKeys].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${v}\t${k}`);
  console.log(`\n→ ${OUT_DIR}/raw.json`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  });
}
