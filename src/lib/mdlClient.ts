import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { MDL_UA } from "@/lib/mydramalist";

// HTTP-клиент для массовых прогонов по MyDramaList. Раздел /people/ (и
// иногда остальное) закрыт Cloudflare-челленджем, который решается
// только в реальном браузере — поэтому:
// 1) поднимаем ОДИН headed chromium и решаем челлендж навигацией;
// 2) дальше ходим быстрыми HTTP-запросами через context.request — он
//    шлёт те же cookies (cf_clearance) и UA, что и браузер;
// 3) если очередной ответ снова оказался челленджем — решаем его
//    навигацией и повторяем запрос.
// Использовать только в скриптах (scripts/mdl-sync-*.ts), не в вебе.

const CHALLENGE_MARKER = /Just a moment|challenges\.cloudflare\.com/;

export class MdlClient {
  private browser: Browser | null = null;
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    this.ctx = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: MDL_UA,
    });
    this.page = await this.ctx.newPage();
  }

  private async solveChallenge(url: string): Promise<void> {
    if (!this.page) throw new Error("MdlClient не инициализирован");
    await this.page.goto(url, { waitUntil: "commit", timeout: 60000 });
    for (let i = 0; i < 30; i++) {
      await this.page.waitForTimeout(2000);
      const title = await this.page.title().catch(() => "");
      if (!/just a moment/i.test(title)) return;
    }
    throw new Error("Cloudflare-челлендж не решился за 60с");
  }

  /** GET страницы; при челлендже — решаем и повторяем (до 2 раз). */
  async fetchHtml(url: string): Promise<string> {
    if (!this.ctx) throw new Error("MdlClient не инициализирован");
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.ctx.request.get(url, {
        timeout: 45000,
        headers: { Referer: "https://mydramalist.com/" },
      });
      const status = res.status();
      const body = await res.text();
      if (status === 200 && !CHALLENGE_MARKER.test(body.slice(0, 3000))) {
        return body;
      }
      if (status === 404) throw new Error("404");
      if (status === 429) {
        // не душим сайт — ждём подольше
        await new Promise((r) => setTimeout(r, 30000 * (attempt + 1)));
        continue;
      }
      // 403/челлендж — решаем браузером и пробуем снова
      await this.solveChallenge(url);
      // после решения страница уже открыта в браузере — можно взять её HTML
      const html = await this.page!.content();
      if (!CHALLENGE_MARKER.test(html.slice(0, 3000)) && html.length > 20000) {
        return html;
      }
    }
    throw new Error(`Не удалось получить ${url}`);
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}
