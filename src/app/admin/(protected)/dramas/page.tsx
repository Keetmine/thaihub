import LetterAvatar from "@/components/LetterAvatar";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteDrama } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import Pagination from "@/components/Pagination";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { adminListHref } from "@/lib/adminListHref";
import { dramaTitleWhere } from "@/lib/searchWhere";
import AdminFilters from "@/components/admin/AdminFilters";
import {
  adminDramaFilterDefs,
  adminDramaFilterWhere,
  loadDramaFilterOptions,
  type FilterParams,
} from "@/lib/catalogFilters";
import { getDict } from "@/lib/i18n";
import AdminSortLinks from "@/components/admin/AdminSortLinks";
import {
  activeAdminSort,
  updatedOrderBy,
  updatedSortOption,
  UPDATED_SORT,
} from "@/lib/adminSort";
import BulkList from "@/components/admin/BulkList";
import {
  bulkDelete,
  bulkSetDramaAgency,
  bulkSetDramaStatus,
} from "../bulkActions";
import { DRAMA_STATUS_LABELS } from "@/lib/dramaStatus";

export const metadata = { title: "Сериалы" };

export const dynamic = "force-dynamic";

const AIR_TABS = [
  { key: "all", label: "Все" },
  { key: "airing", label: "В эфире" },
  { key: "upcoming", label: "Анонсы" },
  { key: "aired", label: "Вышедшие" },
  // Сериалы, которым MDL-синк не дал дат эфира, — без этой вкладки они
  // были видны только во «Все» и счётчики вкладок не сходились с суммой.
  { key: "undated", label: "Без дат" },
] as const;
type AirTab = (typeof AIR_TABS)[number]["key"];

const SORT_OPTIONS = [{ key: null, label: "по названию" }, updatedSortOption];

/** Фильтр вкладки по датам эфира (airedFrom/airedTo из MDL). */
function airWhere(tab: AirTab, now: Date) {
  if (tab === "airing")
    return {
      airedFrom: { lte: now },
      OR: [{ airedTo: { gte: now } }, { airedTo: null }],
    };
  if (tab === "upcoming") return { airedFrom: { gt: now } };
  if (tab === "aired") return { airedTo: { lt: now } };
  if (tab === "undated") return { airedFrom: null, airedTo: null };
  return {};
}

export default async function AdminDramasPage({
  searchParams,
}: {
  searchParams: Promise<
    { q?: string; page?: string; tab?: string; sort?: string; issue?: string } & FilterParams
  >;
}) {
  const sp = await searchParams;
  const { q: rawQ, page: rawPage, tab: rawTab, issue } = sp;
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);
  const sort = activeAdminSort(sp.sort, SORT_OPTIONS);
  const tab: AirTab = (AIR_TABS.find((t) => t.key === rawTab)?.key ??
    "all") as AirTab;
  const now = new Date();

  // «Требует внимания» на дашборде ведёт сюда с ?issue=... — сразу к
  // проблемным записям, а не в общий список.
  const issueWhere =
    issue === "no-poster"
      ? { posterUrl: null }
      : issue === "no-cast"
        ? { performers: { none: {} } }
        : {};
  // Вкладки эфира остаются быстрыми пресетами, фильтры (И6) складываются
  // с ними через AND: «выходящие + без постера + GMMTV» — законный срез.
  const filterWhere = adminDramaFilterWhere(sp);
  const where = {
    AND: [
      { ...(q ? dramaTitleWhere(q) : {}), ...airWhere(tab, now), ...issueWhere },
      ...filterWhere,
    ],
  };
  const [dramas, total, tabCounts, agencies] = await Promise.all([
    prisma.drama.findMany({
      where,
      include: { _count: { select: { performers: true } } },
      orderBy: sort === UPDATED_SORT ? updatedOrderBy : { title: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.drama.count({ where }),
    Promise.all(
      AIR_TABS.map((t) =>
        prisma.drama.count({
          where: {
            AND: [{ ...(q ? dramaTitleWhere(q) : {}), ...airWhere(t.key, now) }, ...filterWhere],
          },
        }),
      ),
    ),
    prisma.agency.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const totalPages = totalPagesFor(total);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-5">
        <div>
          <span className="eyebrow">Управление</span>
          <h1
            className="display-1-tight mt-3 mb-0"
            style={{ fontSize: "2.25rem" }}
          >
            Сериалы
          </h1>
        </div>
        <Link href="/admin/dramas/new" className="btn btn-primary btn-sm">
          + Добавить сериал
        </Link>
      </div>

      <NameSearchBox
        action="/admin/dramas"
        q={q}
        placeholder="Поиск по названию…"
        hiddenFields={{
          ...(tab !== "all" ? { tab } : {}),
          ...(sort ? { sort } : {}),
        }}
        className="admin-search-lg mb-3"
        quickKind="drama"
      />
      <div className="tab-bar-row">
        <div className="tab-bar">
          {AIR_TABS.map((t, i) => (
            <Link
              key={t.key}
              // Вкладка меняет в текущем адресе только себя (adminListHref,
              // И16): поиск, сортировка и фильтры остаются. Уходит лишь
              // ?issue — это разовый переход с дашборда, а не срез.
              href={adminListHref("/admin/dramas", sp, {
                tab: t.key,
                page: 1,
                issue: null,
              })}
              prefetch={false}
              className={`tab-bar-item ${tab === t.key ? "active" : ""}`}
            >
              {t.label} ({tabCounts[i]})
            </Link>
          ))}
        </div>
        <AdminSortLinks
          basePath="/admin/dramas"
          params={sp}
          options={SORT_OPTIONS}
          active={sort}
          className="d-flex flex-wrap align-items-center gap-2"
        />
      </div>

      {/* Список слева, фильтры колонкой справа — как на /search. */}

      <div className="row g-4">

      <div className="col-12 col-xl-9">

      {issue && (
        <p className="small text-secondary mb-3">
          Показаны только{" "}
          {issue === "no-poster" ? "сериалы без постера" : "сериалы без актёрского состава"}.{" "}
          <Link href="/admin/dramas" className="link-body-emphasis">
            Показать все
          </Link>
        </p>
      )}

      {dramas.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Пока нет сериалов."}
        </p>
      ) : (
        <BulkList
          rows={dramas.map((d) => {
            const boundDelete = deleteDrama.bind(null, d.id);
            return {
              id: d.id,
              node: (
                <div className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3">
                  <div className="d-flex align-items-center gap-3">
                    <LetterAvatar
                      name={d.title}
                      photoUrl={d.posterUrl}
                      size={2.75}
                      height={3.75}
                      rounded={false}
                    />
                    <div>
                      <Link
                        href={`/admin/dramas/${d.id}/edit`}
                        className="stretched-link text-decoration-none"
                      >
                        <span className="font-display fw-medium text-white d-block">
                          {d.title}
                        </span>
                      </Link>
                      {/* Русское название подстрокой: видно сразу, у кого
                          перевода нет (фильтр «Нет ру перевода» — про то
                          же, но списком). */}
                      {d.titleRu && (
                        <span className="small text-secondary d-block">{d.titleRu}</span>
                      )}
                      <p className="small text-secondary mb-0">
                        {d.year ?? "—"} · {d._count.performers} в актёрском
                        составе
                      </p>
                    </div>
                  </div>
                  {/* position-relative + z-2 lifts these controls above the
                      row's stretched-link (::after has z-index: 1), so they
                      stay individually clickable instead of triggering the
                      row navigation. */}
                  <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/admin/dramas/${d.id}/edit`}
                      className="icon-btn"
                      aria-label="Редактировать"
                      data-tooltip="Редактировать"
                    >
                      <PencilIcon />
                    </Link>
                    <ConfirmForm
                      action={boundDelete}
                      confirmMessage={`Удалить сериал «${d.title}»?`}
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
              confirmTemplate: "Удалить {n} сериалов? Действие необратимо.",
              run: async (ids) => {
                "use server";
                await bulkDelete("drama", ids);
              },
            },
            {
              kind: "select",
              label: "Сменить агентство",
              placeholder: "Агентство…",
              options: agencies,
              run: async (ids, value) => {
                "use server";
                await bulkSetDramaAgency(ids, value);
              },
            },
            {
              kind: "select",
              label: "Проставить статус",
              placeholder: "Статус…",
              options: Object.entries(DRAMA_STATUS_LABELS).map(
                ([id, name]) => ({ id, name }),
              ),
              run: async (ids, value) => {
                "use server";
                await bulkSetDramaStatus(ids, value);
              },
            },
          ]}
        />
      )}
      {/* Листание — от полного адреса: вкладка, поиск, фильтры и issue
          остаются на месте (И16), меняется только page. */}
      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => adminListHref("/admin/dramas", sp, { page: p })}
      />
      </div>
      <AdminFilters defs={adminDramaFilterDefs(getDict("ru"), await loadDramaFilterOptions())} params={sp} />
      </div>
    </div>
  );
}
