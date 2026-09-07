import Link from "next/link";
import { adminListHref } from "@/lib/adminListHref";
import type { AdminSortOption } from "@/lib/adminSort";

/**
 * Переключатель сортировки над админ-списком (см. `src/lib/adminSort.ts`).
 *
 * Адреса строит `adminListHref` от текущих searchParams: поиск, вкладка
 * и панель фильтров остаются на месте, а страница сбрасывается — другой
 * порядок смотрят с начала.
 */
export default function AdminSortLinks({
  basePath,
  params,
  options,
  active,
  className = "d-flex flex-wrap align-items-center gap-2 mb-4",
}: {
  basePath: string;
  /** Уже await-нутый `searchParams` страницы. */
  params: Record<string, string | string[] | undefined>;
  options: AdminSortOption[];
  /** Ключ выбранного варианта (`activeAdminSort`); `null` — по умолчанию. */
  active: string | null;
  /** Списки с вкладками кладут переключатель внутрь `.tab-bar-row`,
   *  который отступ снизу даёт сам. */
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="small text-secondary">Сортировка:</span>
      {options.map((o) => (
        <Link
          key={o.key ?? "default"}
          href={adminListHref(basePath, params, { sort: o.key, page: 1 })}
          prefetch={false}
          className={`btn btn-sm ${active === o.key ? "btn-primary" : "btn-ghost"}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
