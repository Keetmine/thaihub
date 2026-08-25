import { Fragment } from "react";
import AppLink from "@/components/AppLink";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import type { Performer } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import { HeartIcon } from "@/components/icons";
import NameSearchBox from "@/components/NameSearchBox";
import { SEARCH_RESULT_LIMIT } from "@/lib/pagination";
import { performerHref } from "@/lib/performerSlug";
import { agencyHref } from "@/lib/slugHelpers";
import { performerNameWhere, performerRealNameParen } from "@/lib/searchWhere";
import AlphabetIndexList from "@/components/AlphabetIndexList";
import { pageMetadata } from "@/lib/seo";
import { getT, type Dict } from "@/lib/i18n";
import AlphabetDataList from "@/components/AlphabetDataList";
import { addPerformerToList } from "@/app/(public)/artist-lists/actions";
import { performerPhoto, FALLBACK_COVER_SELECT } from "@/lib/performerPhoto";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.catalog.artists.metaTitle,
    description: t.catalog.artists.metaDescription,
    path: "/artists",
  });
}


export const dynamic = "force-dynamic";

/** Поля, которые рисует строка списка. Полная запись Performer тянет
 *  биографию, профильные списки и награды — в перечне они не нужны, а
 *  весят больше всего остального вместе взятого. */
const PERFORMER_ROW_SELECT = {
  id: true,
  name: true,
  slug: true,
  realName: true,
  musicAlias: true,
  photoUrl: true,
  type: true,
  // Обложка свежего релиза — вместо фото, если его нет (см.
  // lib/performerPhoto.ts): у групп фото часто отсутствует, и в списке
  // оставалась пустая буква.
  albums: FALLBACK_COVER_SELECT,
  _count: { select: { events: true } },
} as const;

type PerformerWithCount = {
  id: string;
  name: string;
  slug: string | null;
  realName: string | null;
  musicAlias: string | null;
  photoUrl: string | null;
  type: Performer["type"];
  albums: { coverUrl: string | null; year: number | null }[];
  _count: { events: number };
};


function typeOfView(view: View): "SOLO" | "BAND" | "MASCOT" {
  return view === "bands" ? "BAND" : view === "mascots" ? "MASCOT" : "SOLO";
}


type View = "performers" | "bands" | "mascots" | "agencies";

function Tabs({ active, t }: { active: View; t: Dict }) {
  return (
    <div className="tab-bar">
      <AppLink
        href="/artists"
        prefetch={false}
        className={`tab-bar-item ${active === "performers" ? "active" : ""}`}
      >
        {t.catalog.artists.tabPerformers}
      </AppLink>
      <AppLink
        href="/artists?view=bands"
        prefetch={false}
        className={`tab-bar-item ${active === "bands" ? "active" : ""}`}
      >
        {t.catalog.artists.tabBands}
      </AppLink>
      <AppLink
        href="/artists?view=mascots"
        prefetch={false}
        className={`tab-bar-item ${active === "mascots" ? "active" : ""}`}
      >
        {t.catalog.artists.tabMascots}
      </AppLink>
      <AppLink
        href="/artists?view=agencies"
        prefetch={false}
        className={`tab-bar-item ${active === "agencies" ? "active" : ""}`}
      >
        {t.catalog.artists.tabAgencies}
      </AppLink>
    </div>
  );
}

async function AgenciesTab({ q }: { q: string }) {
  const { t } = await getT();
  const agencies = await prisma.agency.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: { _count: { select: { performers: true } } },
    orderBy: { name: "asc" },
  });

  const currentUser = await getCurrentUser();
  const favoritedIds = new Set<string>();
  if (currentUser && agencies.length > 0) {
    const favorites = await prisma.favoriteAgency.findMany({
      where: { userId: currentUser.id, agencyId: { in: agencies.map((a) => a.id) } },
      select: { agencyId: true },
    });
    for (const f of favorites) favoritedIds.add(f.agencyId);
  }

  if (agencies.length === 0) {
    return <p className="text-secondary">{t.catalog.artists.emptyAgencies}</p>;
  }

  return (
    <AlphabetIndexList
      items={agencies.map((a) => ({ id: a.id, name: a.name, agency: a }))}
      emptyMessage={t.catalog.artists.emptyAgencies}
      renderItem={({ agency: a }) => (
        <div
          key={a.id}
          className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
        >
          <AppLink
            href={agencyHref(a)}
            className="text-decoration-none d-flex align-items-center gap-3"
            style={{ minWidth: 0 }}
          >
            {a.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                loading="lazy"
                decoding="async"
                src={a.logoUrl}
                alt=""
                style={{
                  width: "2.75rem",
                  height: "2.75rem",
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                className="d-flex align-items-center justify-content-center"
                style={{
                  width: "2.75rem",
                  height: "2.75rem",
                  borderRadius: "50%",
                  background: "var(--bs-secondary-bg)",
                  flexShrink: 0,
                  color: "var(--bs-secondary-color)",
                  opacity: 0.7,
                  fontWeight: 600,
                }}
              >
                {a.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <p className="font-display fw-medium text-white mb-0 text-truncate">{a.name}</p>
              <p className="small text-secondary mb-0">
                {t.catalog.artists.artistCount(a._count.performers)}
              </p>
            </div>
          </AppLink>
          <FavoriteButton
            kind="agency"
            id={a.id}
            isFavorited={favoritedIds.has(a.id)}
            variant="icon"
            className="flex-shrink-0"
          />
        </div>
      )}
    />
  );
}

/** Алфавитный список исполнителей. Строки собирает клиент из данных
 *  (AlphabetDataList): сервер отдавал разметку всех записей целиком, и
 *  каталог на тысячи имён весил сотни килобайт — при этом весь список
 *  остаётся на странице, так что переход по букве работает скроллом. */
function PerformerAlphabetList({
  performers,
  favoritedIds,
  myLists,
  emptyMessage,
  favoritesLabel,
  pinFavorites = true,
}: {
  performers: PerformerWithCount[];
  favoritedIds: Set<string>;
  myLists: { id: string; title: string }[] | null;
  emptyMessage: string;
  /** Подпись закреплённой секции с избранными. */
  favoritesLabel: string;
  // Избранные сверху (дефолт: список = избранные + событийные).
  pinFavorites?: boolean;
}) {
  if (performers.length === 0) {
    return <p className="text-secondary">{emptyMessage}</p>;
  }

  const toRow = (p: PerformerWithCount) => ({
    id: p.id,
    name: p.name,
    href: performerHref(p),
    photoUrl: performerPhoto(p),
    nameSuffix: performerRealNameParen(p),
    // Счётчик «N событ.» убран (фидбек владельца): в него попадали и
    // прошедшие события, и это читалось как «предстоящих всего N».
    favorited: favoritedIds.has(p.id),
  });

  // Избранные — отдельной пачкой перед алфавитом, но из самого алфавита
  // НЕ вырезаются (фидбек владельца): пусть дублируются, иначе человека
  // не найти на его букве.
  const favorited = pinFavorites ? performers.filter((p) => favoritedIds.has(p.id)) : [];
  const rest = performers;

  const addToList =
    myLists && myLists.length > 0
      ? {
          lists: myLists,
          add: async (listId: string, performerId: string) => {
            "use server";
            await addPerformerToList(listId, performerId);
          },
        }
      : undefined;

  return (
    <>
      {/* Избранное и алфавит — ОДИН список с общей рейкой на всю
          высоту: сверху сердечко-якорь, ниже буквы. */}
      <AlphabetDataList
        rows={rest.map(toRow)}
        emptyMessage={emptyMessage}
        showFavoriteButton
        addToList={addToList}
        variant="cards"
        pinned={
          favorited.length > 0
            ? {
                id: "favorites",
                heading: (
                  <>
                    <HeartIcon filled />
                    {favoritesLabel}
                  </>
                ),
                rows: favorited.map(toRow),
                indexLabel: <HeartIcon filled />,
                indexAriaLabel: favoritesLabel,
              }
            : undefined
        }
      />
    </>
  );
}

export default async function PerformersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { t } = await getT();
  const { view: rawView, q: rawQ } = await searchParams;
  const view: View =
    rawView === "bands"
      ? "bands"
      : rawView === "mascots"
        ? "mascots"
        : rawView === "agencies"
          ? "agencies"
          : "performers";
  const q = (rawQ ?? "").trim();
  const currentUser = view === "agencies" ? null : await getCurrentUser();

  // The catalog has grown into the thousands of performers — loading and
  // rendering all of them by default made the page painfully slow. Without
  // a search term, show only what's already favorited; the full catalog
  // is reachable through search instead of one giant always-rendered list.
  const searchResults =
    view === "agencies" || !q
      ? null
      : await prisma.performer.findMany({
          where: { type: typeOfView(view), ...performerNameWhere(q) },
          select: PERFORMER_ROW_SELECT,
          orderBy: { name: "asc" },
          take: SEARCH_RESULT_LIMIT + 1,
        });
  const searchTruncated = !!searchResults && searchResults.length > SEARCH_RESULT_LIMIT;

  // Группы и маскоты — короткие списки, показываем целиком; актёров без
  // поиска — только избранных (каталог в тысячи строк).
  const showAllByDefault = view === "bands" || view === "mascots";
  const performers =
    view === "agencies"
      ? []
      : searchResults
        ? searchResults.slice(0, SEARCH_RESULT_LIMIT)
        : showAllByDefault
          ? await prisma.performer.findMany({
              where: { type: typeOfView(view) },
              // Только поля строки: биографии и профильные списки в
              // перечне не нужны, а весят они больше всего остального.
              select: PERFORMER_ROW_SELECT,
              orderBy: { name: "asc" },
            })
          : // Без поиска: избранные юзера + все, у кого есть хотя бы
            // одно событие (анониму — только событийные). Полный каталог
            // в тысячи актёров — через поиск.
            await prisma.performer.findMany({
              where: {
                type: typeOfView(view),
                OR: [
                  { events: { some: {} } },
                  ...(currentUser
                    ? [{ favoritedBy: { some: { userId: currentUser.id } } }]
                    : []),
                ],
              },
              select: PERFORMER_ROW_SELECT,
              orderBy: { name: "asc" },
            });
  // Списки актёров пользователя — для кнопки «+ в список» в строках.
  const myLists = currentUser
    ? await prisma.performerList.findMany({
        where: { userId: currentUser.id },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      })
    : null;
  const favoritedIds = new Set<string>();
  if (currentUser && performers.length > 0) {
    const favorites = await prisma.favoritePerformer.findMany({
      where: { userId: currentUser.id, performerId: { in: performers.map((p) => p.id) } },
      select: { performerId: true },
    });
    for (const f of favorites) favoritedIds.add(f.performerId);
  }

  const titles: Record<View, string> = {
    performers: t.catalog.artists.titlePerformers,
    bands: t.catalog.artists.titleBands,
    mascots: t.catalog.artists.titleMascots,
    agencies: t.catalog.artists.titleAgencies,
  };

  return (
    <div>
      <PageHeader
        eyebrow={t.catalog.eyebrow}
        title={titles[view]}
        size="lg"
        className="mb-5"
        watermark="Artists"
      />

      <div className="tab-bar-row">
        <Tabs active={view} t={t} />
        <NameSearchBox
          action="/artists"
          q={q}
          hiddenFields={view !== "performers" ? { view } : undefined}
          placeholder={
            view === "agencies" ? t.catalog.searchByTitle : t.catalog.searchByName
          }
          className=""
        />
      </div>
      {view === "performers" && !q && (
        <p className="small text-secondary mb-3" style={{ maxWidth: "44rem" }}>
          {t.catalog.artists.hint}
        </p>
      )}

      {view === "agencies" ? (
        <AgenciesTab q={q} />
      ) : (
        <>
          {searchTruncated && (
            <p className="small text-secondary mb-3">
              {t.catalog.showingFirst(SEARCH_RESULT_LIMIT)}
            </p>
          )}
          <PerformerAlphabetList
            performers={performers}
            favoritedIds={favoritedIds}
            myLists={myLists}
            pinFavorites
            favoritesLabel={t.catalog.artists.favorites}
            emptyMessage={
              q
                ? t.common.nothingFound
                : view === "bands"
                  ? t.catalog.artists.emptyBands
                  : view === "mascots"
                    ? t.catalog.artists.emptyMascots
                    : t.catalog.artists.emptyFavorites
            }
          />
        </>
      )}
    </div>
  );
}
