"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dateKey, getMonthGrid, monthLabel, parseDateKey, WEEKDAY_NAMES_RU } from "@/lib/dates";

/** Отображаемый формат — ДД.ММ.ГГГГ; в форму (hidden input) уходит
 *  каноничный YYYY-MM-DD, как отдавал бы нативный input type=date. */
function formatDisplay(key: string): string {
  if (!key) return "";
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Кастомная замена <input type="date">: то же имя/значение для формы
 * (hidden input с YYYY-MM-DD), но с собственным календарём в стиле
 * сайта вместо нативного пикера (который в каждом браузере/ОС выглядит
 * по-своему, а под тайской локалью ещё и отдаёт буддийские года — см.
 * normalizeYear в dates.ts; отсюда значение всегда каноничное).
 */
export default function DatePickerInput({
  name,
  value: controlledValue,
  defaultValue = "",
  required = false,
  placeholder = "Выберите дату",
  onValueChange,
}: {
  /** Без name компонент работает как чисто контролируемый виджет —
   *  значение в форму тогда кладёт сам родитель. */
  name?: string;
  /** Контролируемый режим (для списков строк с key по индексу —
   *  внутренний state там прилипал бы к позиции, не к строке). */
  value?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  /** Для форм, которым нужно реагировать на выбор (например, подставить
   *  дату начала в поле конца поездки). */
  onValueChange?: (value: string) => void;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;
  const [isOpen, setIsOpen] = useState(false);
  const initialView = value ? parseDateKey(value) : new Date();
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());
  // Календарь рендерится порталом в body с fixed-координатами от поля —
  // абсолютное позиционирование внутри родителя обрезалось бы его
  // overflow'ом (модалки прокручиваются: .modal-panel { overflow-y:
  // auto }, см. скриншот-багрепорт с обрезанным календарём в попапе
  // создания поездки).
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const DROPDOWN_HEIGHT = 340; // примерная высота календаря для флипа вверх

  function open() {
    // Открываем всегда на месяце выбранной даты (или текущем).
    const base = value ? parseDateKey(value) : new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) {
      // Не даём календарю вылезти за правый край экрана и флипаем вверх,
      // если снизу не хватает места.
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 290));
      if (rect.bottom + DROPDOWN_HEIGHT > window.innerHeight && rect.top > DROPDOWN_HEIGHT) {
        setDropdownPos({ bottom: window.innerHeight - rect.top + 6, left });
      } else {
        setDropdownPos({ top: rect.bottom + 6, left });
      }
    }
    setIsOpen(true);
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function pick(day: Date) {
    const key = dateKey(day);
    if (!isControlled) setUncontrolledValue(key);
    setIsOpen(false);
    onValueChange?.(key);
  }

  const todayKey = dateKey(new Date());

  return (
    <div className="date-picker" ref={ref}>
      {name && <input type="hidden" name={name} value={value} />}
      {/* Видимое поле — без name (в форму уходит hidden выше) и
          контролируемое с onChange-noop: набор с клавиатуры ничего не
          меняет, зато нативная required-валидация работает (readOnly её
          бы отключил — readonly-поля исключены из constraint validation). */}
      <input
        ref={inputRef}
        type="text"
        className="form-control date-picker-toggle"
        value={value ? formatDisplay(value) : ""}
        placeholder={placeholder}
        required={required}
        onChange={() => {}}
        onMouseDown={(e) => {
          e.preventDefault();
          (e.target as HTMLInputElement).focus();
          if (isOpen) setIsOpen(false);
          else open();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isOpen) open();
          }
          if (e.key === "Escape") setIsOpen(false);
        }}
        onBlur={(e) => {
          // Закрываем только если фокус ушёл за пределы пикера целиком.
          if (!ref.current?.contains(e.relatedTarget as Node)) setIsOpen(false);
        }}
      />

      {isOpen && dropdownPos && createPortal(
        <div
          className="date-picker-dropdown"
          style={{
            position: "fixed",
            top: dropdownPos.top,
            bottom: dropdownPos.bottom,
            left: dropdownPos.left,
            // Инлайном, не классом: слой обязан быть выше .modal-overlay
            // (1050) при любом порядке/минификации CSS-правил.
            zIndex: 2000,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="d-flex align-items-center justify-content-between mb-2">
            <button
              type="button"
              className="icon-btn"
              aria-label="Предыдущий месяц"
              onClick={() => shiftMonth(-1)}
            >
              ←
            </button>
            <span className="fw-semibold small text-capitalize">
              {monthLabel(viewYear, viewMonth)}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Следующий месяц"
              onClick={() => shiftMonth(1)}
            >
              →
            </button>
          </div>

          <div className="date-picker-grid date-picker-weekdays">
            {WEEKDAY_NAMES_RU.map((wd) => (
              <span key={wd}>{wd}</span>
            ))}
          </div>
          <div className="date-picker-grid">
            {getMonthGrid(viewYear, viewMonth).map((day) => {
              const key = dateKey(day);
              const isCurrentMonth = day.getMonth() === viewMonth;
              const isSelected = key === value;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    "date-picker-day",
                    isCurrentMonth ? "" : "is-outside",
                    isSelected ? "is-selected" : "",
                    isToday ? "is-today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => pick(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {value && !required && (
            <button
              type="button"
              className="btn btn-ghost btn-sm w-100 mt-2"
              onClick={() => {
                if (!isControlled) setUncontrolledValue("");
                setIsOpen(false);
                onValueChange?.("");
              }}
            >
              Сбросить
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
