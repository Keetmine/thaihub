import { prisma } from "@/lib/prisma";
import { createInviteCode, deleteInviteCode, deleteUser } from "./actions";
import PremiumToggle from "./PremiumToggle";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import { TrashIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
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

  const invites = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { usedBy: { select: { name: true, email: true } } },
    take: 30,
  });
  const freeInvites = invites.filter((i) => !i.usedAt);

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
          <h2 className="h6 mb-0">Инвайт-коды</h2>
          <form action={createInviteCode}>
            <button type="submit" className="btn btn-ghost btn-sm">
              + Создать код
            </button>
          </form>
        </div>
        {freeInvites.length === 0 ? (
          <p className="small text-secondary mb-0">Свободных кодов нет.</p>
        ) : (
          <div className="d-flex flex-wrap gap-2">
            {freeInvites.map((i) => (
              <form key={i.code} action={deleteInviteCode.bind(null, i.code)} className="d-inline">
                <span className="event-chip font-monospace">{i.code}</span>{" "}
                <button type="submit" className="btn btn-link btn-sm text-danger p-0" title="Удалить код">
                  ×
                </button>
              </form>
            ))}
          </div>
        )}
        {invites.some((i) => i.usedAt) && (
          <p className="small text-secondary mt-2 mb-0">
            Использованы:{" "}
            {invites
              .filter((i) => i.usedAt)
              .map((i) => `${i.code} → ${i.usedBy?.name || i.usedBy?.email || "?"}`)
              .join(", ")}
          </p>
        )}
      </div>

      {users.length === 0 ? (
        <p className="text-secondary">{q ? "Никого не найдено." : "Пока нет пользователей."}</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {users.map((u) => {
            const boundDelete = deleteUser.bind(null, u.id);
            const displayName = u.name || u.email || `tg:${u.telegramUsername ?? u.telegramId}`;
            return (
              <div
                key={u.id}
                className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3"
              >
                <div className="d-flex align-items-center gap-3">
                  {u.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.photoUrl}
                      alt=""
                      className="rounded-circle flex-shrink-0"
                      style={{ width: "2.5rem", height: "2.5rem", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      className="rounded-circle flex-shrink-0"
                      style={{ width: "2.5rem", height: "2.5rem", background: "var(--bs-secondary-bg)" }}
                    />
                  )}
                  <div>
                    <span className="font-display fw-medium text-white d-block">{displayName}</span>
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
