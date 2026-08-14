"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  setDramaWatchStatus,
  clearDramaWatchStatus,
  type DramaWatchStatusValue,
} from "@/app/(public)/favorites/actions";
import { WATCH_STATUS_LABELS, WATCH_STATUS_ORDER } from "@/lib/watchStatus";
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
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
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

  const label = status ? `Статус: ${WATCH_STATUS_LABELS[status]}` : "Добавить статус просмотра";

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
          setIsOpen((v) => !v);
        }}
      >
        {status ? <PencilIcon /> : <PlusIcon />}
      </button>

      {isOpen && (
        <div className="performer-select-dropdown drama-status-dropdown">
          <button type="button" className="performer-select-option" onClick={() => choose(null)}>
            <span className="flex-fill text-start">Не отмечено</span>
            {!status && <CheckIcon />}
          </button>
          {WATCH_STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className="performer-select-option"
              onClick={() => choose(s)}
            >
              <span className="flex-fill text-start">{WATCH_STATUS_LABELS[s]}</span>
              {status === s && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
