import Link from "next/link";
import { prisma } from "@/lib/prisma";
import StopImportButton from "./StopImportButton";

/**
 * Журнал прогонов ПОД блоками импорта своей вкладки (просьба владельца
 * 2026-09-06): запустил парсер — и тут же под формой видно, чем дело
 * кончилось, не уходя на вкладку «Журнал».
 *
 * Показываются только прогоны ЭТОЙ вкладки: виды (`ImportRun.kind`)
 * перечисляет вызывающий — они же подписаны в KIND_LABELS страницы.
 * Полный журнал со всеми видами, пагинацией и лентой спарсенного
 * остаётся отдельной вкладкой, сюда идёт короткий хвост.
 */
export default async function TabRunsJournal({
  kinds,
  labels,
  /** Сколько последних прогонов показывать. */
  take = 5,
}: {
  kinds: readonly string[];
  labels: Record<string, string>;
  take?: number;
}) {
  if (kinds.length === 0) return null;

  const [runs, total] = await Promise.all([
    prisma.importRun.findMany({
      where: { kind: { in: [...kinds] } },
      orderBy: { startedAt: "desc" },
      take,
    }),
    prisma.importRun.count({ where: { kind: { in: [...kinds] } } }),
  ]);

  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <section className="admin-section mb-4">
      <div className="admin-section-head">
        <span className="admin-section-title">Журнал этой вкладки</span>
        <span className="admin-section-hint">
          {total > 0 ? `последние ${runs.length} из ${total}` : "прогонов ещё не было"}
        </span>
      </div>

      {runs.length === 0 ? (
        <p className="small text-secondary mb-0">
          Здесь появятся прогоны, запущенные с этой вкладки.
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {runs.map((r) => (
            <div
              key={r.id}
              className="surface d-flex flex-wrap justify-content-between gap-3 p-3"
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small mb-0">
                  <b>{labels[r.kind] ?? r.kind}</b>{" "}
                  <span
                    className={
                      r.status === "DONE"
                        ? "text-success"
                        : r.status === "FAILED"
                          ? "text-danger"
                          : r.status === "CANCELLED"
                            ? "text-secondary"
                            : "text-warning"
                    }
                  >
                    ·{" "}
                    {r.status === "DONE"
                      ? "готово"
                      : r.status === "FAILED"
                        ? "ошибка"
                        : r.status === "CANCELLED"
                          ? "остановлено"
                          : "выполняется"}
                  </span>
                </p>
                {r.summary && <p className="small text-secondary mb-0">{r.summary}</p>}
              </div>
              <span className="d-flex align-items-center gap-2 flex-shrink-0">
                {/* Остановить можно только то, что ещё идёт. */}
                {r.status === "RUNNING" && <StopImportButton runId={r.id} />}
                <span className="small text-secondary">{fmt(r.startedAt)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {total > runs.length && (
        <Link href="/admin/imports?tab=log&log=runs" prefetch={false} className="small mt-2 d-inline-block">
          Весь журнал →
        </Link>
      )}
    </section>
  );
}
