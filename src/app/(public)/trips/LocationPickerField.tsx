"use client";

import { useRef, useState } from "react";
import { searchLocationOptions } from "@/app/(public)/lists/actions";

/** Поле «Место» для формы личного события: асинхронный поиск локаций,
 *  выбранная кладётся в hidden input name=locationId. */
export default function LocationPickerField({
  defaultLocation,
}: {
  defaultLocation?: { id: string; name: string } | null;
}) {
  const [selected, setSelected] = useState(defaultLocation ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  function handleChange(next: string) {
    setQuery(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const q = next.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++seqRef.current;
    timeoutRef.current = setTimeout(async () => {
      const found = await searchLocationOptions(q);
      if (seq === seqRef.current) setResults(found);
    }, 300);
  }

  return (
    <div>
      <label className="form-label small text-secondary">Место (необязательно)</label>
      <input type="hidden" name="locationId" value={selected?.id ?? ""} />
      {selected ? (
        <p className="mb-0 d-flex align-items-center gap-2">
          <span className="event-chip">📍 {selected.name}</span>
          <button
            type="button"
            className="btn btn-link btn-sm text-danger p-0"
            onClick={() => setSelected(null)}
          >
            убрать
          </button>
        </p>
      ) : (
        <div className="performer-combobox">
          <input
            type="text"
            className="form-control"
            placeholder="Начните вводить название локации…"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
          />
          {isOpen && results.length > 0 && (
            <div className="performer-combobox-dropdown">
              {results.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="performer-combobox-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelected({ id: l.id, name: l.name });
                    setQuery("");
                    setResults([]);
                  }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
