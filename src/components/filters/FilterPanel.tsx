"use client";

import { useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import { ChevronDownIcon } from "@/components/icons";
import type { FilterDef } from "@/lib/catalogFilters";

/**
 * Панель фильтров каталога. Своего состояния у неё нет: значения живут
 * в адресе, панель их читает и меняет — поэтому срез можно положить в
 * закладки, переслать, открыть в новой вкладке, и панель отрисуется
 * уже заполненной. По той же причине её можно рисовать на странице
 * дважды (колонка на широком экране и раскрывашка на телефоне) — обе
 * копии смотрят в один адрес и не могут разъехаться.
 *
 * Устройство — по правкам владельца: каждая группа сворачивается за
 * заголовок (стрелка у правого края; агентства и теги свёрнуты по
 * умолчанию, группа с выбранным значением открыта всегда), варианты —
 * чекбоксами в два столбца, ЦЕЛИКОМ и без прокрутки; отдельных плашек
 * выбранного нет — отмеченный чекбокс говорит сам за себя. Теги —
 * особый случай: значений сотни, поэтому там поле поиска, подходящие —
 * плашками в ряд, выбранные — снимаемыми плашками под полем.
 *
 * Что описывать фильтрами и как собирать из них запрос — не здесь:
 * описания приходят готовыми из lib/catalogFilters.ts, уже с
 * переведёнными подписями.
 */
export default function FilterPanel({ defs }: { defs: FilterDef[] }) {
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

  const shown = defs.filter(
    // Группа без единого варианта — шум, если только она не помечена
    // «показывать всегда» (страна: варианты появятся по мере
    // переимпорта, а пометка объяснит, почему пусто).
    (def) =>
      def.alwaysShow ||
      !(def.kind === "multi" || def.kind === "select") ||
      (def.options ?? []).length > 0,
  );

  // Одиночные флаги («Без постера»…) собираются в один столбик, а не
  // расползаются по панели с большими зазорами (правка владельца).
  const rendered: React.ReactNode[] = [];
  let flagStack: FilterDef[] = [];
  const flushFlags = () => {
    if (flagStack.length === 0) return;
    rendered.push(
      <div key={`flags-${flagStack[0].key}`} className="filter-flag-stack">
        {flagStack.map((def) => (
          <label key={def.key} className="form-check filter-flag">
            <input
              type="checkbox"
              className="form-check-input"
              checked={searchParams.get(def.key) === "1"}
              onChange={(e) => setParam(def.key, e.target.checked ? "1" : "")}
            />
            <span className="form-check-label small">{def.title}</span>
          </label>
        ))}
      </div>,
    );
    flagStack = [];
  };
  for (const def of shown) {
    if (def.kind === "flag") {
      flagStack.push(def);
      continue;
    }
    flushFlags();
    rendered.push(
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
      />,
    );
  }
  flushFlags();

  return (
    <div className="filter-panel">
      {rendered}
      {anyActive && (
        <button type="button" className="btn btn-ghost btn-sm align-self-start" onClick={resetAll}>
          {t.filters.reset}
        </button>
      )}
    </div>
  );
}

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
  const hasActive =
    def.kind === "yearRange" || def.kind === "dateRange"
      ? Boolean(rangeFrom || rangeTo)
      : Boolean(selected);
  // Раскрыта ли группа — своё состояние, а не атрибут из пропов: иначе
  // каждая перерисовка (то есть каждая смена любого фильтра)
  // захлопывала бы группы обратно.
  const [open, setOpen] = useState(!def.collapsed || hasActive);
  const [optionQuery, setOptionQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected.split(",").filter(Boolean)), [selected]);

  let body: React.ReactNode;

  if (def.kind === "text") {
    body = (
      <DebouncedInput
        id={`${uid}-${def.key}`}
        value={selected}
        onCommit={onSet}
        ariaLabel={def.title}
        className="form-control form-control-sm"
      />
    );
  } else if (def.kind === "yearRange" || def.kind === "dateRange") {
    const isYear = def.kind === "yearRange";
    body = (
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
    );
  } else if (def.kind === "select") {
    // Радио-кнопки, а не выпадашка (правка владельца): варианты видны
    // все сразу, «Любые» снимает выбор.
    body = (
      <div className="filter-options filter-options-grid" role="radiogroup" aria-label={def.title}>
        <label className="form-check filter-option">
          <input
            type="radio"
            className="form-check-input"
            name={`${uid}-${def.key}`}
            checked={selected === ""}
            onChange={() => onSet("")}
          />
          <span className="form-check-label small">{t.filters.anyOption}</span>
        </label>
        {(def.options ?? []).map((o) => (
          <label key={o.value} className="form-check filter-option">
            <input
              type="radio"
              className="form-check-input"
              name={`${uid}-${def.key}`}
              checked={selected === o.value}
              onChange={() => onSet(o.value)}
            />
            <span className="form-check-label small">{o.label}</span>
          </label>
        ))}
      </div>
    );
  } else if (def.chipStyle) {
    // Теги: поле поиска, подходящие — плашками в ряд (как чипы на
    // карточке сериала), выбранные — снимаемыми плашками ПОД полем.
    const options = def.options ?? [];
    const query = optionQuery.trim().toLowerCase();
    // Выбранное строим от адреса, а не от списка вариантов: список
    // приходит из получасового кэша, и свежего значения (или значения
    // из чужой ссылки) в нём может не быть — а плашка снятия обязана
    // быть в любом случае.
    const chosen = [...selectedSet].map(
      (v) => options.find((o) => o.value === v) ?? { value: v, label: v },
    );
    const suggestions = query
      ? options.filter(
          (o) => !selectedSet.has(o.value) && o.label.toLowerCase().includes(query),
        )
      : [];
    body = (
      <>
        <input
          type="search"
          className="form-control form-control-sm mb-2"
          placeholder={t.filters.optionSearchPlaceholder}
          aria-label={`${def.title}: ${t.filters.optionSearchPlaceholder}`}
          value={optionQuery}
          onChange={(e) => setOptionQuery(e.target.value)}
        />
        {chosen.length > 0 && (
          <div className="filter-chips mb-2">
            {chosen.map((o) => (
              <button
                key={o.value}
                type="button"
                className="filter-chip"
                onClick={() => onToggle(o.value)}
                title={t.filters.reset}
              >
                {o.label}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        )}
        {query &&
          (suggestions.length > 0 ? (
            <div className="filter-chips">
              {suggestions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="filter-chip filter-chip-option"
                  onClick={() => {
                    onToggle(o.value);
                    setOptionQuery("");
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="small text-secondary">{t.filters.live.empty}</span>
          ))}
      </>
    );
  } else {
    // multi: чекбоксы в два столбца, ЦЕЛИКОМ — без прокрутки, без
    // «показать все» и без перестановки выбранных наверх (правки
    // владельца: чекбокс должен оставаться там, где его нашли).
    // Значение из адреса, которого нет в кэшированном списке, всё равно
    // показываем отмеченным чекбоксом — иначе его не снять.
    const options = [
      ...(def.options ?? []),
      ...[...selectedSet]
        .filter((v) => !(def.options ?? []).some((o) => o.value === v))
        .map((v) => ({ value: v, label: v })),
    ];
    body =
      options.length === 0 ? (
        <span className="small text-secondary">{t.filters.noOptionsYet}</span>
      ) : (
        <div className="filter-options filter-options-grid">
          {options.map((o) => (
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
        </div>
      );
  }

  // Не details: его сворачивание мгновенное и «скачет» (правка
  // владельца). Гармошка на grid-template-rows 0fr→1fr — высота едет
  // плавно, тело остаётся в DOM, состояние у группы и так своё.
  return (
    <div className={`filter-group ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="filter-group-title"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {def.title}
        {/* Счётчик — только у multi, с числом. Точка у остальных видов
            выглядела мусором (правка владельца) — раскрытая группа и
            отмеченное значение говорят сами за себя. */}
        {selectedSet.size > 0 && def.kind === "multi" && (
          <span className="filter-group-count">{selectedSet.size}</span>
        )}
        <span className="filter-chevron" aria-hidden>
          <ChevronDownIcon />
        </span>
      </button>
      <div className="filter-group-body">
        <div className="filter-group-body-inner">
          {def.hint && <p className="filter-group-hint">{def.hint}</p>}
          {body}
        </div>
      </div>
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
