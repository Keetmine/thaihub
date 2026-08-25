"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { useT } from "@/components/LocaleProvider";

// Error boundary публичной части: вместо пустого минифицированного
// экрана React — объяснение и кнопка повтора. В этой версии Next проп
// называется retry (перезапрашивает и перерисовывает сегмент), а не
// reset — см. node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/error.md.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="text-center py-5 mx-auto" style={{ maxWidth: "28rem" }}>
      <span className="eyebrow">{t.widgets.errors.errorEyebrow}</span>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        {t.widgets.errors.errorTitle}
      </h1>
      <p className="text-secondary mb-4">
        {t.widgets.errors.errorHint}
      </p>
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
