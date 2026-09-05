import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { premiumActiveWhere } from "@/lib/premium";
import { formatShortDate } from "@/lib/dates";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import BroadcastForm from "./BroadcastForm";

export const metadata = { title: "Рассылки" };

export const dynamic = "force-dynamic";

export default async function AdminBroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const { page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const [withTelegram, premiumWithTelegram, history, historyTotal] =
    await Promise.all([
      prisma.user.count({ where: { telegramId: { not: null } } }),
      prisma.user.count({
        where: { telegramId: { not: null }, ...premiumActiveWhere() },
      }),
      prisma.broadcast.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.broadcast.count(),
    ]);
  const totalPages = totalPagesFor(historyTotal);

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
      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/broadcast?page=${p}`}
      />
    </div>
  );
}
