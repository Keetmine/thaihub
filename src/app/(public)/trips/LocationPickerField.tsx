"use client";

import { useRef, useState } from "react";
import { searchLocationOptions, createOwnPlaceAndReturn } from "@/app/(public)/lists/actions";
import { useT } from "@/components/LocaleProvider";

/** Поле «Место» для формы личного события: асинхронный поиск локаций,
 *  выбранная кладётся в hidden input name=locationId. Если нужного
 *  места в каталоге нет, его можно завести прямо здесь — форма
 *  разворачивается внутри той же модалки (уходить в другой раздел и
 *  терять заполненное больше не нужно), и созданное место сразу
 *  становится выбранным. */
export default function LocationPickerField({
  defaultLocation,
}: {
  defaultLocation?: { id: string; name: string } | null;
}) {
  const t = useT();
  const [selected, setSelected] = useState(defaultLocation ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const mapsRef = useRef<HTMLInputElement>(null);
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

  // Форма места живёт внутри формы события, поэтому это НЕ submit, а
  // обычная кнопка: вложенных <form> в HTML не бывает, а сабмит
  // внешней формы создал бы событие вместо места.
  async function createPlace() {
    const name = nameRef.current?.value.trim() ?? "";
    if (!name) {
      setError(t.trips.placePicker.nameRequired);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("name", name);
      data.set("mapsUrl", mapsRef.current?.value.trim() ?? "");
      const result = await createOwnPlaceAndReturn(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(result.location);
      setIsCreating(false);
      setQuery("");
      setResults([]);
    } catch {
      setError(t.trips.placePicker.createFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <label className="form-label small text-secondary">{t.trips.placePicker.label}</label>
      <input type="hidden" name="locationId" value={selected?.id ?? ""} />
      {selected ? (
        <p className="mb-0 d-flex align-items-center gap-2">
          <span className="event-chip">📍 {selected.name}</span>
          <button
            type="button"
            className="btn btn-link btn-sm text-danger p-0"
            onClick={() => setSelected(null)}
          >
            {t.trips.placePicker.remove}
          </button>
        </p>
      ) : isCreating ? (
        <div className="surface p-3 d-flex flex-column gap-2">
          <input
            ref={nameRef}
            type="text"
            autoFocus
            defaultValue={query}
            placeholder={t.trips.placePicker.namePlaceholder}
            aria-label={t.trips.placePicker.nameAria}
            className="form-control form-control-sm"
          />
          <input
            ref={mapsRef}
            type="text"
            placeholder={t.trips.placePicker.mapsPlaceholder}
            aria-label={t.trips.placePicker.mapsAria}
            className="form-control form-control-sm"
          />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={isSaving}
              onClick={createPlace}
            >
              {isSaving ? t.trips.placePicker.creating : t.trips.placePicker.createAndPick}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setIsCreating(false);
                setError(null);
              }}
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="performer-combobox">
            <input
              type="text"
              className="form-control"
              placeholder={t.trips.placePicker.searchPlaceholder}
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
          <button
            type="button"
            className="btn btn-link btn-sm p-0 mt-1"
            onClick={() => {
              setIsCreating(true);
              setError(null);
            }}
          >
            {t.trips.placePicker.ownPlace}
          </button>
        </>
      )}
    </div>
  );
}
