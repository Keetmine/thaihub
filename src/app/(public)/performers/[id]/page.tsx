import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dateKey, formatHumanDate, formatTime } from "@/lib/dates";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import { PinIcon } from "@/components/icons";
import { getFavoritedEventIds } from "@/lib/favorites";

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
    include: { event: true },
    orderBy: { event: { startsAt: "asc" } },
  });

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
  const upcoming = eventLinks.filter((l) => l.event.startsAt >= now);
  const past = eventLinks.filter((l) => l.event.startsAt < now);
  const favoritedEventIds = await getFavoritedEventIds(
    eventLinks.map((l) => l.eventId),
    currentUser?.id,
  );

  const formatBirthDate = (d: Date) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const Row = ({ event }: { event: (typeof eventLinks)[number]["event"] }) => (
    <div className="position-relative">
      <FavoriteButton
        kind="event"
        id={event.id}
        isFavorited={favoritedEventIds.has(event.id)}
        variant="corner"
      />
      <Link
        href={`/day/${dateKey(event.startsAt)}`}
        className="surface surface-hover text-decoration-none d-flex align-items-baseline justify-content-between gap-3 p-3"
      >
        <div>
          <p className="font-display fw-medium text-white mb-0 pe-5">{event.title}</p>
          <p className="small text-secondary mb-0">
            <PinIcon /> {event.venue}
          </p>
        </div>
        <span className="small text-secondary text-end flex-shrink-0">
          {formatHumanDate(event.startsAt)}
          <br />
          {formatTime(event.startsAt)}
        </span>
      </Link>
    </div>
  );

  return (
    <div>
      <Link href="/performers" className="eyebrow text-decoration-none">
        ← Все исполнители
      </Link>
      <div className="d-flex flex-wrap align-items-center gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          {performer.name}{" "}
          <span className="fs-5 fw-normal text-secondary">
            ({performer.type === "BAND" ? "группа" : "соло"})
          </span>
        </h1>
        <FavoriteButton kind="performer" id={performer.id} isFavorited={isFavorited} />
      </div>
      {performer.realName && (
        <p className="small text-secondary mb-4">{performer.realName}</p>
      )}

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
          {performer.birthDate && (
            <p className="small text-secondary mb-0">
              <span aria-hidden="true">🎂</span> {formatBirthDate(performer.birthDate)}
            </p>
          )}
          {performer.agency && (
            <p className="small text-secondary mb-0">
              <span aria-hidden="true">🏢</span>{" "}
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

          {!isBand && performer.dramas.length > 0 && (
            <div className="mt-2">
              <h2
                className="small text-secondary text-uppercase mb-2"
                style={{ letterSpacing: "0.08em" }}
              >
                Дорамы
              </h2>
              <div className="d-flex flex-wrap gap-2">
                {performer.dramas.map((pd) => (
                  <Link
                    key={pd.dramaId}
                    href={`/dramas/${pd.dramaId}`}
                    className="badge text-bg-secondary text-decoration-none"
                  >
                    {pd.drama.title}
                    {pd.drama.year ? ` (${pd.drama.year})` : ""}
                  </Link>
                ))}
              </div>
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
                <Link
                  key={pair.id}
                  href={`/performers/${other.id}`}
                  className="event-chip text-decoration-none"
                >
                  {pair.name || other.name}
                </Link>
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
          {upcoming.map((l) => (
            <Row key={l.eventId} event={l.event} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Прошедшие
          </h2>
          <div className="d-flex flex-column gap-2 opacity-50">
            {past.map((l) => (
              <Row key={l.eventId} event={l.event} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
