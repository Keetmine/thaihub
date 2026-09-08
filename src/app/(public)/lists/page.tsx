import { FREE_PLACE_LIST_LIMIT, isPremiumActive } from "@/lib/premium";
import { WANT_TO_VISIT_TITLE } from "@/lib/systemLists";
import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import CreateListButton from "./CreateListButton";
import PremiumUpsell from "@/components/PremiumUpsell";
import CreateOwnPlaceButton from "./[id]/CreateOwnPlaceButton";
import { createStandalonePlace } from "./actions";
import { listHref, locationHref } from "@/lib/slugHelpers";
import { categoryEmoji } from "@/lib/locationCategories";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref } from "@/lib/i18n";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.lists.places.metaTitle,
    description: t.lists.places.metaDescription,
    path: "/lists",
    noIndex: true,
  });
}


export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  // next — чтобы после входа вернуло сюда же (гейт ловит и протухшую
  // сессию, мимо прокси, который смотрит только наличие куки).
  if (!user) redirect(localeHref("/login?next=/lists", locale));

  // Место — основная сущность раздела, список — необязательная
  // группировка: сначала свои места, ниже подборки из них.
  const [ownPlaces, lists] = await Promise.all([
    prisma.location.findMany({
      where: { createdByUserId: user.id },
      select: {
        id: true,
        name: true,
        slug: true,
        photoUrl: true,
        category: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.placeList.findMany({
      // Только личные списки: список сообщества (`communityId`) ведёт
      // сообщество, а `userId` в нём — просто тот, кто его завёл.
      // Здесь он был бы враньём («мой список», который в любой момент
      // перейдёт другому модератору) и путал бы с личными; его место —
      // на вкладке «Места» самого сообщества.
      where: { userId: user.id, communityId: null },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Досортировываем на нашей стороне: сортировка Postgres зависит от
  // collation базы, и на части систем русские названия из нескольких слов
  // выстраиваются не по алфавиту. Список свой, на одного человека —
  // сортировка в памяти дешевле, чем зависимость от локали сервера.
  const places = ownPlaces.sort((a, b) => a.name.localeCompare(b.name, locale));

  const isEmpty = places.length === 0 && lists.length === 0;
  const canCreate = isPremiumActive(user);
  // Пробный лимит (аудит 2026-09 п.8, решение владельца): бесплатному —
  // ОДИН свой список мест (наполняется каталожными локациями; свои
  // места остаются частью подписки). Списки сообществ сюда не попадают
  // (выборка выше уже с communityId: null), а системный «Хочу посетить»
  // не в счёт: он заводится кнопкой «хочу сюда» в обход гейта (см.
  // toggleWantToVisit в actions.ts) и слот съедать не должен. Тот же
  // подсчёт — в createPlaceList: кнопка правом не является.
  const trialListsUsed = lists.filter((l) => l.title !== WANT_TO_VISIT_TITLE).length;
  const canCreateList = canCreate || trialListsUsed < FREE_PLACE_LIST_LIMIT;

  return (
    <div>
      <PageHeader
        eyebrow={t.lists.eyebrow}
        title={t.lists.places.title}
        size="lg"
        className="mb-5"
      />

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">{t.lists.places.intro}</p>
        {/* Заводить СВОИ места — по подписке (правка владельца
            2026-09-06); уже созданные места и списки остаются на месте
            и работают. Бесплатному — пробный первый список (кнопка
            ниже), а когда он использован — честный апселл: intro
            объясняет, что первый был бесплатным. */}
        {canCreate ? (
          <div className="mb-4">
            <CreateOwnPlaceButton
              action={createStandalonePlace}
              label={t.lists.places.addPlace}
            />
          </div>
        ) : canCreateList ? (
          <div className="mb-4">
            <CreateListButton />
            <p className="small text-secondary mb-0 mt-2">{t.lists.freeFirstListHint}</p>
          </div>
        ) : (
          <div className="mb-4">
            <PremiumUpsell feature={t.lists.paywallFeature} intro={t.lists.freeLimitIntro} />
          </div>
        )}

        {isEmpty ? (
          <EmptyState
            emoji="📍"
            title={t.lists.places.emptyTitle}
            hint={t.lists.places.emptyHint}
            compact
          />
        ) : (
          <>
            {places.length > 0 && (
              <div className="d-flex flex-column gap-2 mb-5">
                {places.map((p) => {
                  const category = p.category ? t.catalog.locationCategory[p.category] : null;
                  const coords =
                    p.latitude != null && p.longitude != null
                      ? `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`
                      : null;
                  const subtitle = [category, coords].filter(Boolean).join(" · ");
                  return (
                    <AppLink
                      key={p.id}
                      href={locationHref(p)}
                      className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3"
                    >
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          loading="lazy"
                          decoding="async"
                          src={p.photoUrl}
                          alt=""
                          style={{
                            width: "3rem",
                            height: "3rem",
                            borderRadius: "0.6rem",
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          className="d-flex align-items-center justify-content-center"
                          style={{
                            width: "3rem",
                            height: "3rem",
                            borderRadius: "0.6rem",
                            background: "var(--bs-secondary-bg)",
                            flexShrink: 0,
                          }}
                          aria-hidden
                        >
                          {categoryEmoji(p.category) ?? "📍"}
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <p className="font-display fw-medium text-white mb-0 text-truncate">
                          {p.name}
                        </p>
                        {subtitle && (
                          <p className="small text-secondary mb-0 text-truncate">{subtitle}</p>
                        )}
                      </div>
                    </AppLink>
                  );
                })}
              </div>
            )}

            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <h2 className="section-heading mb-0">{t.lists.places.listsHeading}</h2>
              {/* canCreateList, а не canCreate: у бесплатного без
                  списков кнопка тоже должна быть — это его пробный. */}
              {canCreateList && <CreateListButton />}
            </div>
            <p className="small text-secondary mb-3">{t.lists.places.listsIntro}</p>

            {lists.length > 0 && (
              <div className="d-flex flex-column gap-2">
                {lists.map((l) => (
                  <AppLink
                    key={l.id}
                    href={listHref(l)}
                    className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
                  >
                    <div style={{ minWidth: 0 }}>
                      <p className="font-display fw-medium text-white mb-0 text-truncate">{l.title}</p>
                      {l.description && (
                        <p className="small text-secondary mb-0 text-truncate">{l.description}</p>
                      )}
                    </div>
                    <span className="small text-secondary text-end flex-shrink-0">
                      {t.lists.places.placeCount(l._count.items)}
                      {l.visibility !== "PRIVATE" && (
                        <span className="d-block" style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                          {t.lists.visibility[l.visibility]}
                        </span>
                      )}
                    </span>
                  </AppLink>
                ))}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
