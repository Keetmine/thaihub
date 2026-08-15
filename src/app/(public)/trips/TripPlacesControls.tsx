"use client";

import { useState, useTransition } from "react";
import {
  addPlaceToTrip,
  attachListToTrip,
  detachListFromTrip,
  removePlaceFromTrip,
} from "./actions";
import { searchLocationOptions } from "@/app/(public)/lists/actions";
import { useRef } from "react";

/** Прикрепление своего списка к поездке. */
export function AttachListSelect({
  tripId,
  availableLists,
}: {
  tripId: string;
  availableLists: { id: string; title: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  if (availableLists.length === 0) return null;
  return (
    <select
      className="form-select form-select-sm w-auto"
      disabled={isPending}
      value=""
      aria-label="Прикрепить список"
      onChange={(e) => {
        const listId = e.target.value;
        if (!listId) return;
        startTransition(async () => {
          await attachListToTrip(tripId, listId);
        });
      }}
    >
      <option value="">+ Прикрепить список…</option>
      {availableLists.map((l) => (
        <option key={l.id} value={l.id}>
          {l.title}
        </option>
      ))}
    </select>
  );
}

export function DetachListButton({ tripId, listId }: { tripId: string; listId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm text-danger"
      disabled={isPending}
      onClick={() => startTransition(async () => detachListFromTrip(tripId, listId))}
    >
      Открепить
    </button>
  );
}

export function RemoveTripPlaceButton({ tripId, locationId }: { tripId: string; locationId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="icon-btn icon-btn-danger flex-shrink-0"
      aria-label="Убрать место"
      title="Убрать место"
      disabled={isPending}
      onClick={() => startTransition(async () => removePlaceFromTrip(tripId, locationId))}
    >
      ×
    </button>
  );
}

/** Комбобокс «добавить отдельное место в поездку». */
export function AddTripPlaceBox({ tripId }: { tripId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
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
    <div className="performer-combobox" style={{ maxWidth: "22rem" }}>
      <input
        type="text"
        className="form-control form-control-sm"
        placeholder="+ Добавить место…"
        value={query}
        disabled={isPending}
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
                setQuery("");
                setResults([]);
                startTransition(async () => addPlaceToTrip(tripId, l.id));
              }}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
