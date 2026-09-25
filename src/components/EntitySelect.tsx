"use client";

import { adminEntityHref, type AdminEntityType } from "@/app/admin/entityHref";
import { useId, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";
import { useT } from "./LocaleProvider";
import Modal from "./Modal";

export type EntityOption = {
  id: string;
  name: string;
  photoUrl?: string | null;
  /** Адрес карточки записи в админке — рядом с выбранным значением
   *  появится «открыть ↗». Обычно проще задать один раз пропом
   *  `hrefKind` (см. src/app/admin/entityHref.ts), но у смешанных
   *  списков ссылка может приезжать с самой опцией. */
  href?: string | null;
};

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

/** «Открыть ↗» рядом с выбранной записью: отдельная цель клика, вне
 *  кнопки-триггера (ссылка внутри кнопки — невалидный HTML, и клик по
 *  ней открывал бы выпадашку). */
export function OpenEntityLink({
  href,
  name,
  compact = false,
}: {
  href: string;
  name: string;
  compact?: boolean;
}) {
  // Подписи из словаря: селект стоит и на публичных формах, где зритель
  // может быть англоязычным (в админке proxy ставит ru — там всё как было).
  const t = useT();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="entity-open-link"
      data-tooltip={t.ui.select.openCard}
      aria-label={t.ui.select.openCardAria(name)}
      // Клик по ссылке не должен ни открывать выпадашку, ни ронять
      // фокус комбобокса до перехода.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {compact ? "↗" : t.ui.select.openCardText}
    </a>
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
  id,
  name,
  label,
  options,
  defaultValue,
  placeholder,
  onCreateNew,
  createLabel,
  searchOptions,
  onChange,
  hrefKind,
}: {
  /** Ложится на кнопку-триггер: button — подписываемый элемент, так что
   *  htmlFor рядом сработает. */
  id?: string;
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
  /** Как построить ссылку на карточку записи в админке — у выбранного
   *  значения появляется «Открыть ↗» в новой вкладке. Маршруты у разных
   *  сущностей разные, поэтому вызывающий говорит, ЧТО выбирается
   *  (`hrefKind="Drama"`), а адрес компонент строит сам через
   *  adminEntityHref. Именно строкой, а не функцией: селекты стоят и в
   *  серверных компонентах (/admin/imports), а функцию через границу
   *  RSC не передать — страница падала в «Раздел не открылся». Без
   *  пропа (публичные страницы) ссылки просто нет. */
  hrefKind?: AdminEntityType;
}) {
  // `options` can change from the parent (e.g. excluding a sibling select's
  // current value) — merge with locally-created-this-session options rather
  // than snapshotting once, so both stay in sync.
  // Дефолты подписей — из словаря (пропом их по-прежнему можно
  // переопределить): раньше русские строки были зашиты и утекали на
  // EN-витрину (аудит 2026-09, п.3).
  const t = useT();
  const placeholderText = placeholder ?? t.ui.select.placeholder;
  const createText = createLabel ?? t.ui.select.create;
  const [createdOptions, setCreatedOptions] = useState<EntityOption[]>([]);
  const allOptions = useMemo(
    () => [...options, ...createdOptions.filter((c) => !options.some((o) => o.id === c.id))],
    [options, createdOptions],
  );
  const [value, setValueState] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const uid = useId();
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
  const selectedHref = selected ? selected.href ?? (hrefKind ? adminEntityHref(hrefKind, selected.id) : null) : null;

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
      setCreateError(t.ui.select.createFailed);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      {label && <label className="form-label d-block" htmlFor={`${uid}-input`}>{label}</label>}
      <input id={`${uid}-input`} type="hidden" name={name} value={value} />
      <div className={`performer-select ${hrefKind === "Performer" ? "is-people" : ""}`} ref={ref}>
        <div className="entity-select-row">
          <button
            id={id}
            type="button"
            className="performer-select-trigger"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((v) => !v)}
          >
            <span className="d-flex align-items-center gap-2 min-w-0">
              {selected && <Avatar option={selected} />}
              <span className={`text-truncate ${selected ? "" : "text-secondary"}`}>
                {selected?.name ?? placeholderText}
              </span>
            </span>
            <ChevronDownIcon />
          </button>
          {selected && selectedHref && (
            <OpenEntityLink href={selectedHref} name={selected.name} />
          )}
        </div>

        {isOpen && (
          <div className="performer-select-dropdown">
            <input
              type="text"
              className="form-control form-control-sm mb-2"
              placeholder={t.ui.select.searchPlaceholder}
              aria-label={t.ui.select.searchAria}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              autoFocus
            />
            {searchOptions && trimmedQuery.length < 2 && (
              <p className="small text-secondary px-2 py-1 mb-0">
                {t.ui.select.startTypingHint}
              </p>
            )}
            {searchOptions && isSearching && (
              <p className="small text-secondary px-2 py-1 mb-0">{t.ui.select.searching}</p>
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
                {t.ui.select.notSelected}
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
                <p className="small text-secondary px-2 py-1 mb-0">{t.common.nothingFound}</p>
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
                {t.ui.select.createOption(createText, trimmedQuery)}
              </button>
            )}
          </div>
        )}
      </div>

      <Modal
        open={createPrefill !== null}
        onClose={() => setCreatePrefill(null)}
        title={createText}
      >
        <form className="d-flex flex-column gap-3" onSubmit={handleCreateSubmit}>
          <div>
            <label className="form-label" htmlFor={`${uid}-newName`}>
              {t.ui.select.nameLabel} *
            </label>
            <input id={`${uid}-newName`}
              name="newName"
              required
              autoFocus
              defaultValue={createPrefill ?? ""}
              className="form-control"
            />
          </div>
          {createError && <p className="small text-danger mb-0">{createError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreating}>
            {isCreating ? t.ui.select.creating : t.ui.select.create}
          </button>
        </form>
      </Modal>
    </div>
  );
}
