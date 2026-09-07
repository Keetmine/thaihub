"use client";

import { useState } from "react";
import { normalizeTimeValue } from "@/lib/dates";

/**
 * Поле времени вместо нативного `<input type="time">`.
 *
 * Заведено по той же причине, что и `DatePickerInput` вместо
 * `type="date"`: нативное поле рисует БРАУЗЕР, и что там увидит человек,
 * мы не решаем. Пустое поле показывалось как «12:30» — значения в форме
 * не было, а на экране оно было (жалоба владельца 2026-09-09: «у меня
 * всегда везде выводится 12:30, а если стереть — возвращается снова»).
 * Дальше человек правил эту фантомную подпись, отправлял половину («12»
 * без минут) и получал ошибку про неправильную дату.
 *
 * Здесь пустое поле пустое, а подсказка формата — обычный placeholder.
 * Ввод не ограничиваем на лету по одному символу (так поле дёргается
 * из-под пальцев): пускаем цифры и двоеточие, а приводим к «ЧЧ:ММ» на
 * потере фокуса — тем же `normalizeTimeValue`, что и сервер. Поэтому
 * «12», «12:», «1230» и «9:30» одинаково становятся нормальным
 * временем, а мусор просто остаётся в поле, и сервер его отклонит.
 */
export default function TimeInput({
  id,
  name,
  value,
  defaultValue = "",
  onValueChange,
  className = "form-control",
  required = false,
  ariaLabel,
}: {
  id?: string;
  name?: string;
  /** Контролируемый режим — как у `DatePickerInput`: значение держит
   *  родитель (строки дат в админ-форме события живут в его состоянии). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  required?: boolean;
  ariaLabel?: string;
}) {
  const isControlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue);
  const current = isControlled ? value : own;

  function set(next: string) {
    if (!isControlled) setOwn(next);
    onValueChange?.(next);
  }

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      required={required}
      aria-label={ariaLabel}
      // Пять знаков — ровно «ЧЧ:ММ»: больше в осмысленное время не
      // складывается, а обрезать лишнее молча неприятно.
      maxLength={5}
      placeholder="чч:мм"
      className={className}
      value={current}
      onChange={(e) => set(e.target.value.replace(/[^\d:.\s-]/g, ""))}
      onBlur={() => {
        const trimmed = current.trim();
        if (!trimmed) {
          // Пустое остаётся пустым: у времени это законное «не
          // назначено», и подставлять сюда полночь нельзя.
          if (trimmed !== current) set("");
          return;
        }
        const normalized = normalizeTimeValue(trimmed);
        if (normalized) set(normalized);
      }}
    />
  );
}
