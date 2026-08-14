import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import EventAgendaRow from "@/components/EventAgendaRow";
import EntityMiniCard from "@/components/EntityMiniCard";
import { getFavoritedEventIds, getGoingEventIds } from "@/lib/favorites";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { CakeIcon, BuildingIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function PerformerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const performer = await prisma.performer.findUnique({
    where: { id },
    include: {
      links: true,
      agency: true,
      dramas: { include: { drama: true }, orderBy: { drama: { title: "asc" } } },
      bandMembers: { include: { performer: true }, orderBy: { performer: { name: "asc" } } },
      memberOfBands: { include: { band: true }, orderBy: { band: { name: "asc" } } },
    },
  });
  if (!performer) notFound();
  const isBand = performer.type === "BAND";

  const eventLinks = await prisma.eventPerformer.findMany({
    where: { performerId: id },
    include: {
      event: {
        include: {
          performers: { include: { performer: true } },
          occurrences: { orderBy: { startsAt: "asc" } },
        },
      },
    },
  });
  const performerEvents = eventLinks.flatMap((l) =>
    l.event.occurrences.map((occ) => flattenOccurrence({ ...occ, event: l.event })),
  );

  // Pairings this performer is part of — solo-only, nice-to-have, additive.
  const pairings = isBand
    ? []
    : await prisma.pairing.findMany({
        where: { OR: [{ performerAId: id }, { performerBId: id }] },
        include: { performerA: true, performerB: true },
        orderBy: { createdAt: "desc" },
      });

  const currentUser = await getCurrentUser();
  let isFavorited = false;
  if (currentUser) {
    const favorite = await prisma.favoritePerformer.findUnique({
      where: { userId_performerId: { userId: currentUser.id, performerId: id } },
    });
    isFavorited = !!favorite;
  }

  const now = new Date();
  const upcoming = performerEvents
    .filter((ev) => ev.startsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = performerEvents
    .filter((ev) => ev.startsAt < now)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  const eventIds = performerEvents.map((ev) => ev.id);
  const [favoritedEventIds, goingEventIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingEventIds(eventIds, currentUser?.id),
  ]);

  const favoritedDramaIds = new Set<string>();
  if (currentUser && performer.dramas.length > 0) {
    const favorites = await prisma.favoriteDrama.findMany({
      where: {
        userId: currentUser.id,
        dramaId: { in: performer.dramas.map((pd) => pd.dramaId) },
      },
      select: { dramaId: true },
    });
    for (const f of favorites) favoritedDramaIds.add(f.dramaId);
  }

  const formatBirthDate = (d: Date) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <Link href="/performers" className="eyebrow text-decoration-none">
        ← Все исполнители
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          {performer.name}{" "}
          {performer.realName && (
            <span className="fs-5 fw-normal text-secondary">({performer.realName})</span>
          )}
        </h1>
        <FavoriteButton kind="performer" id={performer.id} isFavorited={isFavorited} variant="icon" />
      </div>

      <div className="d-flex flex-column flex-sm-row gap-4 mb-4" style={{ maxWidth: "40rem" }}>
        {performer.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={performer.photoUrl}
            alt={performer.name}
            className="rounded-4 flex-shrink-0"
            style={{ width: "10rem", height: "10rem", objectFit: "cover" }}
          />
        )}

        <div className="d-flex flex-column gap-2">
          {!isBand && performer.birthDate && (
            <p className="small text-secondary mb-0">
              <CakeIcon /> <span className="text-secondary">Дата рождения:</span>{" "}
              {formatBirthDate(performer.birthDate)}
            </p>
          )}
          {performer.agency && (
            <p className="small text-secondary mb-0">
              <BuildingIcon /> <span className="text-secondary">Студия:</span>{" "}
              <Link href={`/agencies/${performer.agency.id}`} className="link-body-emphasis">
                {performer.agency.name}
              </Link>
            </p>
          )}
          {performer.bio && <p className="mb-0">{performer.bio}</p>}

          {performer.links.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mt-1">
              {performer.links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-secondary btn-sm"
                >
                  {l.label}
                </a>
              ))}
            </div>
          )}

          {isBand && performer.bandMembers.length > 0 && (
            <div className="mt-2">
              <h2
                className="small text-secondary text-uppercase mb-2"
                style={{ letterSpacing: "0.08em" }}
              >
                Участники
              </h2>
              <div className="d-flex flex-wrap gap-2">
                {performer.bandMembers.map((m) => (
                  <Link
                    key={m.performerId}
                    href={`/performers/${m.performerId}`}
                    className="event-chip text-decoration-none"
                  >
                    {m.performer.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {!isBand && performer.memberOfBands.length > 0 && (
            <div className="mt-2">
              <h2
                className="small text-secondary text-uppercase mb-2"
                style={{ letterSpacing: "0.08em" }}
              >
                Группа
              </h2>
              <div className="d-flex flex-wrap gap-2">
                {performer.memberOfBands.map((m) => (
                  <Link
                    key={m.bandId}
                    href={`/performers/${m.bandId}`}
                    className="event-chip text-decoration-none"
                  >
                    {m.band.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {pairings.length > 0 && (
        <div className="mb-4">
          <h2
            className="small text-secondary text-uppercase mb-2"
            style={{ letterSpacing: "0.08em" }}
          >
            В паре с
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {pairings.map((pair) => {
              const other = pair.performerAId === id ? pair.performerB : pair.performerA;
              return (
                <EntityMiniCard
                  key={pair.id}
                  href={`/performers/${other.id}`}
                  photoUrl={other.photoUrl}
                  name={pair.name || other.name}
                  subtitle={pair.name ? other.name : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        Предстоящие
      </h2>
      {upcoming.length === 0 ? (
        <p className="small text-secondary mb-4">Нет предстоящих событий.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-4">
          {upcoming.map((ev) => (
            <EventAgendaRow
              key={ev.occurrenceId}
              event={ev}
              isFavorited={favoritedEventIds.has(ev.id)}
              isGoing={goingEventIds.has(ev.id)}
              showDate
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Прошедшие
          </h2>
          <div className="d-flex flex-column gap-2 opacity-50 mb-4">
            {past.map((ev) => (
              <EventAgendaRow
                key={ev.occurrenceId}
                event={ev}
                isFavorited={favoritedEventIds.has(ev.id)}
                isGoing={goingEventIds.has(ev.id)}
                showDate
              />
            ))}
          </div>
        </>
      )}

      {!isBand && performer.dramas.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Сериалы
          </h2>
          <div className="d-flex flex-column gap-2">
            {performer.dramas.map((pd) => (
              <div
                key={pd.dramaId}
                className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <Link
                  href={`/dramas/${pd.dramaId}`}
                  className="text-decoration-none d-flex align-items-center gap-3"
                  style={{ minWidth: 0 }}
                >
                  <div
                    style={{
                      width: "2.75rem",
                      height: "3.75rem",
                      borderRadius: "0.5rem",
                      background: "var(--bs-secondary-bg)",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    {pd.drama.posterUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pd.drama.posterUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p className="font-display fw-medium text-white mb-0 text-truncate">
                      {pd.drama.title}
                    </p>
                    {pd.drama.year && <p className="small text-secondary mb-0">{pd.drama.year}</p>}
                  </div>
                </Link>
                <FavoriteButton
                  kind="drama"
                  id={pd.dramaId}
                  isFavorited={favoritedDramaIds.has(pd.dramaId)}
                  variant="icon"
                  className="flex-shrink-0"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
