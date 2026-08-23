import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  runMdlPerformerImport,
  runTpopArtistImport,
  markImportsReviewed,
  runYoutubeMusicImport,
  runYoutubeMusicImportAndSchedule,
} from "./actions";
import RunningImportsWatcher from "./RunningImportsWatcher";
import SubmitButton from "@/components/admin/SubmitButton";
import Pagination from "@/components/Pagination";
import EntitySelect from "@/components/EntitySelect";
import { searchPerformerOptions } from "../performers/actions";

export const metadata = { title: "Импорты" };

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  "mdl-performer": "MyDramaList: актёр",
  "mdl-drama": "MyDramaList: сериал",
  blscene: "blscene: локации",
  "ttm-event": "ThaiTicketMajor: событие",
  "tpop-agency": "tpop.fandom: агентство",
  "tpop-artist": "tpop.fandom: артист",
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
const PAGE_SIZE = 20;

// Спарсенное и запуски — два независимых журнала, и раньше они шли
// простынёй друг за другом: чтобы добраться до запусков, нужно было
// пролистать все находки. Табы дают каждому свою страницу и свою
// пагинацию (`page` относится к активной вкладке).
const LOG_TABS = [
  { key: "items", label: "Последнее спарсенное" },
  { key: "runs", label: "Последние запуски" },
] as const;
type LogTab = (typeof LOG_TABS)[number]["key"];

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; log?: string }>;
}) {
  const { page: rawPage, status: rawStatus, log: rawLog } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);
  // Фильтр по статусу: с дашборда «упавшие импорты» ведут сразу сюда,
  // иначе пришлось бы искать их глазами в общем журнале. Он же решает,
  // какая вкладка открыта: со ссылки про упавшие ждут именно запуски.
  const status = ["RUNNING", "DONE", "FAILED"].includes(rawStatus ?? "") ? rawStatus! : null;
  const logTab: LogTab =
    LOG_TABS.find((t) => t.key === rawLog)?.key ?? (status ? "runs" : "items");
  const runsWhere = status ? { status } : {};
  const skip = (page - 1) * PAGE_SIZE;
  const hasRunningPromise = prisma.importRun.findFirst({ where: { status: "RUNNING" } });
  const [runs, totalRuns, unreviewedFailed, recentItems, totalItems] = await Promise.all([
    logTab === "runs"
      ? prisma.importRun.findMany({
          where: runsWhere,
          orderBy: { startedAt: "desc" },
          skip,
          take: PAGE_SIZE,
        })
      : Promise.resolve([]),
    prisma.importRun.count({ where: runsWhere }),
    prisma.importRun.count({ where: { status: "FAILED", reviewedAt: null } }),
    logTab === "items"
      ? prisma.importedItem.findMany({ orderBy: { createdAt: "desc" }, skip, take: PAGE_SIZE })
      : Promise.resolve([]),
    prisma.importedItem.count(),
  ]);
  const totalPages = Math.max(
    1,
    Math.ceil((logTab === "runs" ? totalRuns : totalItems) / PAGE_SIZE),
  );
  const logHref = (tab: LogTab, p = 1) =>
    `/admin/imports?log=${tab}&page=${p}` + (tab === "runs" && status ? `&status=${status}` : "");

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
        <Link href="/admin/locations" className="btn btn-ghost btn-sm">blscene-локации →</Link>
        <Link href="/admin/imports/ttm" className="btn btn-ghost btn-sm">Импорт события с TTM →</Link>
      </div>

      {/* Карточки импортов в ряд: раздельные широкие блоки заставляли
          скроллить между ними. */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-xl-6">
          <div className="surface p-4 h-100">
            <h2 className="section-heading mb-2">MyDramaList: импорт актёра</h2>
            <p className="small text-secondary mb-3">
              Ссылка на профиль человека (mydramalist.com/people/…) — заберём
              настоящее имя, дату рождения, биографию, фото и соцсети.
              Фильмография привяжется к тем сериалам, что уже есть в каталоге;
              недостающие не заводим — сериал добавляется своим импортом.
              Заполняются только пустые поля, занесённое руками не переписываем.
              Исполнителя можно не выбирать — тогда карточка создастся новая.
            </p>
            <form action={runMdlPerformerImport} className="d-flex flex-column gap-2">
              <EntitySelect
                name="performerId"
                options={[]}
                placeholder="Исполнитель из каталога (необязательно)…"
                searchOptions={searchPerformerOptions}
              />
              <div className="d-flex flex-wrap gap-2">
                <input
                  name="mdlUrl"
                  required
                  placeholder="https://mydramalist.com/people/…"
                  className="form-control flex-grow-1"
                  style={{ minWidth: "16rem" }}
                />
                <SubmitButton
                  label={runningRun ? "Импорт идёт…" : "Импортировать"}
                  busyLabel="Запускаем…"
                  className="btn btn-primary btn-sm flex-shrink-0"
                  disabled={!!runningRun}
                />
              </div>
            </form>
          </div>
        </div>
        <div className="col-12 col-xl-6">
        <div className="surface p-4 h-100">
          <h2 className="section-heading mb-2">tpop.fandom: импорт артиста</h2>
          <p className="small text-secondary mb-3">
            Страница артиста или группы (например,
            https://tpop.fandom.com/wiki/TYTAN): создаст/обновит с полным
            профилем, дискографией и концертами; агентство возьмётся из поля
            Agency его страницы.
          </p>
          <form action={runTpopArtistImport} className="d-flex gap-2">
            <input
              name="url"
              required
              placeholder="https://tpop.fandom.com/wiki/…"
              className="form-control"
            />
            <SubmitButton
              label={runningRun ? "Импорт идёт…" : "Импортировать"}
              busyLabel="Запускаем…"
              className="btn btn-primary btn-sm flex-shrink-0"
              disabled={!!runningRun}
            />
          </form>
        </div>
        </div>
        <div className="col-12 col-xl-6">
          <div className="surface p-4 h-100">
            <h2 className="section-heading mb-2">YouTube Music: дискография</h2>
            <p className="small text-secondary mb-3">
              Ссылка на канал артиста (music.youtube.com/channel/UC…) — заберём
              релизы с обложками и годами, песни и ссылки на них. Исполнителя
              выбираем руками: по имени сопоставлять нельзя, «JASP.ER» и
              «Jasper» — разные строки, и ошибка привяжет чужие альбомы.
            </p>
            <form action={runYoutubeMusicImport} className="d-flex flex-column gap-2">
              <EntitySelect
                name="performerId"
                options={[]}
                placeholder="Исполнитель из каталога…"
                searchOptions={searchPerformerOptions}
              />
              <div className="d-flex flex-wrap gap-2">
                <input
                  name="channelUrl"
                  required
                  placeholder="https://music.youtube.com/channel/UC…"
                  className="form-control flex-grow-1"
                  style={{ minWidth: "16rem" }}
                />
                <SubmitButton
                  label={runningRun ? "Импорт идёт…" : "Импортировать"}
                  busyLabel="Запускаем…"
                  className="btn btn-primary btn-sm flex-shrink-0"
                  disabled={!!runningRun}
                />
                <SubmitButton
                  label={runningRun ? "Импорт идёт…" : "Импортировать и в расписание"}
                  busyLabel="Запускаем…"
                  className="btn btn-ghost btn-sm flex-shrink-0"
                  disabled={!!runningRun}
                  formAction={runYoutubeMusicImportAndSchedule}
                  title="Импортировать и добавить артиста в ежедневную проверку новинок"
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      <RunningImportsWatcher hasRunning={!!runningRun} />

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        {LOG_TABS.map((t) => (
          <Link
            key={t.key}
            href={logHref(t.key)}
            className={`nav-chip ${logTab === t.key ? "is-active" : ""}`}
          >
            {t.label}
            <span className="text-secondary ms-1">
              {t.key === "runs" ? totalRuns : totalItems}
            </span>
          </Link>
        ))}
      </div>

      {logTab === "items" && (recentItems.length === 0 ? (
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
      ))}

      {logTab === "runs" && (
      <>
      <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
        <span className="d-flex flex-wrap gap-2">
          {[
            { value: null, label: "Все" },
            { value: "FAILED", label: "Упавшие" },
            { value: "RUNNING", label: "Идут" },
            { value: "DONE", label: "Успешные" },
          ].map((f) => (
            <Link
              key={f.label}
              href={`/admin/imports?log=runs${f.value ? `&status=${f.value}` : ""}`}
              className={`nav-chip ${status === f.value ? "is-active" : ""}`}
            >
              {f.label}
            </Link>
          ))}
        </span>
        {/* Гасит бейдж упавших импортов в сайдбаре: он считает только
            неразобранные записи. */}
        {unreviewedFailed > 0 && (
          <form action={markImportsReviewed}>
            <SubmitButton
              label={`Пометить разобранными (${unreviewedFailed})`}
              busyLabel="Сохраняем…"
              className="btn btn-ghost btn-sm"
            />
          </form>
        )}
      </div>
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
      </>
      )}

      <Pagination page={page} totalPages={totalPages} buildHref={(p) => logHref(logTab, p)} />
    </div>
  );
}
