"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";

export type EntityOption = { id: string; name: string; photoUrl?: string | null };

function Avatar({ option }: { option: EntityOption }) {
  if (option.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={option.photoUrl} alt="" className="performer-select-avatar" />;
  }
  return (
    <span className="performer-select-avatar performer-select-avatar-placeholder">
      {option.name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Chip-based multi-select: search existing options (with avatar), or create
 * a new one inline by name when nothing matches. Renders one hidden
 * `<input name=... value=id>` per selected chip, for plain form submission.
 */
const SEARCH_DEBOUNCE_MS = 300;

export default function EntityMultiSelect({
  name,
  options,
  defaultSelectedIds,
  placeholder = "Начните вводить…",
  onCreateNew,
  createLabel = "Создать",
  emptyMessage,
  externalAdditions,
  searchOptions,
}: {
  name: string;
  options: EntityOption[];
  defaultSelectedIds?: string[];
  placeholder?: string;
  onCreateNew?: (query: string) => Promise<EntityOption | null>;
  createLabel?: string;
  emptyMessage?: string;
  /** Options created via an external flow (e.g. a "new event" modal) —
   *  each new entry appended here is automatically selected. */
  externalAdditions?: EntityOption[];
  /** Async mode for catalogs too big to ship to the client (~17k
   *  performers): `options` then only needs to cover the already-selected
   *  ids, and the dropdown is fed by this debounced server-side search
   *  instead of client-side filtering. */
  searchOptions?: (query: string) => Promise<EntityOption[]>;
}) {
  const [createdOptions, setCreatedOptions] = useState<EntityOption[]>([]);
  const allOptions = useMemo(
    () => [...options, ...createdOptions.filter((c) => !options.some((o) => o.id === c.id))],
    [options, createdOptions],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds ?? []);
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

  const selected = useMemo(
    () => selectedIds.map((id) => allOptions.find((o) => o.id === id)).filter(
      (o): o is EntityOption => Boolean(o),
    ),
    [selectedIds, allOptions],
  );

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

  const filtered = useMemo(() => {
    if (searchOptions) {
      return searchResults.filter((o) => !selectedIds.includes(o.id));
    }
    const q = query.trim().toLowerCase();
    return allOptions.filter((o) => {
      if (selectedIds.includes(o.id)) return false;
      if (!q) return true;
      return o.name.toLowerCase().includes(q);
    });
  }, [allOptions, selectedIds, query, searchOptions, searchResults]);

  const trimmedQuery = query.trim();
  const hasExactMatch = [...allOptions, ...searchResults].some(
    (o) => o.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  // В async-режиме не предлагаем «создать», пока идёт поиск — иначе
  // кнопка мелькает до прихода результатов с точным совпадением.
  const showCreateOption =
    !!onCreateNew && trimmedQuery.length > 0 && !hasExactMatch && !(searchOptions && isSearching);

  function add(option: EntityOption) {
    // В async-режиме вариант живёт только в searchResults — сохраняем его
    // в createdOptions, иначе чип и hidden input не отрендерятся (баг
    // «второй актёр не добавляется»).
    if (!allOptions.some((o) => o.id === option.id)) {
      setCreatedOptions((prev) => [...prev, option]);
    }
    setSelectedIds((prev) => (prev.includes(option.id) ? prev : [...prev, option.id]));
    setQuery("");
  }

  const externalCount = useRef(0);
  useEffect(() => {
    if (!externalAdditions) return;
    const fresh = externalAdditions.slice(externalCount.current);
    if (fresh.length === 0) return;
    externalCount.current = externalAdditions.length;
    setCreatedOptions((prev) => [...prev, ...fresh]);
    setSelectedIds((prev) => [...prev, ...fresh.map((o) => o.id).filter((id) => !prev.includes(id))]);
  }, [externalAdditions]);

  function remove(id: string) {
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  }

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
        add(created);
        setCreatePrefill(null);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Не удалось создать");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-2">
          {selected.map((o) => (
            <span key={o.id} className="event-chip performer-chip">
              <input type="hidden" name={name} value={o.id} />
              {o.name}
              <button
                type="button"
                className="performer-chip-remove"
                onClick={() => remove(o.id)}
                aria-label={`Убрать ${o.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="performer-combobox" ref={ref}>
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
        />

        {isOpen && searchOptions && trimmedQuery.length > 0 && filtered.length === 0 && !showCreateOption && (
          <div className="performer-combobox-dropdown">
            <div className="performer-combobox-option text-secondary" aria-disabled>
              {trimmedQuery.length < 2 ? "Введите минимум 2 символа" : isSearching ? "Поиск…" : "Никого не найдено"}
            </div>
          </div>
        )}
        {isOpen && (filtered.length > 0 || showCreateOption) && (
          <div className="performer-combobox-dropdown">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                className="performer-combobox-option d-flex align-items-center gap-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(o)}
              >
                <Avatar option={o} />
                {o.name}
              </button>
            ))}
            {showCreateOption && (
              <button
                type="button"
                className="performer-combobox-option performer-combobox-create"
                onMouseDown={(e) => e.preventDefault()}
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

      {allOptions.length === 0 && emptyMessage && (
        <p className="small text-secondary mt-2">{emptyMessage}</p>
      )}

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
