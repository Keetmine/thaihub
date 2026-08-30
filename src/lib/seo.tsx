// SEO-хелперы открытого каталога: базовый URL, сборка метаданных и
// JSON-LD-строители. generateMetadata живут в самих страницах, отсюда
// берут общий формат.

import type { Metadata } from "next";
import { LOCALES, localeHref, type Locale } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n";

export const SITE_URL = process.env.SITE_URL ?? "https://myblhub.com";
export const SITE_NAME = "MyBLHub";

/** Язык страницы в формате OpenGraph. Отдельной функцией, потому что
 *  нужен и здесь, и в корневом layout: разъехавшиеся написания
 *  («ru» вместо «ru_RU») соцсети молча игнорируют. */
export function ogLocale(locale: Locale): string {
  return locale === "ru" ? "ru_RU" : "en_US";
}

/** Заголовок вкладки и выдачи: «Что за страница — MyBLHub». Название
 *  сайта в конце, потому что в узкой вкладке и в поиске первым читается
 *  начало строки, а оно у каждой страницы своё. */
export function pageTitle(title?: string): string {
  return title ? `${title} — ${SITE_NAME}` : SITE_NAME;
}

/**
 * Единая сборка метаданных страницы: title, description, канонический
 * адрес и карточка для соцсетей. Telegram, VK и поисковики читают
 * OpenGraph, поэтому картинку и описание задаём здесь один раз, а не
 * копируем по страницам.
 *
 * `image` принимает путь вида /uploads/… — он разворачивается в
 * абсолютный, иначе Telegram картинку не подтянет.
 */
export async function pageMetadata(input: {
  title?: string;
  description: string;
  path?: string;
  image?: string | null;
  /** Профиль актёра/страница сериала — «article», остальное «website». */
  type?: "website" | "article";
  /** Личные страницы: в поиске им делать нечего. */
  noIndex?: boolean;
  /**
   * Язык страницы. Влияет на canonical (у русской версии он свой, с
   * префиксом /ru), на hreflang-пару и на og:locale. Без этого
   * поисковик считал бы две языковые версии дублями и выбирал бы одну
   * сам.
   */
  locale?: Locale;
  /**
   * Фактические размеры картинки, если страница их знает. Когда `image`
   * задан, а размеры нет — width/height НЕ пишем вовсе: у деталок
   * картинка портретная (постер, фото актёра), и враньё «1200×630»
   * хуже отсутствия — Facebook/VK по этим числам режут превью, а
   * Telegram и WhatsApp размер меряют сами по файлу. Для дефолтной
   * og-картинки размеры известны и проставляются.
   */
  imageSize?: { width: number; height: number };
}): Promise<Metadata> {
  // Язык берём сами: все вызовы живут в асинхронных generateMetadata, и
  // прокидывать его из каждой страницы значило бы забыть в половине —
  // а забытый язык это canonical русской страницы, указывающий на
  // английскую, то есть выпадение из индекса.
  const locale = input.locale ?? (await getLocale());
  // В metadata.title кладём ТОЛЬКО свою часть: суффикс « — MyBLHub»
  // дописывает title.template из корневого layout, иначе он попадал в
  // заголовок дважды. А вот в OpenGraph шаблон не применяется — там
  // нужно полное название.
  const fullTitle = pageTitle(input.title);
  const path = input.path && input.path !== "" ? input.path : "/";
  const url = `${SITE_URL}${localeHref(path, locale)}`;
  // hreflang показывает поисковику обе версии и их языки; x-default —
  // куда вести тех, чей язык не совпал ни с одним (у нас английский).
  const languages = Object.fromEntries(
    LOCALES.map((l) => [l, `${SITE_URL}${localeHref(path, l)}`]),
  );
  const image = absoluteImage(input.image);
  // Своя картинка страницы — с размерами только если их передали;
  // запасная og-default.png — всегда 1200×630, это её реальный размер.
  const ogImage = image
    ? { url: image, ...(input.imageSize ?? {}), alt: fullTitle }
    : { url: `${SITE_URL}/og-default.png`, width: 1200, height: 630, alt: fullTitle };

  return {
    ...(input.title ? { title: input.title } : {}),
    description: input.description,
    alternates: {
      canonical: url,
      languages: { ...languages, "x-default": `${SITE_URL}${path}` },
    },
    ...(input.noIndex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: fullTitle,
      description: input.description,
      url,
      siteName: SITE_NAME,
      locale: ogLocale(locale),
      type: input.type ?? "website",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: input.description,
      images: [ogImage.url],
    },
  };
}

/** Абсолютный URL картинки: соцсети относительные пути не понимают. */
export function absoluteImage(src?: string | null): string | null {
  if (!src) return null;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  return `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
}

/**
 * Все поля после id — опциональные НАМЕРЕННО: страницы передают сюда
 * готовый объект Prisma целиком, и когда выборка страницы уже включает
 * `links` (страница артиста включает), sameAs собирается сам, без
 * лишних запросов и без правки страниц. Где данных нет — поля просто
 * не выводятся.
 */
export function personJsonLd(p: {
  name: string;
  realName: string | null;
  photoUrl: string | null;
  birthDate: Date | null;
  slug: string | null;
  id: string;
  /** Внешние ссылки (соцсети, профили) → schema.org sameAs. */
  links?: { url: string }[];
}) {
  // sameAs — только абсолютные http(s)-адреса, без дублей: свободные
  // подписи админки могут содержать что угодно.
  const sameAs = [
    ...new Set(
      (p.links ?? [])
        .map((l) => l.url)
        .filter((u) => u.startsWith("http://") || u.startsWith("https://")),
    ),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.name,
    ...(p.realName ? { alternateName: p.realName } : {}),
    ...(p.photoUrl ? { image: absoluteImage(p.photoUrl) } : {}),
    ...(p.birthDate ? { birthDate: p.birthDate.toISOString().slice(0, 10) } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    url: `${SITE_URL}/artists/${p.slug ?? p.id}`,
  };
}

/**
 * Обогащённые поля (genre, actor, эпизоды, страна) опциональны по той
 * же причине, что в personJsonLd: страница сериала передаёт объект
 * Prisma со своим include (там уже есть performers, genres, episodes,
 * country) — новых запросов к БД для разметки не нужно.
 */
export function tvSeriesJsonLd(d: {
  title: string;
  synopsis: string | null;
  posterUrl: string | null;
  year: number | null;
  slug: string | null;
  id: string;
  /** Жанры MDL → schema.org genre. */
  genres?: string[];
  /** Число серий → numberOfEpisodes. */
  episodes?: number | null;
  /** Страна производства («Thailand» с MDL) → countryOfOrigin. */
  country?: string | null;
  /** Каст в форме include-а страницы сериала → actor: Person[]. */
  performers?: { performer: { name: string; slug: string | null; id: string } }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: d.title,
    ...(d.synopsis ? { description: d.synopsis.slice(0, 500) } : {}),
    ...(d.posterUrl ? { image: absoluteImage(d.posterUrl) } : {}),
    ...(d.year ? { datePublished: String(d.year) } : {}),
    // Язык оригинала: каталог — тайские сериалы (лакорны).
    inLanguage: "th",
    ...(d.genres?.length ? { genre: d.genres } : {}),
    ...(d.episodes ? { numberOfEpisodes: d.episodes } : {}),
    ...(d.country ? { countryOfOrigin: { "@type": "Country", name: d.country } } : {}),
    ...(d.performers?.length
      ? {
          actor: d.performers.map(({ performer: p }) => ({
            "@type": "Person",
            name: p.name,
            url: `${SITE_URL}/artists/${p.slug ?? p.id}`,
          })),
        }
      : {}),
    url: `${SITE_URL}/dramas/${d.slug ?? d.id}`,
  };
}

/**
 * Тайское настенное время → ISO с явной зоной ICT.
 *
 * В базе лежит время «как на афише» (19:00 значит 19:00 в Бангкоке), а
 * Prisma отдаёт его как момент в UTC — поэтому компоненты берём в UTC
 * (ровно как в `src/lib/dates.ts`) и дописываем смещение Таиланда
 * вручную. Без зоны Google трактовал бы startDate как локальное время
 * читателя, и у события уезжали бы часы, а у вечерних — и дата.
 * Таиланд на летнее время не переходит, смещение постоянное.
 */
const THAI_UTC_OFFSET = "+07:00";
function thaiDateTime(d: Date, hasTime = true): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  // Событие без времени («дата уточняется») отдаём датой без часов —
  // schema.org это разрешает, а выдуманная полночь врала бы.
  return hasTime ? `${day}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00${THAI_UTC_OFFSET}` : day;
}

/**
 * schema.org/Event для страницы события. Как и у Person/TVSeries, поля
 * приходят из того же объекта Prisma, который страница уже загрузила
 * (occurrences, performers, drama) — новых запросов разметка не делает.
 *
 * Разметке подлежит ТОЛЬКО публичная часть страницы (что, когда, где,
 * кто, билеты): личные блоки за подпиской — отметки «иду», билеты
 * пользователя, заметки — в JSON-LD не попадают вовсе.
 *
 * Многодневное событие — один Event с диапазоном startDate…endDate (так
 * же, как оно живёт одной записью у нас): отдельные Event на каждую дату
 * ссылались бы на один и тот же URL и выглядели бы дублями.
 *
 * Возвращает null, если у события нет ни одной даты: startDate —
 * обязательное поле, без него разметка невалидна.
 */
export function eventJsonLd(e: {
  id: string;
  slug: string | null;
  title: string;
  venue: string;
  description: string | null;
  posterUrl: string | null;
  presaleAt: Date | null;
  presaleUrl: string | null;
  occurrences: { startsAt: Date; endsAt: Date | null; hasTime: boolean }[];
  performers?: { performer: { id: string; name: string; slug: string | null; type?: string } }[];
  drama?: { title: string; slug: string | null; id: string } | null;
}): object | null {
  const occurrences = [...e.occurrences].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const first = occurrences[0];
  if (!first) return null;
  const last = occurrences[occurrences.length - 1];
  // Конец: явный endsAt последней даты, а у многодневного без него —
  // хотя бы её начало (иначе трёхдневный фестиваль выглядит однодневным).
  const end = last.endsAt ?? (occurrences.length > 1 ? last.startsAt : null);

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: thaiDateTime(first.startsAt, first.hasTime),
    ...(end ? { endDate: thaiDateTime(end, last.hasTime) } : {}),
    // Отмен в модели нет — событие либо есть в афише, либо удалено.
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: e.venue,
      // Площадка в базе — свободная строка («Impact Arena, Muang Thong
      // Thani»), отдельных полей города/улицы нет; страна известна
      // всегда — весь каталог тайский.
      address: { "@type": "PostalAddress", streetAddress: e.venue, addressCountry: "TH" },
    },
    ...(e.posterUrl ? { image: absoluteImage(e.posterUrl) } : {}),
    ...(e.description ? { description: e.description.slice(0, 500) } : {}),
    ...(e.performers?.length
      ? {
          performer: e.performers.map(({ performer: p }) => ({
            // Группа — PerformingGroup, актёр и маскот — Person.
            "@type": p.type === "BAND" ? "PerformingGroup" : "Person",
            name: p.name,
            url: `${SITE_URL}/artists/${p.slug ?? p.id}`,
          })),
        }
      : {}),
    ...(e.drama
      ? {
          about: {
            "@type": "TVSeries",
            name: e.drama.title,
            url: `${SITE_URL}/dramas/${e.drama.slug ?? e.drama.id}`,
          },
        }
      : {}),
    // Билеты: цена в базе — свободная строка с несколькими категориями
    // («6,900 / 5,900 / 5,000 baht»), числом её не отдать, поэтому в
    // offers идут только адрес, статус и дата старта продаж.
    ...(e.presaleUrl
      ? {
          offers: {
            "@type": "Offer",
            url: e.presaleUrl,
            availability:
              e.presaleAt && e.presaleAt > new Date()
                ? "https://schema.org/PreOrder"
                : "https://schema.org/InStock",
            ...(e.presaleAt ? { validFrom: thaiDateTime(e.presaleAt) } : {}),
          },
        }
      : {}),
    url: `${SITE_URL}/event/${e.slug ?? e.id}`,
  };
}

/**
 * WebSite + SearchAction: подсказывает поисковикам сайтлинк-поиск.
 * Живёт в корневом layout — он общий на оба языка, поэтому скрипт
 * рендерится ровно один раз на страницу; сущность одна, url без
 * языкового префикса (русская версия — та же организация и тот же
 * поиск, /ru/search — рерайт на него же).
 */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Organization для панели знаний и логотипа в выдаче. Тоже в корневом
 *  layout, один раз на страницу (см. websiteJsonLd). */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
  };
}

/**
 * Хлебные крошки: `items` — путь от корня до текущей страницы, path
 * БЕЗ языкового префикса (локаль добавляется здесь через localeHref).
 * Подключён на детальных страницах каталога (сериал, артист, новелла,
 * локация, агентство). Крошка трёхступенчатая: главная → раздел →
 * запись. Видимой крошки на страницах нет — её роль играет ссылка
 * «← Все сериалы» (BackLink), и подписи ступеней намеренно повторяют
 * её текст и адрес: Google просит, чтобы разметка совпадала с видимым.
 */
export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
  locale: Locale = "en",
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${localeHref(item.path, locale)}`,
    })),
  };
}

/** <script type="application/ld+json"> без клиентского кода.
 *  `<` экранируется юникод-эскейпом (u003c): в данных бывают
 *  скрейпленные синопсисы, и буквальный закрывающий script-тег внутри
 *  JSON.stringify обрывал бы наш тег — это и
 *  XSS-дыра, и сломанная страница (бэкстоп из гайда Next по JSON-LD). */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
