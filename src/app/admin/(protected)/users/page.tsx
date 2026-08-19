import { requireAdminPage } from "@/lib/auth";
import LetterAvatar from "@/components/LetterAvatar";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createPromoCode, deletePromoCode, deleteUser } from "./actions";
import PremiumToggle from "./PremiumToggle";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import { TrashIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/dates";

export const metadata = { title: "Пользователи" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminPage();
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { telegramUsername: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { favoriteEvents: true, eventAttendances: true, dramaWatchStatuses: true },
      },
    },
  });

  const promos = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { usedBy: { select: { name: true, email: true } } },
    take: 30,
  });
  const freePromos = promos.filter((p) => !p.usedAt);


  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Пользователи
        </h1>
        <span className="text-secondary small">Всего: {users.length}</span>
      </div>

      <NameSearchBox action="/admin/users" q={q} placeholder="Поиск по имени, email, telegram…" />

      <div className="surface p-3 mb-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h2 className="h6 mb-0">Промокоды подписки (+1 месяц)</h2>
          <form action={createPromoCode}>
            <button type="submit" className="btn btn-ghost btn-sm">
              + Создать промокод
            </button>
          </form>
        </div>
        {freePromos.length === 0 ? (
          <p className="small text-secondary mb-0">Свободных промокодов нет.</p>
        ) : (
          <div className="d-flex flex-wrap gap-2">
            {freePromos.map((c) => (
              <form key={c.code} action={deletePromoCode.bind(null, c.code)} className="d-inline">
                <span className="event-chip font-monospace">{c.code}</span>{" "}
                <button type="submit" className="btn btn-link btn-sm text-danger p-0" title="Удалить код">
                  ×
                </button>
              </form>
            ))}
          </div>
        )}
        {promos.some((c) => c.usedAt) && (
          <p className="small text-secondary mt-2 mb-0">
            Активированы:{" "}
            {promos
              .filter((c) => c.usedAt)
              .map((c) => `${c.code} → ${c.usedBy?.name || c.usedBy?.email || "?"}`)
              .join(", ")}
          </p>
        )}
      </div>

      {users.length === 0 ? (
        <p className="text-secondary">{q ? "Никого не найдено." : "Пока нет пользователей."}</p>
      ) : (
        <div className="d-flex flex-column gap-2 scroll-list-lg thin-scroll">
          {users.map((u) => {
            const boundDelete = deleteUser.bind(null, u.id);
            const displayName = u.name || u.email || `tg:${u.telegramUsername ?? u.telegramId}`;
            return (
              <div
                key={u.id}
                className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3"
              >
                <div className="d-flex align-items-center gap-3">
                  <LetterAvatar name={u.name ?? u.email} photoUrl={u.photoUrl} size={2.5} />
                  <div>
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-display fw-medium text-white d-block text-decoration-none"
                    >
                      {displayName}
                      {u.isAdmin && (
                        <span className="admin-badge badge rounded-pill fw-semibold ms-2">ADMIN</span>
                      )}
                    </Link>
                    <p className="small text-secondary mb-0">
                      {[
                        u.email,
                        u.telegramUsername ? `@${u.telegramUsername}` : u.telegramId ? "Telegram" : null,
                        `с ${formatShortDate(u.createdAt)} ${u.createdAt.getFullYear()}`,
                        `${u._count.eventAttendances} идёт · ${u._count.favoriteEvents} избр. · ${u._count.dramaWatchStatuses} сериалов`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-3 flex-shrink-0">
                  <PremiumToggle userId={u.id} premiumUntil={u.premiumUntil} />
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить пользователя «${displayName}» со всеми его данными?`}
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
