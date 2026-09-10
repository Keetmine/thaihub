import { prisma } from "@/lib/prisma";
import { pairingNames } from "@/lib/pairingLabel";
import {
  bulkDeletePairings,
  bulkSetPairingStatus,
  deletePairing,
  setPairingStatus,
  swapPairingOrder,
} from "./actions";
import { PAIRING_STATUS_LABELS } from "./pairingStatus";
import BulkList from "@/components/admin/BulkList";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/admin/SubmitButton";
import CreatePairingModal from "./CreatePairingModal";
import NameSearchBox from "@/components/NameSearchBox";
import AdminSortLinks from "@/components/admin/AdminSortLinks";
import {
  activeAdminSort,
  UPDATED_SORT,
  updatedOrderBy,
  updatedSortOption,
} from "@/lib/adminSort";
import AdminFilters from "@/components/admin/AdminFilters";
import {
  adminPairingFilterDefs,
  adminPairingFilterWhere,
  type FilterParams,
} from "@/lib/catalogFilters";
import Pagination from "@/components/Pagination";
import { TrashIcon } from "@/components/icons";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { adminListHref } from "@/lib/adminListHref";
import Link from "next/link";
import LetterAvatar from "@/components/LetterAvatar";
import { adminEntityHref } from "@/app/admin/entityHref";

export const metadata = { title: "Пейринги" };

export const dynamic = "force-dynamic";

// Порядок по умолчанию — заявки сверху: пейринги приходят от людей, и
// неразобранное важнее алфавита.
const SORT_OPTIONS = [{ key: null, label: "по статусу" }, updatedSortOption];

export default async function AdminPairingsPage({
  searchParams,
}: {
  searchParams: Promise<
    { q?: string; page?: string; sort?: string } & FilterParams
  >;
}) {
  const sp = await searchParams;
  const sort = activeAdminSort(sp.sort, SORT_OPTIONS);
  const { q: rawQ, page: rawPage } = sp;
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);

  // Поиск: по названию пейринга и по имени любого из участников.
  const where = {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              {
                performerA: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
              {
                performerB: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {},
      ...adminPairingFilterWhere(sp),
    ],
  };
  const [pairings, total] = await Promise.all([
    prisma.pairing.findMany({
      where,
      include: {
        performerA: true,
        performerB: true,
        _count: { select: { events: true } },
      },
      orderBy:
        sort === UPDATED_SORT
          ? updatedOrderBy
          : [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.pairing.count({ where }),
  ]);
  const totalPages = totalPagesFor(total);

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Пейринги
        </h1>
        {/* Каталог соло-исполнителей в модалку не грузится — партнёры
            ищутся асинхронно (searchSoloPerformerOptions). */}
        <CreatePairingModal performers={[]} />
      </div>

      <NameSearchBox
        action="/admin/pairings"
        q={q}
        placeholder="Поиск по имени…"
        hiddenFields={sort ? { sort } : undefined}
        className="admin-search-lg mb-3"
      />

      <AdminSortLinks
        basePath="/admin/pairings"
        params={sp}
        options={SORT_OPTIONS}
        active={sort}
      />

      {/* Список слева, фильтры колонкой справа — как на /search. */}

      <div className="row g-4">
        <div className="col-12 col-xl-9">
          {pairings.length === 0 ? (
            <p className="text-secondary">
              {q ? "Ничего не найдено." : "Пока нет пейрингов."}
            </p>
          ) : (
            <BulkList
              rows={pairings.map((pair) => {
                const boundDelete = deletePairing.bind(null, pair.id);
                const boundToggleStatus = setPairingStatus.bind(
                  null,
                  pair.id,
                  pair.status === "CURRENT" ? "PAST" : "CURRENT",
                );
                // Для подтверждения удаления: там нужна одна строка.
                const fallbackLabel = pairingNames(pair);
                return {
                  id: pair.id,
                  node: (
                    <div className="surface d-flex align-items-center justify-content-between gap-3 p-3">
                      <div>
                        {/* Кто в паре — карточками с фото и ссылкой на
                        правку, а не строкой имён: пейринги правят,
                        глядя на людей, и «Tay × New» текстом каждый раз
                        приходилось искать глазами (правка владельца
                        2026-09-06). Имя пары стоит рядом со статусом
                        такой же плашкой: это ярлык пары, а не её
                        заголовок. */}
                        <div className="d-flex align-items-center flex-wrap gap-2">
                          <PerformerChip performer={pair.performerA} />
                          <span className="text-secondary">×</span>
                          <PerformerChip performer={pair.performerB} />
                          {pair.name && (
                            <span
                              className="badge rounded-pill text-bg-primary"
                              style={{ fontSize: "0.65rem" }}
                            >
                              {pair.name}
                            </span>
                          )}
                          <span
                            className={`badge rounded-pill ${pair.status === "CURRENT" ? "text-bg-success" : "text-bg-secondary"}`}
                            style={{ fontSize: "0.65rem" }}
                          >
                            {PAIRING_STATUS_LABELS[pair.status]}
                          </span>
                        </div>
                        <p className="small text-secondary mb-0 mt-1">
                          {pair._count.events} событ.
                        </p>
                      </div>
                      <div className="d-flex align-items-center gap-2 flex-shrink-0">
                        <form action={swapPairingOrder.bind(null, pair.id)}>
                          <SubmitButton
                            label="⇄"
                            busyLabel="…"
                            className="btn btn-ghost btn-sm"
                            title="Поменять A и B местами"
                          />
                        </form>
                        <form action={boundToggleStatus}>
                          <SubmitButton
                            label={
                              pair.status === "CURRENT"
                                ? "Отметить бывшим"
                                : "Отметить текущим"
                            }
                            busyLabel="Сохраняем…"
                            className="btn btn-ghost btn-sm"
                          />
                        </form>
                        <ConfirmForm
                          action={boundDelete}
                          confirmMessage={`Удалить пейринг «${pair.name || fallbackLabel}»?`}
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
                    "Удалить {n} пейрингов? Действие необратимо.",
                  run: async (ids) => {
                    "use server";
                    await bulkDeletePairings(ids);
                  },
                },
                {
                  kind: "select",
                  label: "Проставить статус",
                  placeholder: "Статус…",
                  options: Object.entries(PAIRING_STATUS_LABELS).map(
                    ([id, name]) => ({ id, name }),
                  ),
                  run: async (ids, value) => {
                    "use server";
                    await bulkSetPairingStatus(ids, value);
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
            buildHref={(p) => adminListHref("/admin/pairings", sp, { page: p })}
          />
        </div>
        <AdminFilters defs={adminPairingFilterDefs()} params={sp} />
      </div>
    </div>
  );
}

/** Участник пары в списке: фото, имя и ссылка на его правку — тем же
 *  чипом, что в форме события (`.event-chip.performer-chip`). */
function PerformerChip({
  performer,
}: {
  performer: { id: string; name: string; photoUrl: string | null };
}) {
  return (
    <Link
      href={adminEntityHref("Performer", performer.id)!}
      className="event-chip performer-chip text-decoration-none"
    >
      <LetterAvatar
        name={performer.name}
        photoUrl={performer.photoUrl}
        size={1.5}
      />
      {performer.name}
    </Link>
  );
}
