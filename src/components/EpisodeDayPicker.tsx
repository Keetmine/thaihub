"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DatePickerInput from "@/components/DatePickerInput";

/**
 * Выбор дня для блока «Новые серии».
 *
 * Календарь СВОЙ, а не нативный `input[type=date]` (правка владельца
 * 2026-09-16: «календарь делаем кастомный с выбором дат»). Нативный
 * рисует браузер, и выглядит он в каждом по-своему — посреди тёмной
 * витрины это читалось чужой деталью. `DatePickerInput` — тот же
 * календарь, что в поездках и событиях, с выбором месяца и года.
 *
 * День уезжает в адрес (`?day=2026-09-16`) — как и стрелки рядом.
 * Своего состояния у компонента нет: срез можно переслать и положить в
 * закладки, а страница остаётся серверной.
 */
export default function EpisodeDayPicker({ day }: { day: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
      {/* Годы — от начала каталога и на пару вперёд: расписание ведут
          заранее, и «через год» в нём встречается. */}
      <DatePickerInput value={day} onValueChange={go} yearsBack={12} yearsForward={2} />
    </span>
  );
}
