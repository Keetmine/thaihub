import { isPremiumActive } from "@/lib/premium";
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
  if (!user) redirect(localeHref("/login", locale));

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
      where: { userId: user.id },
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
        {/* Заводить своё — по подписке (правка владельца 2026-09-06);
            уже созданные места и списки остаются на месте и работают,
            платное тут только создание. */}
        {canCreate ? (
          <div className="mb-4">
            <CreateOwnPlaceButton
              action={createStandalonePlace}
              label={t.lists.places.addPlace}
            />
          </div>
        ) : (
          <div className="mb-4">
            <PremiumUpsell feature={t.lists.paywallFeature} />
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
              {canCreate && <CreateListButton />}
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
