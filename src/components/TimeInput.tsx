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
 * Здесь пустое поле пустое, а ввод идёт по МАСКЕ «ЧЧ:ММ»: принимаются
 * только цифры, двоеточие ставится само, часы держатся в 00–23, минуты
 * в 00–59. Набрать «99999» нельзя (правка владельца 2026-09-09) —
 * раньше поле пропускало что угодно и надеялось на проверку сервера.
 */

/** Ввод по маске: из набранного оставляем цифры и складываем «ЧЧ:ММ».
 *  `prev` нужен для забоя: стирая двоеточие, человек хочет стереть и
 *  цифру перед ним, иначе маска возвращает его на место и поле
 *  «залипает». */
export function maskTime(raw: string, prev: string): string {
  let digits = raw.replace(/\D/g, "").slice(0, 4);
  if (prev.endsWith(":") && raw === prev.slice(0, -1)) digits = digits.slice(0, -1);
  if (!digits) return "";

  let hours = digits.slice(0, 2);
  // Одинокая цифра больше двух часами первого разряда быть не может:
  // человек набрал «9» — значит 09, и двоеточие пора ставить.
  if (hours.length === 1 && Number(hours) > 2) hours = `0${hours}`;
  if (hours.length === 2 && Number(hours) > 23) hours = "23";
  if (hours.length < 2) return hours;

  const minutes = digits.slice(2);
  if (!minutes) return `${hours}:`;
  return `${hours}:${Number(minutes) > 59 ? "59" : minutes}`;
}

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
      // Ровно «ЧЧ:ММ». Маска и так не пустит больше, но с атрибутом это
      // видно и мобильной клавиатуре, и автозаполнению.
      maxLength={5}
      placeholder="чч:мм"
      className={className}
      value={current}
      onChange={(e) => set(maskTime(e.target.value, current))}
      onBlur={() => {
        // Недобранное дополняем при уходе из поля: «12» и «12:» — это
        // 12:00. Пустое остаётся пустым: у времени это законное «не
        // назначено», подставлять сюда полночь нельзя.
        if (!current) return;
        const normalized = normalizeTimeValue(current);
        if (normalized && normalized !== current) set(normalized);
      }}
    />
  );
}
