"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  setDramaWatchStatus,
  clearDramaWatchStatus,
  type DramaWatchStatusValue,
} from "@/app/(public)/favorites/actions";
import { WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { useT } from "@/components/LocaleProvider";
import { CheckIcon, PencilIcon, PlusIcon } from "@/components/icons";

/** Compact icon-button replacement for the drama heart/favorite toggle:
 *  a "+" when no watch status is set yet, a pencil once one is — both open
 *  the same small status-picker dropdown. Used everywhere a drama shows up
 *  as a row/card (list pages, a performer's or agency's filmography). */
export default function DramaStatusButton({
  dramaId,
  status,
  className,
}: {
  dramaId: string;
  status: DramaWatchStatusValue | null;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    }
    // Скролл (в т.ч. внутренний скролл постер-ряда) уводит кнопку из-под
    // fixed-меню — просто закрываем его.
    function onScroll() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  async function choose(value: DramaWatchStatusValue | null) {
    setIsOpen(false);
    setIsSubmitting(true);
    try {
      if (value === null) {
        await clearDramaWatchStatus(dramaId);
      } else {
        await setDramaWatchStatus(dramaId, value);
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  const label = status
    ? t.catalog.watchStatusIs(t.catalog.watchStatus[status])
    : t.catalog.watchStatusSet;

  return (
    <div className={`drama-status-btn ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        className={`round-icon-btn ${status ? "is-accent" : ""}`}
        disabled={isSubmitting}
        aria-expanded={isOpen}
        aria-label={label}
        data-tooltip={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Fixed-координаты: ряды постеров скроллятся по горизонтали
          // (overflow), absolute-дропдаун ими обрезался.
          const rect = e.currentTarget.getBoundingClientRect();
          setCoords({
            top: rect.bottom + 6,
            left: Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)),
          });
          setIsOpen((v) => !v);
        }}
      >
        {status ? <PencilIcon /> : <PlusIcon />}
      </button>

      {/* Портал в body: у карточек-предков бывают transform'ы (stagger,
          hover постеров) — они делают position:fixed относительным себя,
          и меню улетало в случайное место страницы. */}
      {isOpen &&
        coords &&
        createPortal(
        <div
          ref={menuRef}
          className="performer-select-dropdown drama-status-dropdown"
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            right: "auto",
            zIndex: 2000,
          }}
        >
          <button type="button" className="performer-select-option" onClick={() => choose(null)}>
            <span className="flex-fill text-start">{t.catalog.watchStatusNone}</span>
            {!status && <CheckIcon />}
          </button>
          {WATCH_STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className="performer-select-option"
              onClick={() => choose(s)}
            >
              <span className="flex-fill text-start">{t.catalog.watchStatus[s]}</span>
              {status === s && <CheckIcon />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
