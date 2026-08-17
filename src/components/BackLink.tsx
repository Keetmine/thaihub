"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Контекстный «назад» для страниц сущностей: если пользователь пришёл
// внутри сайта (глубина внутренней навигации > 1, считает
// NavDepthTracker) — клик ведёт на предыдущую страницу, иначе — на
// каталог-фолбэк. Так «сериал → актёр → назад» возвращает на актёра.
//
// Всегда рендерится один и тот же <Link> (никаких свапов элементов
// после маунта — от них навигация «скакала»); отличается только текст,
// который известен уже при гидрации (ленивый useState) — единственный
// законный SSR↔клиент дифф гасится suppressHydrationWarning.
export default function BackLink({
  fallbackHref,
  fallbackLabel,
}: {
  fallbackHref: string;
  fallbackLabel: string;
}) {
  const router = useRouter();
  const [canGoBack] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const depth = Number(sessionStorage.getItem("nav-depth") ?? "0");
      return depth > 1 && window.history.length > 1;
    } catch {
      return false;
    }
  });

  return (
    <Link
      href={fallbackHref}
      className="eyebrow text-decoration-none"
      onClick={(e) => {
        if (canGoBack) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      <span suppressHydrationWarning>{canGoBack ? "← Назад" : fallbackLabel}</span>
    </Link>
  );
}
