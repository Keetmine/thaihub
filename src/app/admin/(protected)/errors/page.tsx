import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { TrashIcon } from "@/components/icons";
import { clearErrorLog, deleteErrorGroup, markErrorsReviewed } from "./actions";
import Pagination from "@/components/Pagination";
import Link from "next/link";

export const metadata = { title: "Ошибки" };

export const dynamic = "force-dynamic";

// Лог серверных ошибок: onRequestError (instrumentation.ts) пишет сюда
// всё, что упало в страницах/экшенах/роутах. Показываем не плоскую
// ленту, а группы: одна упавшая страница за ночь набивает сотни
// одинаковых записей, и до второй ошибки было не долистать.
// Ключ группы — digest (у ошибок без digest он null, тогда группирует
// message; groupBy по паре полей это и даёт).
const PAGE_SIZE = 20;

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

  const [groups, allGroupKeys, unreviewed] = await Promise.all([
    prisma.errorLog.groupBy({
      by: ["digest", "message"],
      where: errorsWhere,
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    // Общее число групп: groupBy не умеет отдавать свой count, а
    // считать distinct по паре полей Prisma тоже не может — берём
    // список ключей (по строке на группу; их немного, лог чистится).
    prisma.errorLog.groupBy({ by: ["digest", "message"], where: errorsWhere }),
    prisma.errorLog.count({ where: { reviewedAt: null } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(allGroupKeys.length / PAGE_SIZE));

  // Последний пример каждой группы страницы — для стека и path.
  const examples = await Promise.all(
    groups.map((g) =>
      prisma.errorLog.findFirst({
        where: { ...errorsWhere, digest: g.digest, message: g.message },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );

  const fmt = (d: Date | null) =>
    d
      ? d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "?";

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
              <SubmitButton
                label={`Пометить разобранными (${unreviewed})`}
                busyLabel="Сохраняем…"
                className="btn btn-ghost btn-sm"
              />
            </form>
          )}
          {groups.length > 0 && (
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

      {groups.length === 0 ? (
        <p className="text-secondary">Ошибок нет — красота.</p>
      ) : (
        <div className="d-flex flex-column gap-2 scroll-list-lg thin-scroll">
          {groups.map((g, i) => {
            const example = examples[i];
            const count = g._count._all;
            return (
              <div
                key={`${g.digest ?? ""}|${g.message}`}
                className="surface d-flex justify-content-between gap-3 p-3"
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="small mb-1">
                    <span className="text-danger">{g.message}</span>
                    {count > 1 && (
                      <span className="badge rounded-pill text-bg-secondary ms-2">×{count}</span>
                    )}
                  </p>
                  <p className="small text-secondary mb-1">
                    {count > 1
                      ? `${fmt(g._min.createdAt)} — ${fmt(g._max.createdAt)}`
                      : fmt(g._max.createdAt)}
                    {example?.path ? ` · ${example.path}` : ""}
                    {g.digest ? ` · digest ${g.digest}` : ""}
                  </p>
                  {example?.stack && (
                    <details>
                      <summary className="small text-secondary" style={{ cursor: "pointer" }}>
                        Стек (последнее появление)
                      </summary>
                      <pre
                        className="small text-secondary mb-0 mt-1"
                        style={{ whiteSpace: "pre-wrap", maxHeight: "14rem", overflowY: "auto" }}
                      >
                        {example.stack}
                      </pre>
                    </details>
                  )}
                </div>
                <ConfirmForm
                  action={deleteErrorGroup.bind(null, g.digest, g.message)}
                  confirmMessage={
                    count > 1 ? `Удалить все ${count} записей этой ошибки?` : "Удалить запись?"
                  }
                  className="flex-shrink-0"
                >
                  <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить">
                    <TrashIcon />
                  </button>
                </ConfirmForm>
              </div>
            );
          })}
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
