"use client";

import { useState, type ReactNode } from "react";

/**
 * Свёртка тегов на карточке сериала: первые N рендерит сервер, хвост
 * разворачивается по клику на неброское «ещё 12» сразу за последним
 * тегом. Никаких замеров высоты: первая версия мерила строку в
 * useEffect, и страница мигала — SSR-кадр показывал все теги, потом
 * клиент их прятал (жалоба владельца; вторая жалоба — кнопка у правого
 * края, инлайновая ссылка стоит там, где кончается текст).
 */
export default function TagRowFold({
  visible,
  rest,
  moreLabel,
}: {
  visible: ReactNode;
  /** null — прятать нечего, рендерится просто строка. */
  rest: ReactNode | null;
  moreLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="d-flex flex-wrap column-gap-2 row-gap-1" style={{ minWidth: 0 }}>
      {visible}
      {expanded && rest}
      {rest != null && !expanded && (
        <button type="button" className="tag-more-link" onClick={() => setExpanded(true)}>
          {moreLabel}
        </button>
      )}
    </div>
  );
}
