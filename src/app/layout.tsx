import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import CookieConsent from "@/components/CookieConsent";

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

export const metadata: Metadata = {
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
  description:
    "Трекер концертов, фанмитов и сериалов тайских BL-актёров: расписание событий, профили актёров, места съёмок.",
  applicationName: SITE_NAME,
  appleWebApp: {
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ru_RU",
    url: SITE_URL,
    title: SITE_NAME,
    description:
      "Трекер концертов, фанмитов и сериалов тайских BL-актёров: расписание событий, профили актёров, места съёмок.",
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    images: ["/og-default.png"],
  },
};

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      data-bs-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-100`}
    >
      <body className="d-flex flex-column min-vh-100">
        <ServiceWorkerRegistrar />
        {children}
        {/* Баннер согласия + аналитика: Метрика грузится только после
            «Принять все» (см. CookieConsent). */}
        <CookieConsent metrikaId={process.env.YANDEX_METRIKA_ID ?? null} />
      </body>
    </html>
  );
}
