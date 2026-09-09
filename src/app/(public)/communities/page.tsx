import { unstable_cache } from "next/cache";
import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import LetterAvatar from "@/components/LetterAvatar";
import PageHeader from "@/components/PageHeader";
import PremiumUpsell from "@/components/PremiumUpsell";
import ScrollableTabs from "@/components/ScrollableTabs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { communityHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { CATALOG_TAG } from "@/lib/catalogCache";
import CreateCommunityButton from "./CreateCommunityButton";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.communities.metaTitle,
    description: t.communities.metaDescription,
    path: "/communities",
  });
}

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
 * Кэш общей части витрины (аудит 2026-09, п.4). Список публичных
 * сообществ и оба ряда фильтра по месту одинаковы для всех — считаем
 * раз в полчаса, как соседние каталоги (тег catalog сбрасывает раньше,
 * когда сообщество правят). Блок «мои сообщества» ниже остаётся живым
 * запросом: он у каждого свой, и в общий кэш ему нельзя.
 * ------------------------------------------------------------------ */

/** Поля карточки витрины — ровно то, что рисует `card` ниже. Узкий
 *  select, а не целая строка: описание, правила вступления и даты
 *  списку не нужны, а из кэша даты всё равно вернулись бы строками. */
const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  coverUrl: true,
  country: true,
  city: true,
  _count: { select: { members: { where: { status: "ACTIVE" as const } } } },
} as const;

/** Публичные сообщества — весь список среза по месту (ключ кэша —
 *  страна и город, поэтому у каждого среза своя запись). */
const getPublicCommunities = unstable_cache(
  async (country: string | null, city: string | null) =>
    prisma.community.findMany({
      where: {
        visibility: "PUBLIC",
        ...(country ? { country, ...(city ? { city } : {}) } : {}),
      },
      select: CARD_SELECT,
      take: 100,
    }),
  ["communities-public-list"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Варианты фильтра по месту: страны — всегда, города — внутри
 *  выбранной страны (её имя входит в ключ кэша). */
const getPlaceFacets = unstable_cache(
  async (country: string | null) => {
    const [countryRows, cityRows] = await Promise.all([
      // Варианты фильтра считаем по ВСЕМ публичным сообществам, а не по
      // выданной сотне: иначе страна пропадала бы из ряда ровно тогда,
      // когда её сообщества не попали на первую страницу.
      prisma.community.groupBy({
        by: ["country"],
        where: { visibility: "PUBLIC", country: { not: null } },
        _count: { _all: true },
      }),
      // Города — только внутри выбранной страны: список городов мира
      // одним рядом нечитаем, да и «Минск» без страны ничего не значит.
      country
        ? prisma.community.groupBy({
            by: ["city"],
            where: { visibility: "PUBLIC", country, city: { not: null } },
            _count: { _all: true },
          })
        : Promise.resolve([] as { city: string | null; _count: { _all: number } }[]),
    ]);
    return {
      countries: countryRows.map((row) => ({ value: row.country!, count: row._count._all })),
      cities: cityRows.map((row) => ({ value: row.city!, count: row._count._all })),
    };
  },
  ["communities-place-facets"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/**
 * Витрина сообществ (АА25).
 *
 * Открыта всем, включая поисковики: человек ищет «лакорны Беларусь»,
 * находит страницу и заводит аккаунт, чтобы вступить. Поэтому в списке
 * только ПУБЛИЧНЫЕ сообщества — закрытые не показываются даже
 * названием, попасть в них можно лишь по прямой ссылке.
 *
 * Порядок — по числу участников, а не по дате: пустое сообщество,
 * заведённое вчера, наверху витрины выглядит хуже, чем его отсутствие.
 *
 * Здесь же — фильтр по МЕСТУ (`?country=…&city=…`). Это второй способ
 * найти сообщество, и он существует ровно для тех, кого не привязать к
 * каталогу: «Лакорны Беларусь» любит всех актёров сразу, и ищут его по
 * стране, а не по имени (см. docs/features/communities.md, раздел
 * «Связь с каталогом и место»). Значения живут в адресе, а не в
 * состоянии: ссылкой на срез можно поделиться.
 */
export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; city?: string }>;
}) {
  const { t } = await getT();
  const s = t.communities.topics;
  const user = await getCurrentUser();

  const { country: rawCountry, city: rawCity } = await searchParams;
  const country = (rawCountry ?? "").trim() || null;
  // Город без страны не бывает: фильтр устроен «страна → город», и
  // одинокий ?city=Минск показал бы одноимённые города разных стран.
  const city = country ? (rawCity ?? "").trim() || null : null;
  const placeWhere = country ? { country, ...(city ? { city } : {}) } : {};

  const [publicCommunities, facets, mine] = await Promise.all([
    getPublicCommunities(country, city),
    getPlaceFacets(country),
    user
      ? prisma.community.findMany({
          // Свои — и те, что завёл, и те, куда вступил, включая закрытые:
          // человеку они видны всегда. Персональный запрос, мимо кэша:
          // общий ответ на всех тут выдал бы чужие закрытые сообщества.
          // Фильтр по месту действует и здесь: иначе выбранная страна
          // молча не относилась бы к половине страницы.
          where: { members: { some: { userId: user.id, status: "ACTIVE" } }, ...placeWhere },
          select: CARD_SELECT,
        })
      : Promise.resolve([]),
  ]);

  const byMembers = <T extends { _count: { members: number }; title: string }>(rows: T[]) =>
    [...rows].sort((a, b) => b._count.members - a._count.members || a.title.localeCompare(b.title));

  const mineIds = new Set(mine.map((c) => c.id));
  const others = byMembers(publicCommunities.filter((c) => !mineIds.has(c.id)));
  const canCreate = isPremiumActive(user);
  // Заводить сообщество — часть подписки; вступать и участвовать можно
  // без неё (решение владельца). Апселл поэтому не стена, а колонка
  // сбоку: раньше он стоял между вступлением и списком и своей высотой
  // отодвигал сам список за экран — «пользователь может даже не
  // долистать до списка» (правка владельца 2026-09-10).
  const showUpsell = !!user && !canCreate;

  // Частые места вперёд, при равенстве — по алфавиту: ряд читается как
  // «где сообществ больше всего». Сортируем ЗДЕСЬ, а не в кэше: порядок
  // дешёвый, а в кэше лежит голый ответ базы.
  const byCount = (rows: { value: string; count: number }[]) =>
    [...rows].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const countries = byCount(facets.countries);
  const cities = byCount(facets.cities);

  const placeHref = (nextCountry: string | null, nextCity: string | null) => {
    const params = new URLSearchParams();
    if (nextCountry) params.set("country", nextCountry);
    if (nextCountry && nextCity) params.set("city", nextCity);
    return params.size ? `/communities?${params}` : "/communities";
  };

  const card = (c: {
    id: string;
    slug: string | null;
    title: string;
    description: string | null;
    coverUrl: string | null;
    country: string | null;
    city: string | null;
    _count: { members: number };
  }) => (
    <AppLink
      key={c.id}
      href={communityHref(c)}
      className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3"
    >
      {/* Обложка — та же картинка, что висит на странице сообщества, но
          КВАДРАТОМ (правка владельца 2026-09-09): в строке списка
          широкая полоса 3:2 съедала место у названия, а квадрат встаёт
          в один ряд с аватарками остальных списков сайта. Без обложки —
          первая буква названия общим LetterAvatar: своей заглушки тут
          нет намеренно, иначе пустая карточка на витрине и пустая
          аватарка в списках разъехались бы. */}
      <LetterAvatar name={c.title} photoUrl={c.coverUrl} size={4} rounded={false} />
      <span className="d-flex flex-column gap-1 flex-fill" style={{ minWidth: 0 }}>
        <span className="font-display fw-medium text-white text-truncate">{c.title}</span>
        {c.description && (
          <span className="small text-secondary text-truncate">{c.description}</span>
        )}
        <span className="small text-secondary text-truncate">
          {t.communities.membersCount(c._count.members)}
          {/* Место — прямо в карточке: человек, пришедший «а есть ли
              кто-то у нас», должен видеть ответ, не открывая страницу. */}
          {c.country && ` · ${[c.country, c.city].filter(Boolean).join(", ")}`}
        </span>
      </span>
    </AppLink>
  );

  return (
    <div>
      <PageHeader
        eyebrow={t.communities.eyebrow}
        title={t.communities.heading}
        size="lg"
        className="mb-4"
        action={canCreate ? <CreateCommunityButton /> : undefined}
      />

      {/* Ширину держит только вступительный абзац: строка в 44rem
          читается, а во всю страницу — нет. Сам список с этого места и
          ниже занимает всю ширину (правка владельца 2026-09-09). */}
      <p className="text-secondary mb-4" style={{ maxWidth: "44rem" }}>
        {t.communities.intro}
      </p>

      <div>
        {/* Фильтр по месту. Ряда нет вовсе, пока ни одно сообщество не
            назвало страну: пустая панель фильтров — это шум. */}
        {countries.length > 0 && (
          <nav aria-label={s.filterLabel} className="mb-3">
            {/* Стран в ряду сколько угодно — ряд прокручивается общим
                механизмом (ScrollableTabs), как вкладки везде на сайте:
                со стрелками и растушёванным краем вместо заворота в три
                строки. */}
            <ScrollableTabs>
              <AppLink
                href={placeHref(null, null)}
                className={`tab-bar-item ${country ? "" : "active"}`}
                aria-current={country ? undefined : "page"}
              >
                {s.anyPlace}
              </AppLink>
              {countries.map((c) => (
                <AppLink
                  key={c.value}
                  href={placeHref(c.value, null)}
                  className={`tab-bar-item ${c.value === country ? "active" : ""}`}
                  aria-current={c.value === country ? "page" : undefined}
                >
                  {c.value} ({c.count})
                </AppLink>
              ))}
            </ScrollableTabs>
            {/* Города появляются, только когда страна выбрана и город у
                кого-то заполнен: у сообщества «Лакорны Беларусь» города
                нет, и второй пустой ряд ему не нужен. */}
            {country && cities.length > 0 && (
              <div className="d-flex flex-wrap gap-2 mt-2">
                <AppLink
                  href={placeHref(country, null)}
                  className="chip-link"
                  aria-current={city ? undefined : "page"}
                  style={city ? undefined : { borderColor: "rgba(var(--accent-rgb), 0.55)" }}
                >
                  {s.wholeCountry}
                </AppLink>
                {cities.map((c) => (
                  <AppLink
                    key={c.value}
                    href={placeHref(country, c.value)}
                    className="chip-link"
                    aria-current={c.value === city ? "page" : undefined}
                    style={
                      c.value === city
                        ? { borderColor: "rgba(var(--accent-rgb), 0.55)" }
                        : undefined
                    }
                  >
                    {c.value} ({c.count})
                  </AppLink>
                ))}
              </div>
            )}
          </nav>
        )}

        {mine.length > 0 && (
          <section className="mb-4">
            <h2 className="section-heading mb-2">{t.communities.myCommunities}</h2>
            <div className="community-list">{byMembers(mine).map(card)}</div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            {mine.length > 0 && (
              <h2 className="section-heading mb-2">{t.communities.allCommunities}</h2>
            )}
            <div className="community-list">{others.map(card)}</div>
          </section>
        )}

        {mine.length === 0 && others.length === 0 && (
          // Пусто из-за фильтра и пусто вообще — разные беды: во втором
          // случае звать заводить первое сообщество уместно, в первом
          // человеку сначала надо сказать, что дело в выбранном месте.
          <EmptyState
            emoji="🫂"
            title={country ? s.emptyPlaceTitle : t.communities.emptyTitle}
            hint={country ? s.emptyPlaceHint : t.communities.emptyHint}
            compact
          />
        )}

        {/* Апселл — ПОД списком (правка владельца 2026-09-10). Раньше
            он стоял над ним и своей высотой отодвигал сам список за
            экран: «пользователь может даже не долистать до списка». */}
        {showUpsell && (
          <div className="mt-5">
            <PremiumUpsell feature={t.communities.create} />
          </div>
        )}
      </div>
    </div>
  );
}
