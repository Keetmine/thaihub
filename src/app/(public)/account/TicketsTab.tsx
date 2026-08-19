import Link from "next/link";
import { eventHref } from "@/lib/eventSlug";
import { formatShortDate } from "@/lib/dates";

export type TicketRow = {
  id: string;
  ticketUrl: string;
  event: { id: string; slug: string | null; title: string; venue: string };
  startsAt: Date | null;
};

/**
 * «Мои билеты» — все загруженные файлы в одном месте. Раньше билет был
 * виден только на странице своего события: чтобы найти его перед
 * поездкой, надо было вспомнить, на какое событие он был.
 */
export default function TicketsTab({ tickets }: { tickets: TicketRow[] }) {
  if (tickets.length === 0) {
    return (
      <p className="text-secondary">
        Загруженных билетов нет. Прикрепить файл можно на странице события —
        там, где отмечаете «иду».
      </p>
    );
  }

  const now = new Date();
  const upcoming = tickets.filter((t) => !t.startsAt || t.startsAt >= now);
  const past = tickets.filter((t) => t.startsAt && t.startsAt < now);

  const row = (t: TicketRow, dimmed = false) => (
    <div
      key={t.id}
      className={`surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3 ${dimmed ? "opacity-75" : ""}`}
    >
      <div style={{ minWidth: 0 }}>
        <Link href={eventHref(t.event)} className="text-white text-decoration-none d-block">
          {t.event.title}
        </Link>
        <span className="small text-secondary">
          {[t.startsAt ? formatShortDate(t.startsAt) : null, t.event.venue]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <a
        href={t.ticketUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost btn-sm flex-shrink-0"
      >
        Открыть билет ↗
      </a>
    </div>
  );

  return (
    <div className="d-flex flex-column gap-4">
      {upcoming.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">Ближайшие</h2>
          <div className="d-flex flex-column gap-2">{upcoming.map((t) => row(t))}</div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">Прошедшие</h2>
          <div className="d-flex flex-column gap-2">{past.map((t) => row(t, true))}</div>
        </section>
      )}
    </div>
  );
}
