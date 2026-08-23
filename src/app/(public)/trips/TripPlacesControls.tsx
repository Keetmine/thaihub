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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (availableLists.length === 0) return null;
  return (
    <>
      <select
        className="form-select form-select-sm w-auto"
        disabled={isPending}
        value=""
        aria-label="Прикрепить список"
        onChange={(e) => {
          const listId = e.target.value;
          if (!listId) return;
          setError(null);
          startTransition(async () => {
            const result = await attachListToTrip(tripId, listId);
            if (!result.ok) setError(result.error);
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
      {error && <span className="small text-danger">{error}</span>}
    </>
  );
}

export function DetachListButton({ tripId, listId }: { tripId: string; listId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm text-danger"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await detachListFromTrip(tripId, listId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        Открепить
      </button>
      {error && <span className="small text-danger">{error}</span>}
    </>
  );
}

export function RemoveTripPlaceButton({ tripId, locationId }: { tripId: string; locationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="icon-btn icon-btn-danger flex-shrink-0"
        aria-label="Убрать место"
        title="Убрать место"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await removePlaceFromTrip(tripId, locationId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        ×
      </button>
      {error && <span className="small text-danger">{error}</span>}
    </>
  );
}

/** Комбобокс «добавить отдельное место в поездку». */
export function AddTripPlaceBox({ tripId }: { tripId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
                setError(null);
                startTransition(async () => {
                  const result = await addPlaceToTrip(tripId, l.id);
                  if (!result.ok) setError(result.error);
                });
              }}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="small text-danger mt-1 mb-0">{error}</p>}
    </div>
  );
}
