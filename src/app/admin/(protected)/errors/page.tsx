import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import { clearErrorLog, deleteErrorEntry } from "./actions";

export const metadata = { title: "Ошибки" };

export const dynamic = "force-dynamic";

// Лог серверных ошибок: onRequestError (instrumentation.ts) пишет сюда
// всё, что упало в страницах/экшенах/роутах.
export default async function AdminErrorsPage() {
  await requireAdminPage();
  const errors = await prisma.errorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Ошибки
        </h1>
        {errors.length > 0 && (
          <ConfirmForm action={clearErrorLog} confirmMessage="Очистить весь лог ошибок?">
            <button type="button" className="btn btn-ghost btn-sm">
              Очистить всё
            </button>
          </ConfirmForm>
        )}
      </div>

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
    </div>
  );
}
