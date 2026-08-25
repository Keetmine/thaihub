"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/LocaleProvider";

/** Свёртка длинного текста в details/summary (CSS — .synopsis-fold в
 *  globals.css). Клиентская обёртка нужна ради одного: «Читать дальше»
 *  не должно показываться, когда текст целиком влез в кламп — CSS сам
 *  переполнение не видит, поэтому после монтирования меряем его.
 *
 *  Подпись переключателя рисуем текстом, а не через content в CSS:
 *  строка должна приходить из словаря языка. Оформление — в
 *  .synopsis-toggle-label в globals.css. */
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
      if (!el.closest("details")?.open) {
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
    <details
      className="synopsis-fold"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span ref={spanRef} className={`synopsis-text ${textClassName}`} style={style}>
          {text}
        </span>
        <span className="synopsis-toggle-label">{open ? t.common.less : t.common.more}</span>
      </summary>
    </details>
  );
}
