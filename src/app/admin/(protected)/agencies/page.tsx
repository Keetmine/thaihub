import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteAgency } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import AdminFilters from "@/components/admin/AdminFilters";
import {
  adminAgencyFilterDefs,
  adminAgencyFilterWhere,
  type FilterParams,
} from "@/lib/catalogFilters";
import Pagination from "@/components/Pagination";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { adminListHref } from "@/lib/adminListHref";
import AdminSortLinks from "@/components/admin/AdminSortLinks";
import {
  activeAdminSort,
  updatedOrderBy,
  updatedSortOption,
  UPDATED_SORT,
} from "@/lib/adminSort";
import BulkList from "@/components/admin/BulkList";
import { bulkDelete } from "../bulkActions";

export const metadata = { title: "Агентства" };

export const dynamic = "force-dynamic";

const SORT_OPTIONS = [{ key: null, label: "по названию" }, updatedSortOption];

// Раньше список агентств жил вкладкой внутри /admin/performers
// (?view=agencies) — теперь это свой раздел, старый адрес редиректит сюда.
export default async function AdminAgenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string } & FilterParams>;
}) {
  const sp = await searchParams;
  const { q: rawQ, page: rawPage } = sp;
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);
  const sort = activeAdminSort(sp.sort, SORT_OPTIONS);

  const where = {
    AND: [
      q ? { name: { contains: q, mode: "insensitive" as const } } : {},
      ...adminAgencyFilterWhere(sp),
    ],
  };
  const [agencies, total] = await Promise.all([
    prisma.agency.findMany({
      where,
      include: { _count: { select: { performers: true } } },
      orderBy: sort === UPDATED_SORT ? updatedOrderBy : { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.agency.count({ where }),
  ]);
  const totalPages = totalPagesFor(total);

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Агентства
        </h1>
        <Link href="/admin/agencies/new" className="btn btn-primary btn-sm">
          + Добавить агентство
        </Link>
      </div>

      <NameSearchBox
        action="/admin/agencies"
        q={q}
        placeholder="Поиск по названию…"
        hiddenFields={sort ? { sort } : undefined}
        className="admin-search-lg mb-3"
        quickKind="agency"
      />

      <AdminSortLinks
        basePath="/admin/agencies"
        params={sp}
        options={SORT_OPTIONS}
        active={sort}
      />

      {/* Список слева, фильтры колонкой справа — как на /search. */}

      <div className="row g-4">

      <div className="col-12 col-xl-9">

      {agencies.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Пока нет агентств."}
        </p>
      ) : (
        <BulkList
          rows={agencies.map((a) => {
            const boundDelete = deleteAgency.bind(null, a.id);
            return {
              id: a.id,
              node: (
                <div className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3">
                  <div className="d-flex align-items-center gap-3">
                    {a.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={a.logoUrl}
                        alt=""
                        style={{
                          width: "2.5rem",
                          height: "2.5rem",
                          borderRadius: "50%",
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "2.5rem",
                          height: "2.5rem",
                          borderRadius: "50%",
                          background: "var(--bs-secondary-bg)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div>
                      <Link
                        href={`/admin/agencies/${a.id}/edit`}
                        className="stretched-link text-decoration-none"
                      >
                        <span className="font-display fw-medium text-white d-block">
                          {a.name}
                        </span>
                      </Link>
                      <p className="small text-secondary mb-0">
                        {a._count.performers} исполнит.
                      </p>
                    </div>
                  </div>
                  {/* position-relative + z-2 lifts these controls above the
                    row's stretched-link (::after has z-index: 1), so they
                    stay individually clickable instead of triggering the
                    row navigation. */}
                  <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/admin/agencies/${a.id}/edit`}
                      className="icon-btn"
                      aria-label="Редактировать"
                      data-tooltip="Редактировать"
                    >
                      <PencilIcon />
                    </Link>
                    <ConfirmForm
                      action={boundDelete}
                      confirmMessage={`Удалить агентство «${a.name}»?`}
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
                "Удалить {n} агентств? Связи с артистами и сериалами очистятся.",
              run: async (ids) => {
                "use server";
                await bulkDelete("agency", ids);
              },
            },
          ]}
        />
      )}
      {/* Листание — от полного адреса: поиск и фильтры остаются на
          месте (И16), меняется только page. */}
      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => adminListHref("/admin/agencies", sp, { page: p })}
      />
      </div>
      <AdminFilters defs={adminAgencyFilterDefs()} params={sp} />
      </div>
    </div>
  );
}
