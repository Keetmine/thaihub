"use client";

import Script from "next/script";

/**
 * Google Analytics 4 (gtag.js). Как Метрика и GTM — только после
 * «Принять все»: счётчик ставит свои куки, а /privacy обещает, что
 * аналитика не грузится до согласия.
 *
 * NB: тот же GA4 можно подключить и внутри контейнера GTM. Если так
 * сделать, просмотры посчитаются дважды — держите поток в одном месте.
 */
export default function GoogleAnalytics({ id }: { id: string }) {
  return (
    <>
      <Script
        id="ga4-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}');
        `}
      </Script>
    </>
  );
}
