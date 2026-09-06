import LetterAvatar from "@/components/LetterAvatar";
import Pagination from "@/components/Pagination";
import Link from "next/link";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { adminListHref } from "@/lib/adminListHref";
import { prisma } from "@/lib/prisma";
import { formatHumanDate, formatTimeRangeWithMsk } from "@/lib/dates";
import { deleteEvent } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import AdminFilters from "@/components/admin/AdminFilters";
import {
  adminEventFilterDefs,
  adminEventFilterWhere,
  loadEventFilterOptions,
  type FilterParams,
} from "@/lib/catalogFilters";
import { getDict } from "@/lib/i18n";
import { PencilIcon, PinIcon, TrashIcon } from "@/components/icons";
import ImportEventButton from "./ImportEventButton";
import BulkList from "@/components/admin/BulkList";
import { bulkDelete } from "../bulkActions";

export const metadata = { title: "События" };

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<
    { q?: string; page?: string; tab?: string; sort?: string; issue?: string } & FilterParams
  >;
}) {
  const sp = await searchParams;
  const { q: rawQ, tab: rawTab, sort: rawSort, issue, page: rawPage } = sp;
  const q = (rawQ ?? "").trim();
  // «Текущие» — события с будущими датами, «Архив» — целиком прошедшие.
  const isArchive = rawTab === "archive";
  // Сортировка: по дате события (дефолт) или по дате добавления записи.
  const sortByAdded = rawSort === "added";
  const page = parsePage(rawPage);

  // ?issue=no-lineup — переход с блока «требует внимания» на дашборде:
  // сразу события без состава, а не весь список.
  //
  // Два прохода вместо выборки всех событий с составами целиком.
  // Сортировка по дате первого шоу в Prisma невозможна (orderBy по
  // relation-агрегатам умеет только _count), поэтому первый проход —
  // лёгкий (id, createdAt и только даты выступлений), фильтр по вкладке
  // и сортировка в JS; второй — полные данные лишь для страницы из 30.
  const filterWhere = adminEventFilterWhere(sp);
  const eventsLight = await prisma.event.findMany({
    where: {
      AND: [
        {
          ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
          ...(issue === "no-lineup" ? { performers: { none: {} } } : {}),
        },
        ...filterWhere,
      ],
    },
    select: {
      id: true,
      createdAt: true,
      occurrences: { select: { startsAt: true }, orderBy: { startsAt: "asc" } },
    },
  });
  const now = new Date();
  const withDates = eventsLight.filter((ev) => ev.occurrences.length > 0);
  const tabEvents = withDates.filter((ev) => {
    const last = ev.occurrences[ev.occurrences.length - 1].startsAt;
    return isArchive ? last < now : last >= now;
  });
  // Архив — свежепрошедшие сверху.
  const sortedIds = [...tabEvents]
    .sort((a, b) =>
      sortByAdded
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : isArchive
          ? b.occurrences[0].startsAt.getTime() - a.occurrences[0].startsAt.getTime()
          : a.occurrences[0].startsAt.getTime() - b.occurrences[0].startsAt.getTime(),
    )
    .map((ev) => ev.id);
  const totalPages = totalPagesFor(sortedIds.length);
  const pageIds = sortedIds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pageEvents = await prisma.event.findMany({
    where: { id: { in: pageIds } },
    include: {
      performers: {
        include: { performer: { select: { id: true, name: true } } },
      },
      occurrences: { orderBy: { startsAt: "asc" } },
    },
  });
  const orderIndex = new Map(pageIds.map((id, i) => [id, i]));
  const events = [...pageEvents].sort(
    (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
  );

  const tabCounts = {
    current: isArchive ? withDates.length - tabEvents.length : tabEvents.length,
    archive: isArchive ? tabEvents.length : withDates.length - tabEvents.length,
  };
  const baseQuery = (tab: string, sort: string) =>
    `/admin/events?${[
      tab === "archive" ? "tab=archive" : "",
      sort === "added" ? "sort=added" : "",
      q ? `q=${encodeURIComponent(q)}` : "",
    ]
      .filter(Boolean)
      .join("&")}`;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-5">
        <div className="dot-grid pb-1">
          <span className="eyebrow">Управление</span>
          <h1 className="display-1-tight mt-3 mb-0" style={{ fontSize: "2.25rem" }}>
            События
          </h1>
        </div>
        <div className="d-flex gap-2">
          <ImportEventButton />
          <Link href="/admin/events/new" className="btn btn-primary btn-sm">
            + Добавить событие
          </Link>
        </div>
      </div>

      <NameSearchBox
        action="/admin/events"
        q={q}
        placeholder="Поиск по названию…"
        hiddenFields={{
          ...(isArchive ? { tab: "archive" } : {}),
          ...(sortByAdded ? { sort: "added" } : {}),
        }}
        className="admin-search-lg mb-3"
        quickKind="event"
      />
      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={baseQuery("current", rawSort ?? "")}
            prefetch={false}
            className={`tab-bar-item ${!isArchive ? "active" : ""}`}
          >
            Текущие ({tabCounts.current})
          </Link>
          <Link
            href={baseQuery("archive", rawSort ?? "")}
            prefetch={false}
            className={`tab-bar-item ${isArchive ? "active" : ""}`}
          >
            Архив ({tabCounts.archive})
          </Link>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="small text-secondary">Сортировка:</span>
          <Link
            href={baseQuery(isArchive ? "archive" : "current", "")}
            prefetch={false}
            className={`btn btn-sm ${!sortByAdded ? "btn-primary" : "btn-ghost"}`}
          >
            по дате события
          </Link>
          <Link
            href={baseQuery(isArchive ? "archive" : "current", "added")}
            prefetch={false}
            className={`btn btn-sm ${sortByAdded ? "btn-primary" : "btn-ghost"}`}
          >
            по дате добавления
          </Link>
        </div>
      </div>

      {/* Список слева, фильтры колонкой справа — как на /search. */}

      <div className="row g-4">

      <div className="col-12 col-xl-9">

      {events.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Событий пока нет."}
        </p>
      ) : (
        <BulkList
          rows={events.map((ev) => {
            const boundDeleteEvent = deleteEvent.bind(null, ev.id);
            return {
              id: ev.id,
              node: (
              <div className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3">
                {/* Ссылка-«растяжка» висит только на названии, а не на всей
                    левой части строки: обёртка поверх аватарки и текста
                    перехватывала бы клик по чекбоксу выделения. Так же
                    устроены строки локаций и сериалов. */}
                <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
                  <LetterAvatar name={ev.title} photoUrl={ev.posterUrl} size={2.75} rounded={false} />
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={`/admin/events/${ev.id}/edit`}
                      className="stretched-link text-decoration-none"
                    >
                      <span className="font-display fw-medium text-white d-block text-truncate">
                        {ev.title}
                      </span>
                    </Link>
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
                </div>
                {/* position-relative + z-2 lifts these controls above the
                    row's stretched-link (::after has z-index: 1), so they
                    stay individually clickable instead of triggering the
                    row navigation. */}
                <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/events/${ev.id}/edit`}
                    className="icon-btn"
                    aria-label="Редактировать"
                    data-tooltip="Редактировать"
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
                      data-tooltip="Удалить"
                    >
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              </div>
              ),
            };
          })}
          actions={[
            {
              kind: "delete",
              label: "Удалить выбранные",
              confirmTemplate:
                "Удалить {n} событий? Вместе с датами, составом и отметками пользователей.",
              run: async (ids) => {
                "use server";
                await bulkDelete("event", ids);
              },
            },
          ]}
        />
      )}
      {/* Листание — от полного адреса: вкладка, сортировка, поиск,
          issue и фильтры остаются на месте (И16), меняется только page. */}
      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => adminListHref("/admin/events", sp, { page: p })}
      />
      </div>
      <AdminFilters defs={adminEventFilterDefs(getDict("ru"), await loadEventFilterOptions())} params={sp} />
      </div>
    </div>
  );
}
