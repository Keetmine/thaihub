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
import { adminListHref } from "@/lib/adminListHref";
import { isOnlineNow, lastSeenExact, lastSeenLabel } from "./lastSeenLabel";
import BanControls from "./BanControls";
import { getCurrentUser } from "@/lib/userAuth";

export const metadata = { title: "Пользователи" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<
    { q?: string; page?: string; sort?: string; banned?: string } & FilterParams
  >;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const me = await getCurrentUser();
  const { q: rawQ, page: rawPage, sort: rawSort } = sp;
  // Заблокированные не выделены в фильтры (AdminFilters) намеренно: их
  // единицы, и нужны они не «в разрезе», а списком — по ссылке с плитки.
  const bannedOnly = sp.banned === "1";
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);
  // По умолчанию список отсортирован по последнему заходу — сюда смотрят,
  // чтобы видеть, кто живой; порядок по дате регистрации — явным
  // ?sort=created (просьба владельца, раньше было наоборот).
  const sortByCreated = rawSort === "created";

  // Удалённые аккаунты в списке не показываем — они обезличены и войти
  // в них нельзя (см. lib/userDeletion.ts).
  const where = {
    AND: [
      {
        deletedAt: null,
        ...(bannedOnly ? { bannedAt: { not: null } } : {}),
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

  const [users, usersTotal, activeWeek, activeMonth, neverSeen, bannedCount] = await Promise.all([
    prisma.user.findMany({
      where,
      // nulls: "last" — те, кто ни разу не заходил, не должны занимать
      // верх списка «кто был недавно».
      orderBy: sortByCreated
        ? { createdAt: "desc" }
        : { lastSeenAt: { sort: "desc", nulls: "last" } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: {
          select: { eventMaybes: true, eventAttendances: true, dramaWatchStatuses: true },
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
    prisma.user.count({ where: { deletedAt: null, bannedAt: { not: null } } }),
  ]);

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
        <span className="text-secondary small">Всего: {usersTotal}</span>
      </div>

      {/* Плитки считают ВСЕ аккаунты, а не текущую страницу выдачи.
          Сноска про пустое «последний заход» убрана (правка владельца
          2026-09-18): объяснение читалось дольше самих чисел. */}
      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatTile value={activeWeek} label="заходили за 7 дней" />
        <StatTile value={activeMonth} label="за 30 дней" />
        <StatTile value={neverSeen} label="ни разу не заходили" />
        <StatTile value={bannedCount} label="заблокированы" />
      </div>
      {/* Ссылки сортировки строят адрес от текущего (adminListHref):
          поиск и фильтры остаются, а страница сбрасывается — другой
          порядок смотрят с начала. Дефолтный вариант первым. */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
        <span className="small text-secondary">Сортировка:</span>
        <Link
          href={adminListHref("/admin/users", sp, { sort: null, page: 1 })}
          prefetch={false}
          className={`btn btn-sm ${!sortByCreated ? "btn-primary" : "btn-ghost"}`}
        >
          по последнему заходу
        </Link>
        <Link
          href={adminListHref("/admin/users", sp, { sort: "created", page: 1 })}
          prefetch={false}
          className={`btn btn-sm ${sortByCreated ? "btn-primary" : "btn-ghost"}`}
        >
          по регистрации
        </Link>
        {/* Заблокированных единицы, и ищут их не по имени, а «покажи
            всех разом» — отдельным переключателем рядом с сортировкой. */}
        <Link
          href={adminListHref("/admin/users", sp, {
            banned: bannedOnly ? null : "1",
            page: 1,
          })}
          prefetch={false}
          className={`btn btn-sm ms-2 ${bannedOnly ? "btn-outline-danger" : "btn-ghost"}`}
        >
          {bannedOnly ? "× только заблокированные" : "только заблокированные"}
        </Link>
      </div>

      <NameSearchBox
        action="/admin/users"
        q={q}
        placeholder="Поиск по имени, email, telegram…"
        hiddenFields={{
          ...(sortByCreated ? { sort: "created" } : {}),
          ...(bannedOnly ? { banned: "1" } : {}),
        }}
        className="admin-search-lg mb-3"
      />
      {/* Список слева, фильтры колонкой справа — как на /search. */}
      <div className="row g-4">
      <div className="col-12 col-xl-9">

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
                    data-tooltip="Удалить код"
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
                        `${u._count.eventAttendances} идёт · ${u._count.eventMaybes} возм. · ${u._count.dramaWatchStatuses} сериалов`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {/* Отдельной строкой, а не в общем перечислении:
                        глазами по списку ищут именно её.
                        Дата и время, а не «вчера» (правка владельца
                        2026-09-09): по относительной подписи нельзя
                        сверить заход с чем-то ещё — письмом, оплатой,
                        жалобой, — а ровно за этим в список и смотрят.
                        «Сейчас на сайте» осталось: это не про дату. */}
                    <p className="small mb-0">
                      <span className="text-secondary opacity-75">последний заход: </span>
                      <span
                        className={isOnlineNow(u.lastSeenAt) ? "text-success" : "text-secondary"}
                      >
                        {isOnlineNow(u.lastSeenAt)
                          ? lastSeenLabel(u.lastSeenAt)
                          : u.lastSeenAt
                            ? lastSeenExact(u.lastSeenAt)
                            : lastSeenLabel(null)}
                      </span>
                    </p>
                  </div>
                </div>
                {/* На телефоне кнопки строки не влезали и уводили ВСЮ
                    страницу вбок на 280px (поймано 2026-09-18): ряд
                    больше не «не сжимай меня», а переносится под имя. */}
                <div className="admin-user-row-actions d-flex align-items-center gap-3">
                  <BanControls
                    userId={u.id}
                    userLabel={displayName}
                    banned={
                      u.bannedAt
                        ? {
                            at: `${formatShortDate(u.bannedAt)} ${u.bannedAt.getFullYear()}`,
                            reason: u.banReason,
                            by: null,
                          }
                        : null
                    }
                    blockedReason={
                      me?.id === u.id
                        ? "Себя заблокировать нельзя"
                        : u.isAdmin
                          ? "Админа заблокировать нельзя"
                          : null
                    }
                    compact
                  />
                  <PremiumToggle userId={u.id} premiumUntil={u.premiumUntil} premiumLifetime={u.premiumLifetime} />
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить пользователя «${displayName}» со всеми его данными?`}
                  >
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label="Удалить"
                      data-tooltip="Удалить"
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
      {/* Листание — от полного адреса: сортировка, поиск и фильтры
          остаются на месте (И16), меняется только page. */}
      <Pagination
        page={page}
        totalPages={totalPagesFor(usersTotal)}
        buildHref={(p) => adminListHref("/admin/users", sp, { page: p })}
      />
      </div>
      <AdminFilters defs={adminUserFilterDefs()} params={sp} />
      </div>
    </div>
  );
}
