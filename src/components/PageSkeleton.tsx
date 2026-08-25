"use client";

import { useT } from "@/components/LocaleProvider";

// Универсальный скелет страницы для loading.tsx: eyebrow, заголовок и
// стопка surface-строк — усреднённая форма наших списковых страниц.
// Стили — блок .skeleton-* в globals.css.
//
// Клиентский, хотя ничего интерактивного тут нет: язык нужен для
// aria-label, а брать его через getT() (то есть headers()) в фолбэке
// Suspense нельзя — Next префетчит фолбэк отдельно от запроса страницы.
export default function PageSkeleton({ rows = 6 }: { rows?: number }) {
  const t = useT();
  return (
    <div aria-busy="true" aria-label={t.widgets.loading}>
      <div className="skeleton skeleton-eyebrow" />
      <div className="skeleton skeleton-title mt-3 mb-5" />
      <div className="d-flex flex-column gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="surface d-flex align-items-center gap-3 p-3">
            <div className="skeleton skeleton-avatar flex-shrink-0" />
            <div className="flex-grow-1">
              <div className="skeleton skeleton-line mb-2" />
              <div className="skeleton skeleton-line-short" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
