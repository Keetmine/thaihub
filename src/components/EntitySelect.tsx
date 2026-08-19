"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";
import Modal from "./Modal";

export type EntityOption = { id: string; name: string; photoUrl?: string | null };

function Avatar({ option }: { option: EntityOption }) {
  if (option.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img
  loading="lazy"
  decoding="async" src={option.photoUrl} alt="" className="performer-select-avatar" />;
  }
  return (
    <span className="performer-select-avatar performer-select-avatar-placeholder">
      {option.name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Custom searchable single-select for picking an existing entity (agency,
 * drama, …) by name + optional photo, with an inline "+ Создать «query»"
 * option (opens a small popup with just the name field) when the typed name
 * doesn't match anything existing.
 */
const SEARCH_DEBOUNCE_MS = 300;

export default function EntitySelect({
  name,
  label,
  options,
  defaultValue,
  placeholder = "Выберите…",
  onCreateNew,
  createLabel = "Создать",
  searchOptions,
  onChange,
}: {
  name: string;
  label?: string;
  options: EntityOption[];
  defaultValue?: string;
  placeholder?: string;
  onCreateNew?: (query: string) => Promise<EntityOption | null>;
  createLabel?: string;
  /** Асинхронный режим для больших каталогов (см. EntityMultiSelect):
   *  ничего не грузим заранее, варианты ищутся на сервере по мере ввода;
   *  `options` тогда должен покрывать только текущее выбранное значение. */
  searchOptions?: (query: string) => Promise<EntityOption[]>;
  /** Fires whenever the selection changes — for parents that need to react
   *  (e.g. excluding this value from a sibling select's options). The
   *  hidden input is still the source of truth for plain form submission. */
  onChange?: (id: string) => void;
}) {
  // `options` can change from the parent (e.g. excluding a sibling select's
  // current value) — merge with locally-created-this-session options rather
  // than snapshotting once, so both stay in sync.
  const [createdOptions, setCreatedOptions] = useState<EntityOption[]>([]);
  const allOptions = useMemo(
    () => [...options, ...createdOptions.filter((c) => !options.some((o) => o.id === c.id))],
    [options, createdOptions],
  );
  const [value, setValueState] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<EntityOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (!searchOptions) return;
    const q = next.trim();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = ++searchSeqRef.current;
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchOptions(q);
        // Отбрасываем ответ, если пользователь уже набрал новый запрос.
        if (seq === searchSeqRef.current) setSearchResults(results);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function setValue(id: string) {
    setValueState(id);
    onChange?.(id);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selected =
    allOptions.find((o) => o.id === value) ?? searchResults.find((o) => o.id === value);

  const filtered = useMemo(() => {
    if (searchOptions) return searchResults;
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((o) => o.name.toLowerCase().includes(q));
  }, [allOptions, query, searchOptions, searchResults]);

  const trimmedQuery = query.trim();
  const hasExactMatch = [...allOptions, ...searchResults].some(
    (o) => o.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showCreateOption =
    !!onCreateNew && trimmedQuery.length > 0 && !hasExactMatch && !(searchOptions && isSearching);

  async function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!onCreateNew || isCreating) return;
    const newName = String(new FormData(e.currentTarget).get("newName") ?? "").trim();
    if (!newName) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await onCreateNew(newName);
      if (created) {
        setCreatedOptions((prev) => [...prev, created]);
        setValue(created.id);
        setQuery("");
        setCreatePrefill(null);
      }
    } catch {
      setCreateError("Не удалось создать. Проверьте название и попробуйте ещё раз.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      {label && <label className="form-label d-block">{label}</label>}
      <input type="hidden" name={name} value={value} />
      <div className="performer-select" ref={ref}>
        <button
          type="button"
          className="performer-select-trigger"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((v) => !v)}
        >
          <span className="d-flex align-items-center gap-2 min-w-0">
            {selected && <Avatar option={selected} />}
            <span className={`text-truncate ${selected ? "" : "text-secondary"}`}>
              {selected?.name ?? placeholder}
            </span>
          </span>
          <ChevronDownIcon />
        </button>

        {isOpen && (
          <div className="performer-select-dropdown">
            <input
              type="text"
              className="form-control form-control-sm mb-2"
              placeholder="Поиск…"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              autoFocus
            />
            {searchOptions && trimmedQuery.length < 2 && (
              <p className="small text-secondary px-2 py-1 mb-0">
                Начните вводить название для поиска…
              </p>
            )}
            {searchOptions && isSearching && (
              <p className="small text-secondary px-2 py-1 mb-0">Поиск…</p>
            )}
            {value && (
              <button
                type="button"
                className="performer-select-option text-secondary"
                onClick={() => {
                  setValue("");
                  setIsOpen(false);
                }}
              >
                Не выбрано
              </button>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                className="performer-select-option"
                onClick={() => {
                  // В async-режиме результат живёт только в searchResults —
                  // сохраняем выбранный, чтобы триггер знал имя после
                  // очистки поиска.
                  if (searchOptions && !allOptions.some((x) => x.id === o.id)) {
                    setCreatedOptions((prev) => [...prev, o]);
                  }
                  setValue(o.id);
                  setQuery("");
                  setIsOpen(false);
                }}
              >
                <Avatar option={o} />
                <span className="flex-fill text-start text-truncate">{o.name}</span>
              </button>
            ))}
            {filtered.length === 0 &&
              !showCreateOption &&
              !(searchOptions && (trimmedQuery.length < 2 || isSearching)) && (
                <p className="small text-secondary px-2 py-1 mb-0">Ничего не найдено</p>
              )}
            {showCreateOption && (
              <button
                type="button"
                className="performer-combobox-create performer-select-option"
                onClick={() => {
                  setCreatePrefill(trimmedQuery);
                  setIsOpen(false);
                }}
              >
                {`+ ${createLabel} «${trimmedQuery}»`}
              </button>
            )}
          </div>
        )}
      </div>

      <Modal
        open={createPrefill !== null}
        onClose={() => setCreatePrefill(null)}
        title={createLabel}
      >
        <form className="d-flex flex-column gap-3" onSubmit={handleCreateSubmit}>
          <div>
            <label className="form-label">Название *</label>
            <input
              name="newName"
              required
              autoFocus
              defaultValue={createPrefill ?? ""}
              className="form-control"
            />
          </div>
          {createError && <p className="small text-danger mb-0">{createError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreating}>
            {isCreating ? "Создание…" : "Создать"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
