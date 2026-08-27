"use client";

import { useId } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Сортировка выдачи. Как и фильтры, живёт в адресе (`?sort=rating`),
 *  а не в состоянии — ссылка на срез уносит с собой и порядок. */
export default function SortSelect({
  options,
  label,
}: {
  options: { value: string; label: string }[];
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = useId();
  const current = searchParams.get("sort") ?? options[0]?.value ?? "";

  return (
    <span className="d-inline-flex align-items-center gap-2 ms-auto">
      <label className="small text-secondary" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="form-select form-select-sm w-auto"
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value === options[0]?.value) params.delete("sort");
          else params.set("sort", e.target.value);
          params.delete("page");
          router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
