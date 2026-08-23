import Link from "next/link";
import { METRICS, METRIC_KEYS } from "@/lib/achievements";
import AchievementForm from "../AchievementForm";
import { createAchievement } from "../actions";

export const metadata = { title: "Новая ачивка" };

export const dynamic = "force-dynamic";

export default function NewAchievementPage() {
  // Реестр метрик — серверный (тянет prisma через achievements.ts),
  // в клиентскую форму уходит плоским списком опций.
  const metricOptions = METRIC_KEYS.map((value) => ({
    value,
    label: METRICS[value].label,
    kind: METRICS[value].kind,
  }));

  return (
    <div>
      <Link href="/admin/achievements" className="eyebrow text-decoration-none">
        ← К списку ачивок
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новая ачивка
      </h1>
      <AchievementForm
        action={createAchievement}
        submitLabel="Создать ачивку"
        metricOptions={metricOptions}
      />
    </div>
  );
}
