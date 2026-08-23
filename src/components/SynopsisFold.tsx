"use client";

import { useEffect, useRef, useState } from "react";

/** Свёртка длинного текста в details/summary (CSS — .synopsis-fold в
 *  globals.css). Клиентская обёртка нужна ради одного: «Читать дальше»
 *  не должно показываться, когда текст целиком влез в кламп — CSS сам
 *  переполнение не видит, поэтому после монтирования меряем его. */
export default function SynopsisFold({
  text,
  textClassName = "text-secondary",
  preLine,
}: {
  text: string;
  textClassName?: string;
  preLine?: boolean;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [clamped, setClamped] = useState(true);

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
    <details className="synopsis-fold">
      <summary>
        <span ref={spanRef} className={`synopsis-text ${textClassName}`} style={style}>
          {text}
        </span>
        <span className="synopsis-toggle" />
      </summary>
    </details>
  );
}
