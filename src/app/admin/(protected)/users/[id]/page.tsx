import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import PremiumToggle from "../PremiumToggle";
import AdminRoleToggle from "./AdminRoleToggle";
import BanControls from "../BanControls";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/dates";
import { isOnlineNow, lastSeenExact, lastSeenLabel } from "../lastSeenLabel";
import { eventHref, tripHref, listHref, performerHref, locationHref } from "@/lib/slugHelpers";
import {
  deleteUser,
  adminDeleteEventNote,
  adminDeletePlaceList,
  adminDeleteOwnPlace,
  adminDeleteTrip,
} from "../actions";

export const dynamic = "force-dynamic";

const VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: "приватный",
  FRIENDS: "для друзей",
  PUBLIC: "публичный",
};

// Полная карточка пользователя для модерации: роль, подписка и ВСЁ, что
// он создал/оставил на сайте — заметки, списки мест, свои места,
// поездки, избранное, отметки «иду» — с точечным удалением неуместного.
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const me = await getCurrentUser();

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      eventNotes: {
        include: { event: { select: { id: true, slug: true, title: true } } },
        orderBy: { id: "desc" },
      },
      placeLists: {
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
      },
      createdLocations: { orderBy: { createdAt: "desc" } },
      trips: { orderBy: { startDate: "desc" } },
      favoritePerformers: {
        include: { performer: { select: { id: true, slug: true, name: true, photoUrl: true } } },
      },
      eventAttendances: {
        include: {
          occurrence: {
            include: { event: { select: { id: true, slug: true, title: true } } },
          },
        },
        orderBy: { occurrence: { startsAt: "desc" } },
        take: 30,
      },
      // Кто заблокировал — на карточке видно рядом с причиной: через
      // полгода «когда и за что» без автора читается наполовину.
      bannedBy: { select: { name: true, email: true } },
      _count: {
        select: {
          favoriteEvents: true,
          favoritePerformers: true,
          dramaWatchStatuses: true,
          eventAttendances: true,
          eventNotes: true,
          placeLists: true,
          createdLocations: true,
          trips: true,
        },
      },
    },
  });
  if (!user) notFound();

  const displayName = user.name || user.email || `tg:${user.telegramUsername ?? user.telegramId}`;
  const boundDelete = deleteUser.bind(null, user.id);

  return (
    <div>
      <Link href="/admin/users" className="eyebrow text-decoration-none">
        ← Все пользователи
      </Link>

      {/* Шапка и управление — одной карточкой (переделка 2026-09-18 по
          просьбе владельца, в языке дашборда): кто это, как с ним
          связаться и что с ним можно сделать — один взгляд, а не три
          разных блока подряд. */}
      <div className="surface stats-card mt-3 mb-3">
        <div className="d-flex flex-wrap align-items-center gap-3">
          {user.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              loading="lazy"
              decoding="async"
              src={user.photoUrl}
              alt=""
              className="rounded-circle flex-shrink-0"
              style={{ width: "4rem", height: "4rem", objectFit: "cover" }}
            />
          ) : (
            <div
              className="rounded-circle flex-shrink-0"
              style={{ width: "4rem", height: "4rem", background: "var(--bs-secondary-bg)" }}
            />
          )}
          <div>
            <h1 className="display-1-tight mb-1" style={{ fontSize: "1.9rem" }}>
              {displayName}
              {user.isAdmin && (
                <span className="admin-badge badge rounded-pill fw-semibold ms-2 align-middle">
                  ADMIN
                </span>
              )}
              {user.bannedAt && (
                <span className="badge rounded-pill text-bg-danger ms-2 align-middle">
                  ЗАБЛОКИРОВАН
                </span>
              )}
            </h1>
            <p className="small text-secondary mb-0">
              {[
                user.email,
                user.telegramUsername ? `@${user.telegramUsername}` : null,
                user.googleId ? "Google" : null,
                `с ${formatShortDate(user.createdAt)} ${user.createdAt.getFullYear()}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="small mb-0">
              <span className="text-secondary opacity-75">последний заход: </span>
              <span className={isOnlineNow(user.lastSeenAt) ? "text-success" : "text-secondary"}>
                {user.lastSeenAt
                  ? `${lastSeenExact(user.lastSeenAt)} (${lastSeenLabel(user.lastSeenAt)})`
                  : "ни разу"}
              </span>
            </p>
          </div>
        </div>

        {/* Управление — подписанными группами, а не кашей кнопок
            (фидбек владельца: роль, подписка и удаление сливались в одну
            нечитаемую строку). */}
        <div className="admin-user-controls d-flex flex-wrap align-items-end column-gap-4 row-gap-3">
        <div>
          <p className="small text-secondary mb-1">Роль</p>
          <AdminRoleToggle
            userId={user.id}
            isAdmin={user.isAdmin}
            isManager={user.isManager}
            isSelf={me?.id === user.id}
          />
        </div>
        <div>
          <p className="small text-secondary mb-1">Подписка</p>
          <PremiumToggle
            userId={user.id}
            premiumUntil={user.premiumUntil}
            premiumLifetime={user.premiumLifetime}
          />
        </div>
        <div>
          <p className="small text-secondary mb-1">Доступ к сайту</p>
          <BanControls
            userId={user.id}
            userLabel={displayName}
            banned={
              user.bannedAt
                ? {
                    at: `заблокирован ${formatShortDate(user.bannedAt)} ${user.bannedAt.getFullYear()}`,
                    reason: user.banReason,
                    by: user.bannedBy?.name ?? user.bannedBy?.email ?? null,
                  }
                : null
            }
            blockedReason={
              me?.id === user.id
                ? "Себя заблокировать нельзя"
                : user.isAdmin
                  ? "Админа заблокировать нельзя"
                  : null
            }
          />
        </div>
        <div className="ms-auto">
          <ConfirmForm
            action={boundDelete}
            confirmMessage={`Удалить пользователя «${displayName}» со всеми его данными?`}
          >
            <button type="button" className="btn btn-outline-danger btn-sm">
              Удалить аккаунт
            </button>
          </ConfirmForm>
        </div>
        </div>
      </div>

      {/* Чем человек живёт на сайте — ряд цифр, как на дашборде.
          Остальные счётчики (заметки, списки, места, поездки) стоят в
          шапках своих карточек ниже: дублировать их плитками незачем. */}
      <div className="kpi-tiles mb-3">
        <div className="kpi-tile">
          <span className="kpi-tile-icon" aria-hidden>
            🎤
          </span>
          <span className="kpi-tile-value">{user._count.eventAttendances}</span>
          <span className="kpi-tile-label">отметок «иду»</span>
          <span className="kpi-tile-hint">{user._count.favoriteEvents} событий в избранном</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-tile-icon" aria-hidden>
            📺
          </span>
          <span className="kpi-tile-value">{user._count.dramaWatchStatuses}</span>
          <span className="kpi-tile-label">сериалов в списке</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-tile-icon" aria-hidden>
            ✨
          </span>
          <span className="kpi-tile-value">{user._count.favoritePerformers}</span>
          <span className="kpi-tile-label">любимых артистов</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-tile-icon" aria-hidden>
            🧳
          </span>
          <span className="kpi-tile-value">{user._count.trips}</span>
          <span className="kpi-tile-label">поездок</span>
          <span className="kpi-tile-hint">{user._count.placeLists} списков мест</span>
        </div>
      </div>

      {/* Содержимое — карточками в две колонки, у каждой счётчик в
          шапке: пустые больше не занимают экран заголовком и фразой
          «нет заметок» на всю ширину. */}
      <div className="row g-3 align-items-start">
        <div className="col-12 col-lg-6 d-flex flex-column gap-3">
          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Заметки к событиям</h2>
              <span className="stats-card-meta">{user._count.eventNotes}</span>
            </div>
          {user.eventNotes.length === 0 ? (
            <p className="small text-secondary mb-0">Нет заметок.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {user.eventNotes.map((n) => (
                <div key={n.id} className="surface d-flex justify-content-between gap-3 p-3">
                  <div style={{ minWidth: 0 }}>
                    <Link href={eventHref(n.event)} target="_blank" rel="noopener noreferrer" className="small link-body-emphasis d-block text-truncate">
                      {n.event.title}
                    </Link>
                    <p className="small text-secondary mb-0">{n.text}</p>
                    <span className="small text-secondary opacity-75">
                      {VISIBILITY_LABELS[n.visibility] ?? n.visibility.toLowerCase()}
                    </span>
                  </div>
                  <ConfirmForm
                    action={adminDeleteEventNote.bind(null, n.id)}
                    confirmMessage="Удалить эту заметку?"
                    className="flex-shrink-0"
                  >
                    <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить заметку">
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              ))}
            </div>
          )}

          </div>

          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Списки мест</h2>
              <span className="stats-card-meta">{user._count.placeLists}</span>
            </div>
          {user.placeLists.length === 0 ? (
            <p className="small text-secondary mb-0">Нет списков.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {user.placeLists.map((l) => (
                <div key={l.id} className="surface d-flex justify-content-between gap-3 p-3">
                  <div style={{ minWidth: 0 }}>
                    <Link href={listHref(l)} target="_blank" rel="noopener noreferrer" className="link-body-emphasis d-block text-truncate">
                      {l.title}
                    </Link>
                    <span className="small text-secondary">
                      {l._count.items} мест · {VISIBILITY_LABELS[l.visibility]}
                    </span>
                    {l.description && (
                      <p className="small text-secondary mb-0">{l.description}</p>
                    )}
                  </div>
                  <ConfirmForm
                    action={adminDeletePlaceList.bind(null, l.id)}
                    confirmMessage={`Удалить список «${l.title}»?`}
                    className="flex-shrink-0"
                  >
                    <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить список">
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              ))}
            </div>
          )}

          </div>

          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Свои места</h2>
              <span className="stats-card-meta">{user._count.createdLocations}</span>
            </div>
          {user.createdLocations.length === 0 ? (
            <p className="small text-secondary mb-0">Нет своих мест.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {user.createdLocations.map((loc) => (
                <div key={loc.id} className="surface d-flex justify-content-between gap-3 p-3">
                  <div style={{ minWidth: 0 }}>
                    <Link href={locationHref(loc)} target="_blank" rel="noopener noreferrer" className="link-body-emphasis d-block text-truncate">
                      {loc.name}
                    </Link>
                    {loc.description && (
                      <span className="small text-secondary">{loc.description}</span>
                    )}
                  </div>
                  <ConfirmForm
                    action={adminDeleteOwnPlace.bind(null, loc.id)}
                    confirmMessage={`Удалить место «${loc.name}»?`}
                    className="flex-shrink-0"
                  >
                    <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить место">
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              ))}
            </div>
          )}

          </div>

          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Поездки</h2>
              <span className="stats-card-meta">{user._count.trips}</span>
            </div>
          {user.trips.length === 0 ? (
            <p className="small text-secondary mb-0">Нет поездок.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {user.trips.map((t) => (
                <div key={t.id} className="surface d-flex justify-content-between gap-3 p-3">
                  <div style={{ minWidth: 0 }}>
                    <Link href={tripHref(t)} target="_blank" rel="noopener noreferrer" className="link-body-emphasis d-block text-truncate">
                      {t.title}
                    </Link>
                    <span className="small text-secondary">
                      {formatShortDate(t.startDate)} — {formatShortDate(t.endDate)} ·{" "}
                      {VISIBILITY_LABELS[t.visibility]}
                    </span>
                  </div>
                  <ConfirmForm
                    action={adminDeleteTrip.bind(null, t.id)}
                    confirmMessage={`Удалить поездку «${t.title}»?`}
                    className="flex-shrink-0"
                  >
                    <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить поездку">
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        <div className="col-12 col-lg-6 d-flex flex-column gap-3">
          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Избранные артисты</h2>
              <span className="stats-card-meta">{user._count.favoritePerformers}</span>
            </div>
          {user.favoritePerformers.length === 0 ? (
            <p className="small text-secondary mb-0">Нет избранных артистов.</p>
          ) : (
            <div className="d-flex flex-wrap gap-2 mb-2">
              {user.favoritePerformers.map(({ performer }) => (
                <Link
                  key={performer.id}
                  href={performerHref(performer)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="event-chip text-decoration-none"
                >
                  {performer.name}
                </Link>
              ))}
            </div>
          )}

          </div>

          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Идёт на события</h2>
              <span className="stats-card-meta">{user._count.eventAttendances}</span>
            </div>
          {user.eventAttendances.length === 0 ? (
            <p className="small text-secondary mb-0">Нет отметок «иду».</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {user.eventAttendances.map((a) => (
                <div key={`${a.occurrenceId}`} className="surface d-flex justify-content-between gap-3 p-3">
                  <Link
                    href={eventHref(a.occurrence.event)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="small link-body-emphasis text-truncate"
                  >
                    {a.occurrence.event.title}
                  </Link>
                  <span className="small text-secondary flex-shrink-0">
                    {formatShortDate(a.occurrence.startsAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
