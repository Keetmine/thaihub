"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Error boundary контентной области админки: сайдбар остаётся живым,
// текст ошибки показываем как есть — здесь свои люди, а server actions
// пока бросают понятные русские throw (см. roadmap Э0.4). Проп retry —
// конвенция этой версии Next (не reset).
export default function Error({
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
    <div className="py-5 mx-auto" style={{ maxWidth: "32rem" }}>
      <span className="eyebrow">Ошибка</span>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        Раздел не открылся
      </h1>
      <p className="text-secondary mb-2">
        {error.message || "Неизвестная ошибка."}
      </p>
      {error.digest && (
        <p className="small text-secondary mb-4">
          Код для поиска в /admin/errors: {error.digest}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary rounded-pill px-4"
        onClick={() => retry()}
      >
        Попробовать снова
      </button>
    </div>
  );
}
