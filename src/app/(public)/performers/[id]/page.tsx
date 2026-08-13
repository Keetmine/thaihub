import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dateKey, formatHumanDate, formatTime } from "@/lib/dates";

export default async function PerformerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const performer = await prisma.performer.findUnique({ where: { id } });
  if (!performer) notFound();

  const links = await prisma.eventPerformer.findMany({
    where: { performerId: id },
    include: { event: true },
    orderBy: { event: { startsAt: "asc" } },
  });

  const now = new Date();
  const upcoming = links.filter((l) => l.event.startsAt >= now);
  const past = links.filter((l) => l.event.startsAt < now);

  const Row = ({ event }: { event: (typeof links)[number]["event"] }) => (
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
