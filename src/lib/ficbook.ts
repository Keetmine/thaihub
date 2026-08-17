// Парсер страницы фанфика на ficbook.net. Сайт закрыт JS-проверкой
// («Проверка безопасности») для голых HTTP-клиентов — fetch пробуем
// первым (иногда проходит), при челлендже поднимаем chromium
// (playwright — уже рантайм-зависимость). Заголовок/описание/автор —
// из разметки (itemprop), бейджи — из .ds-label, «Автор оригинала»,
// «Оригинал», «Размер», «Метки» — из блока инфо.

import { chromium } from "playwright";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const CHALLENGE = /Проверка безопасности/;

export type FicbookNovel = {
  url: string;
  title: string;
  description: string | null;
  author: string | null;
  originalAuthor: string | null;
  originalUrl: string | null;
  tags: string[];
  size: string | null;
};

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function strip(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseFicbookPage(html: string, url: string): FicbookNovel {
  const title = strip(html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  if (!title) throw new Error("Не удалось разобрать страницу (нет заголовка)");

  const description = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  const author = html.match(/itemprop="author"[^>]*>([\s\S]*?)<\/a>/)?.[1];

  const origAuthorBlock = html.match(/Автор оригинала:<\/strong>([\s\S]{0,400}?)<\/div>/)?.[1];
  const originalAuthor = origAuthorBlock ? strip(origAuthorBlock) || null : null;

  // «Оригинал:» — ссылка завёрнута в /away?url=<encoded>
  const awayHref = html.match(/Оригинал:<\/strong>[\s\S]{0,400}?href="\/away\?url=([^"]+)"/)?.[1];
  let originalUrl: string | null = null;
  if (awayHref) {
    try {
      originalUrl = decodeURIComponent(decode(awayHref));
    } catch {
      originalUrl = null;
    }
  }

  // Бейджи: направленность/перевод/рейтинг/статус (.ds-label)
  const badges = [...html.matchAll(/class="ds-label[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => strip(m[1]))
    .filter(Boolean);

  // «Метки:» — облако тегов
  const tagsBlock = html.match(/Метки:<\/strong>[\s\S]{0,80}?<div class="tags">([\s\S]*?)<\/div>/)?.[1];
  const marks = tagsBlock
    ? [...tagsBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => strip(m[1])).filter(Boolean)
    : [];

  const sizeBlock = html.match(/Размер:<\/strong>[\s\S]{0,60}?<div>([\s\S]*?)<\/div>/)?.[1];

  return {
    url,
    title,
    description: description ? strip(description) || null : null,
    author: author ? strip(author) || null : null,
    originalAuthor,
    originalUrl,
    tags: Array.from(new Set([...badges, ...marks])).filter((t) => !/^\+?\d+$/.test(t)),
    size: sizeBlock ? strip(sizeBlock).split(",").slice(0, 2).join(",") || null : null,
  };
}

export async function fetchFicbookHtml(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!/(^|\.)ficbook\.net$/.test(parsed.hostname)) {
    throw new Error("Ожидается ссылка на ficbook.net");
  }

  // 1) обычный fetch — иногда проходит без проверки
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const html = await res.text();
      if (!CHALLENGE.test(html)) return html;
    }
  } catch {
    // перейдём к браузеру
  }

  // 2) браузер решает JS-проверку. На машине с дисплеем headless может
  // не пройти — пробуем оба режима.
  for (const headless of [true, false]) {
    const browser = await chromium.launch({ headless }).catch(() => null);
    if (!browser) continue;
    try {
      const page = await browser.newPage({ userAgent: UA });
      await page.goto(url, { waitUntil: "commit", timeout: 45000 });
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(2000);
        const t = await page.title().catch(() => "");
        if (!CHALLENGE.test(t) && !/проверка безопасности/i.test(t)) break;
      }
      const html = await page.content();
      if (!CHALLENGE.test(html) && html.length > 50000) return html;
    } finally {
      await browser.close();
    }
  }
  throw new Error("Фикбук не отдал страницу (JS-проверка) — попробуйте ещё раз");
}

/** og:image со страницы оригинала — фикбук своих обложек не отдаёт. */
export async function fetchOriginalCover(originalUrl: string): Promise<string | null> {
  try {
    const res = await fetch(originalUrl, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const og = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1];
    return og ? decode(og) : null;
  } catch {
    return null;
  }
}
