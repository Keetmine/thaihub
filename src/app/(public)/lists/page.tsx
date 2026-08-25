import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import CreateListButton from "./CreateListButton";
import CreateOwnPlaceButton from "./[id]/CreateOwnPlaceButton";
import { createStandalonePlace } from "./actions";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";
import { listHref, locationHref } from "@/lib/slugHelpers";
import { categoryEmoji, categoryLabel } from "@/lib/locationCategories";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Мои места",
  description:
    "Свои места в Таиланде: кафе и точки съёмок из сериалов, куда хочется дойти. Место можно добавить само по себе, а списком — сгруппировать подборку и открыть её друзьям.",
  path: "/lists",
  noIndex: true,
});


export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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
  const places = ownPlaces.sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const isEmpty = places.length === 0 && lists.length === 0;

  return (
    <div>
      <PageHeader eyebrow="Планирование" title="Мои места" size="lg" className="mb-5" />

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">
          Сохраняйте места, куда хочется дойти: кафе, точки съёмок из сериалов,
          магазины. Место живёт само по себе — список нужен, только если хочется
          собрать из мест подборку.
        </p>
        <div className="mb-4">
          <CreateOwnPlaceButton action={createStandalonePlace} label="+ Добавить место" />
        </div>

        {isEmpty ? (
          <EmptyState
            emoji="📍"
            title="Пока нет ни одного места"
            hint="Добавьте первое место: по ссылке из Google Карт оно сразу встанет на карту. Списки понадобятся позже — когда захочется сгруппировать места и поделиться подборкой."
            compact
          />
        ) : (
          <>
            {places.length > 0 && (
              <div className="d-flex flex-column gap-2 mb-5">
                {places.map((p) => {
                  const category = categoryLabel(p.category);
                  const coords =
                    p.latitude != null && p.longitude != null
                      ? `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`
                      : null;
                  const subtitle = [category, coords].filter(Boolean).join(" · ");
                  return (
                    <Link
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
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <h2 className="section-heading mb-0">Списки</h2>
              <CreateListButton />
            </div>
            <p className="small text-secondary mb-3">
              Список — способ сгруппировать места и поделиться подборкой: открыть
              её друзьям или прикрепить к поездке.
            </p>

            {lists.length > 0 && (
              <div className="d-flex flex-column gap-2">
                {lists.map((l) => (
                  <Link
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
                      {l._count.items} мест
                      {l.visibility !== "PRIVATE" && (
                        <span className="d-block" style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                          {VISIBILITY_LABELS[l.visibility]}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
