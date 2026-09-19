"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/LocaleProvider";

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  titleHidden,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Широкая панель (52rem вместо 32rem) — для форм с колонками,
   *  например импорт события по ссылке на /admin/events. */
  wide?: boolean;
  /** Заголовок только для чтения с экрана: панель рисует свою шапку
   *  сама (личное событие поездки — попап собран как страница события,
   *  с крупным названием и постером). Кнопка закрытия остаётся. */
  titleHidden?: boolean;
}) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Portalled to <body> — many callers render a <form> inside this modal
  // (e.g. inline "create performer" popups) while themselves sitting inside
  // a page-level <form>. Rendering inline would nest that <form> inside the
  // page's <form>, which is invalid HTML and made native submit routing
  // unreliable (observed: submitting the inner form on a fresh, empty
  // DramaForm cleared the whole page instead of just adding the performer).
  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={`modal-panel surface ${wide ? "modal-panel--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={
            titleHidden
              ? "d-flex align-items-center justify-content-end modal-close-row"
              : "d-flex align-items-center justify-content-between mb-3"
          }
        >
          <h2 className={`h6 fw-semibold mb-0 ${titleHidden ? "visually-hidden" : ""}`}>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.ui.close}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
