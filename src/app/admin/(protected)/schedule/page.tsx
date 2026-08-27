import { requireAdminPage } from "@/lib/auth";
import { listJobs } from "@/lib/scheduledJobs";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/admin/SubmitButton";
import JobTargets from "./JobTargets";
import { saveJobSchedule, runJobNow } from "./actions";

export const metadata = { title: "Расписание" };

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  RUNNING: "идёт",
  DONE: "успешно",
  FAILED: "упало",
};

// Расписание фоновых задач: что запускается само, во сколько и по кому.
// Раньше это жило только в коде — поменять час прогона можно было
// исключительно деплоем (см. features/admin-panel.md).
export default async function AdminSchedulePage() {
  await requireAdminPage();
  const jobs = await listJobs();

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
        Задачи выполняются сами раз в сутки в указанный час (время московское,
        как у сервера). Планировщик просыпается каждые 10 минут и запускает то,
        чему пришло время.
      </p>

      <div className="d-flex flex-column gap-3">
        {jobs.map((job) => (
          <section key={job.key} className="admin-section">
            <div className="admin-section-head">
              <span className="admin-section-title">{job.title}</span>
              <span className="admin-section-hint">
                {job.lastStatus ? (
                  <>
                    {STATUS_LABELS[job.lastStatus] ?? job.lastStatus} · {fmt(job.lastRunAt)}
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

            <form
              action={saveJobSchedule.bind(null, job.key)}
              className="d-flex flex-wrap align-items-end gap-3 mb-3"
            >
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id={`enabled-${job.key}`}
                  name="enabled"
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

              <SubmitButton label="Сохранить" busyLabel="Сохранение…" />

              <ConfirmForm
                action={runJobNow.bind(null, job.key)}
                confirmMessage={`Запустить «${job.title}» сейчас? Прогон может занять несколько минут.`}
                className="d-inline"
              >
                <button type="button" className="btn btn-ghost btn-sm">
                  Запустить сейчас
                </button>
              </ConfirmForm>
            </form>

            {job.supportsTargets && (
              <JobTargets
                jobKey={job.key}
                targets={job.targets}
                active={job.targetMode === "SELECTED"}
              />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
