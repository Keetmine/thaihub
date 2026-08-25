"use client";

import { useState, useSyncExternalStore } from "react";
import AppLink from "@/components/AppLink";
import { useT } from "@/components/LocaleProvider";
import Analytics from "@/components/Analytics";
import GoogleTagManager from "@/components/GoogleTagManager";
import GoogleAnalytics from "@/components/GoogleAnalytics";

// Куки согласия читают и другие места: instrumentation-client.ts решает
// по нему, включать ли Sentry Session Replay.
export const CONSENT_COOKIE = "cookie_consent";

export function readConsentCookie(): "all" | "necessary" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)cookie_consent=(all|necessary)/);
  return (m?.[1] as "all" | "necessary") ?? null;
}

/**
 * Баннер согласия на куки + гейт аналитики: Яндекс.Метрика (с
 * вебвизором) подключается только после «Принять все». Выбор хранится
 * год в куке cookie_consent; «Только необходимые» оставляет лишь
 * сессию и сам выбор. Пока выбор не сделан, аналитика не грузится.
 */
// Кука доступна только в браузере, поэтому читаем её через
// useSyncExternalStore: на сервере снимок — null (баннер не рендерится
// и не мигает при гидратации), на клиенте — фактический выбор. Раньше
// это делал useEffect с setState, что ловил линтер (каскадный рендер).
// Подписка пустая: кука меняется только из decide() ниже.
const noopSubscribe = () => () => {};
const clientSnapshot = (): "all" | "necessary" | "pending" =>
  readConsentCookie() ?? "pending";
const serverSnapshot = () => null;

export default function CookieConsent({
  metrikaId,
  gtmId,
  gaId,
}: {
  metrikaId: string | null;
  gtmId: string | null;
  gaId: string | null;
}) {
  const t = useT();
  const stored = useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  // Выбор, сделанный прямо сейчас, — приоритетнее снимка куки.
  const [decided, setDecided] = useState<"all" | "necessary" | null>(null);
  const choice = decided ?? stored;

  function decide(value: "all" | "necessary") {
    document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setDecided(value);
  }

  return (
    <>
      {choice === "all" && metrikaId && <Analytics id={metrikaId} />}
      {choice === "all" && gtmId && <GoogleTagManager id={gtmId} />}
      {choice === "all" && gaId && <GoogleAnalytics id={gaId} />}
      {choice === "pending" && (
        <div
          className="cookie-consent surface p-3"
          role="dialog"
          aria-label={t.legal.cookies.ariaLabel}
        >
          <p className="small mb-2">
            {t.legal.cookies.text}{" "}
            <AppLink href="/privacy" className="link-body-emphasis">
              {t.legal.cookies.link}
            </AppLink>
            .
          </p>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => decide("all")}
            >
              {t.legal.cookies.acceptAll}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => decide("necessary")}
            >
              {t.legal.cookies.necessaryOnly}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
