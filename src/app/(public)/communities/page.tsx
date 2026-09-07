import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import PremiumUpsell from "@/components/PremiumUpsell";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { communityHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
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

  const [publicCommunities, mine, countryFacets, cityFacets] = await Promise.all([
    prisma.community.findMany({
      where: { visibility: "PUBLIC", ...placeWhere },
      include: { _count: { select: { members: { where: { status: "ACTIVE" } } } } },
      take: 100,
    }),
    user
      ? prisma.community.findMany({
          // Свои — и те, что завёл, и те, куда вступил, включая закрытые:
          // человеку они видны всегда. Фильтр по месту действует и здесь:
          // иначе выбранная страна молча не относилась бы к половине
          // страницы.
          where: { members: { some: { userId: user.id, status: "ACTIVE" } }, ...placeWhere },
          include: { _count: { select: { members: { where: { status: "ACTIVE" } } } } },
        })
      : Promise.resolve([]),
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
      : Promise.resolve([]),
  ]);

  const byMembers = <T extends { _count: { members: number }; title: string }>(rows: T[]) =>
    [...rows].sort((a, b) => b._count.members - a._count.members || a.title.localeCompare(b.title));

  const mineIds = new Set(mine.map((c) => c.id));
  const others = byMembers(publicCommunities.filter((c) => !mineIds.has(c.id)));
  const canCreate = isPremiumActive(user);

  // Частые места вперёд, при равенстве — по алфавиту: ряд читается как
  // «где сообществ больше всего».
  const countries = countryFacets
    .map((row) => ({ value: row.country!, count: row._count._all }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const cities = cityFacets
    .map((row) => ({ value: row.city!, count: row._count._all }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

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
    country: string | null;
    city: string | null;
    _count: { members: number };
  }) => (
    <AppLink
      key={c.id}
      href={communityHref(c)}
      className="surface surface-hover text-decoration-none d-flex flex-column gap-1 p-3"
    >
      <span className="font-display fw-medium text-white">{c.title}</span>
      {c.description && (
        <span className="small text-secondary text-truncate">{c.description}</span>
      )}
      <span className="small text-secondary">
        {t.communities.membersCount(c._count.members)}
        {/* Место — прямо в карточке: человек, пришедший «а есть ли
            кто-то у нас», должен видеть ответ, не открывая страницу. */}
        {c.country && ` · ${[c.country, c.city].filter(Boolean).join(", ")}`}
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

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">{t.communities.intro}</p>

        {/* Заводить сообщество — часть подписки; вступать и участвовать
            можно без неё (решение владельца). */}
        {user && !canCreate && (
          <div className="mb-4">
            <PremiumUpsell feature={t.communities.create} />
          </div>
        )}

        {/* Фильтр по месту. Ряда нет вовсе, пока ни одно сообщество не
            назвало страну: пустая панель фильтров — это шум. */}
        {countries.length > 0 && (
          <nav aria-label={s.filterLabel} className="mb-3">
            <div className="d-flex flex-wrap gap-3 tab-bar">
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
            </div>
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
            <div className="d-flex flex-column gap-2">{byMembers(mine).map(card)}</div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            {mine.length > 0 && (
              <h2 className="section-heading mb-2">{t.communities.allCommunities}</h2>
            )}
            <div className="d-flex flex-column gap-2">{others.map(card)}</div>
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
      </div>
    </div>
  );
}
