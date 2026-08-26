import type { Browser, BrowserContext, Page } from "playwright";
import { fetchMdlHtmlPlain, MdlHttpError, MDL_UA } from "@/lib/mydramalist";

// HTTP-клиент для массовых прогонов по MyDramaList. Раздел /people/ (и
// временами всё остальное) закрыт Cloudflare-челленджем, который
// решается только в реальном браузере — поэтому:
// 1) поднимаем ОДИН chromium на прогон и решаем челлендж навигацией;
// 2) дальше ходим быстрыми HTTP-запросами через context.request — он
//    шлёт те же cookies (cf_clearance) и UA, что и браузер;
// 3) если очередной ответ снова оказался челленджем — решаем его
//    навигацией и берём открывшуюся страницу, а её свежие cookies
//    достаются следующим быстрым запросам.
//
// Годится и для скриптов (scripts/mdl-sync-*.ts), и для фоновых
// прогонов в вебе (импорт со страницы поиска, ночное обновление). НЕ
// годится для обработки обычного запроса страницы: подъём браузера
// занимает секунды и держит память — посетителю столько ждать нечего.
//
// playwright подгружается динамически, а не импортом в шапке: модуль
// тянут за собой импортёры, а браузер нужен им далеко не в каждом
// прогоне (см. MdlRunFetcher ниже).

const CHALLENGE_MARKER = /Just a moment|challenges\.cloudflare\.com/;

export class MdlClient {
  private browser: Browser | null = null;
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;
  private headless = true;

  async init(): Promise<void> {
    // Headless первым: на сервере дисплея нет, и окно там просто не
    // откроется. Если челлендж в headless не решится — переподнимемся с
    // окном (см. solveChallenge).
    await this.launch(true);
  }

  private async launch(headless: boolean): Promise<void> {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless });
    let ctx: BrowserContext;
    let page: Page;
    try {
      ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: MDL_UA,
      });
      page = await ctx.newPage();
    } catch (e) {
      // Процесс браузера уже запущен — без этого он остался бы висеть.
      await browser.close().catch(() => {});
      throw e;
    }

    const previous = this.browser;
    this.browser = browser;
    this.ctx = ctx;
    this.page = page;
    this.headless = headless;
    // Старый браузер закрываем ПОСЛЕ удачного подъёма нового: если
    // headed не запустился, клиент должен остаться рабочим в headless.
    await previous?.close().catch(() => {});
  }

  /** Одна попытка пройти челлендж навигацией на текущем браузере.
   *  Отдаёт html открывшейся страницы или null, если за минуту так и не
   *  открылась. Судим по содержимому, а не только по заголовку: вместо
   *  «Just a moment» Cloudflare может показать и глухую заглушку — по
   *  заголовку она выглядит как успех, и мы бы никогда не дошли до
   *  переподъёма с окном. */
  private async passChallenge(url: string): Promise<string | null> {
    const page = this.page;
    if (!page) throw new Error("MdlClient не инициализирован");
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 60000 });
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(2000);
        if (/just a moment/i.test(await page.title().catch(() => ""))) continue;
        const html = await page.content();
        if (!CHALLENGE_MARKER.test(html.slice(0, 3000)) && html.length > 20000) return html;
        // Не заглушка, так недогруженная страница — ждём дальше, минута
        // на весь цикл всё равно ограничена сверху.
      }
    } catch {
      // навигация сорвалась — считаем попытку неудачной
    }
    return null;
  }

  private async solveChallenge(url: string): Promise<string> {
    const headlessHtml = await this.passChallenge(url);
    if (headlessHtml) return headlessHtml;
    // Часть челленджей headless не проходит. Пробуем с окном — но
    // только если сидели в headless: на сервере без дисплея подъём
    // просто не удастся, и мы останемся на прежнем браузере.
    if (this.headless) {
      const relaunched = await this.launch(false).then(
        () => true,
        () => false,
      );
      const headedHtml = relaunched ? await this.passChallenge(url) : null;
      if (headedHtml) return headedHtml;
    }
    throw new Error("Cloudflare-челлендж не решился");
  }

  /** GET страницы быстрым запросом; при челлендже — решаем навигацией.
   *  Цикл нужен только 429: остальные исходы уходят из него сразу. */
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
      // Код нужен вызывающему: обход страниц поиска по 404 понимает
      // «выдача кончилась», а не «сломалось».
      if (status === 404) throw new MdlHttpError(404, "MyDramaList ответил 404");
      if (status === 429) {
        // не душим сайт — ждём подольше
        await new Promise((r) => setTimeout(r, 30000 * (attempt + 1)));
        continue;
      }
      // 403/челлендж — решаем навигацией; открывшаяся страница и есть
      // ответ, а её cookies достанутся следующим быстрым запросам.
      return await this.solveChallenge(url);
    }
    throw new Error(`Не удалось получить ${url}`);
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.ctx = null;
    this.page = null;
    await browser?.close();
  }
}

/**
 * Загрузчик страниц на весь массовый прогон.
 *
 * Ходит обычным fetch'ем и поднимает браузер ЛЕНИВО — только когда MDL
 * впервые ответил Cloudflare-заглушкой. С сети, которую MDL пропускает
 * (а это обычный случай), chromium за прогон не запускается вовсе.
 *
 * Как только браузер поднят, через него идут ВСЕ оставшиеся страницы:
 * раз Cloudflare нас заметил, он уже не отпустит, и голая попытка перед
 * каждой страницей — лишний запрос и лишняя секунда на сотнях тайтлов.
 * Браузер при этом один на прогон — в этом вся разница с прежним
 * «chromium на каждую недоступную страницу», из-за которого массовые
 * импорты ходили голым fetch'ем и падали.
 *
 * Закрывать ОБЯЗАТЕЛЬНО в finally: незакрытый chromium — это память
 * сервера, которая уже не вернётся.
 */
export class MdlRunFetcher {
  private client: MdlClient | null = null;
  /** Браузер не помог — второй раз за прогон не пробуем: сотня
   *  бесполезных запусков растянула бы прогон на часы. */
  private browserFailed = false;

  constructor(private readonly opts: { onNotice?: (message: string) => void } = {}) {}

  readonly fetchHtml = async (
    url: string,
    fetchOpts: { onWait?: (message: string) => void } = {},
  ): Promise<string> => {
    if (this.client) return this.client.fetchHtml(url);

    try {
      return await fetchMdlHtmlPlain(url, fetchOpts);
    } catch (e) {
      const blocked = e instanceof MdlHttpError && e.status === 403;
      if (!blocked || this.browserFailed) throw e;

      this.opts.onNotice?.(
        "MyDramaList закрылся Cloudflare-проверкой — поднимаем браузер на прогон",
      );
      const client = new MdlClient();
      try {
        await client.init();
      } catch (browserError) {
        this.browserFailed = true;
        await client.close().catch(() => {});
        const reason =
          browserError instanceof Error ? browserError.message.split("\n")[0] : String(browserError);
        throw new MdlHttpError(403, `${(e as MdlHttpError).message} (браузер не поднялся: ${reason})`);
      }
      this.client = client;
      return client.fetchHtml(url);
    }
  };

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    // Ошибку закрытия глотаем: close() зовут из finally, и падение здесь
    // подменило бы настоящую причину выхода — в том числе остановку
    // кнопкой, из-за чего прогон стал бы FAILED вместо CANCELLED.
    await client?.close().catch(() => {});
  }
}
