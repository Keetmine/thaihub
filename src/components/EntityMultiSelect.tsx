"use client";

import { adminEntityHref, type AdminEntityType } from "@/app/admin/entityHref";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "./LocaleProvider";
import Modal from "./Modal";

export type EntityOption = {
  id: string;
  name: string;
  photoUrl?: string | null;
  /** Адрес карточки записи в админке — у выбранного значения появится
   *  «↗». Обычно задаётся один раз пропом `hrefKind`. */
  href?: string | null;
};

/** «Открыть ↗» у выбранной записи. Близнец такого же в EntitySelect —
 *  как и Avatar ниже: компоненты живут отдельными бандлами, и общий
 *  импорт затащил бы один в другой. */
function OpenEntityLink({ href, name }: { href: string; name: string }) {
  // Подписи из словаря: селект стоит и на публичных формах (в админке
  // proxy ставит ru, там всё по-русски, как и было).
  const t = useT();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="entity-open-link"
      data-tooltip={t.ui.select.openCard}
      aria-label={t.ui.select.openCardAria(name)}
      // Чип стоит рядом с полем ввода: гасим всплытие, чтобы клик по
      // ссылке не считался кликом по чипу/полю.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      ↗
    </a>
  );
}

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
 * Chip-based multi-select: search existing options (with avatar), or create
 * a new one inline by name when nothing matches. Renders one hidden
 * `<input name=... value=id>` per selected chip, for plain form submission.
 */
const SEARCH_DEBOUNCE_MS = 300;

export default function EntityMultiSelect({
  id,
  name,
  options,
  defaultSelectedIds,
  placeholder,
  onCreateNew,
  createLabel,
  createNameLabel,
  emptyMessage,
  externalAdditions,
  searchOptions,
  selectedVariant = "chip",
  onPick,
  excludeIds,
  inputClassName,
  hrefKind,
}: {
  /** Ложится на видимое поле ввода — туда, куда встаёт фокус, — чтобы
   *  подпись рядом могла сослаться через htmlFor. Скрытые инпуты
   *  выбранных значений подписи не касаются. */
  id?: string;
  /** Имя hidden-инпутов выбранных значений; в режиме `onPick` не нужен. */
  name?: string;
  options: EntityOption[];
  defaultSelectedIds?: string[];
  placeholder?: string;
  onCreateNew?: (query: string) => Promise<EntityOption | null>;
  createLabel?: string;
  /** Подпись поля в модалке создания — «Имя» для людей. */
  createNameLabel?: string;
  emptyMessage?: string;
  /** Options created via an external flow (e.g. a "new event" modal) —
   *  each new entry appended here is automatically selected. */
  externalAdditions?: EntityOption[];
  /** Async mode for catalogs too big to ship to the client (~17k
   *  performers): `options` then only needs to cover the already-selected
   *  ids, and the dropdown is fed by this debounced server-side search
   *  instead of client-side filtering. */
  searchOptions?: (query: string) => Promise<EntityOption[]>;
  /** «card» — выбранные показываются карточками с постером/фото (списки
   *  сериалов и событий: по чипам без картинок непонятно, что выбрано). */
  selectedVariant?: "chip" | "card";
  /** Режим «только выбор»: компонент ничего не хранит и не рендерит ни
   *  чипов, ни hidden-инпутов — каждый выбранный (в том числе созданный
   *  через модалку) вариант отдаётся наверх, а состояние живёт у
   *  родителя. Нужен, когда к выбранному прикреплены свои поля: состав
   *  сериала с ролями, лайнап дня события. */
  onPick?: (option: EntityOption) => void;
  /** Какие id спрятать из выпадашки — в режиме `onPick` компонент сам не
   *  знает, что уже выбрано родителем. */
  excludeIds?: string[];
  /** Доп. классы поля ввода (например, `form-control-sm`). */
  inputClassName?: string;
  /** Что именно выбирается — у каждого выбранного чипа/карточки
   *  появляется «↗» на карточку записи в админке. Адрес компонент
   *  строит сам через adminEntityHref; вызывающий передаёт ВИД записи
   *  строкой, а не функцию: селекты стоят и в серверных компонентах
   *  (/admin/imports), а функцию через границу RSC не передать —
   *  страница падала в «Раздел не открылся». Без пропа (публичные
   *  страницы) ссылок нет. */
  hrefKind?: AdminEntityType;
}) {
  // Дефолты подписей — из словаря (пропом по-прежнему можно
  // переопределить): раньше русские строки были зашиты и утекали на
  // EN-витрину (аудит 2026-09, п.3).
  const t = useT();
  const placeholderText = placeholder ?? t.ui.select.multiPlaceholder;
  const createText = createLabel ?? t.ui.select.create;
  const createNameText = createNameLabel ?? t.ui.select.nameLabel;
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

  const optionHref = (option: EntityOption) => option.href ?? (hrefKind ? adminEntityHref(hrefKind, option.id) : null);

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
    const hidden = new Set([...selectedIds, ...(excludeIds ?? [])]);
    if (searchOptions) {
      return searchResults.filter((o) => !hidden.has(o.id));
    }
    const q = query.trim().toLowerCase();
    return allOptions.filter((o) => {
      if (hidden.has(o.id)) return false;
      if (!q) return true;
      return o.name.toLowerCase().includes(q);
    });
  }, [allOptions, selectedIds, excludeIds, query, searchOptions, searchResults]);

  const trimmedQuery = query.trim();
  const hasExactMatch = [...allOptions, ...searchResults].some(
    (o) => o.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  // В async-режиме не предлагаем «создать», пока идёт поиск — иначе
  // кнопка мелькает до прихода результатов с точным совпадением.
  const showCreateOption =
    !!onCreateNew && trimmedQuery.length > 0 && !hasExactMatch && !(searchOptions && isSearching);

  function add(option: EntityOption) {
    // Режим `onPick`: состояние выбора живёт у родителя, себе ничего не
    // запоминаем (результаты поиска остаются видны — удобно добавлять
    // нескольких подряд).
    if (onPick) {
      onPick(option);
      setQuery("");
      return;
    }
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
    } catch {
      setCreateError(t.ui.select.createFailed);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      {selected.length > 0 && selectedVariant === "card" && (
        <div className="d-flex flex-wrap gap-2 mb-2">
          {selected.map((o) => (
            <div key={o.id} className="selected-card">
              <input type="hidden" name={name} value={o.id} />
              <Avatar option={o} />
              <span className="selected-card-name">{o.name}</span>
              {optionHref(o) && <OpenEntityLink href={optionHref(o)!} name={o.name} />}
              <button
                type="button"
                className="performer-chip-remove"
                onClick={() => remove(o.id)}
                aria-label={t.ui.select.remove(o.name)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && selectedVariant === "chip" && (
        <div className="d-flex flex-wrap gap-2 mb-2">
          {selected.map((o) => (
            <span key={o.id} className="event-chip performer-chip">
              <input type="hidden" name={name} value={o.id} />
              {/* Миниатюра и в чипе тоже: вид выбранной записи один и
                  тот же во всей админке — фото/постер/логотип + название
                  (просьба владельца). */}
              <Avatar option={o} />
              {o.name}
              {optionHref(o) && <OpenEntityLink href={optionHref(o)!} name={o.name} />}
              <button
                type="button"
                className="performer-chip-remove"
                onClick={() => remove(o.id)}
                aria-label={t.ui.select.remove(o.name)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="performer-combobox" ref={ref}>
        <input
          id={id}
          type="text"
          className={inputClassName ? `form-control ${inputClassName}` : "form-control"}
          placeholder={placeholderText}
          aria-label={placeholderText}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
        />

        {isOpen && searchOptions && trimmedQuery.length > 0 && filtered.length === 0 && !showCreateOption && (
          <div className="performer-combobox-dropdown">
            <div className="performer-combobox-option text-secondary" aria-disabled>
              {trimmedQuery.length < 2
                ? t.ui.select.minTwoChars
                : isSearching
                  ? t.ui.select.searching
                  : t.common.nobodyFound}
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
                {t.ui.select.createOption(createText, trimmedQuery)}
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
        title={createText}
      >
        <form className="d-flex flex-column gap-3" onSubmit={handleCreateSubmit}>
          <div>
            <label className="form-label" htmlFor="entity-multi-select-newName">{createNameText} *</label>
            <input id="entity-multi-select-newName"
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
