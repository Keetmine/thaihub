"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Строка тегов со свёрткой до ОДНОЙ строки (просьба владельца: у MDL
 * тегов десятки, и чипы раздували карточку сериала). Не влезло — рядом
 * появляется «показать все», по клику разворачивается целиком.
 *
 * Меряем фактическую высоту (первый тег = высота строки), как капсулы
 * состава в CastGrid: теги разной ширины, счётчиком строку не угадать.
 * Рендерится двумя соседями во flex-строке родителя: обрезанный
 * контейнер + кнопка.
 */
export default function TagRowFold({
  children,
  moreLabel,
}: {
  children: ReactNode;
  moreLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (expanded) {
      el.style.maxHeight = "";
      return;
    }
    const apply = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      el.style.maxHeight = `${first.offsetHeight}px`;
      setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  return (
    <>
      <div
        ref={ref}
        className="d-flex flex-wrap column-gap-2 row-gap-1"
        style={{ minWidth: 0, overflow: expanded ? undefined : "hidden" }}
      >
        {children}
      </div>
      {overflowing && !expanded && (
        <button
          type="button"
          className="btn-link-accent flex-shrink-0"
          onClick={() => setExpanded(true)}
        >
          {moreLabel}
        </button>
      )}
    </>
  );
}
