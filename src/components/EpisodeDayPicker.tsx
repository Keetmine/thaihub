"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { useT } from "@/components/LocaleProvider";
import { CalendarIcon } from "@/components/icons";

/**
 * Выбор дня для блока «Новые серии»: маленькая кнопка-календарь, за
 * которой прячется нативный `input[type=date]`.
 *
 * Нативный, а не наш DatePickerInput: тот рисует полноценную выпадашку
 * с месяцем и годом, и в ряду со стрелками она перевешивала бы сам
 * блок. Здесь нужно ровно «открыть календарь и выбрать день».
 *
 * День уезжает в адрес (`?day=2026-09-16`) — как и стрелки рядом. Своего
 * состояния у компонента нет: срез можно переслать и положить в
 * закладки, а страница остаётся серверной.
 */
export default function EpisodeDayPicker({ day }: { day: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  function go(value: string) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("day", value);
    // Листание дней не должно тащить за собой номер страницы списка
    // ниже: он относится к другому срезу.
    params.delete("page");
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  return (
    <span className="episode-day-pick">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={t.catalog.showcase.pickDay}
        title={t.catalog.showcase.pickDay}
        onClick={() => {
          // showPicker есть не везде (Safari до 16, старый Firefox) —
          // там остаётся обычный клик по самому полю, оно лежит под
          // кнопкой и ловит его само.
          const el = inputRef.current;
          if (!el) return;
          if (typeof el.showPicker === "function") el.showPicker();
          else el.focus();
        }}
      >
        <CalendarIcon />
      </button>
      <input
        ref={inputRef}
        type="date"
        className="episode-day-input"
        value={day}
        aria-label={t.catalog.showcase.pickDay}
        onChange={(e) => go(e.target.value)}
      />
    </span>
  );
}
