"use client";

import { useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import type { FilterDef } from "@/lib/catalogFilters";

/**
 * Панель фильтров каталога. Своего состояния у неё нет: значения живут
 * в адресе, панель их читает и меняет — поэтому срез можно положить в
 * закладки, переслать, открыть в новой вкладке, и панель отрисуется
 * уже заполненной. По той же причине её можно рисовать на странице
 * дважды (колонка на широком экране и раскрывашка на телефоне) — обе
 * копии смотрят в один адрес и не могут разъехаться.
 *
 * Что описывать фильтрами и как собирать из них запрос — не здесь:
 * описания приходят готовыми из lib/catalogFilters.ts, уже с
 * переведёнными подписями.
 */
export default function FilterPanel({
  defs,
  variant = "column",
}: {
  defs: FilterDef[];
  /** column — правая колонка публичного поиска; bar — горизонтальная
   *  раскладка в админке. Отличаются только классами. */
  variant?: "column" | "bar";
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const uid = useId();

  function apply(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    // Любая смена фильтра возвращает на первую страницу: старый номер
    // страницы относился к другому срезу.
    params.delete("page");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  function setParam(key: string, value: string) {
    apply((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
  }

  function toggleValue(key: string, value: string) {
    const current = (searchParams.get(key) ?? "").split(",").filter(Boolean);
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setParam(key, next.join(","));
  }

  const anyActive = defs.some((d) =>
    d.kind === "yearRange" || d.kind === "dateRange"
      ? searchParams.get(`${d.key}From`) || searchParams.get(`${d.key}To`)
      : searchParams.get(d.key),
  );

  function resetAll() {
    apply((params) => {
      for (const d of defs) {
        params.delete(d.key);
        params.delete(`${d.key}From`);
        params.delete(`${d.key}To`);
      }
    });
  }

  return (
    <div className={variant === "bar" ? "filter-panel filter-panel-bar" : "filter-panel"}>
      {defs
        .filter(
          // Группа без единого варианта — шум: у страны и типа варианты
          // появятся по мере переимпорта каталога, а до тех пор пустой
          // блок «Ничего не нашлось» только смущает.
          (def) =>
            !(def.kind === "multi" || def.kind === "select") ||
            (def.options ?? []).length > 0,
        )
        .map((def) => (
        <FilterGroup
          key={def.key}
          def={def}
          uid={uid}
          selected={searchParams.get(def.key) ?? ""}
          rangeFrom={searchParams.get(`${def.key}From`) ?? ""}
          rangeTo={searchParams.get(`${def.key}To`) ?? ""}
          onToggle={(v) => toggleValue(def.key, v)}
          onSet={(v) => setParam(def.key, v)}
          onSetRange={(side, v) => setParam(`${def.key}${side}`, v)}
        />
        ))}
      {anyActive && (
        <button type="button" className="btn btn-ghost btn-sm align-self-start" onClick={resetAll}>
          {t.filters.reset}
        </button>
      )}
    </div>
  );
}

/** Сколько вариантов multi-списка видно без «показать все». */
const COLLAPSED_OPTIONS = 8;

function FilterGroup({
  def,
  uid,
  selected,
  rangeFrom,
  rangeTo,
  onToggle,
  onSet,
  onSetRange,
}: {
  def: FilterDef;
  uid: string;
  selected: string;
  rangeFrom: string;
  rangeTo: string;
  onToggle: (value: string) => void;
  onSet: (value: string) => void;
  onSetRange: (side: "From" | "To", value: string) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [optionQuery, setOptionQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected.split(",").filter(Boolean)), [selected]);

  if (def.kind === "flag") {
    return (
      <label className="form-check filter-group filter-flag">
        <input
          type="checkbox"
          className="form-check-input"
          checked={selected === "1"}
          onChange={(e) => onSet(e.target.checked ? "1" : "")}
        />
        <span className="form-check-label small">{def.title}</span>
      </label>
    );
  }

  if (def.kind === "text") {
    return (
      <div className="filter-group">
        <label className="filter-group-title" htmlFor={`${uid}-${def.key}`}>
          {def.title}
        </label>
        <DebouncedInput
          id={`${uid}-${def.key}`}
          value={selected}
          onCommit={onSet}
          className="form-control form-control-sm"
        />
      </div>
    );
  }

  if (def.kind === "yearRange" || def.kind === "dateRange") {
    const isYear = def.kind === "yearRange";
    return (
      <div className="filter-group">
        <span className="filter-group-title">{def.title}</span>
        <div className="d-flex align-items-center gap-2">
          <DebouncedInput
            value={rangeFrom}
            onCommit={(v) => onSetRange("From", v)}
            type={isYear ? "number" : "date"}
            placeholder={isYear ? String(def.min ?? "") : undefined}
            ariaLabel={`${def.title}: ${isYear ? t.filters.yearFrom : t.filters.dateFrom}`}
            className="form-control form-control-sm"
          />
          <span className="text-secondary small">—</span>
          <DebouncedInput
            value={rangeTo}
            onCommit={(v) => onSetRange("To", v)}
            type={isYear ? "number" : "date"}
            placeholder={isYear ? String(def.max ?? "") : undefined}
            ariaLabel={`${def.title}: ${isYear ? t.filters.yearTo : t.filters.dateTo}`}
            className="form-control form-control-sm"
          />
        </div>
      </div>
    );
  }

  if (def.kind === "select") {
    return (
      <div className="filter-group">
        <label className="filter-group-title" htmlFor={`${uid}-${def.key}`}>
          {def.title}
        </label>
        <select
          id={`${uid}-${def.key}`}
          className="form-select form-select-sm"
          value={selected}
          onChange={(e) => onSet(e.target.value)}
        >
          <option value="">{t.filters.anyOption}</option>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // multi: чекбоксы; длинные списки — свёрнуты и с поиском.
  const options = def.options ?? [];
  const query = optionQuery.trim().toLowerCase();
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query))
    : options;
  // Выбранные всегда видны, даже когда список свёрнут: чекбокс, который
  // нельзя увидеть, нельзя и снять.
  const visible =
    expanded || query
      ? filtered
      : [
          ...filtered.filter((o) => selectedSet.has(o.value)),
          ...filtered.filter((o) => !selectedSet.has(o.value)),
        ].slice(0, Math.max(COLLAPSED_OPTIONS, selectedSet.size));
  const hiddenCount = filtered.length - visible.length;

  return (
    <div className="filter-group">
      <span className="filter-group-title">
        {def.title}
        {selectedSet.size > 0 && <span className="filter-group-count">{selectedSet.size}</span>}
      </span>
      {def.searchable && (
        <input
          type="search"
          className="form-control form-control-sm mb-1"
          placeholder={t.filters.optionSearchPlaceholder}
          aria-label={`${def.title}: ${t.filters.optionSearchPlaceholder}`}
          value={optionQuery}
          onChange={(e) => setOptionQuery(e.target.value)}
        />
      )}
      <div className="filter-options">
        {visible.map((o) => (
          <label key={o.value} className="form-check filter-option">
            <input
              type="checkbox"
              className="form-check-input"
              checked={selectedSet.has(o.value)}
              onChange={() => onToggle(o.value)}
            />
            <span className="form-check-label small">{o.label}</span>
          </label>
        ))}
        {visible.length === 0 && (
          <span className="small text-secondary">{t.filters.live.empty}</span>
        )}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="btn btn-link btn-sm p-0 filter-more"
          onClick={() => setExpanded(true)}
        >
          {t.filters.showAllOptions(filtered.length)}
        </button>
      )}
      {expanded && !query && options.length > COLLAPSED_OPTIONS && (
        <button
          type="button"
          className="btn btn-link btn-sm p-0 filter-more"
          onClick={() => setExpanded(false)}
        >
          {t.filters.collapseOptions}
        </button>
      )}
    </div>
  );
}

/**
 * Поле, которое сообщает значение с паузой: диапазон года набирают по
 * цифре, и дёргать навигацию на каждую было бы четырьмя перерисовками
 * ради одного «2024». Enter и уход с поля сообщают сразу.
 */
function DebouncedInput({
  value,
  onCommit,
  type = "search",
  placeholder,
  className,
  id,
  ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  // Внешнее значение сменилось (сброс фильтров, навигация назад) —
  // черновик следует за ним. Подстройка прямо в рендере, а не в
  // эффекте: это благословлённый React-ом способ производного
  // состояния, эффект дал бы лишний промежуточный кадр.
  const [seen, setSeen] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  function commit(next: string) {
    if (timer.current) clearTimeout(timer.current);
    // Сравниваем с последним внешним значением: попытка «закоммитить»
    // то, что и так стоит в адресе, была бы пустой перерисовкой.
    if (next === value) return;
    onCommit(next);
  }

  return (
    <input
      id={id}
      type={type}
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(next), 600);
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(draft);
      }}
    />
  );
}
