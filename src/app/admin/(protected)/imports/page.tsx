import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { runTpopAgencyImport } from "./actions";
import RunningImportsWatcher from "./RunningImportsWatcher";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  "tmdb-dramas": "TMDB: сериалы",
  "tmdb-performers": "TMDB: актёры",
  gmmtv: "GMMTV: ростер",
  "mdl-drama": "MyDramaList: сериал",
  blscene: "blscene: локации",
  "ttm-event": "ThaiTicketMajor: событие",
  "tpop-agency": "tpop.fandom: агентство",
};

// Куда вести из ленты «последнего спарсенного» — на админ-редактирование.
const ITEM_EDIT_HREF: Record<string, (id: string) => string> = {
  performer: (id) => `/admin/performers/${id}/edit`,
  agency: (id) => `/admin/agencies/${id}/edit`,
  event: (id) => `/admin/events/${id}/edit`,
  album: () => `/admin/performers`,
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  performer: "исполнитель",
  agency: "агентство",
  event: "событие",
  album: "альбом",
  song: "песня",
};

// Журнал запусков импортов из админки (пишется logImportRun) + быстрые
// ссылки на места, откуда они запускаются. Массовые прогоны из консоли
// (scripts/*.ts) сюда не пишут — у них свои логи.
export default async function AdminImportsPage() {
  const hasRunningPromise = prisma.importRun.findFirst({ where: { status: "RUNNING" } });
  const [runs, recentItems] = await Promise.all([
    prisma.importRun.findMany({ orderBy: { startedAt: "desc" }, take: 100 }),
    prisma.importedItem.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
  ]);

  const runningRun = await hasRunningPromise;

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

      <div className="surface p-4 mb-4" style={{ maxWidth: "44rem" }}>
        <h2 className="section-heading mb-2">tpop.fandom: импорт агентства</h2>
        <p className="small text-secondary mb-3">
          Страница агентства (например, https://tpop.fandom.com/wiki/RISER_MUSIC):
          создаст/обновит агентство с лого и всех его артистов — группы, дуэты,
          солистов и бывших — с полным профилем (занятия, инструменты,
          рост/вес, дискография со ссылками, награды, факты, источники) и
          сверит концерты с афишей, догрузив новые с ThaiTicketMajor. Может
          занять несколько минут.
        </p>
        <form action={runTpopAgencyImport} className="d-flex gap-2">
          <input
            name="url"
            required
            placeholder="https://tpop.fandom.com/wiki/…"
            className="form-control"
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm flex-shrink-0"
            disabled={!!runningRun}
          >
            {runningRun ? "Импорт идёт…" : "Импортировать"}
          </button>
        </form>
        {runningRun && (
          <div className="d-flex align-items-center gap-2 mt-3 small">
            <span
              className="spinner-border spinner-border-sm text-warning flex-shrink-0"
              role="status"
              aria-label="Импорт выполняется"
            />
            <span className="text-secondary text-truncate">
              {runningRun.summary || "Выполняется…"}
            </span>
          </div>
        )}
      </div>

      <RunningImportsWatcher hasRunning={!!runningRun} />

      <h2 className="section-heading mb-2">Последнее спарсенное</h2>
      {recentItems.length === 0 ? (
        <p className="small text-secondary mb-4">
          Пока пусто — сюда попадает всё, что импортёры создали или обновили
          автоматически (исполнители, события, альбомы…).
        </p>
      ) : (
        <div className="d-flex flex-column gap-1 mb-4">
          {recentItems.map((item) => (
            <div
              key={item.id}
              className="surface d-flex flex-wrap align-items-center gap-2 px-3 py-2"
            >
              <span className="event-chip">{ITEM_TYPE_LABELS[item.entityType] ?? item.entityType}</span>
              <span className={item.action === "created" ? "text-success small" : "text-secondary small"}>
                {item.action === "created" ? "создан" : "обновлён"}
              </span>
              {ITEM_EDIT_HREF[item.entityType] ? (
                <Link
                  href={ITEM_EDIT_HREF[item.entityType](item.entityId)}
                  className="link-body-emphasis small text-truncate"
                  style={{ minWidth: 0 }}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="small text-truncate">{item.label}</span>
              )}
              <span className="small text-secondary ms-auto flex-shrink-0">
                {fmt(item.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

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
