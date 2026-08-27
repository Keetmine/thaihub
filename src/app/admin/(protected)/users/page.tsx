import { requireAdminPage } from "@/lib/auth";
import LetterAvatar from "@/components/LetterAvatar";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createPromoCode, deletePromoCode, deleteUser } from "./actions";
import PremiumToggle from "./PremiumToggle";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/admin/SubmitButton";
import NameSearchBox from "@/components/NameSearchBox";
import AdminFilters from "@/components/admin/AdminFilters";
import {
  adminUserFilterDefs,
  adminUserFilterWhere,
  type FilterParams,
} from "@/lib/catalogFilters";
import StatTile from "@/components/StatTile";
import { TrashIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/dates";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { isOnlineNow, lastSeenExact, lastSeenLabel } from "./lastSeenLabel";

export const metadata = { title: "Пользователи" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string } & FilterParams>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const { q: rawQ, page: rawPage, sort: rawSort } = sp;
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);
  const sortBySeen = rawSort === "seen";

  // Удалённые аккаунты в списке не показываем — они обезличены и войти
  // в них нельзя (см. lib/userDeletion.ts).
  const where = {
    AND: [
      {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" as const } },
                { name: { contains: q, mode: "insensitive" as const } },
                { username: { contains: q, mode: "insensitive" as const } },
                { telegramUsername: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      ...adminUserFilterWhere(sp),
    ],
  };
  const now = new Date();
  const activeSince = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [users, usersTotal, activeWeek, activeMonth, neverSeen] = await Promise.all([
    prisma.user.findMany({
      where,
      // nulls: "last" — те, кто ни разу не заходил, не должны занимать
      // верх списка «кто был недавно».
      orderBy: sortBySeen
        ? { lastSeenAt: { sort: "desc", nulls: "last" } }
        : { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: {
          select: { favoriteEvents: true, eventAttendances: true, dramaWatchStatuses: true },
        },
      },
    }),
    prisma.user.count({ where }),
    // Сводка по активности считается по всем живым аккаунтам отдельными
    // запросами, а не по показанной странице: иначе цифры прыгали бы от
    // поиска и перелистывания.
    prisma.user.count({ where: { deletedAt: null, lastSeenAt: { gte: activeSince(7) } } }),
    prisma.user.count({ where: { deletedAt: null, lastSeenAt: { gte: activeSince(30) } } }),
    prisma.user.count({ where: { deletedAt: null, lastSeenAt: null } }),
  ]);

  const promos = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { usedBy: { select: { name: true, email: true } } },
    take: 30,
  });
  const freePromos = promos.filter((p) => !p.usedAt);

  // Поиск, сортировка и страница живут в одном адресе — переключение
  // любого из них не должно терять остальные.
  const listHref = (sort: string, targetPage?: number) => {
    const qs = [
      q ? `q=${encodeURIComponent(q)}` : "",
      sort === "seen" ? "sort=seen" : "",
      targetPage ? `page=${targetPage}` : "",
    ]
      .filter(Boolean)
      .join("&");
    return `/admin/users${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Пользователи
        </h1>
        <span className="text-secondary small">Всего: {usersTotal}</span>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-2">
        <StatTile value={activeWeek} label="заходили за 7 дней" />
        <StatTile value={activeMonth} label="за 30 дней" />
        <StatTile value={neverSeen} label="ни разу не заходили" />
      </div>
      <p className="small text-secondary mb-4">
        По всем аккаунтам, независимо от поиска и страницы. У тех, кто не заходил с тех пор, как
        появились отметки, поле пустое — это ещё не значит, что человек ушёл.
      </p>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
        <span className="small text-secondary">Сортировка:</span>
        <Link
          href={listHref("")}
          prefetch={false}
          className={`btn btn-sm ${!sortBySeen ? "btn-primary" : "btn-ghost"}`}
        >
          по регистрации
        </Link>
        <Link
          href={listHref("seen")}
          prefetch={false}
          className={`btn btn-sm ${sortBySeen ? "btn-primary" : "btn-ghost"}`}
        >
          по последнему заходу
        </Link>
      </div>

      <NameSearchBox
        action="/admin/users"
        q={q}
        placeholder="Поиск по имени, email, telegram…"
        hiddenFields={sortBySeen ? { sort: "seen" } : undefined}
        className="mb-3"
      />
      <AdminFilters defs={adminUserFilterDefs()} params={sp} />

      <div className="surface p-3 mb-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h2 className="h6 mb-0">Промокоды подписки (+1 месяц)</h2>
          <form action={createPromoCode}>
            <SubmitButton
              label="+ Создать промокод"
              busyLabel="Создание…"
              className="btn btn-ghost btn-sm"
            />
          </form>
        </div>
        {freePromos.length === 0 ? (
          <p className="small text-secondary mb-0">Свободных промокодов нет.</p>
        ) : (
          <div className="d-flex flex-wrap gap-2">
            {freePromos.map((c) => (
              <span key={c.code} className="d-inline-flex align-items-center gap-1">
                <span className="event-chip font-monospace">{c.code}</span>
                <ConfirmForm
                  action={deletePromoCode.bind(null, c.code)}
                  confirmMessage={`Удалить промокод ${c.code}? Он перестанет работать.`}
                  className="d-inline"
                >
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-danger p-0"
                    title="Удалить код"
                  >
                    ×
                  </button>
                </ConfirmForm>
              </span>
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
                    {/* Отдельной строкой, а не в общем перечислении:
                        глазами по списку ищут именно её. */}
                    <p
                      className="small mb-0"
                      title={u.lastSeenAt ? lastSeenExact(u.lastSeenAt) : undefined}
                    >
                      <span className="text-secondary opacity-75">последний заход: </span>
                      <span
                        className={isOnlineNow(u.lastSeenAt) ? "text-success" : "text-secondary"}
                      >
                        {lastSeenLabel(u.lastSeenAt)}
                      </span>
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
      <Pagination
        page={page}
        totalPages={totalPagesFor(usersTotal)}
        buildHref={(p) => listHref(sortBySeen ? "seen" : "", p)}
      />
    </div>
  );
}
