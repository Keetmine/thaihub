"use client";

import { useId, useEffect, useRef, useState } from "react";
import { CalendarIcon } from "@/components/icons";
import DatePickerInput from "@/components/DatePickerInput";
import { useT } from "@/components/LocaleProvider";

/** Compact calendar-icon button that opens a small popover with the
 *  from/to date inputs — keeps a date-range filter out of the tab-bar-row
 *  it sits in instead of two always-visible inputs cluttering that row. */
export default function DateRangeFilterButton({
  action,
  from,
  to,
  clearHref,
  hiddenFields,
}: {
  action: string;
  from: string;
  to: string;
  /** href that resubmits with from/to stripped but everything else kept. */
  clearHref: string;
  hiddenFields?: Record<string, string>;
}) {
  const uid = useId();
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasRange = Boolean(from || to);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const label = hasRange
    ? t.events.filter.range(from || "…", to || "…")
    : t.events.filter.button;

  return (
    <div className="date-range-filter" ref={ref}>
      <button
        type="button"
        className={`round-icon-btn ${hasRange ? "is-accent" : ""}`}
        aria-expanded={isOpen}
        aria-label={label}
        data-tooltip={label}
        onClick={() => setIsOpen((v) => !v)}
      >
        <CalendarIcon />
      </button>

      {isOpen && (
        <form className="date-range-filter-dropdown" action={action} method="GET">
          {hiddenFields &&
            Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          <label className="form-label small text-secondary mb-1" htmlFor={`${uid}-from`}>{t.events.filter.from}</label>
          <div className="mb-2">
            <DatePickerInput id={`${uid}-from`} name="from" defaultValue={from} />
          </div>
          <label className="form-label small text-secondary mb-1" htmlFor={`${uid}-to`}>{t.events.filter.to}</label>
          <div className="mb-2">
            <DatePickerInput id={`${uid}-to`} name="to" defaultValue={to} />
          </div>
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-outline-secondary btn-sm flex-fill">
              {t.events.filter.apply}
            </button>
            {hasRange && (
              <a href={clearHref} className="btn btn-ghost btn-sm">
                {t.events.filter.reset}
              </a>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
