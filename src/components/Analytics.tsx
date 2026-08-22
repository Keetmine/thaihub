"use client";

import Script from "next/script";

/**
 * Счётчик Яндекс.Метрики. Рендерится ТОЛЬКО из CookieConsent после
 * согласия пользователя на аналитические куки (вебвизор пишет действия
 * на странице — без согласия такое включать нельзя). Номер счётчика
 * приходит пропом из layout (env на клиенте недоступен).
 *
 * `afterInteractive` — скрипт грузится после того, как страница стала
 * интерактивной: счётчик не должен задерживать отрисовку.
 */
export default function Analytics({ id }: { id: string }) {
  return (
    <Script id="yandex-metrika" strategy="afterInteractive">
      {`
        (function(m,e,t,r,i,k,a){
          m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
        })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${id}', 'ym');

        ym(${id}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", accurateTrackBounce:true, trackLinks:true});
      `}
    </Script>
  );
}
