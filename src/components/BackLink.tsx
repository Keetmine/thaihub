"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Контекстный «назад» для страниц сущностей: если пользователь пришёл
// внутри сайта (глубина внутренней навигации > 1, считает
// NavDepthTracker) — кнопка ведёт на предыдущую страницу (история
// браузера), иначе — на каталог-фолбэк. Так «сериал → актёр → назад»
// возвращает на актёра, а не в общий список.
export default function BackLink({
  fallbackHref,
  fallbackLabel,
}: {
  fallbackHref: string;
  fallbackLabel: string;
}) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // setState не синхронно в эффекте (правило react-hooks) — через rAF.
    const raf = requestAnimationFrame(() => {
      try {
        const depth = Number(sessionStorage.getItem("nav-depth") ?? "0");
        if (depth > 1 && window.history.length > 1) setCanGoBack(true);
      } catch {
        // sessionStorage недоступен — остаёмся на фолбэке
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  if (canGoBack) {
    return (
      <button
        type="button"
        className="eyebrow text-decoration-none border-0 bg-transparent p-0"
        onClick={() => router.back()}
      >
        ← Назад
      </button>
    );
  }
  return (
    <Link href={fallbackHref} className="eyebrow text-decoration-none">
      {fallbackLabel}
    </Link>
  );
}
