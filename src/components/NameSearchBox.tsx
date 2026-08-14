"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DEBOUNCE_MS = 400;

export default function NameSearchBox({
  action,
  q,
  hiddenFields,
  placeholder = "Поиск по названию…",
  className = "mb-4",
}: {
  action: string;
  q: string;
  hiddenFields?: Record<string, string>;
  placeholder?: string;
  /** Defaults to "mb-4" for standalone use; pass "" when placed inside a
   *  .tab-bar-row alongside tabs, which spaces itself. */
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync if q changes from outside this input (a tab link that also
  // carries q, browser back/forward) — adjusted during render, not in an
  // effect, per React's guidance for "state that depends on a prop".
  if (q !== prevQ) {
    setPrevQ(q);
    setValue(q);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function navigate(nextValue: string) {
    const params = new URLSearchParams(hiddenFields);
    if (nextValue) params.set("q", nextValue);
    const qs = params.toString();
    router.replace(`${action}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Clearing (typing back to empty, or the native search input's own "x"
    // button, which fires the same change event) updates right away —
    // only non-empty typing gets debounced.
    if (next === "") {
      navigate(next);
      return;
    }
    timeoutRef.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
  }

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        navigate(value);
      }}
    >
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, fieldValue]) => (
          <input key={name} type="hidden" name={name} value={fieldValue} />
        ))}
      <div className="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          name="q"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className="pill-search"
        />
      </div>
    </form>
  );
}
