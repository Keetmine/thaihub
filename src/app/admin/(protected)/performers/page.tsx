import LetterAvatar from "@/components/LetterAvatar";
import { performerRealNameParen } from "@/lib/searchWhere";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deletePerformer } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import AdminPerformerTabs from "@/components/AdminPerformerTabs";
import NameSearchBox from "@/components/NameSearchBox";
import Pagination from "@/components/Pagination";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { performerNameWhere } from "@/lib/searchWhere";
import BulkList from "@/components/admin/BulkList";
import { bulkDelete, bulkSetPerformerAgency } from "../bulkActions";

export const metadata = { title: "Исполнители" };

export const dynamic = "force-dynamic";

function AdminPerformerRow({
  performer,
}: {
  performer: {
    id: string;
    name: string;
    realName: string | null;
    photoUrl: string | null;
    _count: { events: number };
  };
}) {
  const boundDelete = deletePerformer.bind(null, performer.id);
  return (
    <div className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3">
      <Link
        href={`/admin/performers/${performer.id}/edit`}
        className="stretched-link text-decoration-none d-flex align-items-center gap-3"
        style={{ minWidth: 0 }}
      >
        <LetterAvatar
          name={performer.name}
          photoUrl={performer.photoUrl}
          size={2.25}
        />
        <div style={{ minWidth: 0 }}>
          <span className="font-display fw-medium text-white d-block text-truncate">
            {performer.name}
            {performerRealNameParen(performer) && (
              <span className="text-secondary fw-normal">
                {" "}
                ({performerRealNameParen(performer)})
              </span>
            )}
          </span>
          <p className="small text-secondary mb-0">
            {performer._count.events} событ.
          </p>
        </div>
      </Link>
      {/* position-relative + z-2 lifts these controls above the row's
          stretched-link (::after has z-index: 1), so they stay
          individually clickable instead of triggering the row navigation. */}
      <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
        <Link
          href={`/admin/performers/${performer.id}/edit`}
          className="icon-btn"
          aria-label="Редактировать"
          title="Редактировать"
        >
          <PencilIcon />
        </Link>
        <ConfirmForm
          action={boundDelete}
          confirmMessage={`Удалить исполнителя «${performer.name}»?`}
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
}

export default async function AdminPerformersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; page?: string }>;
}) {
  const { view, q: rawQ, page: rawPage } = await searchParams;
  // Агентства переехали в свой раздел, но на старый адрес много закладок.
  if (view === "agencies") redirect("/admin/agencies");
  const isBands = view === "bands";
  const isMascots = view === "mascots";
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);

  const performerType: "BAND" | "SOLO" | "MASCOT" = isMascots
    ? "MASCOT"
    : isBands
      ? "BAND"
      : "SOLO";
  const performersWhere = {
    type: performerType,
    ...(q ? performerNameWhere(q) : {}),
  };
  // При поиске — ранжирование как на фронте: точные совпадения по
  // имени/реальному имени/алиасу, затем префиксные, затем contains
  // (иначе «Tle» хоронился под алфавитным списком contains-совпадений).
  const nameFields = ["name", "realName", "musicAlias"] as const;
  const [performersRaw, performersTotal] = await Promise.all([
    q
      ? Promise.all([
          prisma.performer.findMany({
            where: {
              type: performerType,
              OR: nameFields.map((f) => ({
                [f]: { equals: q, mode: "insensitive" },
              })),
            },
            include: { _count: { select: { events: true } } },
            orderBy: { name: "asc" },
            take: 20,
          }),
          prisma.performer.findMany({
            where: {
              type: performerType,
              OR: nameFields.map((f) => ({
                [f]: { startsWith: q, mode: "insensitive" },
              })),
            },
            include: { _count: { select: { events: true } } },
            orderBy: { name: "asc" },
            take: 20,
          }),
          prisma.performer.findMany({
            where: performersWhere,
            include: { _count: { select: { events: true } } },
            orderBy: { name: "asc" },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          }),
        ]).then(([exact, prefix, rest]) => {
          const seen = new Set<string>();
          return [...exact, ...prefix, ...rest].filter((p) =>
            seen.has(p.id) ? false : (seen.add(p.id), true),
          );
        })
      : prisma.performer.findMany({
          where: performersWhere,
          include: { _count: { select: { events: true } } },
          orderBy: { name: "asc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
    prisma.performer.count({ where: performersWhere }),
  ]);
  const performers = performersRaw;
  const performersTotalPages = totalPagesFor(performersTotal);
  // Для массового «сменить агентство»: список короткий (сотни), грузим целиком.
  const allAgencies = await prisma.agency.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {isMascots ? "Маскоты" : isBands ? "Группы" : "Актёры"}
        </h1>
        <Link href="/admin/performers/new" className="btn btn-primary btn-sm">
          + Добавить исполнителя
        </Link>
      </div>

      <div className="tab-bar-row">
        <AdminPerformerTabs
          active={isMascots ? "mascots" : isBands ? "bands" : "performers"}
        />
        <NameSearchBox
          action="/admin/performers"
          q={q}
          hiddenFields={
            isMascots
              ? { view: "mascots" }
              : isBands
                ? { view: "bands" }
                : undefined
          }
          placeholder="Поиск по имени…"
          className=""
        />
      </div>

      {performers.length === 0 ? (
        <p className="text-secondary">
          {q
            ? "Ничего не найдено."
            : isBands
              ? "Пока нет групп."
              : "Пока нет актёров."}
        </p>
      ) : (
        <>
          <BulkList
            rows={performers.map((p) => ({
              id: p.id,
              node: <AdminPerformerRow performer={p} />,
            }))}
            actions={[
              {
                kind: "delete",
                label: "Удалить выбранных",
                confirmTemplate: "Удалить {n} записей? Действие необратимо.",
                run: async (ids) => {
                  "use server";
                  await bulkDelete("performer", ids);
                },
              },
              {
                kind: "select",
                label: "Сменить агентство",
                placeholder: "Агентство…",
                options: allAgencies,
                run: async (ids, value) => {
                  "use server";
                  await bulkSetPerformerAgency(ids, value);
                },
              },
            ]}
          />
          <Pagination
            page={page}
            totalPages={performersTotalPages}
            buildHref={(p) =>
              `/admin/performers?${isMascots ? "view=mascots&" : isBands ? "view=bands&" : ""}${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`
            }
          />
        </>
      )}
    </div>
  );
}
