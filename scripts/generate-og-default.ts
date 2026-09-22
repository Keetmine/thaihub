/**
 * Пересобирает `public/og-default.png` — картинку, которую видят в
 * превью ссылки на сайт (мессенджеры, соцсети, выдача поиска). Запасная
 * на весь сайт: у страниц с постером своя, см. `src/lib/seo.tsx`.
 *
 * Рисуется в настоящем браузере, а не в SVG-рендерере: так знак, шрифты
 * и фон — те же самые, что на сайте, и картинка не расходится с ним при
 * следующей правке. Источники берём из проекта:
 *  - знак: `public/icons/logo.svg` (он же фавикон, src/app/icon.svg);
 *  - фон: база `--bs-body-bg` и градиенты `.ambient-wash` из globals.css;
 *  - шрифт: Space Grotesk, как `--font-display`;
 *  - подписи: разделы из словаря `nav` и короткое описание сайта.
 *
 * Запуск (нужен интернет — шрифт тянется из Google Fonts):
 *   npx tsx scripts/generate-og-default.ts
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "public/og-default.png";
const WIDTH = 1200;
const HEIGHT = 630;

/** Разделы сайта — как в шапке (src/lib/i18n/ru/nav.ts). Пять, а не
 *  все: в одну строку больше не помещается, а перенос одного чипа на
 *  вторую строку выглядит обрывком. */
const SECTIONS = ["Афиша", "Артисты", "Каталог", "Локации", "Поездки"];
/** Короткое описание — из ui.siteDescription, без перечисления после двоеточия. */
const TAGLINE = "Концерты, фанмиты и сериалы актёров";

async function main() {
  const logo = readFileSync("public/icons/logo.svg", "utf8");

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Geist:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    /* Те же цвета, что у сайта: --bs-body-bg и --bs-body-color. */
    background: #0a0a0c; color: #f2f0ee;
    font-family: "Geist", system-ui, sans-serif;
  }
  /* Копия .ambient-wash из globals.css, пересчитанная из rem в пиксели
     под 1200×630: оранжевые пятна сверху, едва заметный холодный низ. */
  .wash {
    position: absolute; inset: 0;
    background:
      radial-gradient(1040px 640px at 100% -15%, rgba(255, 106, 61, 0.26), transparent 65%),
      radial-gradient(720px 480px at -15% 30%, rgba(255, 106, 61, 0.15), transparent 60%),
      radial-gradient(450px 320px at 50% -8%, rgba(255, 106, 61, 0.22), transparent 55%),
      radial-gradient(830px 580px at 88% 108%, rgba(200, 80, 190, 0.10), transparent 60%),
      radial-gradient(700px 480px at -8% 105%, rgba(120, 90, 255, 0.08), transparent 60%);
  }
  /* Точечная сетка — как .ambient-wash::before, чтобы фон не был плоским. */
  .grain {
    position: absolute; inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.028) 1px, transparent 1px);
    background-size: 3px 3px;
  }
  .row { position: relative; display: flex; align-items: center; gap: 52px; height: 100%; padding: 0 76px; }
  .mark { width: 232px; height: 232px; flex: 0 0 232px; }
  .mark svg { width: 100%; height: 100%; display: block; border-radius: 52px; }
  .wordmark {
    font-family: "Space Grotesk", system-ui, sans-serif;
    font-weight: 700; font-size: 84px; letter-spacing: -0.02em; line-height: 1;
  }
  .wordmark b { color: #ff6a3d; font-weight: 700; }
  .tagline { margin-top: 18px; font-size: 30px; color: #a6a3a0; }
  .chips { margin-top: 30px; display: flex; flex-wrap: wrap; gap: 10px; }
  .chip {
    font-size: 20px; color: #d8d5d2; white-space: nowrap;
    padding: 9px 17px; border-radius: 999px;
    background: #141417; border: 1px solid rgba(255,255,255,0.09);
  }
</style></head>
<body>
  <div class="wash"></div>
  <div class="grain"></div>
  <div class="row">
    <div class="mark">${logo}</div>
    <div>
      <div class="wordmark">My<b>BL</b>Hub</div>
      <div class="tagline">${TAGLINE}</div>
      <div class="chips">${SECTIONS.map((s) => `<span class="chip">${s}</span>`).join("")}</div>
    </div>
  </div>
</body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  // Шрифт мог не успеть примениться — ждём его явно, иначе надпись
  // отрисуется системным и картинка разойдётся с сайтом.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: "png" });
  await browser.close();
  console.log(`Готово: ${OUT} (${WIDTH}×${HEIGHT})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
