import EmptyState from "@/components/EmptyState";
import { getFriendIds } from "@/lib/friends";
import { getT } from "@/lib/i18n";
import { isPremiumActive } from "@/lib/premium";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { userDisplayName } from "@/lib/userProfile";
import TripCard from "../../trips/TripCard";
import TripFromCommunityButton from "./TripFromCommunityButton";

/**
 * Вкладка «Поездки» — поездки, собранные этим сообществом (АА25).
 *
 * В сообществе договариваются, а едут в поездке: собранная отсюда
 * поездка помечается `Trip.communityId` и возвращается на эту вкладку —
 * иначе её приходилось бы искать в своём кабинете, а тем, кого позвали
 * позже, и вовсе негде.
 *
 * ГЛАВНОЕ ЗДЕСЬ — ПРИВАТНОСТЬ. Поездка — вещь личная, и то, что её
 * собрало сообщество, НЕ делает её общим достоянием: сотня участников
 * не должна узнать, что четверо из них летят в Бангкок 20 августа.
 * Правило вкладки поэтому одно:
 *
 *   вкладка показывает ровно те поездки, которые зритель и так вправе
 *   открыть на /trips/[id], и ни одной сверх того.
 *
 * То есть (порядок как в `trips/[id]/page.tsx`, где стоит гейт самой
 * страницы):
 *
 *   - своя поездка — всегда;
 *   - поездка, куда позвали (`TripMember` в любом статусе): PENDING —
 *     это приглашение, и страницу оно уже открывает, значит и в списке
 *     прятать нечего;
 *   - `PUBLIC` — всем;
 *   - `FRIENDS` — друзьям владельца;
 *   - `PRIVATE` чужая — НИКОМУ, даже участнику того же сообщества.
 *
 * Гейт стоит В ЗАПРОСЕ, а не в разметке: чужая приватная поездка не
 * должна доезжать даже в пропсы компонента — скрытое стилями всё равно
 * уехало бы в HTML. Это то же правило, по которому закрытые сообщества
 * отсекаются в самом `findMany` (см. docs/features/communities.md).
 *
 * Сама вкладка живёт за `access.canSeeInside` (см. page.tsx), так что
 * посторонний сюда не попадает вовсе.
 */
export default async function TripsTab({
  communityId,
  canCreate,
}: {
  communityId: string;
  canCreate: boolean;
}) {
  const { locale, t } = await getT();
  const s = t.communities.together;
  const viewer = await getCurrentUser();

  // Дружба симметрична, поэтому «зритель — друг владельца» считается по
  // друзьям ЗРИТЕЛЯ (страница поездки спрашивает друзей владельца и
  // приходит к тому же ответу, только вторым запросом).
  const friendIds = viewer ? await getFriendIds(viewer.id) : [];

  const trips = viewer
    ? await prisma.trip.findMany({
        where: {
          communityId,
          OR: [
            { userId: viewer.id },
            { members: { some: { userId: viewer.id } } },
            { visibility: "PUBLIC" },
            { visibility: "FRIENDS", userId: { in: friendIds } },
          ],
        },
        include: {
          user: { select: { id: true, name: true, username: true, deletedAt: true } },
          _count: { select: { members: { where: { status: "ACCEPTED" } } } },
        },
        orderBy: { startDate: "asc" },
      })
    : [];

  // Кандидаты в попутчики и название для заготовки заголовка нужны
  // только тому, кто вправе собрать поездку, — лишний запрос остальным
  // не делаем.
  const canPlan = canCreate && isPremiumActive(viewer);
  const community = canPlan
    ? await prisma.community.findUnique({
        where: { id: communityId },
        select: {
          title: true,
          members: {
            where: { status: "ACTIVE", user: { deletedAt: null } },
            select: {
              userId: true,
              user: { select: { name: true, username: true, photoUrl: true, deletedAt: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    : null;

  const now = new Date();
  // Будущие и текущие — сверху (ближайшая первой), прошедшие — ниже
  // свёрнутыми: они не мусорят вкладку, но и не пропадают.
  const upcoming = trips.filter((trip) => trip.endDate >= now);
  const past = trips.filter((trip) => trip.endDate < now).reverse();

  const card = (trip: (typeof trips)[number], isPast: boolean) => (
    <TripCard
      key={trip.id}
      trip={{ ...trip, acceptedMembers: trip._count.members }}
      viewerId={viewer?.id ?? null}
      isPast={isPast}
      locale={locale}
      t={t}
    />
  );

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h2 className="section-heading mb-0">{s.tripsHeading}</h2>
        {canPlan && community && (
          <TripFromCommunityButton
            communityId={communityId}
            communityTitle={community.title}
            members={community.members
              .filter((m) => m.userId !== viewer?.id)
              .map((m) => ({
                id: m.userId,
                name: userDisplayName(m.user, locale),
                photoUrl: m.user.photoUrl,
              }))}
          />
        )}
      </div>

      {/* Почему список короче, чем «все поездки сообщества»: без этой
          строки человек решит, что вкладка сломалась, а не что чужие
          планы его не касаются. */}
      <p className="small text-secondary mb-0">{s.tripsNote}</p>

      {trips.length === 0 ? (
        <EmptyState
          emoji="✈️"
          title={s.tripsEmptyTitle}
          hint={canPlan ? s.tripsEmptyHint : s.tripsEmptyHintReadOnly}
          compact
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="d-flex flex-column gap-3">
              {upcoming.map((trip) => card(trip, false))}
            </div>
          )}
          {past.length > 0 && (
            <details>
              {/* Счёт в подписи — чтобы не открывать свёртку ради одной
                  строки (как у прошедших встреч). */}
              <summary className="small text-secondary">{`${s.tripsPast} (${past.length})`}</summary>
              <div className="d-flex flex-column gap-2 mt-2">
                {past.map((trip) => card(trip, true))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
