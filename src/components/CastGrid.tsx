"use client";

import { Children, useState, type ReactNode } from "react";
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
}: {
  children: ReactNode;
  limit?: number;
  /** Мельче карточки — для составов события. */
  compact?: boolean;
  /** Капсулы в ряд (EntityMiniCard row) вместо фото-сетки. */
  chips?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  // Прятать за кнопкой одну-две карточки глупо — тогда сразу все.
  const collapsed = !expanded && items.length > limit + 2;
  return (
    <>
      <div className={chips ? "d-flex flex-wrap gap-2" : `cast-grid ${compact ? "cast-grid-sm" : ""}`}>
        {collapsed ? items.slice(0, limit) : items}
      </div>
      {collapsed && (
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
