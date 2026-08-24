import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import ReportButton from "@/components/ReportButton";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import { formatCombinedDateList, formatHumanDate, formatShortDate, formatTime } from "@/lib/dates";
import { performerHref } from "@/lib/performerSlug";
import { eventHref } from "@/lib/eventSlug";
import EntityMiniCard from "@/components/EntityMiniCard";
import FriendActionButton from "@/components/FriendActionButton";
import { CalendarIcon, CheckIcon, HeartIcon, PinIcon, TicketIcon, TvIcon, UsersIcon } from "@/components/icons";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";
import { isPremiumActive } from "@/lib/premium";
import { sendFriendRequest } from "../../friends/actions";
import FriendNotifyToggle from "./FriendNotifyToggle";
import { getUnlockedAchievements } from "@/lib/achievements";
import AchievementBadge from "@/components/AchievementBadge";
import { listHref, tripHref, locationHref, artistListHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Тот же разбор параметра, что в самой странице: cuid — это id, всё
  // остальное — ник.
  const looksLikeId = /^c[a-z0-9]{20,}$/.test(id);
  const user = await prisma.user.findUnique({
    where: looksLikeId ? { id } : { username: id },
    select: { name: true, deletedAt: true },
  });
  if (!user || user.deletedAt)
    return pageMetadata({
      title: "Пользователь",
      description: "Профиль не найден.",
      noIndex: true,
    });
  return pageMetadata({
    title: user.name ?? "Пользователь",
    description: user.name
      ? `Профиль пользователя ${user.name} на MyBLHub.`
      : "Профиль пользователя на MyBLHub.",
    path: `/users/${id}`,
    noIndex: true,
  });
}

// Публичный профиль пользователя: открыт любому залогиненному — имя,
// фото, статистика, любимые актёры, видимые зрителю поездки и (для
// зрителей с подпиской) предстоящие события, на которые человек идёт.
export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const { id } = await params;
  // Ник от id отличаем по формату: id — это cuid (начинается с "c" и
  // длинный), ник короче и может быть любым допустимым словом.
  const looksLikeId = /^c[a-z0-9]{20,}$/.test(id);
  const username = looksLikeId ? null : id;
  if (id === viewer.id) redirect("/account");

  const user = await prisma.user.findUnique({
    // Ник в адресе (/users/keetmine) — им делятся с друзьями; id
    // остаётся рабочим для старых ссылок и аккаунтов без ника.
    where: username ? { username } : { id },
    include: {
      favoritePerformers: { include: { performer: true }, orderBy: { createdAt: "desc" } },
      eventAttendances: {
        include: { event: true, occurrence: true },
      },
      _count: { select: { favoriteEvents: true, dramaWatchStatuses: true } },
    },
  });
  // Удалённый аккаунт публично не существует.
  if (!user || user.deletedAt) notFound();

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
  // Не-друзьям в actions шапки нужна кнопка «В друзья» — а если заявка
  // уже висит (в любую сторону), показываем её состояние вместо кнопки.
  const pendingFriendship = isFriend
    ? null
    : await prisma.friendship.findFirst({
        where: {
          status: "PENDING",
          OR: [
            { requesterId: viewer.id, addresseeId: user.id },
            { requesterId: user.id, addresseeId: viewer.id },
          ],
        },
      });

  // Списки мест, видимые этому зрителю (та же модель, что у поездок).
  const placeLists = await prisma.placeList.findMany({
    where: {
      userId: user.id,
      OR: [{ visibility: "PUBLIC" }, ...(isFriend ? [{ visibility: "FRIENDS" as const }] : [])],
    },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Кастомные списки актёров — та же модель видимости.
  const artistLists = await prisma.performerList.findMany({
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
  const showAchievements = showActivity && (isFriend || !user.hideAchievements);
  const showFavorites = showActivity && (isFriend || !user.hideFavoritePerformers);
  const showVisited = showActivity && (isFriend || !user.hideVisitedPlaces);

  // Бейджи-ачивки (Д2): только уже зафиксированные — пересчёт делает сам
  // владелец при заходе в кабинет.
  const badges = showAchievements ? await getUnlockedAchievements(user.id) : [];

  // Посещённые места — с собственным приватность-переключателем.
  const visitedPlaces = showVisited
    ? await prisma.locationVisit.findMany({
        where: { userId: user.id },
        include: { location: { select: { id: true, slug: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 24,
      })
    : [];

  return (
    <div>
      <Link href="/friends" className="eyebrow text-decoration-none d-inline-block mb-3">
        ← Друзья
      </Link>

      {/* Шапка на языке DetailHero (свой вариант на .detail-hero: круглый
          аватар вместо карточки 3/4, см. .profile-hero в globals.css). */}
      <section className="detail-hero profile-hero">
        {user.photoUrl && (
          <div className="detail-hero-backdrop" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.photoUrl} alt="" loading="eager" decoding="async" />
          </div>
        )}
        <div className="detail-hero-scrim" aria-hidden />
        <div className="detail-hero-content">
          {user.photoUrl ? (
            <div className="detail-hero-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.photoUrl} alt={displayName} loading="eager" decoding="async" />
            </div>
          ) : (
            <div className="profile-hero-fallback" aria-hidden>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            {showActivity && (
              <div className="detail-hero-chips mb-2">
                <span className="date-chip">
                  <UsersIcon className="icon-inline" /> друзей: {ownerFriendIds.length}
                </span>
                <span className="date-chip">
                  <TicketIcon className="icon-inline" /> событий: {user.eventAttendances.length}
                </span>
                <span className="date-chip">
                  <HeartIcon className="icon-inline" /> актёров: {user.favoritePerformers.length}
                </span>
                <span className="date-chip">
                  <TvIcon className="icon-inline" /> сериалов: {user._count.dramaWatchStatuses}
                </span>
              </div>
            )}
            <h1 className="display-1-tight detail-hero-title mb-1">{displayName}</h1>
            <p className="text-secondary mb-0">
              На MyBLHub с {formatShortDate(user.createdAt)} {user.createdAt.getFullYear()}
            </p>
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2 flex-shrink-0 mb-1">
            {/* На своём профиле дружеских действий нет — иначе можно
                было отправить заявку самому себе (Ж7). */}
            {viewer.id === user.id ? (
              <Link href="/account" className="btn btn-ghost btn-sm">
                Это вы · в кабинет
              </Link>
            ) : isFriend ? (
              <>
                <span className="date-chip">
                  <CheckIcon /> Ваш друг
                </span>
                <FriendNotifyToggle friendId={user.id} muted={!!muteRow} />
              </>
            ) : pendingFriendship ? (
              pendingFriendship.requesterId === viewer.id ? (
                <span className="date-chip">Заявка отправлена</span>
              ) : (
                <Link href="/friends" className="btn btn-primary btn-sm">
                  Ответить на заявку
                </Link>
              )
            ) : (
              <FriendActionButton
                action={sendFriendRequest}
                id={user.id}
                label="В друзья"
                pendingLabel="Отправка…"
              />
            )}
          </div>
        </div>
      </section>

      {!showActivity && (
        <p className="small text-secondary">Этот профиль скрывает свою активность.</p>
      )}

      {showActivity && (
      <>
      {badges.length > 0 && (
        <>
          <h2 className="section-heading mb-2">
            Ачивки
          </h2>
          {/* Медали вместо чипов (Э2ф): тот же AchievementBadge, что в
              кабинете, компактным вариантом. */}
          <div className="d-flex flex-wrap gap-2 mb-4">
            {badges.map((b) => (
              <AchievementBadge
                key={b.key}
                emoji={b.emoji}
                title={b.title}
                hint={b.hint}
                compact
              />
            ))}
          </div>
        </>
      )}
      <h2 className="section-heading mb-2">
        Идёт на события
      </h2>
      {!isPremiumActive(viewer) ? (
        <p className="small text-secondary mb-4">
          🔒 {upcomingGoing.length > 0 ? `Событий: ${upcomingGoing.length} — с` : "С"}писки событий
          доступны по подписке.
        </p>
      ) : upcomingGoing.length === 0 ? (
        <div className="mb-4">
          <EmptyState
            emoji="🎫"
            title="Пока никуда не собирается"
            hint={`Когда ${displayName} отметит «иду», события появятся здесь.`}
            compact
          />
        </div>
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
          <h2 className="section-heading mb-2">
            Поездки
          </h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {trips.map((t) => (
              <Link
                key={t.id}
                href={tripHref(t)}
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
          <h2 className="section-heading mb-2">
            Списки мест
          </h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {placeLists.map((l) => (
              <Link
                key={l.id}
                href={listHref(l)}
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

      {artistLists.length > 0 && (
        <>
          <h2 className="section-heading mb-2">Списки актёров</h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {artistLists.map((l) => (
              <Link
                key={l.id}
                href={artistListHref(l)}
                className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div style={{ minWidth: 0 }}>
                  <p className="font-display fw-medium text-white mb-0 text-truncate">{l.title}</p>
                  {l.description && (
                    <p className="small text-secondary mb-0 text-truncate">{l.description}</p>
                  )}
                </div>
                <span className="small text-secondary flex-shrink-0">{l._count.items} актёров</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {visitedPlaces.length > 0 && (
        <>
          <h2 className="section-heading mb-2">Посещённые места</h2>
          <div className="d-flex flex-wrap gap-2 mb-4">
            {visitedPlaces.map((v) => (
              <Link
                key={v.locationId}
                href={locationHref(v.location)}
                className="event-chip text-decoration-none"
              >
                📍 {v.location.name}
              </Link>
            ))}
          </div>
        </>
      )}

      {showFavorites && user.favoritePerformers.length > 0 && (
        <>
          <h2 className="section-heading mb-2">
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

      {/* «Пожаловаться» — намеренно неприметная серая ссылка в самом
          низу страницы (из шапки убрана по фидбеку владельца). */}
      <p className="mt-5 mb-0">
        <ReportButton targetType="profile" targetId={user.id} />
      </p>
    </div>
  );
}
