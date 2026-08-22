"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Ловит падения корневого layout. Рендерит собственный документ:
// глобальные стили сюда не доезжают (конвенция Next), поэтому минимум
// инлайн-оформления в цветах сайта.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
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
            Сайт споткнулся
          </h1>
          <p style={{ color: "#9b9894", marginBottom: "1.5rem" }}>
            Отчёт об ошибке уже у нас. Попробуйте обновить страницу.
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
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
