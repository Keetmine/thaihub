"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import type { FilterDef } from "@/lib/catalogFilters";

type Chip = {
  /** Что показать: «Жанры: Romance», «Год: 2022–2024», «Без постера». */
  label: string;
  /** Что сделать с адресом, когда чип сняли. */
  remove: (params: URLSearchParams) => void;
};

/**
 * Выбранные фильтры — чипами над выдачей, каждый снимается своим
 * крестиком (просьба владельца: активный срез должен быть виден без
 * заглядывания в панель).
 *
 * Как и панель, без своего состояния: чипы — прочтение адреса, крестик
 * — правка адреса. Подписи берутся из тех же описаний фильтров, что и
 * панель, поэтому разъехаться им не из чего.
 */
export default function FilterChips({ defs }: { defs: FilterDef[] }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const chips: Chip[] = [];
  for (const def of defs) {
    if (def.kind === "yearRange" || def.kind === "dateRange") {
      const from = searchParams.get(`${def.key}From`) ?? "";
      const to = searchParams.get(`${def.key}To`) ?? "";
      if (from || to) {
        chips.push({
          label: `${def.title}: ${from || "…"}–${to || "…"}`,
          remove: (p) => {
            p.delete(`${def.key}From`);
            p.delete(`${def.key}To`);
          },
        });
      }
      continue;
    }
    const raw = searchParams.get(def.key) ?? "";
    if (!raw) continue;
    if (def.kind === "flag") {
      chips.push({ label: def.title, remove: (p) => p.delete(def.key) });
    } else if (def.kind === "text") {
      chips.push({ label: `${def.title}: ${raw}`, remove: (p) => p.delete(def.key) });
    } else if (def.kind === "select") {
      const label = def.options?.find((o) => o.value === raw)?.label ?? raw;
      chips.push({ label: `${def.title}: ${label}`, remove: (p) => p.delete(def.key) });
    } else {
      // multi: по чипу на каждое значение — снимаются поодиночке.
      for (const value of raw.split(",").filter(Boolean)) {
        const label = def.options?.find((o) => o.value === value)?.label ?? value;
        chips.push({
          label: `${def.title}: ${label}`,
          remove: (p) => {
            const rest = (p.get(def.key) ?? "")
              .split(",")
              .filter((v) => v && v !== value);
            if (rest.length) p.set(def.key, rest.join(","));
            else p.delete(def.key);
          },
        });
      }
    }
  }

  if (chips.length === 0) return null;

  function apply(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  return (
    <div className="filter-chips" role="list">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          role="listitem"
          className="filter-chip"
          onClick={() => apply(chip.remove)}
          title={t.filters.reset}
        >
          {chip.label}
          <span aria-hidden>×</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          className="filter-chip filter-chip-clear"
          onClick={() =>
            apply((p) => {
              for (const def of defs) {
                p.delete(def.key);
                p.delete(`${def.key}From`);
                p.delete(`${def.key}To`);
              }
            })
          }
        >
          {t.filters.reset}
        </button>
      )}
    </div>
  );
}
