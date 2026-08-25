"use client";

import { useState, useTransition } from "react";
import { setTripVisibility } from "./actions";
import { useT } from "@/components/LocaleProvider";

// Порядок вариантов видимости: от закрытого к открытому. Подписи живут
// в словаре (у поездки и у списка мест они разные), а порядок — общий,
// поэтому его держим здесь и переиспользуем в контролах списка.
export const VISIBILITY_ORDER = ["PRIVATE", "FRIENDS", "PUBLIC"] as const;

/** Радио-выбор видимости. Используется и формой поездки, и формой
 *  списка мест, поэтому подпись передаётся снаружи: сами варианты у них
 *  общие, а вопрос — «кто видит поездку» или «кто видит список» — нет. */
export function VisibilityRadios({
  defaultValue = "PRIVATE",
  label,
}: {
  defaultValue?: string;
  label?: string;
}) {
  const t = useT();
  const [selected, setSelected] = useState(defaultValue);
  return (
    <div>
      <label className="form-label small text-secondary d-block">
        {label ?? t.trips.visibility.label}
      </label>
      <div className="d-flex flex-column gap-1">
        {VISIBILITY_ORDER.map((value) => (
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
              {t.trips.visibility.options[value]}{" "}
              <span className="text-secondary">— {t.trips.visibility.hints[value]}</span>
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
  const t = useT();
  const [current, setCurrent] = useState(visibility);
  const [isPending, startTransition] = useTransition();

  return (
    <select
      className="form-select form-select-sm w-auto"
      value={current}
      disabled={isPending}
      aria-label={t.trips.visibility.aria}
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
      {VISIBILITY_ORDER.map((value) => (
        <option key={value} value={value}>
          {t.trips.visibility.options[value]}
        </option>
      ))}
    </select>
  );
}
