import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import { clearErrorLog, deleteErrorEntry, markErrorsReviewed } from "./actions";
import Pagination from "@/components/Pagination";
import Link from "next/link";

export const metadata = { title: "Ошибки" };

export const dynamic = "force-dynamic";

// Лог серверных ошибок: onRequestError (instrumentation.ts) пишет сюда
// всё, что упало в страницах/экшенах/роутах.
const PAGE_SIZE = 50;

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; period?: string }>;
}) {
  await requireAdminPage();
  const { page: rawPage, period } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);
  // ?period=day — переход с дашборда «ошибок за сутки»: там счётчик
  // именно суточный, и список должен совпадать с ним.
  // Границу суток считаем от new Date(), а не Date.now(): правило
  // react-hooks запрещает Date.now() в рендере как нестабильный вызов.
  const dayAgo = new Date();
  dayAgo.setUTCHours(dayAgo.getUTCHours() - 24);
  const errorsWhere = period === "day" ? { createdAt: { gte: dayAgo } } : {};
  const [errors, total, unreviewed] = await Promise.all([
    prisma.errorLog.findMany({
      where: errorsWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.errorLog.count({ where: errorsWhere }),
    prisma.errorLog.count({ where: { reviewedAt: null } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Ошибки
        </h1>
        <span className="d-flex flex-wrap align-items-center gap-2">
          {unreviewed > 0 && (
            <form action={markErrorsReviewed}>
              <button type="submit" className="btn btn-ghost btn-sm">
                Пометить разобранными ({unreviewed})
              </button>
            </form>
          )}
          {errors.length > 0 && (
            <ConfirmForm action={clearErrorLog} confirmMessage="Очистить весь лог ошибок?">
              <button type="button" className="btn btn-ghost btn-sm">
                Очистить всё
              </button>
            </ConfirmForm>
          )}
        </span>
      </div>

      {period === "day" && (
        <p className="small text-secondary mb-3">
          Показаны ошибки за последние сутки.{" "}
          <Link href="/admin/errors" className="link-body-emphasis">
            Показать все
          </Link>
        </p>
      )}

      {errors.length === 0 ? (
        <p className="text-secondary">Ошибок нет — красота.</p>
      ) : (
        <div className="d-flex flex-column gap-2 scroll-list-lg thin-scroll">
          {errors.map((e) => (
            <div key={e.id} className="surface d-flex justify-content-between gap-3 p-3">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small mb-1">
                  <span className="text-danger">{e.message}</span>
                </p>
                <p className="small text-secondary mb-1">
                  {fmt(e.createdAt)}
                  {e.path ? ` · ${e.path}` : ""}
                  {e.digest ? ` · digest ${e.digest}` : ""}
                </p>
                {e.stack && (
                  <details>
                    <summary className="small text-secondary" style={{ cursor: "pointer" }}>
                      Стек
                    </summary>
                    <pre
                      className="small text-secondary mb-0 mt-1"
                      style={{ whiteSpace: "pre-wrap", maxHeight: "14rem", overflowY: "auto" }}
                    >
                      {e.stack}
                    </pre>
                  </details>
                )}
              </div>
              <ConfirmForm
                action={deleteErrorEntry.bind(null, e.id)}
                confirmMessage="Удалить запись?"
                className="flex-shrink-0"
              >
                <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить">
                  <TrashIcon />
                </button>
              </ConfirmForm>
            </div>
          ))}
        </div>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/errors?page=${p}${period === "day" ? "&period=day" : ""}`}
      />
    </div>
  );
}
