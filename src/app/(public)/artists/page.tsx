import { Fragment } from "react";
import { unstable_cache } from "next/cache";
import AppLink from "@/components/AppLink";
import PageHeader, { WATERMARK_NAME_LIMIT } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { CATALOG_TAG } from "@/lib/catalogCache";
import { CATALOG_LETTERS, isCatalogLetter, letterPrefixes } from "@/lib/catalogLetters";
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

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; letter?: string }>;
}) {
  const { t } = await getT();
  const { view, letter } = await searchParams;
  // С-5: у страницы буквы canonical самоссылающийся (?letter входит в
  // path и, через pageMetadata, в canonical/hreflang) — иначе поисковик
  // склеил бы все буквы в одну страницу. Прочие параметры canonical
  // не меняют, как и раньше.
  const letterPath =
    letter && isCatalogLetter(letter)
      ? `/artists?${new URLSearchParams({
          ...(view === "bands" || view === "mascots" ? { view } : {}),
          letter,
        }).toString()}`
      : null;
  return pageMetadata({
    title: t.catalog.artists.metaTitle,
    description: t.catalog.artists.metaDescription,
    path: letterPath ?? "/artists",
  });
}


export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
 * Кэш общих выборок (П-1): списки без поиска и подложка имён одинаковы
 * для всех гостей — считаем раз в полчаса (тег catalog сбрасывает
 * раньше при правке каталога). Персональные ветки залогиненных
 * (избранное, свои списки) остаются живыми запросами. ВНИМАНИЕ: внутри
 * unstable_cache нельзя звать cookies()/getCurrentUser.
 * ------------------------------------------------------------------ */

/** Полный список вкладки (группы, маскоты — короткие списки). */
const getAllPerformersOfType = unstable_cache(
  async (type: "SOLO" | "BAND" | "MASCOT") =>
    prisma.performer.findMany({
      where: { type },
      select: PERFORMER_ROW_SELECT,
      orderBy: { name: "asc" },
    }),
  ["artists-all-of-type"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Гостевой список актёров без поиска: только у кого есть события. */
const getPerformersWithEvents = unstable_cache(
  async (type: "SOLO" | "BAND" | "MASCOT") =>
    prisma.performer.findMany({
      where: { type, events: { some: {} } },
      select: PERFORMER_ROW_SELECT,
      orderBy: { name: "asc" },
    }),
  ["artists-with-events"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Имена за шапкой — популярность одна на всех. */
const getArtistsWatermarkNames = unstable_cache(
  async (view: View) =>
    (view === "agencies"
      ? await prisma.agency.findMany({
          select: { name: true },
          orderBy: [{ favoritedBy: { _count: "desc" } }, { name: "asc" }],
          take: WATERMARK_NAME_LIMIT,
        })
      : await prisma.performer.findMany({
          where: { type: typeOfView(view) },
          select: { name: true },
          // Вторым ключом — число событий: иначе хвост подложки
          // заполняется алфавитом со случайными записями каталога.
          orderBy: [
            { favoritedBy: { _count: "desc" } },
            { events: { _count: "desc" } },
            { name: "asc" },
          ],
          take: WATERMARK_NAME_LIMIT,
        })
    ).map((r) => r.name),
  ["artists-watermark-names"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Список агентств без поиска (избранное поверх — живым запросом). */
const getAgenciesList = unstable_cache(
  async () =>
    prisma.agency.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        _count: { select: { performers: true } },
      },
      orderBy: { name: "asc" },
    }),
  ["artists-agencies-list"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** С-5: полный список буквы для серверной страницы `?letter=X`. */
const getPerformersByLetter = unstable_cache(
  async (type: "SOLO" | "BAND" | "MASCOT", letter: string) =>
    prisma.performer.findMany({
      where: {
        type,
        OR: letterPrefixes(letter).map((p) => ({
          name: { startsWith: p, mode: "insensitive" as const },
        })),
      },
      select: { id: true, name: true, slug: true, realName: true },
      orderBy: { name: "asc" },
    }),
  ["artists-by-letter"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

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
  // Без поиска список одинаков для всех — из кэша; c запросом —
  // живой запрос (ключей по числу запросов кэшу не надо).
  const agencies = q
    ? await prisma.agency.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          _count: { select: { performers: true } },
        },
        orderBy: { name: "asc" },
      })
    : await getAgenciesList();

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
  letterHrefBase,
}: {
  performers: PerformerWithCount[];
  favoritedIds: Set<string>;
  myLists: { id: string; title: string }[] | null;
  emptyMessage: string;
  /** Подпись закреплённой секции с избранными. */
  favoritesLabel: string;
  // Избранные сверху (дефолт: список = избранные + событийные).
  pinFavorites?: boolean;
  /** С-5: краулабельные буквы рейки (см. AlphabetDataList). */
  letterHrefBase?: string;
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
            // Результат пробрасываем: ошибка экшена приходит значением,
            // и AddToListButton показывает её в модалке.
            return addPerformerToList(listId, performerId);
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
        letterHrefBase={letterHrefBase}
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
  searchParams: Promise<{ view?: string; q?: string; letter?: string }>;
}) {
  const { t } = await getT();
  const { view: rawView, q: rawQ, letter: rawLetter } = await searchParams;
  const view: View =
    rawView === "bands"
      ? "bands"
      : rawView === "mascots"
        ? "mascots"
        : rawView === "agencies"
          ? "agencies"
          : "performers";
  const q = (rawQ ?? "").trim();

  // С-5: серверная страница буквы — полный список записей на букву
  // обычными ссылками, для краулера (буквы рейки ведут сюда по href;
  // живой зритель по-прежнему скроллит клиентский список).
  if (view !== "agencies" && !q && isCatalogLetter(rawLetter)) {
    const letterBase =
      view === "performers" ? "/artists?letter=" : `/artists?view=${view}&letter=`;
    const performersOfLetter = await getPerformersByLetter(typeOfView(view), rawLetter);
    return (
      <div>
        <PageHeader
          eyebrow={t.catalog.eyebrow}
          title={`${t.catalog.artists[view === "bands" ? "titleBands" : view === "mascots" ? "titleMascots" : "titlePerformers"]} — ${t.catalog.letterTitle(rawLetter)}`}
        />
        <nav
          className="d-flex flex-wrap align-items-center gap-2 small mb-4"
          aria-label={t.catalog.letterIndex}
        >
          <span className="text-secondary">{t.catalog.letterAll}</span>
          {CATALOG_LETTERS.map((l) => (
            <AppLink
              key={l}
              href={`${letterBase}${encodeURIComponent(l)}`}
              className={l === rawLetter ? "fw-bold" : undefined}
            >
              {l}
            </AppLink>
          ))}
        </nav>
        <p className="mb-3">
          <AppLink href={view === "performers" ? "/artists" : `/artists?view=${view}`}>
            {t.catalog.letterBack}
          </AppLink>
        </p>
        {performersOfLetter.length === 0 ? (
          <p className="text-secondary">{t.common.nothingFound}</p>
        ) : (
          <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
            {performersOfLetter.map((p) => {
              const real = performerRealNameParen(p);
              return (
                <li key={p.id}>
                  <AppLink href={performerHref(p)}>{p.name}</AppLink>
                  {real && <span className="small text-secondary"> ({real})</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

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
          take: SEARCH_RESULT_LIMIT,
        });

  // Группы и маскоты — короткие списки, показываем целиком; актёров без
  // поиска — только избранных (каталог в тысячи строк).
  const showAllByDefault = view === "bands" || view === "mascots";
  const performers =
    view === "agencies"
      ? []
      : searchResults
        ? searchResults.slice(0, SEARCH_RESULT_LIMIT)
        : showAllByDefault
          ? // Одинаково для всех — из кэша (только поля строки:
            // биографии и профильные списки в перечне не нужны).
            await getAllPerformersOfType(typeOfView(view))
          : // Без поиска: избранные юзера + все, у кого есть хотя бы
            // одно событие (анониму — только событийные, из кэша).
            // Полный каталог в тысячи актёров — через поиск.
            currentUser
            ? await prisma.performer.findMany({
                where: {
                  type: typeOfView(view),
                  OR: [
                    { events: { some: {} } },
                    { favoritedBy: { some: { userId: currentUser.id } } },
                  ],
                },
                select: PERFORMER_ROW_SELECT,
                orderBy: { name: "asc" },
              })
            : await getPerformersWithEvents(typeOfView(view));
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

  // Имена за шапкой — самые популярные записи текущей вкладки по числу
  // добавлений в избранное. Популярность одна на всех — из кэша.
  const watermarkNames = await getArtistsWatermarkNames(view);

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
        gapOnTitle
        watermark="Artists"
        watermarkNames={watermarkNames}
        action={
          // Подпись про наполнение списка стоит только на вкладке актёров
          // без поиска: на группах и агентствах она была бы неправдой.
          view === "performers" && !q ? (
            <div className="hero-note">
              {/* Три абзаца, а не два: перенос первой реплики прибит
                  разметкой — так в макете владельца. */}
              <p className="hero-note-lead">{t.catalog.artists.heroLead1}</p>
              <p className="hero-note-lead">{t.catalog.artists.heroLead2}</p>
              <p className="hero-note-cta">{t.catalog.artists.heroCta}</p>
            </div>
          ) : undefined
        }
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
      {view === "agencies" ? (
        <AgenciesTab q={q} />
      ) : (
        <>
          <PerformerAlphabetList
            performers={performers}
            favoritedIds={favoritedIds}
            myLists={myLists}
            pinFavorites
            letterHrefBase={
              view === "performers" ? "/artists?letter=" : `/artists?view=${view}&letter=`
            }
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
