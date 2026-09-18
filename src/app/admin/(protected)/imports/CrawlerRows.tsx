import Link from "next/link";
import type { ReactNode } from "react";
import type { listJobs } from "@/lib/scheduledJobs";

type JobRow = Awaited<ReturnType<typeof listJobs>>[number];

const STATUS_LABELS: Record<string, string> = {
  DONE: "прошёл",
  FAILED: "упал",
  CANCELLED: "остановлен",
  RUNNING: "идёт",
};

/** Первая фраза описания задачи — в строку списка; полное описание
 *  читают на вкладке задачи в расписании. */
function firstSentence(text: string): string {
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : text).trim();
}

const fmt = (d: Date) =>
  d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * «Обходы по расписанию» на вкладке импортов: по строке на задачу —
 * имя ссылкой на её вкладку в расписании, одна фраза о том, что она
 * делает, последний результат и кнопки этой задачи (обход архива,
 * заготовки исполнителей…). Одинаковый список на каждой вкладке вместо
 * россыпи разных карточек (правка владельца 2026-09-18).
 */
export default function CrawlerRows({
  jobs,
  extras = {},
}: {
  jobs: JobRow[];
  /** Дополнительные кнопки по ключу задачи. */
  extras?: Record<string, ReactNode>;
}) {
  if (jobs.length === 0) return null;
  return (
    <div className="surface p-0 crawler-rows">
      {jobs.map((job) => (
        <div key={job.key} className="crawler-row">
          <div style={{ minWidth: 0 }}>
            <Link href={`/admin/schedule?tab=${job.key}`} className="crawler-row-title">
              {job.title}
            </Link>
            <div className="crawler-row-blurb">{firstSentence(job.description)}</div>
          </div>
          <div className="crawler-row-last" style={{ minWidth: 0 }}>
            {job.lastStatus ? (
              <>
                <span className={job.lastStatus === "FAILED" ? "is-failed" : undefined}>
                  {STATUS_LABELS[job.lastStatus] ?? job.lastStatus}
                </span>
                {job.lastRunAt && <> · {fmt(job.lastRunAt)}</>}
                {job.lastSummary && (
                  <div className="text-truncate" title={job.lastSummary}>
                    {job.lastSummary}
                  </div>
                )}
              </>
            ) : (
              <span>ещё не запускалась{job.enabled ? "" : " · выключена"}</span>
            )}
          </div>
          <div className="crawler-row-actions">
            {extras[job.key]}
            <Link href={`/admin/schedule?tab=${job.key}`} className="btn btn-sm btn-outline-secondary">
              Настроить
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
