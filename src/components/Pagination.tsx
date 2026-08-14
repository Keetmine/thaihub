import Link from "next/link";

/** Prev/next pager for admin list pages — a full numbered page list isn't
 *  practical once a catalog runs into the hundreds of pages, so this is
 *  just "‹ Назад / Стр. X из Y / Далее ›". `buildHref` gets the target
 *  page number and returns the full URL, so callers keep whatever other
 *  query params (q, view, status…) are already active. */
export default function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className="d-flex align-items-center justify-content-center gap-3 mt-4"
      aria-label="Постраничная навигация"
    >
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className="btn btn-ghost btn-sm">
          ‹ Назад
        </Link>
      ) : (
        <span className="btn btn-ghost btn-sm disabled">‹ Назад</span>
      )}
      <span className="small text-secondary">
        Стр. {page} из {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={buildHref(page + 1)} className="btn btn-ghost btn-sm">
          Далее ›
        </Link>
      ) : (
        <span className="btn btn-ghost btn-sm disabled">Далее ›</span>
      )}
    </nav>
  );
}
