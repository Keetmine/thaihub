import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  "tmdb-dramas": "TMDB: сериалы",
  "tmdb-performers": "TMDB: актёры",
  gmmtv: "GMMTV: ростер",
  "mdl-drama": "MyDramaList: сериал",
  blscene: "blscene: локации",
  "ttm-event": "ThaiTicketMajor: событие",
};

// Журнал запусков импортов из админки (пишется logImportRun) + быстрые
// ссылки на места, откуда они запускаются. Массовые прогоны из консоли
// (scripts/*.ts) сюда не пишут — у них свои логи.
export default async function AdminImportsPage() {
  const runs = await prisma.importRun.findMany({
    orderBy: { startedAt: "asc" },
    take: 100,
  });
  runs.reverse();

  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Импорты
      </h1>

      <div className="d-flex flex-wrap gap-2 mb-4">
        <Link href="/admin/dramas" className="btn btn-ghost btn-sm">TMDB-синк сериалов →</Link>
        <Link href="/admin/performers" className="btn btn-ghost btn-sm">TMDB/GMMTV актёры →</Link>
        <Link href="/admin/locations" className="btn btn-ghost btn-sm">blscene-локации →</Link>
        <Link href="/admin/events/import-ttm" className="btn btn-ghost btn-sm">Импорт события с TTM →</Link>
      </div>

      <h2 className="section-heading mb-2">Последние запуски</h2>
      {runs.length === 0 ? (
        <p className="small text-secondary">
          Запусков ещё не было — здесь появится история всех импортов, запущенных из админки.
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {runs.map((r) => (
            <div key={r.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small mb-0">
                  <b>{KIND_LABELS[r.kind] ?? r.kind}</b>{" "}
                  <span
                    className={
                      r.status === "DONE"
                        ? "text-success"
                        : r.status === "FAILED"
                          ? "text-danger"
                          : "text-warning"
                    }
                  >
                    · {r.status === "DONE" ? "готово" : r.status === "FAILED" ? "ошибка" : "выполняется"}
                  </span>
                </p>
                {r.summary && <p className="small text-secondary mb-0">{r.summary}</p>}
              </div>
              <span className="small text-secondary flex-shrink-0">{fmt(r.startedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
