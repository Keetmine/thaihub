"use client";

// Подпись — showAllItems, а не showAll: «Показать всех» сказано про
// людей (состав актёров), а список тут из песен (правка владельца).
import { useState, type ReactNode } from "react";
import { useT } from "@/components/LocaleProvider";

/**
 * Свёртка длинного вертикального списка на странице артиста: первые N
 * строк рендерит сервер, хвост разворачивается по «Показать все (N)».
 * Нужна дискографии — у музыканта бывает под полсотни песен, и страница
 * уходила в бесконечность (жалоба владельца на /artists/1mill).
 *
 * Манера та же, что у `TagRowFold` (обе половины приходят готовыми с
 * сервера, клиент только переключает) и у `CastGrid`/`EpisodeSchedule`
 * (кнопка `btn-link-accent` под списком, подпись со счётчиком из
 * словаря). Замеров высоты нет намеренно: они дают моргание — SSR-кадр
 * показывает всё, потом клиент прячет.
 */
export default function ListFold({
  visible,
  rest,
  total,
  className,
}: {
  visible: ReactNode;
  /** null — прятать нечего, кнопки не будет. */
  rest: ReactNode | null;
  total: number;
  className?: string;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className={className}>
        {visible}
        {expanded && rest}
      </div>
      {rest != null && !expanded && (
        <button
          type="button"
          className="btn-link-accent mt-2"
          onClick={() => setExpanded(true)}
        >
          {t.catalog.showAllItems(total)}
        </button>
      )}
    </>
  );
}
