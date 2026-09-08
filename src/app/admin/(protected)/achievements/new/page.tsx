import Link from "next/link";
import { metricOptionsForForm } from "../metricOptions";
import AchievementForm from "../AchievementForm";
import { createAchievement } from "../actions";

export const metadata = { title: "Новое достижение" };

export const dynamic = "force-dynamic";

export default function NewAchievementPage() {
  // Реестры метрик — серверные (тянут prisma через achievements.ts),
  // в клиентскую форму уходят плоским списком опций: и личные, и
  // сообществ, а форма показывает те, что подходят выбранному «чья».
  const metricOptions = metricOptionsForForm();

  return (
    <div>
      <Link href="/admin/achievements" className="eyebrow text-decoration-none">
        ← К списку достижений
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новое достижение
      </h1>
      <AchievementForm
        action={createAchievement}
        submitLabel="Создать достижение"
        metricOptions={metricOptions}
      />
    </div>
  );
}
