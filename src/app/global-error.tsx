"use client";

import { useEffect, useSyncExternalStore } from "react";
import * as Sentry from "@sentry/nextjs";

// Ловит падения корневого layout. Рендерит собственный документ:
// глобальные стили сюда не доезжают (конвенция Next), поэтому минимум
// инлайн-оформления в цветах сайта.
//
// Язык берём из адреса, а не из LocaleProvider: упал корневой layout —
// значит провайдера над нами нет. Через useSyncExternalStore, а не
// useState+useEffect: на сервере адреса нет, и серверный снимок
// («английский») даёт разметку, совпадающую с первым клиентским
// рендером, — иначе гидратация ругалась бы на расхождение.
const TEXT = {
  en: {
    title: "The site tripped",
    body: "The error report is already with us. Try reloading the page.",
    retry: "Try again",
  },
  ru: {
    title: "Сайт споткнулся",
    body: "Отчёт об ошибке уже у нас. Попробуйте обновить страницу.",
    retry: "Попробовать снова",
  },
};

// Адрес за жизнь этой страницы не меняется — подписываться не на что.
const subscribeToNothing = () => () => {};
const langFromUrl = (): "en" | "ru" =>
  /^\/ru(\/|$)/.test(window.location.pathname) ? "ru" : "en";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const lang = useSyncExternalStore(subscribeToNothing, langFromUrl, () => "en" as const);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const text = TEXT[lang];

  return (
    <html lang={lang}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0c",
          color: "#f2f0ee",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "26rem", padding: "1.5rem" }}>
          <h1 style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>
            {text.title}
          </h1>
          <p style={{ color: "#9b9894", marginBottom: "1.5rem" }}>
            {text.body}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: "#ff6a3d",
              color: "#0a0a0c",
              border: "none",
              borderRadius: "999px",
              padding: "0.6rem 1.6rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            {text.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
