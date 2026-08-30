import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import {
  SITE_URL,
  SITE_NAME,
  ogLocale,
  JsonLd,
  websiteJsonLd,
  organizationJsonLd,
} from "@/lib/seo";
import CookieConsent from "@/components/CookieConsent";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getLocale, getT, localeHref } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

// Метаданные по умолчанию собираются на запрос, а не лежат статикой:
// описание и og:locale зависят от языка зрителя, а он приходит
// заголовком от proxy. Статический экспорт отдавал русское описание
// всем страницам, которые не зовут pageMetadata, — то есть и
// английской версии в выдаче и в превью ссылок.
//
// Канонический адрес и hreflang здесь НЕ задаём намеренно: layout один
// на все страницы, и canonical из него унаследовали бы все разделы без
// своих метаданных, указав на главную. Их собирает pageMetadata()
// в src/lib/seo.tsx — по адресу конкретной страницы.
export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getT();
  return {
    // metadataBase обязателен: без него относительные пути в openGraph
    // остаются относительными, и Telegram с поисковиками картинку не
    // подтягивают.
    metadataBase: new URL(SITE_URL),
    title: {
      default: SITE_NAME,
      // Страницы задают только свою часть — «Актёры», «Pit Babe»;
      // название сайта дописывается здесь (см. pageTitle в lib/seo).
      template: `%s — ${SITE_NAME}`,
    },
    description: t.ui.siteDescription,
    applicationName: SITE_NAME,
    appleWebApp: {
      title: SITE_NAME,
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: "/icons/icon-192.png",
      // Отдельный файл 180×180 (штатный размер apple-touch-icon),
      // сгенерирован из icons/icon-512.png. iOS скруглит углы сам.
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      // Та же пара, что и в pageMetadata (src/lib/seo.tsx): у страниц
      // со своими метаданными og:locale ставит она.
      locale: ogLocale(locale),
      url: `${SITE_URL}${localeHref("/", locale)}`,
      title: SITE_NAME,
      description: t.ui.siteDescription,
      images: [{ url: "/og-default.png", width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: t.ui.siteDescription,
      images: ["/og-default.png"],
    },
  };
}

export const viewport: Viewport = {
  // Фактический фон сайта (--bs-body-bg) — старый #160a1c остался от
  // фиолетовой темы и красил панель браузера в чужой цвет.
  themeColor: "#0a0a0c",
  // width/initialScale задаём ЯВНО: кастомный viewport-export заменяет
  // дефолтную мету целиком, и без них мобильные рендерили страницу в
  // 1280px (проверено на 390px-вьюпорте).
  width: "device-width",
  initialScale: 1,
  // Без viewport-fit=cover env(safe-area-inset-bottom) на iOS всегда 0 —
  // а на него опираются нижний таб-бар и шторка мобильной навигации.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      data-bs-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-100`}
    >
      <body className="d-flex flex-column min-vh-100">
        {/* WebSite (+SearchAction) и Organization — здесь, потому что
            layout один на весь сайт и оба языка: скрипты рендерятся
            ровно один раз на страницу. Сущности общие, url без /ru —
            русская версия принадлежит той же организации. */}
        <JsonLd data={websiteJsonLd()} />
        <JsonLd data={organizationJsonLd()} />
        <ServiceWorkerRegistrar />
        {/* Язык зрителя доступен всем клиентским компонентам — как
            таймзона. Значение приходит из заголовка, который ставит
            proxy (из пути его не прочитать: русские страницы —
            рерайт). */}
        <LocaleProvider locale={locale}>
          {children}
          {/* Баннер согласия + аналитика: Метрика и Google Tag Manager
              грузятся только после «Принять все» (см. CookieConsent).
              Внутри провайдера — баннеру нужен язык зрителя. */}
          <CookieConsent
            metrikaId={process.env.YANDEX_METRIKA_ID ?? null}
            gtmId={process.env.GTM_ID ?? null}
            gaId={process.env.GA_MEASUREMENT_ID ?? null}
          />
        </LocaleProvider>
      </body>
    </html>
  );
}
