import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { METRICS, isMetricKey } from "@/lib/achievements";
import { deleteAchievement, toggleAchievementEnabled } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { PencilIcon, TrashIcon } from "@/components/icons";

export const metadata = { title: "Ачивки" };

export const dynamic = "force-dynamic";

// Определения ачивок (Э2ф): раньше были зашиты в код, теперь — таблица
// Achievement. Подсчёт «сколько получили» идёт по UserAchievement.key —
// связи без FK, поэтому счётчик у удалённой ачивки просто пропадает
// вместе с ней.
export default async function AdminAchievementsPage() {
  const [achievements, holders] = await Promise.all([
    prisma.achievement.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    prisma.userAchievement.groupBy({ by: ["key"], _count: { _all: true } }),
  ]);
  const holdersByKey = new Map(holders.map((h) => [h.key, h._count._all]));
  const enabledCount = achievements.filter((a) => a.enabled).length;

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Ачивки
        </h1>
        <Link href="/admin/achievements/new" className="btn btn-primary btn-sm">
          + Добавить ачивку
        </Link>
      </div>

      <p className="small text-secondary mb-3">
        Включено {enabledCount} из {achievements.length}. В кабинете пользователи видят
        только полученные ачивки — остальные остаются сюрпризом.
      </p>

      {achievements.length === 0 ? (
        <p className="text-secondary">
          Пока нет ачивок. Стартовый набор сидируется скриптом{" "}
          <code>npx tsx scripts/seed-achievements.ts</code>.
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {achievements.map((a) => {
            const metricLabel = isMetricKey(a.metric) ? METRICS[a.metric].label : `⚠️ ${a.metric}`;
            const isFlag = isMetricKey(a.metric) && METRICS[a.metric].kind === "flag";
            const got = holdersByKey.get(a.key) ?? 0;
            const boundDelete = deleteAchievement.bind(null, a.id);
            const boundToggle = toggleAchievementEnabled.bind(null, a.id);
            return (
              <div
                key={a.id}
                className={`surface position-relative d-flex align-items-center justify-content-between gap-3 p-3 ${a.enabled ? "" : "opacity-50"}`}
              >
                <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
                  <span
                    className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{
                      width: "2.5rem",
                      height: "2.5rem",
                      fontSize: "1.2rem",
                      background: "rgba(var(--accent-rgb), 0.16)",
                    }}
                  >
                    {a.emoji}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={`/admin/achievements/${a.id}/edit`}
                      className="stretched-link text-decoration-none"
                    >
                      <span className="font-display fw-medium text-white">{a.title}</span>{" "}
                      {!a.enabled && (
                        <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.6rem" }}>
                          выключена
                        </span>
                      )}
                    </Link>
                    <p className="small text-secondary mb-0 text-truncate">
                      {metricLabel}
                      {!isFlag && ` ≥ ${a.threshold}`} · {a.hint}
                    </p>
                  </div>
                </div>
                {/* position-relative + z-2: кнопки поверх stretched-link
                    строки, иначе клик уводил бы на редактирование. */}
                <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                  <span className="small text-secondary d-none d-md-inline" title="Сколько пользователей получили">
                    получили: {got}
                  </span>
                  <form action={boundToggle}>
                    <SubmitButton
                      label={a.enabled ? "Выключить" : "Включить"}
                      className="btn btn-ghost btn-sm"
                      title={
                        a.enabled
                          ? "Спрятать отовсюду, прогресс не считать"
                          : "Снова показывать и считать прогресс"
                      }
                    />
                  </form>
                  <Link
                    href={`/admin/achievements/${a.id}/edit`}
                    className="icon-btn"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    <PencilIcon />
                  </Link>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить ачивку «${a.emoji} ${a.title}»? Записи о получении у пользователей останутся в БД, но бейдж перестанет показываться.`}
                  >
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
