import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatHumanDate, formatTime } from "@/lib/dates";
import { deleteEvent } from "./events/actions";

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
          {events.map((ev) => {
            const boundDeleteEvent = deleteEvent.bind(null, ev.id);
            return (
              <div
                key={ev.id}
                className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <Link
                    href={`/admin/events/${ev.id}/edit`}
                    className="stretched-link text-decoration-none"
                  >
                    <span className="font-display fw-medium text-white d-block">
                      {ev.title}
                    </span>
                  </Link>
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
                {/* position-relative + z-2 lifts these controls above the
                    row's stretched-link (::after has z-index: 1), so they
                    stay individually clickable instead of triggering the
                    row navigation. */}
                <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/events/${ev.id}/edit`}
                    className="btn btn-ghost btn-sm"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    ✏️
                  </Link>
                  <form action={boundDeleteEvent}>
                    <button
                      type="submit"
                      className="btn btn-outline-danger btn-sm"
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      🗑️
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
