"use client";

import { useRouter } from "next/navigation";
import { monthNames } from "@/lib/dates";
import { useLocale, useLocaleHref, useT } from "@/components/LocaleProvider";

// Быстрый переход: селекты месяца и года вместо долгого листания
// стрелками (поездка через два года — 20+ кликов «След.»).
export default function MonthYearJump({
  year,
  month,
  viewQuery,
}: {
  year: number;
  month: number; // 0-11
  viewQuery: string; // "&view=mine" | ""
}) {
  const t = useT();
  const locale = useLocale();
  const withLocale = useLocaleHref();
  const months = monthNames(locale);
  const router = useRouter();
  const nowYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = nowYear - 2; y <= nowYear + 4; y++) years.push(y);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);

  function go(y: number, m: number) {
    router.push(withLocale(`/calendar?year=${y}&month=${m + 1}${viewQuery}`));
  }

  return (
    <div className="d-flex gap-2">
      <select
        className="form-select form-select-sm w-auto"
        value={month}
        onChange={(e) => go(year, Number(e.target.value))}
        aria-label={t.events.calendar.monthSelect}
      >
        {months.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </select>
      <select
        className="form-select form-select-sm w-auto"
        value={year}
        onChange={(e) => go(Number(e.target.value), month)}
        aria-label={t.events.calendar.yearSelect}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
