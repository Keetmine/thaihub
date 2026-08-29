import Link from "next/link";
import SavedBanner from "@/components/admin/SavedBanner";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { METRICS, METRIC_KEYS } from "@/lib/achievements";
import AchievementForm from "../../AchievementForm";
import { updateAchievement, deleteAchievement } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";
import AuditTrail from "@/components/admin/AuditTrail";

export const metadata = { title: "Редактировать ачивку" };

export const dynamic = "force-dynamic";

export default async function EditAchievementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const achievement = await prisma.achievement.findUnique({ where: { id } });
  if (!achievement) notFound();

  const holders = await prisma.userAchievement.count({ where: { key: achievement.key } });

  const metricOptions = METRIC_KEYS.map((value) => ({
    value,
    label: METRICS[value].label,
    kind: METRICS[value].kind,
  }));

  const boundUpdate = updateAchievement.bind(null, id);
  const boundDelete = deleteAchievement.bind(null, id);

  return (
    <div>
      <Link href="/admin/achievements" className="eyebrow text-decoration-none">
        ← К списку ачивок
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          {achievement.emoji} {achievement.title}
        </h1>
        <span className="small text-secondary">получили: {holders}</span>
      </div>

      <div className="d-flex flex-column gap-3">
        {saved === "1" && <SavedBanner />}
        <AchievementForm
          action={boundUpdate}
          submitLabel="Сохранить изменения"
          metricOptions={metricOptions}
          keyLocked
          defaultValues={{
            key: achievement.key,
            emoji: achievement.emoji,
            title: achievement.title,
            hint: achievement.hint,
            metric: achievement.metric,
            threshold: achievement.threshold,
            enabled: achievement.enabled,
            sort: achievement.sort,
          }}
        />

        <ConfirmForm
          action={boundDelete}
          confirmMessage={`Удалить ачивку «${achievement.emoji} ${achievement.title}»? Записи о получении у пользователей останутся в БД, но бейдж перестанет показываться.`}
          className="pt-2"
        >
          <button type="button" className="btn btn-outline-danger btn-sm">
            Удалить ачивку
          </button>
        </ConfirmForm>
      </div>
      <div className="mt-4">
        <AuditTrail entityType="Achievement" entityId={achievement.id} hideWhenEmpty />
      </div>
    </div>
  );
}
