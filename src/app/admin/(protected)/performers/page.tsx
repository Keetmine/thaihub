import LetterAvatar from "@/components/LetterAvatar";
import { performerRealNameParen } from "@/lib/searchWhere";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deletePerformer } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import Pagination from "@/components/Pagination";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { adminListHref } from "@/lib/adminListHref";
import { performerNameWhere } from "@/lib/searchWhere";
import AdminFilters from "@/components/admin/AdminFilters";
import AdminSortLinks from "@/components/admin/AdminSortLinks";
import {
  activeAdminSort,
  UPDATED_SORT,
  updatedOrderBy,
  updatedSortOption,
} from "@/lib/adminSort";
import {
  adminPerformerFilterDefs,
  adminPerformerFilterWhere,
  loadPerformerFilterOptions,
  type FilterDef,
  type FilterParams,
} from "@/lib/catalogFilters";
import type { Prisma } from "@/generated/prisma/client";
import { getDict } from "@/lib/i18n";
import BulkList from "@/components/admin/BulkList";
import { bulkDelete, bulkSetPerformerAgency } from "../bulkActions";

export const metadata = { title: "Исполнители" };

export const dynamic = "force-dynamic";

/**
 * «Пустые» артисты (?noEvents=1, ?noDramas=1) — рабочий список владельца:
 * карточка заведена, а показывать на ней нечего. Флаги независимы и
 * складываются друг с другом и с остальными фильтрами через AND.
 * Живут здесь, а не в общем catalogFilters: срез нужен только этому
 * списку, зрителю такой выборки не предлагаем.
 */
const emptyRelationFilterDefs: FilterDef[] = [
  { key: "noEvents", title: "Без событий", kind: "flag" },
  { key: "noDramas", title: "Без сериалов", kind: "flag" },
];

function emptyRelationFilterWhere(
  p: FilterParams,
): Prisma.PerformerWhereInput[] {
  const w: Prisma.PerformerWhereInput[] = [];
  // Связи — таблицы-связки (EventPerformer, PerformerDrama), поэтому
  // «нет ни одного события» — это none по строкам связки, а не по Event.
  if (p.noEvents === "1") w.push({ events: { none: {} } });
  if (p.noDramas === "1") w.push({ dramas: { none: {} } });
  return w;
}

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
          data-tooltip="Редактировать"
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
            data-tooltip="Удалить"
          >
            <TrashIcon />
          </button>
        </ConfirmForm>
      </div>
    </div>
  );
}

const SORT_OPTIONS = [{ key: null, label: "по имени" }, updatedSortOption];

export default async function AdminPerformersPage({
  searchParams,
}: {
  searchParams: Promise<
    { view?: string; q?: string; page?: string; sort?: string } & FilterParams
  >;
}) {
  const sp = await searchParams;
  const { view, q: rawQ, page: rawPage } = sp;
  // Агентства переехали в свой раздел, но на старый адрес много закладок.
  if (view === "agencies") redirect("/admin/agencies");
  const isBands = view === "bands";
  const isMascots = view === "mascots";
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);
  const sort = activeAdminSort(sp.sort, SORT_OPTIONS);
  // Порядок один на все четыре запроса ниже, включая три ранжированные
  // ветки поиска: внутри «точное / по началу / везде» строки всё равно
  // надо чем-то упорядочить, и «по обновлению» там значит то же самое.
  const performersOrderBy =
    sort === UPDATED_SORT ? updatedOrderBy : ({ name: "asc" } as const);

  const performerType: "BAND" | "SOLO" | "MASCOT" = isMascots
    ? "MASCOT"
    : isBands
      ? "BAND"
      : "SOLO";
  const filterWhere = [
    ...adminPerformerFilterWhere(sp),
    ...emptyRelationFilterWhere(sp),
  ];
  const performersWhere = {
    AND: [
      { type: performerType, ...(q ? performerNameWhere(q) : {}) },
      ...filterWhere,
    ],
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
              AND: [
                {
                  type: performerType,
                  OR: nameFields.map((f) => ({
                    [f]: { equals: q, mode: "insensitive" },
                  })),
                },
                ...filterWhere,
              ],
            },
            include: { _count: { select: { events: true } } },
            orderBy: performersOrderBy,
            take: 20,
          }),
          prisma.performer.findMany({
            where: {
              AND: [
                {
                  type: performerType,
                  OR: nameFields.map((f) => ({
                    [f]: { startsWith: q, mode: "insensitive" },
                  })),
                },
                ...filterWhere,
              ],
            },
            include: { _count: { select: { events: true } } },
            orderBy: performersOrderBy,
            take: 20,
          }),
          prisma.performer.findMany({
            where: performersWhere,
            include: { _count: { select: { events: true } } },
            orderBy: performersOrderBy,
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
          orderBy: performersOrderBy,
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
        <div className="d-flex flex-wrap align-items-center gap-2">
          {/* Очередь досбора биографий с MDL — отдельной страницей: там
              и список ожидающих, и запуск обхода (см.
              docs/features/mydramalist-import.md). Только у актёров: у
              групп и маскотов страниц на MDL нет. */}
          {!isBands && !isMascots && (
            <Link href="/admin/performers/bios" className="btn btn-outline-secondary btn-sm">
              Биографии с MDL
            </Link>
          )}
          <Link href="/admin/performers/new" className="btn btn-primary btn-sm">
            + Добавить исполнителя
          </Link>
        </div>
      </div>

      {/* Список слева, фильтры колонкой справа — как на /search. */}

      <div className="row g-4">
        <div className="col-12 col-xl-9">
          {/* Табы разделов убраны — группы/маскоты теперь пункты сайдбара. */}
          <NameSearchBox
            action="/admin/performers"
            q={q}
            // Раздел и выбранный порядок переживают поиск: иначе строка
            // поиска молча возвращала бы солистов и сортировку по имени.
            hiddenFields={{
              ...(isMascots
                ? { view: "mascots" }
                : isBands
                  ? { view: "bands" }
                  : {}),
              ...(sort ? { sort } : {}),
            }}
            placeholder="Поиск по имени…"
            className="admin-search-lg mb-3"
            quickKind="performer"
          />

          <AdminSortLinks
            basePath="/admin/performers"
            params={sp}
            options={SORT_OPTIONS}
            active={sort}
          />

          {/* Список заготовок парсера фестивалей (docs/features/musicfestival-import.md):
          подсказка, что это за записи и как они отсюда выпадают. */}
          {sp.stub === "1" && (
            <p className="alert alert-secondary small py-2 mb-3">
              Заготовки: заведены парсером лайнапов musicfestival.in.th с одним
              именем (и фото, если было на сайте), тип «актёр» по умолчанию.
              Откройте запись, дополните и сохраните профиль — после сохранения
              она из этого списка выпадает. Тёзки не привязывались нарочно: если
              это уже известный артист, слейте записи через «Дубли».
            </p>
          )}

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
                    confirmTemplate:
                      "Удалить {n} записей? Действие необратимо.",
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
              {/* Листание — от полного адреса: view, поиск и фильтры
              остаются на месте (И16), меняется только page. */}
              <Pagination
                page={page}
                totalPages={performersTotalPages}
                buildHref={(p) =>
                  adminListHref("/admin/performers", sp, { page: p })
                }
              />
            </>
          )}
        </div>
        <AdminFilters
          defs={[
            ...adminPerformerFilterDefs(
              getDict("ru"),
              await loadPerformerFilterOptions(),
            ),
            ...emptyRelationFilterDefs,
          ]}
          params={sp}
        />
      </div>
    </div>
  );
}
