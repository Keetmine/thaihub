"use client";

import { useState, useTransition } from "react";
import { setTripVisibility } from "./actions";
import { VISIBILITY_LABELS, VISIBILITY_HINTS } from "@/lib/tripVisibility";

/** Радио-выбор видимости для формы создания поездки. */
export function VisibilityRadios({ defaultValue = "PRIVATE" }: { defaultValue?: string }) {
  const [selected, setSelected] = useState(defaultValue);
  return (
    <div>
      <label className="form-label small text-secondary d-block">Кто видит поездку</label>
      <div className="d-flex flex-column gap-1">
        {Object.entries(VISIBILITY_LABELS).map(([value, label]) => (
          <label key={value} className="form-check mb-0">
            <input
              type="radio"
              name="visibility"
              value={value}
              checked={selected === value}
              onChange={() => setSelected(value)}
              className="form-check-input"
            />
            <span className="form-check-label small">
              {label} <span className="text-secondary">— {VISIBILITY_HINTS[value]}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Компактный селект смены видимости на странице поездки (для владельца). */
export function VisibilitySelect({
  tripId,
  visibility,
}: {
  tripId: string;
  visibility: string;
}) {
  const [current, setCurrent] = useState(visibility);
  const [isPending, startTransition] = useTransition();

  return (
    <select
      className="form-select form-select-sm w-auto"
      value={current}
      disabled={isPending}
      aria-label="Видимость поездки"
      onChange={(e) => {
        const next = e.target.value;
        setCurrent(next);
        startTransition(async () => {
          try {
            const result = await setTripVisibility(tripId, next);
            if (!result.ok) setCurrent(current);
          } catch {
            setCurrent(current);
          }
        });
      }}
    >
      {Object.entries(VISIBILITY_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
