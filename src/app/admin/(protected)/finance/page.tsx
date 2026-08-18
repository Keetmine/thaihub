import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/dates";
import { getPremiumPriceStars } from "@/lib/siteSettings";
import ConfirmForm from "@/components/ConfirmForm";
import { refundPayment } from "./actions";

export const dynamic = "force-dynamic";

// Финансы: журнал оплат Stars (пишется вебхуком), активные подписки и
// грубая оценка MRR (активные подписчики × текущая цена).
export default async function AdminFinancePage() {
  await requireAdminPage();
  const now = new Date();
  const [payments, activeSubs, price, starsTotal] = await Promise.all([
    prisma.payment.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { premiumUntil: { gt: now } },
      select: { id: true, name: true, email: true, premiumUntil: true },
      orderBy: { premiumUntil: "asc" },
    }),
    getPremiumPriceStars(),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { refundedAt: null } }),
  ]);

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Финансы
      </h1>

      <div className="d-flex flex-wrap gap-3 mb-4 small text-secondary">
        <span>Цена подписки: <b className="text-white">{price} Stars</b></span>
        <span>Активных подписок: <b className="text-white">{activeSubs.length}</b></span>
        <span>MRR (оценка): <b className="text-white">{activeSubs.length * price} Stars</b></span>
        <span>Получено всего: <b className="text-white">{starsTotal._sum.amount ?? 0} Stars</b></span>
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Оплаты</h2>
          {payments.length === 0 ? (
            <p className="small text-secondary">
              Оплат пока нет. Каждая успешная оплата Stars теперь записывается сюда
              (раньше только зачислялась и терялась).
            </p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {payments.map((p) => (
                <div key={p.id} className="surface d-flex align-items-center justify-content-between gap-3 p-3">
                  <span className="text-truncate">
                    {p.user ? (
                      <Link href={`/admin/users/${p.user.id}`} className="link-body-emphasis">
                        {p.user.name || p.user.email}
                      </Link>
                    ) : (
                      <span className="text-secondary">аккаунт удалён</span>
                    )}
                    {p.refundedAt && (
                      <span className="badge rounded-pill text-bg-secondary ms-2">возвращено</span>
                    )}
                  </span>
                  <span className="d-flex align-items-center gap-2 flex-shrink-0">
                    <span className="small text-secondary">
                      ★ {p.amount} · {formatShortDate(p.createdAt)} {p.createdAt.getFullYear()}
                    </span>
                    {!p.refundedAt && p.telegramChargeId && p.user && (
                      <ConfirmForm
                        action={async () => {
                          "use server";
                          await refundPayment(p.id);
                        }}
                        confirmMessage={`Вернуть ${p.amount} Stars? Подписка пользователя будет снята.`}
                      >
                        <button type="button" className="btn btn-ghost btn-sm">
                          Вернуть
                        </button>
                      </ConfirmForm>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Активные подписки</h2>
          {activeSubs.length === 0 ? (
            <p className="small text-secondary">Нет активных подписок.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {activeSubs.map((u) => (
                <div key={u.id} className="surface d-flex justify-content-between gap-3 p-3">
                  <Link href={`/admin/users/${u.id}`} className="link-body-emphasis text-truncate">
                    {u.name || u.email}
                  </Link>
                  <span className="small text-secondary flex-shrink-0">
                    до {formatShortDate(u.premiumUntil!)} {u.premiumUntil!.getFullYear()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
