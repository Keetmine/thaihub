import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatHumanDate, formatTimeRangeWithMsk } from "@/lib/dates";
import { deleteEvent } from "./events/actions";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import Pagination from "@/components/Pagination";
import { PencilIcon, PinIcon, TrashIcon } from "@/components/icons";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q: rawQ, page: rawPage } = await searchParams;
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);

  const eventsRaw = await prisma.event.findMany({
    where: q ? { title: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      performers: { include: { performer: true } },
      occurrences: { orderBy: { startsAt: "asc" } },
    },
  });
  // Sorted by first occurrence date, which only exists once every event's
  // occurrences are loaded — paginated after sorting rather than in the
  // query itself.
  const sortedEvents = eventsRaw
    .filter((ev) => ev.occurrences.length > 0)
    .sort((a, b) => a.occurrences[0].startsAt.getTime() - b.occurrences[0].startsAt.getTime());
  const totalPages = totalPagesFor(sortedEvents.length);
  const events = sortedEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div className="dot-grid pb-1">
          <span className="eyebrow">Управление</span>
          <h1 className="display-1-tight mt-3 mb-0" style={{ fontSize: "2.25rem" }}>
            События
          </h1>
        </div>
        <div className="d-flex gap-2">
          <Link href="/admin/events/import-ttm" className="btn btn-ghost btn-sm">
            Импортировать с ThaiTicketMajor
          </Link>
          <Link href="/admin/events/new" className="btn btn-primary btn-sm">
            + Добавить событие
          </Link>
        </div>
      </div>

      <NameSearchBox action="/admin" q={q} placeholder="Поиск по названию…" />

      {events.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Событий пока нет."}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {events.map((ev) => {
            const boundDeleteEvent = deleteEvent.bind(null, ev.id);
            return (
              <div
                key={ev.id}
                className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <Link
                  href={`/admin/events/${ev.id}/edit`}
                  className="stretched-link text-decoration-none d-flex align-items-center gap-3"
                  style={{ minWidth: 0 }}
                >
                  <div
                    style={{
                      width: "2.75rem",
                      height: "2.75rem",
                      borderRadius: "0.5rem",
                      background: "var(--bs-secondary-bg)",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    {ev.posterUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ev.posterUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span className="font-display fw-medium text-white d-block text-truncate">
                      {ev.title}
                    </span>
                    <p className="small text-secondary mb-0">
                      {ev.occurrences
                        .map(
                          (o) =>
                            `${formatHumanDate(o.startsAt)} · ${formatTimeRangeWithMsk(o.startsAt, o.endsAt)}`,
                        )
                        .join(" + ")}{" "}
                      · <PinIcon /> {ev.venue}
                    </p>
                    {ev.performers.length > 0 && (
                      <p className="small text-secondary opacity-50 mb-0 text-truncate">
                        {ev.performers.map((p) => p.performer.name).join(", ")}
                      </p>
                    )}
                  </div>
                </Link>
                {/* position-relative + z-2 lifts these controls above the
                    row's stretched-link (::after has z-index: 1), so they
                    stay individually clickable instead of triggering the
                    row navigation. */}
                <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/events/${ev.id}/edit`}
                    className="icon-btn"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    <PencilIcon />
                  </Link>
                  <ConfirmForm
                    action={boundDeleteEvent}
                    confirmMessage={`Удалить событие «${ev.title}»?`}
                  >
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`}
      />
    </div>
  );
}
