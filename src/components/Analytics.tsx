import Script from "next/script";

/**
 * Счётчик Яндекс.Метрики. Номер берётся из env (YANDEX_METRIKA_ID) —
 * без него ничего не рендерится, поэтому в разработке и на превью
 * статистика не пачкается тестовыми визитами.
 *
 * `afterInteractive` — скрипт грузится после того, как страница стала
 * интерактивной: счётчик не должен задерживать отрисовку.
 */
export default function Analytics() {
  const id = process.env.YANDEX_METRIKA_ID;
  if (!id) return null;

  return (
    <>
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
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${id}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
