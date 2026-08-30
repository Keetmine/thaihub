import sanitizeHtml from "sanitize-html";

// Санитизация HTML вики-статей. Пишут статьи только админы, но
// «только админы» — не защита: угнанная админская сессия или вставка
// скопированного откуда-то HTML в contenteditable-редактор доносит
// разметку до dangerouslySetInnerHTML на публичной странице как есть.
// Поэтому чистим ДВАЖДЫ — на сохранении (actions.ts) и на рендере
// (/wiki/[slug]): второй пояс делает безопасными и статьи, сохранённые
// до появления санитайзера, без миграции по базе.
//
// Allowlist собран по тому, что реально генерит RichTextEditor
// (contenteditable + execCommand): p/div/br, h2/h3, b/i/u (Chrome даёт
// именно их, но strong/em оставлены на случай вставки), списки, ссылка,
// картинка через /api/upload (с инлайновым style max-width/border-radius),
// цвет текста (font[color] или span[style]) и фон-выделение
// (span[style background-color]). Плюс h4 и blockquote — на вырост.

/** Цвета из палитры редактора — hex; rgb()/имя переживают копипасту. */
const COLOR_VALUES = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/, /^[a-z]+$/i];
const SIZE_VALUES = [/^[\d.]+(?:px|rem|em|%)$/];

export function sanitizeWikiHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "div",
      "h2", "h3", "h4",
      "ul", "ol", "li",
      "b", "strong", "i", "em", "u", "s",
      "a", "img", "blockquote", "span",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "loading", "decoding", "style"],
      span: ["style"],
    },
    // href: http/https или относительный (внутренние /wiki/…);
    // javascript: и data: отваливаются на проверке схемы.
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    // style-атрибут разбирается и пересобирается из allowlist свойств —
    // никакие on*-атрибуты и посторонний CSS (position, url(...)) не
    // выживают: on* просто не в allowedAttributes, а стили не из списка
    // ниже выбрасываются при пересборке.
    allowedStyles: {
      "*": { color: COLOR_VALUES, "background-color": COLOR_VALUES },
      img: { "max-width": SIZE_VALUES, "border-radius": SIZE_VALUES },
    },
    transformTags: {
      // execCommand("foreColor") в части браузеров даёт <font color> —
      // переводим в span[style], чтобы значение прошло проверку цвета.
      font: (_tag, attribs) => {
        const out: Record<string, string> = {};
        if (attribs.color) out.style = `color:${attribs.color}`;
        return { tagName: "span", attribs: out };
      },
      // Картинки — только свои (/uploads/…) или https: чужой http-src
      // был бы mixed content, а протокольные трюки — дырой.
      img: (_tag, attribs) => {
        const src = attribs.src ?? "";
        if (src.startsWith("/uploads/") || src.startsWith("https://")) {
          return { tagName: "img", attribs };
        }
        const rest = { ...attribs };
        delete rest.src;
        return { tagName: "img", attribs: rest };
      },
    },
    // Картинка, оставшаяся без src после проверки выше, — мусор.
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}
