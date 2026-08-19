import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/dates";
import BroadcastForm from "./BroadcastForm";

export const metadata = { title: "Рассылки" };

export const dynamic = "force-dynamic";

export default async function AdminBroadcastPage() {
  await requireAdminPage();
  const [withTelegram, premiumWithTelegram, history] = await Promise.all([
    prisma.user.count({ where: { telegramId: { not: null } } }),
    prisma.user.count({
      where: { telegramId: { not: null }, premiumUntil: { gt: new Date() } },
    }),
    prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div>
      <span className="eyebrow">Коммьюнити</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2.25rem" }}>
        Рассылки
      </h1>
      <p className="small text-secondary mb-4">
        Сообщение уйдёт в Telegram: доступно {withTelegram} пользователям
        (с подпиской — {premiumWithTelegram}).
      </p>

      <BroadcastForm />

      <h2 className="section-heading mb-2">История</h2>
      {history.length === 0 ? (
        <p className="small text-secondary">Рассылок ещё не было.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {history.map((b) => (
            <div key={b.id} className="surface p-3">
              <p className="small text-secondary mb-1">
                {formatShortDate(b.createdAt)} {b.createdAt.getFullYear()} ·{" "}
                {b.audience === "premium" ? "подписчики" : "все"} · доставлено {b.sentCount}
              </p>
              <p className="small mb-0" style={{ whiteSpace: "pre-line" }}>{b.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
