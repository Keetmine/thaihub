import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth";
import { JOB_GROUPS, listJobs } from "@/lib/scheduledJobs";
import { adminListHref } from "@/lib/adminListHref";
import { DENSE_PAGE_SIZE } from "@/lib/pagination";
import ConfirmForm from "@/components/ConfirmForm";
import Pagination from "@/components/Pagination";
import JobTargets from "./JobTargets";
import ImportedItemsFeed from "./ImportedItemsFeed";
import { saveJobSchedule, runJobNow } from "./actions";
// «Сохраняем… → Сохранено» — тот же клиентский каркас, что в настройках
// пользователя: молчаливое сохранение выглядело как несохранение
// (владелица дважды сохранила час на проде и не поверила, что вышло).
import SettingsForm from "@/app/(public)/account/settings/SettingsForm";
import { getSetting } from "@/lib/siteSettings";
import { MDL_WATCH_SEARCHES_KEY } from "@/lib/mdlSearchImport";

export const metadata = { title: "Расписание" };

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  RUNNING: "идёт",
  DONE: "успешно",
  FAILED: "упало",
};

// Подписи вкладок: полные title задач для таб-бара длинноваты.
const TAB_LABELS: Record<string, string> = {
  "youtube-music": "YouTube Music",
  "mdl-auto-update": "Обновление MDL",
  "mdl-new-searches": "Новинки MDL",
  "doramaland-sync": "dorama.land",
  "blscene-locations": "Локации blscene",
  "ttm-crawl": "Афиша TTM",
  "gmmtv-mascots": "Маскоты GMMTV",
  "musicfestival-crawl": "Фестивали",
  "cleanup-expired": "Чистка",
};

// Статусы прогонов журнала (ImportRun) — как в /admin/imports.
const RUN_STATUS = {
  DONE: { label: "готово", className: "text-success" },
  FAILED: { label: "ошибка", className: "text-danger" },
  CANCELLED: { label: "остановлено", className: "text-secondary" },
  RUNNING: { label: "выполняется", className: "text-warning" },
} as const;

// История внутри вкладки: сводки прогонов и — у задач, которые пишут
// ImportedItem, — лента «что именно спарсено». `page` относится к
// активному подсписку.
const HIST_TABS = [
  { key: "runs", label: "Прогоны" },
  { key: "items", label: "Спарсенное" },
] as const;
type HistTab = (typeof HIST_TABS)[number]["key"];

// Расписание фоновых задач: что запускается само, во сколько и по кому,
// плюс история прогонов каждой задачи. Раньше всё жило одной простынёй,
// а из истории была только строка «последний результат» — что именно
// нашёл ночной прогон, приходилось искать в общем журнале импортов.
// Теперь по вкладке на задачу (?tab= — ключ задачи), как в /admin/imports.
export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; hist?: string; page?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  // Нерабочие задачи (закрытый источник) в админке не показываем вовсе
  // — см. JobDefinition.unavailable.
  const jobs = (await listJobs()).filter((j) => !j.unavailable);

  // Вкладка — ключ задачи; прямые старые ссылки без ?tab открывают первую.
  const job = jobs.find((j) => j.key === sp.tab) ?? jobs[0];
  // Сохранённые ссылки поиска — настройка только вахты новинок MDL.
  const watchSearches =
    job.key === "mdl-new-searches"
      ? ((await getSetting(MDL_WATCH_SEARCHES_KEY)) ?? "")
      : null;
  const hist: HistTab = job.logsItems && sp.hist === "items" ? "items" : "runs";
  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * DENSE_PAGE_SIZE;

  // История задачи — её прогоны в журнале импортов: задачи пишут туда
  // через logImportRun, kind прогона хранится в определении задачи.
  const runsWhere = { kind: job.logKind };
  const itemsWhere = { run: { kind: job.logKind } };
  const [runs, totalRuns, items, totalItems] = await Promise.all([
    hist === "runs"
      ? prisma.importRun.findMany({
          where: runsWhere,
          orderBy: { startedAt: "desc" },
          skip,
          take: DENSE_PAGE_SIZE,
          include: { _count: { select: { items: true } } },
        })
      : Promise.resolve([]),
    prisma.importRun.count({ where: runsWhere }),
    hist === "items"
      ? prisma.importedItem.findMany({
          where: itemsWhere,
          orderBy: { createdAt: "desc" },
          skip,
          take: DENSE_PAGE_SIZE,
        })
      : Promise.resolve([]),
    job.logsItems ? prisma.importedItem.count({ where: itemsWhere }) : Promise.resolve(0),
  ]);
  const totalPages = Math.max(
    1,
    Math.ceil((hist === "runs" ? totalRuns : totalItems) / DENSE_PAGE_SIZE),
  );

  // Адреса — от ТЕКУЩИХ searchParams (И16, adminListHref): смена вкладки
  // сбрасывает подсписок и страницу, смена подсписка — только страницу.
  const tabHref = (key: string) =>
    adminListHref("/admin/schedule", sp, { tab: key, hist: null, page: null });
  const histHref = (h: HistTab, p = 1) =>
    adminListHref("/admin/schedule", sp, {
      hist: h === "runs" ? null : h,
      page: p === 1 ? null : p,
    });

  const fmt = (d: Date | null) =>
    d
      ? d.toLocaleString("ru-RU", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "ещё не запускалась";

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2.25rem" }}>
        Расписание
      </h1>
      <p className="text-secondary mb-4">
        Задачи выполняются сами в указанный час (время московское, как у
        сервера) — большинство раз в сутки, обход маскотов GMMTV раз в
        неделю. Планировщик просыпается каждые 10 минут и запускает то,
        чему пришло время.
      </p>

      {/* Вкладки — рядами по группам (JOB_GROUPS), с подписью группы
          слева: пятнадцать задач одной полосой заворачивались в три
          строки без порядка, и нужную искали глазами (правка владельца
          2026-09-18). */}
      <div className="tab-bar-groups">
        {JOB_GROUPS.map((g) => {
          const inGroup = jobs.filter((j) => j.group === g.key);
          if (inGroup.length === 0) return null;
          return (
            <div key={g.key} className="tab-bar-group">
              <span className="tab-bar-group-label">{g.label}</span>
              <div className="tab-bar">
                {inGroup.map((j) => (
                  <Link
                    key={j.key}
                    href={tabHref(j.key)}
                    prefetch={false}
                    className={`tab-bar-item ${job.key === j.key ? "active" : ""}`}
                  >
                    {TAB_LABELS[j.key] ?? j.title}
                    {/* Красная точка — последний прогон задачи упал: видно,
                        куда идти, не открывая каждую вкладку. */}
                    {j.lastStatus === "FAILED" && (
                      <span
                        className="d-inline-block rounded-circle bg-danger ms-2"
                        style={{ width: "0.45rem", height: "0.45rem", verticalAlign: "middle" }}
                        data-tooltip="последний прогон упал"
                      />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <section className="admin-section mb-3">
        <div className="admin-section-head">
          <span className="admin-section-title">{job.title}</span>
          <span className="admin-section-hint">
            {job.lastStatus ? (
              <>
                {STATUS_LABELS[job.lastStatus] ?? job.lastStatus} · {fmt(job.lastRunAt)}
                {/* Задача разобрала пачку и попросила продолжить — видно,
                    что круг ещё не пройден и когда будет следующая. */}
                {job.resumeAt && <> · продолжит {fmt(job.resumeAt)}</>}
              </>
            ) : (
              "ещё не запускалась"
            )}
          </span>
        </div>

        <p className="small text-secondary">{job.description}</p>

        {job.lastSummary && (
          <p
            className={`small mb-3 ${job.lastStatus === "FAILED" ? "text-danger" : "text-secondary"}`}
          >
            Последний результат: {job.lastSummary}
          </p>
        )}

        <SettingsForm
          action={saveJobSchedule.bind(null, job.key)}
          submitLabel="Сохранить"
          className="d-flex flex-wrap align-items-end gap-3 mb-3"
        >
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id={`enabled-${job.key}`}
              name="enabled"
              key={`en-${String(job.enabled)}`}
              defaultChecked={job.enabled}
            />
            <label className="form-check-label small" htmlFor={`enabled-${job.key}`}>
              Запускать автоматически
            </label>
          </div>

          <div>
            <label className="form-label small text-secondary mb-1" htmlFor={`job-${job.key}-hour`}>
              Время
            </label>
            <select
              id={`job-${job.key}-hour`}
              name="hour"
              key={`h-${job.hour}`}
              defaultValue={String(job.hour)}
              className="form-select form-select-sm"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>

          {watchSearches !== null && (
            <div className="w-100">
              <label
                className="form-label small text-secondary mb-1"
                htmlFor={`job-${job.key}-watchSearches`}
              >
                Ссылки на поиски MDL — по строке на ссылку
              </label>
              <textarea
                id={`job-${job.key}-watchSearches`}
                name="watchSearches"
                rows={4}
                key={watchSearches}
                defaultValue={watchSearches}
                placeholder="https://mydramalist.com/search?adv=titles&…&so=newest&or=desc"
                className="form-control form-control-sm font-monospace"
              />
              <p className="small text-secondary mb-0 mt-1">
                Наберите фильтры на MDL (сортировка — «сначала новые»),
                скопируйте адрес выдачи и вставьте сюда. Кривая строка не
                даст сохранить форму.
              </p>
            </div>
          )}

          {job.supportsTargets && (
            <div>
              <label className="form-label small text-secondary mb-1" htmlFor={`job-${job.key}-targetMode`}>
                Кого проверять
              </label>
              <select
                name="targetMode"
                id={`job-${job.key}-targetMode`}
                defaultValue={job.targetMode}
                className="form-select form-select-sm"
              >
                <option value="ALL">всех подходящих</option>
                <option value="SELECTED">только выбранных</option>
              </select>
            </div>
          )}

        </SettingsForm>

        {/* «Запустить сейчас» — вне формы сохранения: раньше жил внутри
            неё, и кнопки визуально сливались в один ряд действий. */}
        <div className="mb-3">
          <ConfirmForm
            action={runJobNow.bind(null, job.key)}
            confirmMessage={`Запустить «${job.title}» сейчас? Прогон может занять несколько минут.`}
            confirmLabel="Запустить"
            busyLabel="Запускаем…"
            className="d-inline"
          >
            <button type="button" className="btn btn-ghost btn-sm">
              Запустить сейчас
            </button>
          </ConfirmForm>
        </div>

        {job.supportsTargets && (
          <JobTargets
            jobKey={job.key}
            targets={job.targets}
            active={job.targetMode === "SELECTED"}
          />
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <span className="admin-section-title">История прогонов</span>
          {/* У youtube-music kind общий с ручным импортом дискографии из
              «Импортов» — здесь видны и ночные, и ручные прогоны. */}
          <span className="admin-section-hint">журнал импортов, kind «{job.logKind}»</span>
        </div>

        {job.logsItems && (
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            {HIST_TABS.map((t) => (
              <Link
                key={t.key}
                href={histHref(t.key)}
                className={`nav-chip ${hist === t.key ? "is-active" : ""}`}
              >
                {t.label}
                <span className="text-secondary ms-1">
                  {t.key === "runs" ? totalRuns : totalItems}
                </span>
              </Link>
            ))}
          </div>
        )}

        {hist === "items" ? (
          <ImportedItemsFeed items={items} />
        ) : runs.length === 0 ? (
          <p className="small text-secondary mb-0">
            Прогонов ещё не было — здесь появится история запусков этой задачи
            со сводками «что нашлось».
          </p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {runs.map((r) => {
              const status = RUN_STATUS[r.status as keyof typeof RUN_STATUS];
              return (
                <div key={r.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="small mb-0">
                      <b>{fmt(r.startedAt)}</b>{" "}
                      <span className={status?.className ?? "text-secondary"}>
                        · {status?.label ?? r.status}
                      </span>
                      {job.logsItems && r._count.items > 0 && (
                        <span className="text-secondary"> · строк {r._count.items}</span>
                      )}
                    </p>
                    {r.summary && <p className="small text-secondary mb-0">{r.summary}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} buildHref={(p) => histHref(hist, p)} />
      </section>
    </div>
  );
}
