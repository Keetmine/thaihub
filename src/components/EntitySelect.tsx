"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";
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
 * Custom searchable single-select for picking an existing entity (agency,
 * drama, …) by name + optional photo, with an inline "+ Создать «query»"
 * option (opens a small popup with just the name field) when the typed name
 * doesn't match anything existing.
 */
export default function EntitySelect({
  name,
  label,
  options,
  defaultValue,
  placeholder = "Выберите…",
  onCreateNew,
  createLabel = "Создать",
  onChange,
}: {
  name: string;
  label?: string;
  options: EntityOption[];
  defaultValue?: string;
  placeholder?: string;
  onCreateNew?: (query: string) => Promise<EntityOption | null>;
  createLabel?: string;
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
  const ref = useRef<HTMLDivElement>(null);

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

  const selected = allOptions.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((o) => o.name.toLowerCase().includes(q));
  }, [allOptions, query]);

  const trimmedQuery = query.trim();
  const hasExactMatch = allOptions.some(
    (o) => o.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showCreateOption = !!onCreateNew && trimmedQuery.length > 0 && !hasExactMatch;

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
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Не удалось создать");
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
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
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
                  setValue(o.id);
                  setQuery("");
                  setIsOpen(false);
                }}
              >
                <Avatar option={o} />
                <span className="flex-fill text-start text-truncate">{o.name}</span>
              </button>
            ))}
            {filtered.length === 0 && !showCreateOption && (
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
