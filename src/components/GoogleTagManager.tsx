"use client";

import Script from "next/script";

/**
 * Google Tag Manager. Как и Метрика, рендерится ТОЛЬКО из
 * CookieConsent после «Принять все»: GTM — контейнер, через который
 * подключается аналитика (в том числе Google Analytics с его куками), и
 * ставить его до согласия нельзя — мы сами обещаем обратное в
 * /privacy.
 *
 * Инструкция Google просит вставить фрагмент как можно ближе к началу
 * <head>, но у нас он появляется после согласия — иначе гейт не имел бы
 * смысла. На аналитику это влияет только тем, что первый заход до
 * ответа на баннер не считается.
 *
 * noscript-версию не подключаем: она грузит тот же контейнер в iframe,
 * то есть в обход согласия (а без JS согласие и не получить).
 */
export default function GoogleTagManager({ id }: { id: string }) {
  return (
    <Script id="google-tag-manager" strategy="afterInteractive">
      {`
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${id}');
      `}
    </Script>
  );
}
