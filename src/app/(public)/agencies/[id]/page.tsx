import Link from "next/link";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import DramaStatusButton from "@/components/DramaStatusButton";
import NameSearchBox from "@/components/NameSearchBox";
import { getDramaWatchStatuses } from "@/lib/favorites";
import { DRAMA_STATUS_LABELS, DRAMA_STATUS_BADGE_CLASS } from "@/lib/dramaStatus";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { agencyHref, slugOrIdWhere } from "@/lib/slugHelpers";

export const dynamic = "force-dynamic";

export default async function AgencyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const [{ id: rawParam }, { tab: rawTab, q: rawQ }] = await Promise.all([
    params,
    searchParams,
  ]);
  const tab = rawTab === "dramas" ? "dramas" : "performers";
  const q = (rawQ ?? "").trim();

  const agency = await prisma.agency.findFirst({
    where: slugOrIdWhere(rawParam),
    include: {
      performers: { include: { performer: true }, orderBy: { performer: { name: "asc" } } },
      dramas: { orderBy: { title: "asc" } },
    },
  });

  if (!agency) notFound();
  const id = agency.id;
  const href = agencyHref(agency);

  const allPerformers = agency.performers.map((pa) => pa.performer);
  // Поиск — только внутри этого агентства: фильтруем уже загруженный
  // ростер/фильмографию (это десятки записей, не каталог).
  const needle = q.toLowerCase();
  const performers = q
    ? allPerformers.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.realName ?? "").toLowerCase().includes(needle),
      )
    : allPerformers;
  const dramas = q
    ? agency.dramas.filter((d) => d.title.toLowerCase().includes(needle))
    : agency.dramas;

  const currentUser = await getCurrentUser();
  let isFavorited = false;
  const favoritedPerformerIds = new Set<string>();
  if (currentUser) {
    const [favorite, favPerformers] = await Promise.all([
      prisma.favoriteAgency.findUnique({
        where: { userId_agencyId: { userId: currentUser.id, agencyId: id } },
      }),
      allPerformers.length > 0
        ? prisma.favoritePerformer.findMany({
            where: {
              userId: currentUser.id,
              performerId: { in: allPerformers.map((p) => p.id) },
            },
            select: { performerId: true },
          })
        : Promise.resolve([]),
    ]);
    isFavorited = !!favorite;
    for (const f of favPerformers) favoritedPerformerIds.add(f.performerId);
  }
  const statusByDramaId = await getDramaWatchStatuses(
    agency.dramas.map((d) => d.id),
    currentUser?.id,
  );

  return (
    <div>
      <BackLink fallbackHref="/artists?view=agencies" fallbackLabel="← Все агентства" />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <div className="d-flex flex-wrap align-items-center gap-4">
          {agency.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agency.logoUrl}
              alt={agency.name}
              className="rounded-circle flex-shrink-0"
              style={{ width: "6rem", height: "6rem", objectFit: "cover" }}
            />
          ) : (
            <div
              className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fs-2 fw-semibold"
              style={{
                width: "6rem",
                height: "6rem",
                background: "var(--bs-secondary-bg)",
                color: "var(--bs-secondary-color)",
                opacity: 0.7,
              }}
            >
              {agency.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
            {agency.name}
          </h1>
        </div>
        <FavoriteButton kind="agency" id={agency.id} isFavorited={isFavorited} variant="icon" />
      </div>

      {agency.description && (
        <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
          {agency.description}
        </p>
      )}

      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={q ? `${href}?q=${encodeURIComponent(q)}` : href}
            prefetch={false}
            className={`tab-bar-item ${tab === "performers" ? "active" : ""}`}
          >
            Исполнители ({allPerformers.length})
          </Link>
          <Link
            href={`${href}?tab=dramas${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className={`tab-bar-item ${tab === "dramas" ? "active" : ""}`}
          >
            Сериалы ({agency.dramas.length})
          </Link>
        </div>
        <NameSearchBox
          action={href}
          q={q}
          hiddenFields={tab === "dramas" ? { tab } : undefined}
          placeholder={tab === "dramas" ? "Поиск по названию…" : "Поиск по имени…"}
          className=""
        />
      </div>

      {tab === "performers" ? (
        performers.length === 0 ? (
          <p className="small text-secondary mb-4">
            {q ? "Никого не нашлось." : "Пока нет исполнителей."}
          </p>
        ) : (
          // Компактная сетка карточек (как постеры сериалов на странице
          // актёра) вместо списка на всю ширину — исполнителей у агентства
          // бывает много, а в строке была только аватарка и имя.
          <div
            className="d-flex flex-wrap gap-3 mb-4 scroll-list thin-scroll"
            style={{ maxHeight: "38rem" }}
          >
            {performers.map((p) => (
              <div
                key={p.id}
                className="flex-shrink-0"
                style={{ width: "8.5rem", position: "relative" }}
              >
                <Link href={performerHref(p)} className="text-decoration-none d-block">
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: "0.5rem",
                      background: "var(--bs-secondary-bg)",
                      overflow: "hidden",
                    }}
                  >
                    {p.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photoUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                  </div>
                  <p className="small text-white mb-0 mt-2" style={{ lineHeight: 1.3 }}>
                    {p.name}
                  </p>
                  {p.realName && (
                    <p className="small text-secondary mb-0" style={{ lineHeight: 1.3 }}>
                      ({p.realName})
                    </p>
                  )}
                </Link>
                <div className="position-absolute" style={{ top: "0.375rem", right: "0.375rem" }}>
                  <FavoriteButton
                    kind="performer"
                    id={p.id}
                    isFavorited={favoritedPerformerIds.has(p.id)}
                    variant="icon"
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : dramas.length === 0 ? (
        <p className="small text-secondary">
          {q ? "Ничего не нашлось." : "Пока нет сериалов."}
        </p>
      ) : (
        // Тот же формат постер-карточек, что и в фильмографии актёра.
        <div className="d-flex flex-wrap gap-3">
          {dramas.map((d) => (
            <div
              key={d.id}
              className="flex-shrink-0"
              style={{ width: "8.5rem", position: "relative" }}
            >
              <Link href={dramaHref(d)} className="text-decoration-none d-block">
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "2 / 3",
                    borderRadius: "0.5rem",
                    background: "var(--bs-secondary-bg)",
                    overflow: "hidden",
                  }}
                >
                  {d.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.posterUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                  {d.status === "RETURNING_SERIES" && (
                    <span
                      className={`badge rounded-pill ${DRAMA_STATUS_BADGE_CLASS.RETURNING_SERIES}`}
                      style={{ position: "absolute", top: "0.375rem", left: "0.375rem", fontSize: "0.6rem" }}
                    >
                      {DRAMA_STATUS_LABELS.RETURNING_SERIES}
                    </span>
                  )}
                </div>
                <p className="small text-white mb-0 mt-2" style={{ lineHeight: 1.3 }}>
                  {d.title}
                </p>
                {d.year && <p className="small text-secondary mb-0">{d.year}</p>}
              </Link>
              <div className="position-absolute" style={{ top: "0.375rem", right: "0.375rem" }}>
                <DramaStatusButton
                  dramaId={d.id}
                  status={statusByDramaId.get(d.id) ?? null}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
