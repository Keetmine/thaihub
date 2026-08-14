"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  setDramaWatchStatus,
  clearDramaWatchStatus,
  type DramaWatchStatusValue,
} from "@/app/(public)/favorites/actions";
import { WATCH_STATUS_LABELS, WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";

export default function WatchStatusSelect({
  dramaId,
  status,
}: {
  dramaId: string;
  status: DramaWatchStatusValue | null;
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

  return (
    <div className="performer-select" ref={ref}>
      <button
        type="button"
        className="performer-select-trigger"
        aria-expanded={isOpen}
        disabled={isSubmitting}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className={status ? "" : "text-secondary"}>
          {status ? WATCH_STATUS_LABELS[status] : "Не отмечено"}
        </span>
        <ChevronDownIcon />
      </button>

      {isOpen && (
        <div className="performer-select-dropdown">
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
