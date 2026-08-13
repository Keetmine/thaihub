import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dateKey, formatHumanDate, formatTime } from "@/lib/dates";

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
      dramas: { include: { drama: true }, orderBy: { drama: { title: "asc" } } },
    },
  });
  if (!performer) notFound();

  const eventLinks = await prisma.eventPerformer.findMany({
    where: { performerId: id },
    include: { event: true },
    orderBy: { event: { startsAt: "asc" } },
  });

  // Pairings this performer is part of — nice-to-have section, additive only.
  const pairings = await prisma.pairing.findMany({
    where: { OR: [{ performerAId: id }, { performerBId: id }] },
    include: { performerA: true, performerB: true },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const upcoming = eventLinks.filter((l) => l.event.startsAt >= now);
  const past = eventLinks.filter((l) => l.event.startsAt < now);

  const formatBirthDate = (d: Date) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const Row = ({ event }: { event: (typeof eventLinks)[number]["event"] }) => (
    <Link
      href={`/day/${dateKey(event.startsAt)}`}
      className="surface surface-hover text-decoration-none d-flex align-items-baseline justify-content-between gap-3 p-3"
    >
      <div>
        <p className="font-display fw-medium text-white mb-0">{event.title}</p>
        <p className="small text-secondary mb-0">
          <span aria-hidden="true">🍭</span> {event.venue}
        </p>
      </div>
      <span className="small text-secondary text-end flex-shrink-0">
        {formatHumanDate(event.startsAt)}
        <br />
        {formatTime(event.startsAt)}
      </span>
    </Link>
  );

  return (
    <div>
      <Link href="/performers" className="eyebrow text-decoration-none">
        ← Все исполнители
      </Link>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.5rem" }}>
        {performer.name}{" "}
        <span className="fs-5 fw-normal text-secondary">
          ({performer.type === "BAND" ? "группа" : "соло"})
        </span>
      </h1>

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
              <span aria-hidden="true">🏢</span> {performer.agency}
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

          {performer.dramas.length > 0 && (
            <div className="mt-2">
              <h2
                className="small text-secondary text-uppercase mb-2"
                style={{ letterSpacing: "0.08em" }}
              >
                Дорамы
              </h2>
              <div className="d-flex flex-wrap gap-2">
                {performer.dramas.map((pd) => (
                  <span key={pd.dramaId} className="badge text-bg-secondary">
                    {pd.drama.title}
                    {pd.drama.year ? ` (${pd.drama.year})` : ""}
                  </span>
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
        <div className="d-flex flex-column gap-2 mb-4" style={{ maxWidth: "40rem" }}>
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
          <div className="d-flex flex-column gap-2 opacity-50" style={{ maxWidth: "40rem" }}>
            {past.map((l) => (
              <Row key={l.eventId} event={l.event} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
