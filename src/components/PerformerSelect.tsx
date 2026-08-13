"use client";

import { useRef, useState } from "react";
import { ChevronDownIcon, CheckIcon } from "./icons";

export type PerformerSelectOption = {
  id: string;
  name: string;
  photoUrl?: string | null;
};

function Avatar({ option }: { option: PerformerSelectOption }) {
  if (option.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={option.photoUrl} alt="" className="performer-select-avatar" />
    );
  }
  return (
    <span className="performer-select-avatar performer-select-avatar-placeholder">
      {option.name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Custom-styled single-select "listbox" replacing a native <select> — shows
 * the performer's photo (when set) alongside their name, both in the closed
 * trigger and in each dropdown option.
 */
export default function PerformerSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Выберите…",
}: {
  label?: string;
  options: PerformerSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  return (
    <div className="performer-select" ref={ref}>
      {label && <label className="form-label d-block">{label}</label>}
      <button
        type="button"
        className="performer-select-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      >
        <span className="d-flex align-items-center gap-2 min-w-0">
          {selected && <Avatar option={selected} />}
          <span
            className={`text-truncate ${selected ? "" : "text-secondary"}`}
          >
            {selected?.name ?? placeholder}
          </span>
        </span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="performer-select-dropdown">
          {options.length === 0 && (
            <p className="small text-secondary px-2 py-1 mb-0">Нет вариантов</p>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="performer-select-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              <Avatar option={o} />
              <span className="flex-fill text-start text-truncate">{o.name}</span>
              {o.id === value && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
