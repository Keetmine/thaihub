// SEO-хелперы открытого каталога: базовый URL, сборка метаданных и
// JSON-LD-строители. generateMetadata живут в самих страницах, отсюда
// берут общий формат.

import type { Metadata } from "next";

export const SITE_URL = process.env.SITE_URL ?? "https://myblhub.com";
export const SITE_NAME = "MyBLHub";

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
export function pageMetadata(input: {
  title?: string;
  description: string;
  path?: string;
  image?: string | null;
  /** Профиль актёра/страница сериала — «article», остальное «website». */
  type?: "website" | "article";
  /** Личные страницы: в поиске им делать нечего. */
  noIndex?: boolean;
}): Metadata {
  // В metadata.title кладём ТОЛЬКО свою часть: суффикс « — MyBLHub»
  // дописывает title.template из корневого layout, иначе он попадал в
  // заголовок дважды. А вот в OpenGraph шаблон не применяется — там
  // нужно полное название.
  const fullTitle = pageTitle(input.title);
  const url = `${SITE_URL}${input.path ?? ""}`;
  const image = absoluteImage(input.image) ?? `${SITE_URL}/og-default.png`;

  return {
    ...(input.title ? { title: input.title } : {}),
    description: input.description,
    alternates: { canonical: url },
    ...(input.noIndex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: fullTitle,
      description: input.description,
      url,
      siteName: SITE_NAME,
      locale: "ru_RU",
      type: input.type ?? "website",
      images: [{ url: image, width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: input.description,
      images: [image],
    },
  };
}

/** Абсолютный URL картинки: соцсети относительные пути не понимают. */
export function absoluteImage(src?: string | null): string | null {
  if (!src) return null;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  return `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
}

export function personJsonLd(p: {
  name: string;
  realName: string | null;
  photoUrl: string | null;
  birthDate: Date | null;
  slug: string | null;
  id: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.name,
    ...(p.realName ? { alternateName: p.realName } : {}),
    ...(p.photoUrl ? { image: `${SITE_URL}${p.photoUrl}` } : {}),
    ...(p.birthDate ? { birthDate: p.birthDate.toISOString().slice(0, 10) } : {}),
    url: `${SITE_URL}/artists/${p.slug ?? p.id}`,
  };
}

export function tvSeriesJsonLd(d: {
  title: string;
  synopsis: string | null;
  posterUrl: string | null;
  year: number | null;
  slug: string | null;
  id: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: d.title,
    ...(d.synopsis ? { description: d.synopsis.slice(0, 500) } : {}),
    ...(d.posterUrl ? { image: `${SITE_URL}${d.posterUrl}` } : {}),
    ...(d.year ? { datePublished: String(d.year) } : {}),
    url: `${SITE_URL}/dramas/${d.slug ?? d.id}`,
  };
}

/** <script type="application/ld+json"> без клиентского кода. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
