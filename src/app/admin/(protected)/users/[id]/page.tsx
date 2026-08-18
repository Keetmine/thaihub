import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import PremiumToggle from "../PremiumToggle";
import AdminRoleToggle from "./AdminRoleToggle";
import ConfirmForm from "@/components/ConfirmForm";
import StatTile from "@/components/StatTile";
import { TrashIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/dates";
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

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          {user.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
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
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <AdminRoleToggle
            userId={user.id}
            isAdmin={user.isAdmin}
            isManager={user.isManager}
            isSelf={me?.id === user.id}
          />
          <PremiumToggle userId={user.id} premiumUntil={user.premiumUntil} />
          <ConfirmForm
            action={boundDelete}
            confirmMessage={`Удалить пользователя «${displayName}» со всеми его данными?`}
          >
            <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить" title="Удалить">
              <TrashIcon />
            </button>
          </ConfirmForm>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatTile value={user._count.eventAttendances} label="идёт" />
        <StatTile value={user._count.favoriteEvents} label="избр. событий" />
        <StatTile value={user._count.favoritePerformers} label="избр. артистов" />
        <StatTile value={user._count.dramaWatchStatuses} label="сериалов" />
        <StatTile value={user._count.eventNotes} label="заметок" />
        <StatTile value={user._count.placeLists} label="списков" />
        <StatTile value={user._count.createdLocations} label="своих мест" />
        <StatTile value={user._count.trips} label="поездок" />
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Заметки к событиям</h2>
          {user.eventNotes.length === 0 ? (
            <p className="small text-secondary">Нет заметок.</p>
          ) : (
            <div className="d-flex flex-column gap-2 scroll-list thin-scroll">
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

          <h2 className="section-heading mb-2 mt-4">Списки мест</h2>
          {user.placeLists.length === 0 ? (
            <p className="small text-secondary">Нет списков.</p>
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

          <h2 className="section-heading mb-2 mt-4">Свои места</h2>
          {user.createdLocations.length === 0 ? (
            <p className="small text-secondary">Нет своих мест.</p>
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

          <h2 className="section-heading mb-2 mt-4">Поездки</h2>
          {user.trips.length === 0 ? (
            <p className="small text-secondary">Нет поездок.</p>
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

        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Избранные артисты</h2>
          {user.favoritePerformers.length === 0 ? (
            <p className="small text-secondary">Нет избранных артистов.</p>
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

          <h2 className="section-heading mb-2 mt-4">Идёт на события</h2>
          {user.eventAttendances.length === 0 ? (
            <p className="small text-secondary">Нет отметок «иду».</p>
          ) : (
            <div className="d-flex flex-column gap-2 scroll-list thin-scroll">
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
  );
}
