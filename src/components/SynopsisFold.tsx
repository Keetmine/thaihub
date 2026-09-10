"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/LocaleProvider";

/**
 * Свёртка длинного текста: закрытый клампится на 4 строки, открытый
 * показывается целиком (CSS — `.synopsis-fold` в globals.css).
 *
 * Переключает ТОЛЬКО кнопка «Читать дальше». Раньше это были
 * `details`/`summary` с текстом внутри `summary` — и клик по любому
 * месту описания схлопывал его: человек вёл мышью по тексту, чтобы
 * скопировать, а текст закрывался у него под рукой (жалоба владельца
 * 2026-09-10). Держать текст вне `summary` нельзя было тоже: контент
 * `details` в закрытом виде не рендерится вовсе, а нам нужен видимый
 * кламп. Поэтому от `details` отказались совсем.
 *
 * Клиентский компонент нужен и ради второго: «Читать дальше» не должно
 * показываться, когда текст целиком влез в кламп — CSS переполнение не
 * видит, поэтому после монтирования меряем его.
 *
 * Подпись переключателя рисуем текстом, а не через `content` в CSS:
 * строка приходит из словаря языка.
 */
export default function SynopsisFold({
  text,
  textClassName = "text-secondary",
  preLine,
}: {
  text: string;
  textClassName?: string;
  preLine?: boolean;
}) {
  const t = useT();
  const spanRef = useRef<HTMLSpanElement>(null);
  const [clamped, setClamped] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    const measure = () => {
      // Мерить можно только пока свёрнуто: в открытом виде клампа нет.
      if (el.closest(".synopsis-fold")?.getAttribute("data-open") !== "true") {
        setClamped(el.scrollHeight > el.clientHeight + 1);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const style = preLine ? ({ whiteSpace: "pre-line" } as const) : undefined;

  if (!clamped) {
    return (
      <p className={`${textClassName} mb-0`} style={style}>
        {text}
      </p>
    );
  }

  return (
    <div className="synopsis-fold" data-open={open ? "true" : "false"}>
      <span ref={spanRef} className={`synopsis-text ${textClassName}`} style={style}>
        {text}
      </span>
      <button
        type="button"
        className="synopsis-toggle-label"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t.common.less : t.common.more}
      </button>
    </div>
  );
}
