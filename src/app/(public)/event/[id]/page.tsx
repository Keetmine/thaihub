import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatHumanDate, formatTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      performers: { include: { performer: true } },
      pairings: { include: { pairing: { include: { performerA: true, performerB: true } } } },
    },
  });

  if (!event) notFound();

  return (
    <div>
      <Link href="/" className="eyebrow text-decoration-none">
        ← Все события
      </Link>
      <h1 className="display-1-tight mt-2 mb-2" style={{ fontSize: "2.25rem" }}>
        {event.title}
      </h1>
      <p className="text-secondary mb-4 text-capitalize">
        {formatHumanDate(event.startsAt)} · {formatTime(event.startsAt)}
        {event.endsAt ? `–${formatTime(event.endsAt)}` : ""}
      </p>

      <div className="surface p-4 mb-3" style={{ maxWidth: "40rem" }}>
        <p className="mb-3">
          <span aria-hidden="true">🍭</span> {event.venue}
        </p>

        {event.performers.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3">
            {event.performers.map(({ performer }) => (
              <Link
                key={performer.id}
                href={`/performers/${performer.id}`}
                className="event-chip text-decoration-none"
              >
                {performer.name}
              </Link>
            ))}
          </div>
        )}

        {/* Pairings — added alongside the performer chips above */}
        {event.pairings.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3">
            {event.pairings.map(({ pairing }) => (
              <span key={pairing.id} className="event-chip">
                {pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`}
              </span>
            ))}
          </div>
        )}

        {event.description && (
          <p className="text-secondary mb-0">{event.description}</p>
        )}
      </div>

      <div className="surface p-4" style={{ maxWidth: "40rem" }}>
        {(event.presaleAt || event.presaleUrl) && (
          <>
            <h2
              className="small text-secondary text-uppercase mb-2"
              style={{ letterSpacing: "0.08em" }}
            >
              Препродажа билетов
            </h2>
            {event.presaleAt && (
              <p className="mb-3 text-capitalize">
                {formatHumanDate(event.presaleAt)} · {formatTime(event.presaleAt)}
              </p>
            )}
          </>
        )}

        <div className="d-flex flex-wrap gap-2">
          {event.presaleUrl && (
            <a
              href={event.presaleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Билеты
            </a>
          )}
          <a href={`/event/${event.id}/ics`} className="btn btn-ghost btn-sm">
            📅 Добавить в календарь
          </a>
        </div>
      </div>
    </div>
  );
}
