"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/components/LocaleProvider";

/** Э2ф: адаптивная фото-сетка состава (.cast-grid) с кнопкой
 *  «Показать всех (N)». Дети — готовые карточки (EntityMiniCard
 *  variant="grid"), сетка показывает первые `limit`, остальное
 *  раскрывается кнопкой. Клиентский компонент вместо details/summary:
 *  details не умеет продолжать grid-раскладку соседа, а карточки за
 *  ним выпадали бы из общей сетки. */
export default function CastGrid({
  children,
  limit = 14,
  compact = false,
  chips = false,
  clampRows,
}: {
  children: ReactNode;
  limit?: number;
  /** Мельче карточки — для составов события. */
  compact?: boolean;
  /** Капсулы в ряд (EntityMiniCard row) вместо фото-сетки. */
  chips?: boolean;
  /** Только для chips: свернуть до N РЯДОВ по фактической высоте, а не
   *  до числа карточек — капсулы разной ширины, и счётчиком ряды не
   *  угадать (просьба владельца: у события максимум два ряда). */
  clampRows?: number;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Есть ли за клэмпом спрятанное — решает, рисовать ли кнопку.
  const [overflowing, setOverflowing] = useState(false);
  const items = Children.toArray(children);

  const rowClamp = chips && clampRows ? clampRows : null;

  useEffect(() => {
    if (!rowClamp || expanded) return;
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      // Высота N рядов из фактической высоты капсулы + зазор gap-2.
      const gap = 8;
      el.style.maxHeight = `${first.offsetHeight * rowClamp + gap * (rowClamp - 1)}px`;
      setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowClamp, expanded, items.length]);

  // Клэмп по рядам показывает ВСЕ капсулы и режет высотой; счётчик
  // limit остаётся для фото-сетки и капсул без clampRows.
  const collapsed = !rowClamp && !expanded && items.length > limit + 2;
  const showButton = rowClamp ? overflowing && !expanded : collapsed;

  return (
    <>
      <div
        ref={wrapRef}
        className={
          chips
            ? `d-flex flex-wrap gap-2${rowClamp && !expanded ? " cast-chips-clamp" : ""}`
            : `cast-grid ${compact ? "cast-grid-sm" : ""}`
        }
      >
        {collapsed ? items.slice(0, limit) : items}
      </div>
      {showButton && (
        <div className="mt-3">
          <button
            type="button"
            className="btn-link-accent"
            onClick={() => setExpanded(true)}
          >
            {t.catalog.showAll(items.length)}
          </button>
        </div>
      )}
    </>
  );
}
