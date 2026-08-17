"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addPerformerToList, searchPerformersForList } from "./actions";

// Поиск-добавлялка актёров в свой список: тот же паттерн, что async
// EntityMultiSelect, но результат сразу пишется на сервер.
export default function AddPerformerBox({ listId }: { listId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const seqRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(next: string) {
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
        const rows = await searchPerformersForList(q);
        if (seq === seqRef.current) setResults(rows);
      } finally {
        if (seq === seqRef.current) setIsSearching(false);
      }
    }, 300);
  }

  async function add(id: string) {
    await addPerformerToList(listId, id);
    setQuery("");
    setResults([]);
    router.refresh();
  }

  return (
    <div className="performer-combobox">
      <input
        type="text"
        className="form-control"
        placeholder="Начните вводить имя актёра…"
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />
      {query.trim().length >= 2 && (
        <div className="performer-combobox-dropdown">
          {isSearching && (
            <div className="performer-combobox-option text-secondary">Поиск…</div>
          )}
          {!isSearching && results.length === 0 && (
            <div className="performer-combobox-option text-secondary">Никого не найдено</div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="performer-combobox-option d-flex align-items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(p.id)}
            >
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photoUrl} alt="" className="performer-select-avatar" />
              ) : (
                <span className="performer-select-avatar performer-select-avatar-placeholder">
                  {p.name.charAt(0).toUpperCase()}
                </span>
              )}
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
