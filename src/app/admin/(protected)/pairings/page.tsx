import { prisma } from "@/lib/prisma";
import { deletePairing, setPairingStatus, swapPairingOrder } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/admin/SubmitButton";
import CreatePairingModal from "./CreatePairingModal";
import NameSearchBox from "@/components/NameSearchBox";
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

export const metadata = { title: "Пейринги" };

export const dynamic = "force-dynamic";

export default async function AdminPairingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string } & FilterParams>;
}) {
  const sp = await searchParams;
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
              { performerA: { name: { contains: q, mode: "insensitive" as const } } },
              { performerB: { name: { contains: q, mode: "insensitive" as const } } },
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
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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

      <div className="tab-bar-row justify-content-end">
        <NameSearchBox
          action="/admin/pairings"
          q={q}
          placeholder="Поиск по имени…"
          className=""
        />
      </div>

      {/* Список слева, фильтры колонкой справа — как на /search. */}

      <div className="row g-4">

      <div className="col-12 col-xl-9">

      {pairings.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Пока нет пейрингов."}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {pairings.map((pair) => {
            const boundDelete = deletePairing.bind(null, pair.id);
            const boundToggleStatus = setPairingStatus.bind(
              null,
              pair.id,
              pair.status === "CURRENT" ? "PAST" : "CURRENT",
            );
            const fallbackLabel = `${pair.performerA.name} × ${pair.performerB.name}`;
            return (
              <div
                key={pair.id}
                className="surface d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0 d-flex align-items-center gap-2">
                    {pair.name || fallbackLabel}
                    <span
                      className={`badge rounded-pill ${pair.status === "CURRENT" ? "text-bg-success" : "text-bg-secondary"}`}
                      style={{ fontSize: "0.65rem" }}
                    >
                      {pair.status === "CURRENT" ? "Текущий" : "Бывший"}
                    </span>
                  </p>
                  <p className="small text-secondary mb-0">
                    {pair.name ? fallbackLabel : "Без названия"} · {pair._count.events}{" "}
                    событ.
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
                      label={pair.status === "CURRENT" ? "Отметить бывшим" : "Отметить текущим"}
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
