"use client";

import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import { useLocale, useT } from "@/components/LocaleProvider";
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
  const t = useT();
  const locale = useLocale();

  if (tickets.length === 0) {
    return (
      <EmptyState
        emoji="🎫"
        title={t.account.tickets.emptyTitle}
        hint={t.account.tickets.emptyHint}
        compact
      />
    );
  }

  const now = new Date();
  const upcoming = tickets.filter((ticket) => !ticket.startsAt || ticket.startsAt >= now);
  const past = tickets.filter((ticket) => ticket.startsAt && ticket.startsAt < now);

  const row = (ticket: TicketRow, dimmed = false) => (
    <div
      key={ticket.id}
      className={`surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3 ${dimmed ? "opacity-75" : ""}`}
    >
      <div style={{ minWidth: 0 }}>
        <AppLink href={eventHref(ticket.event)} className="text-white text-decoration-none d-block">
          {ticket.event.title}
        </AppLink>
        <span className="small text-secondary">
          {/* С годом: билеты копятся годами, и «12 окт» без года ничего
              не говорит — особенно в прошедших. */}
          {[
            ticket.startsAt
              ? `${formatShortDate(ticket.startsAt, locale)} ${ticket.startsAt.getUTCFullYear()}`
              : null,
            ticket.event.venue,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <a
        href={ticket.ticketUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost btn-sm flex-shrink-0"
      >
        {t.account.tickets.open}
      </a>
    </div>
  );

  return (
    <div className="d-flex flex-column gap-4">
      {upcoming.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">{t.account.tickets.upcoming}</h2>
          <div className="d-flex flex-column gap-2">{upcoming.map((ticket) => row(ticket))}</div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">{t.account.tickets.past}</h2>
          <div className="d-flex flex-column gap-2">{past.map((ticket) => row(ticket, true))}</div>
        </section>
      )}
    </div>
  );
}
