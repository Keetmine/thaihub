import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import { formatCombinedDateList, formatHumanDate, formatShortDate, formatTime } from "@/lib/dates";
import { performerHref } from "@/lib/performerSlug";
import { eventHref } from "@/lib/eventSlug";
import EntityMiniCard from "@/components/EntityMiniCard";
import { CalendarIcon, PinIcon } from "@/components/icons";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";
import { isPremiumActive } from "@/lib/premium";
import FriendNotifyToggle from "./FriendNotifyToggle";
import { ACHIEVEMENTS } from "@/lib/achievements";

export const dynamic = "force-dynamic";

// Публичный профиль пользователя: открыт любому залогиненному — имя,
// фото, статистика, любимые актёры, видимые зрителю поездки и (для
// зрителей с подпиской) предстоящие события, на которые человек идёт.
export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const { id } = await params;
  if (id === viewer.id) redirect("/account");

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      favoritePerformers: { include: { performer: true }, orderBy: { createdAt: "desc" } },
      eventAttendances: {
        include: { event: true, occurrence: true },
      },
      _count: { select: { favoriteEvents: true, dramaWatchStatuses: true } },
    },
  });
  if (!user) notFound();

  const [ownerFriendIds, viewerFriendIds] = await Promise.all([
    getFriendIds(user.id),
    getFriendIds(viewer.id),
  ]);
  const isFriend = viewerFriendIds.includes(user.id);
  const muteRow = isFriend
    ? await prisma.friendNotificationMute.findUnique({
        where: { userId_mutedFriendId: { userId: viewer.id, mutedFriendId: user.id } },
      })
    : null;

  // Списки мест, видимые этому зрителю (та же модель, что у поездок).
  const placeLists = await prisma.placeList.findMany({
    where: {
      userId: user.id,
      OR: [{ visibility: "PUBLIC" }, ...(isFriend ? [{ visibility: "FRIENDS" as const }] : [])],
    },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Поездки, которые этому зрителю можно видеть.
  const trips = await prisma.trip.findMany({
    where: {
      userId: user.id,
      OR: [{ visibility: "PUBLIC" }, ...(isFriend ? [{ visibility: "FRIENDS" as const }] : [])],
      endDate: { gte: new Date() },
    },
    orderBy: { startDate: "asc" },
  });

  const now = new Date();
  // «Иду» per-дата: собираем события с отмеченными будущими датами.
  const goingByEvent = new Map<string, { event: (typeof user.eventAttendances)[number]["event"]; occurrences: { startsAt: Date }[] }>();
  for (const a of user.eventAttendances) {
    if (a.occurrence.startsAt < now) continue;
    const cur = goingByEvent.get(a.eventId);
    if (cur) cur.occurrences.push({ startsAt: a.occurrence.startsAt });
    else goingByEvent.set(a.eventId, { event: a.event, occurrences: [{ startsAt: a.occurrence.startsAt }] });
  }
  const upcomingGoing = Array.from(goingByEvent.values())
    .map((g) => ({ ...g.event, occurrences: g.occurrences.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime()) }))
    .sort(
      (a, b) =>
        (a.occurrences[0]?.startsAt.getTime() ?? 0) - (b.occurrences[0]?.startsAt.getTime() ?? 0),
    );

  const displayName = user.name || "Пользователь";
  // Приватный профиль: не-друзьям показываем только имя/фото (Г8).
  const showActivity = isFriend || !user.hideProfileActivity;

  // Бейджи-ачивки (Д2): только уже зафиксированные — пересчёт делает сам
  // владелец при заходе в кабинет.
  const unlockedRows = showActivity
    ? await prisma.userAchievement.findMany({ where: { userId: user.id }, orderBy: { unlockedAt: "asc" } })
    : [];
  const badges = unlockedRows
    .map((r) => ACHIEVEMENTS.find((a) => a.key === r.key))
    .filter((a): a is (typeof ACHIEVEMENTS)[number] => !!a);

  return (
    <div>
      <Link href="/friends" className="eyebrow text-decoration-none">
        ← Друзья
      </Link>

      <div className="d-flex flex-wrap align-items-center gap-4 mt-3 mb-5">
        {user.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoUrl}
            alt=""
            className="rounded-circle flex-shrink-0"
            style={{ width: "5.5rem", height: "5.5rem", objectFit: "cover" }}
          />
        ) : (
          <div
            className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center font-display fw-bold"
            style={{
              width: "5.5rem",
              height: "5.5rem",
              fontSize: "2.2rem",
              background: "var(--bs-primary-bg-subtle)",
              color: "var(--bs-primary-text-emphasis)",
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
              {displayName}
            </h1>
            {isFriend && (
              <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.65rem" }}>
                Ваш друг
              </span>
            )}
            {isFriend && <FriendNotifyToggle friendId={user.id} muted={!!muteRow} />}
          </div>
          <p className="text-secondary small mb-0">
            На MyBLHub с {formatShortDate(user.createdAt)} {user.createdAt.getFullYear()}
            {showActivity && (
              <>
                {" "}· {ownerFriendIds.length} друзей · {user.eventAttendances.length} событий ·{" "}
                {user.favoritePerformers.length} любимых актёров · {user._count.dramaWatchStatuses}{" "}
                сериалов
              </>
            )}
          </p>
        </div>
      </div>

      {!showActivity && (
        <p className="small text-secondary">Этот профиль скрывает свою активность.</p>
      )}

      {showActivity && (
      <>
      {badges.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Ачивки
          </h2>
          <div className="d-flex flex-wrap gap-2 mb-4">
            {badges.map((b) => (
              <span key={b.key} className="event-chip" title={b.description}>
                {b.emoji} {b.title}
              </span>
            ))}
          </div>
        </>
      )}
      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        Идёт на события
      </h2>
      {!isPremiumActive(viewer) ? (
        <p className="small text-secondary mb-4">
          🔒 {upcomingGoing.length > 0 ? `Событий: ${upcomingGoing.length} — с` : "С"}писки событий
          доступны по подписке.
        </p>
      ) : upcomingGoing.length === 0 ? (
        <p className="small text-secondary mb-4">Пока никуда не собирается.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-4">
          {upcomingGoing.map((event) => {
            const dates = event.occurrences.map((o) => o.startsAt);
            const first = event.occurrences[0];
            return (
              <Link
                key={event.id}
                href={eventHref(event)}
                className="surface surface-hover text-decoration-none d-flex align-items-baseline justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0">{event.title}</p>
                  <p className="small text-secondary mb-0">
                    <PinIcon /> {event.venue}
                  </p>
                </div>
                <span className="small text-secondary text-end flex-shrink-0 text-capitalize">
                  {dates.length === 1 ? formatHumanDate(dates[0]) : formatCombinedDateList(dates)}
                  {first && ` · ${formatTime(first.startsAt)}`}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {trips.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Поездки
          </h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {trips.map((t) => (
              <Link
                key={t.id}
                href={`/trips/${t.id}`}
                className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0">{t.title}</p>
                  <p className="small text-secondary mb-0">
                    <CalendarIcon className="icon-inline" /> {formatShortDate(t.startDate)} –{" "}
                    {formatShortDate(t.endDate)} {t.endDate.getFullYear()}
                  </p>
                </div>
                <span className="small text-secondary flex-shrink-0">
                  {VISIBILITY_LABELS[t.visibility]}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {placeLists.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Списки мест
          </h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {placeLists.map((l) => (
              <Link
                key={l.id}
                href={`/lists/${l.id}`}
                className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div style={{ minWidth: 0 }}>
                  <p className="font-display fw-medium text-white mb-0 text-truncate">{l.title}</p>
                  {l.description && (
                    <p className="small text-secondary mb-0 text-truncate">{l.description}</p>
                  )}
                </div>
                <span className="small text-secondary flex-shrink-0">{l._count.items} мест</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {user.favoritePerformers.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Любимые актёры
          </h2>
          <div className="d-flex flex-wrap gap-2 mb-4">
            {user.favoritePerformers.map((f) => (
              <EntityMiniCard
                key={f.performerId}
                href={performerHref(f.performer)}
                photoUrl={f.performer.photoUrl}
                name={f.performer.name}
              />
            ))}
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
