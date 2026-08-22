"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Analytics from "@/components/Analytics";

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
export default function CookieConsent({ metrikaId }: { metrikaId: string | null }) {
  // null до маунта — на сервере куки не читаем, баннер не мигает.
  const [choice, setChoice] = useState<"all" | "necessary" | "pending" | null>(null);

  useEffect(() => {
    setChoice(readConsentCookie() ?? "pending");
  }, []);

  function decide(value: "all" | "necessary") {
    document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setChoice(value);
  }

  return (
    <>
      {choice === "all" && metrikaId && <Analytics id={metrikaId} />}
      {choice === "pending" && (
        <div className="cookie-consent surface p-3" role="dialog" aria-label="Куки">
          <p className="small mb-2">
            Мы используем куки: необходимые — для входа и работы сайта, и
            аналитические (Яндекс.Метрика) — чтобы понимать, чем
            пользуются. Подробнее —{" "}
            <Link href="/privacy" className="link-body-emphasis">
              в политике конфиденциальности
            </Link>
            .
          </p>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => decide("all")}
            >
              Принять все
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => decide("necessary")}
            >
              Только необходимые
            </button>
          </div>
        </div>
      )}
    </>
  );
}
