"use client";

import { useRef, useState, useTransition } from "react";
import {
  addPlaceToList,
  removePlaceFromList,
  searchLocationOptions,
  setPlaceListVisibility,
  setPlaceNote,
} from "../actions";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";

/** Селектор видимости списка (владельцу). */
export function ListVisibilitySelect({ listId, visibility }: { listId: string; visibility: string }) {
  const [current, setCurrent] = useState(visibility);
  const [isPending, startTransition] = useTransition();
  return (
    <select
      className="form-select form-select-sm w-auto"
      value={current}
      disabled={isPending}
      aria-label="Видимость списка"
      onChange={(e) => {
        const next = e.target.value;
        setCurrent(next);
        startTransition(async () => {
          try {
            await setPlaceListVisibility(listId, next);
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

/** Комбобокс «добавить место»: асинхронный поиск локаций, выбор — сразу
 *  добавление в список. */
export function AddPlaceBox({ listId }: { listId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  function handleChange(next: string) {
    setQuery(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const q = next.trim();
    if (q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = ++seqRef.current;
    timeoutRef.current = setTimeout(async () => {
      try {
        const found = await searchLocationOptions(q);
        if (seq === seqRef.current) setResults(found);
      } finally {
        if (seq === seqRef.current) setIsSearching(false);
      }
    }, 300);
  }

  function pick(locationId: string) {
    setQuery("");
    setResults([]);
    startTransition(async () => {
      await addPlaceToList(listId, locationId);
    });
  }

  return (
    <div className="performer-combobox" style={{ maxWidth: "24rem" }}>
      <input
        type="text"
        className="form-control"
        placeholder="Добавить место — начните вводить название…"
        value={query}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
      />
      {isOpen && query.trim().length >= 2 && (
        <div className="performer-combobox-dropdown">
          {results.map((l) => (
            <button
              key={l.id}
              type="button"
              className="performer-combobox-option d-flex align-items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(l.id)}
            >
              {l.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.photoUrl} alt="" className="performer-select-avatar" />
              ) : (
                <span className="performer-select-avatar performer-select-avatar-placeholder">
                  {l.name.charAt(0).toUpperCase()}
                </span>
              )}
              {l.name}
            </button>
          ))}
          {results.length === 0 && (
            <div className="performer-combobox-option text-secondary" aria-disabled>
              {isSearching ? "Поиск…" : "Ничего не найдено"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Кнопка удаления места + инлайн-заметка. */
export function PlaceRowControls({
  listId,
  locationId,
  note,
}: {
  listId: string;
  locationId: string;
  note: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const boundNote = setPlaceNote.bind(null, listId, locationId);

  async function saveNote(formData: FormData) {
    await boundNote(formData);
    setIsEditing(false);
  }

  return (
    <div className="d-flex align-items-center gap-2 flex-shrink-0">
      {isEditing ? (
        <form action={saveNote} className="d-flex align-items-center gap-2">
          <input name="note" defaultValue={note ?? ""} className="form-control form-control-sm" autoFocus />
          <button type="submit" className="btn btn-primary btn-sm">
            ОК
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>
          {note ? "✎" : "+ заметка"}
        </button>
      )}
      <button
        type="button"
        className="icon-btn icon-btn-danger"
        aria-label="Убрать из списка"
        title="Убрать из списка"
        disabled={isPending}
        onClick={() => startTransition(async () => removePlaceFromList(listId, locationId))}
      >
        ×
      </button>
    </div>
  );
}
