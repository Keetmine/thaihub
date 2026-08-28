import LetterAvatar from "@/components/LetterAvatar";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteLocation } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import AdminFilters from "@/components/admin/AdminFilters";
import {
  adminLocationFilterDefs,
  adminLocationFilterWhere,
  type FilterParams,
} from "@/lib/catalogFilters";
import Pagination from "@/components/Pagination";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { adminListHref } from "@/lib/adminListHref";
import BulkList from "@/components/admin/BulkList";
import { bulkDelete } from "../bulkActions";

export const metadata = { title: "Локации" };

export const dynamic = "force-dynamic";

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string } & FilterParams>;
}) {
  const sp = await searchParams;
  const { q: rawQ, page: rawPage } = sp;
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);

  // Пользовательские места (createdByUserId) — не часть каталога.
  // «Чьи» из фильтра важнее зашитого «только каталожные»: раньше
  // пользовательские места из этого списка было не увидеть вовсе.
  const filterWhere = adminLocationFilterWhere(sp);
  const hasWhose = typeof sp.whose === "string" && sp.whose !== "";
  const where = {
    AND: [
      {
        ...(hasWhose ? {} : { createdByUserId: null }),
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      ...filterWhere,
    ],
  };
  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      include: { _count: { select: { dramas: true } } },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.location.count({ where }),
  ]);
  const totalPages = totalPagesFor(total);

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Локации
        </h1>
        <Link href="/admin/locations/new" className="btn btn-primary btn-sm">
          + Добавить локацию
        </Link>
      </div>

      <NameSearchBox
        action="/admin/locations"
        q={q}
        placeholder="Поиск по названию…"
        quickKind="location"
        className="mb-3"
      />
      {/* Список слева, фильтры колонкой справа — как на /search. */}
      <div className="row g-4">
      <div className="col-12 col-xl-9">

      {locations.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Пока нет локаций."}
        </p>
      ) : (
        <BulkList
          rows={locations.map((l) => {
            const boundDelete = deleteLocation.bind(null, l.id);
            return {
              id: l.id,
              node: (
              <div className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3">
                <div className="d-flex align-items-center gap-3">
                  <LetterAvatar name={l.name} photoUrl={l.photoUrl} size={2.5} rounded={false} />
                  <div>
                    <Link
                      href={`/admin/locations/${l.id}/edit`}
                      className="stretched-link text-decoration-none"
                    >
                      <span className="font-display fw-medium text-white d-block">{l.name}</span>
                    </Link>
                    <p className="small text-secondary mb-0">{l._count.dramas} сериал.</p>
                  </div>
                </div>
                <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/locations/${l.id}/edit`}
                    className="icon-btn"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    <PencilIcon />
                  </Link>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить локацию «${l.name}»?`}
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
              ),
            };
          })}
          actions={[
            {
              kind: "delete",
              label: "Удалить выбранные",
              confirmTemplate: "Удалить {n} локаций? Связи с сериалами и списками очистятся.",
              run: async (ids) => {
                "use server";
                await bulkDelete("location", ids);
              },
            },
          ]}
        />
      )}
      {/* Листание — от полного адреса: поиск и фильтры (в т.ч. «чьи»)
          остаются на месте (И16), меняется только page. */}
      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => adminListHref("/admin/locations", sp, { page: p })}
      />
      </div>
      <AdminFilters defs={adminLocationFilterDefs()} params={sp} />
      </div>
    </div>
  );
}
