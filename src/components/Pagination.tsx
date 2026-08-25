import AppLink from "@/components/AppLink";
import { getT } from "@/lib/i18n";

/** Prev/next pager for admin list pages — a full numbered page list isn't
 *  practical once a catalog runs into the hundreds of pages, so this is
 *  just "‹ Back / Page X of Y / Next ›". `buildHref` gets the target
 *  page number and returns the full URL, so callers keep whatever other
 *  query params (q, view, status…) are already active. */
export default async function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const { t } = await getT();

  return (
    <nav
      className="d-flex align-items-center justify-content-center gap-3 mt-4"
      aria-label={t.ui.paginationLabel}
    >
      {page > 1 ? (
        <AppLink href={buildHref(page - 1)} className="btn btn-ghost btn-sm">
          {t.ui.prevPage}
        </AppLink>
      ) : (
        <span className="btn btn-ghost btn-sm disabled">{t.ui.prevPage}</span>
      )}
      <span className="small text-secondary">{t.ui.pageOf(page, totalPages)}</span>
      {page < totalPages ? (
        <AppLink href={buildHref(page + 1)} className="btn btn-ghost btn-sm">
          {t.ui.nextPage}
        </AppLink>
      ) : (
        <span className="btn btn-ghost btn-sm disabled">{t.ui.nextPage}</span>
      )}
    </nav>
  );
}
