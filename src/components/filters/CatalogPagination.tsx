import AppLink from "@/components/AppLink";
import { getT } from "@/lib/i18n";
import type { FilterParams } from "@/lib/catalogFilters";

/**
 * Постраничная листалка каталога и поиска.
 *
 * Prev/Next, без списка номеров: глубокие переходы в выдаче — это
 * листание, а не навигация, и полоса из двухсот номеров под таблицей
 * никому не помогает.
 *
 * Адрес собирается от ТЕКУЩИХ параметров, поэтому страница не теряет ни
 * фильтры, ни сортировку, ни раздел каталога. `basePath` — потому что
 * листалка живёт на двух страницах сразу (/search и /dramas), а раньше
 * была приколочена к /search.
 */
export default async function CatalogPagination({
  page,
  pages,
  params,
  basePath,
}: {
  page: number;
  pages: number;
  params: FilterParams;
  basePath: string;
}) {
  const { t } = await getT();
  if (pages <= 1) return null;

  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string" && v) qs.set(k, v);
    }
    if (p > 1) qs.set("page", String(p));
    else qs.delete("page");
    return qs.size ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="d-flex align-items-center gap-3 mt-4">
      {page > 1 && (
        <AppLink href={href(page - 1)} prefetch={false} className="btn btn-ghost btn-sm">
          ← {t.filters.prevPage}
        </AppLink>
      )}
      <span className="small text-secondary">
        {page} / {pages}
      </span>
      {page < pages && (
        <AppLink href={href(page + 1)} prefetch={false} className="btn btn-ghost btn-sm">
          {t.filters.nextPage} →
        </AppLink>
      )}
    </div>
  );
}
