"use client";

import { Children, Fragment, useState, type ReactNode } from "react";

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

  /**
   * Между тегами нужен НАСТОЯЩИЙ пробел. Массив элементов React
   * склеивает встык, а перенос строки бывает только по пробелу — и
   * строка тегов не переносилась вовсе: на телефоне она уезжала за
   * экран и тянула за собой горизонтальный скролл всей страницы
   * (жалоба владельца 2026-09-10, /dramas/muteluv — 832px при экране
   * 390px). Зазор при этом остаётся прежним: половину даёт пробел,
   * половину — margin-right в .tag-row (уменьшен на ту же величину).
   */
  const spaced = (nodes: ReactNode) =>
    Children.toArray(nodes).map((child, i) => (
      <Fragment key={i}>
        {i > 0 ? " " : null}
        {child}
      </Fragment>
    ));

  // Обычный текстовый поток, а не flex-раскладка (правка владельца
  // 2026-09-07): во flex «ещё N» — такой же элемент, как тег, и стоило
  // тегам занять строку целиком, кнопка съезжала на следующую одна.
  // В потоке она ведёт себя как последнее слово абзаца и остаётся
  // вплотную за последним тегом, где бы тот ни оказался.
  return (
    <div className="tag-row" style={{ minWidth: 0 }}>
      {spaced(visible)}
      {expanded && <> {spaced(rest)}</>}
      {rest != null && !expanded && (
        <>
          {" "}
          <button type="button" className="tag-more-link" onClick={() => setExpanded(true)}>
            {moreLabel}
          </button>
        </>
      )}
    </div>
  );
}
