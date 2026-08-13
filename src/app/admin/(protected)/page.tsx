import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatHumanDate, formatTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const events = await prisma.event.findMany({
    include: { performers: { include: { performer: true } } },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <span className="eyebrow">Управление</span>
          <h1 className="display-1-tight mt-2 mb-0" style={{ fontSize: "2.25rem" }}>
            События
          </h1>
        </div>
        <Link href="/admin/events/new" className="btn btn-primary btn-sm">
          + Добавить событие
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-secondary">Событий пока нет.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="surface d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <div>
                <p className="font-display fw-medium text-white mb-0">{ev.title}</p>
                <p className="small text-secondary mb-0">
                  {formatHumanDate(ev.startsAt)} · {formatTime(ev.startsAt)}
                  {ev.endsAt ? `–${formatTime(ev.endsAt)}` : ""} · 🍭 {ev.venue}
                </p>
                {ev.performers.length > 0 && (
                  <p className="small text-secondary opacity-50 mb-0">
                    {ev.performers.map((p) => p.performer.name).join(", ")}
                  </p>
                )}
              </div>
              <Link
                href={`/admin/events/${ev.id}/edit`}
                className="btn btn-ghost btn-sm flex-shrink-0"
              >
                Редактировать
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
