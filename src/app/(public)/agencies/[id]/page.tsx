import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import DramaStatusButton from "@/components/DramaStatusButton";
import { getDramaWatchStatuses } from "@/lib/favorites";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { slugOrIdWhere } from "@/lib/slugHelpers";

export const dynamic = "force-dynamic";

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawParam } = await params;

  const agency = await prisma.agency.findFirst({
    where: slugOrIdWhere(rawParam),
    include: {
      performers: { include: { performer: true }, orderBy: { performer: { name: "asc" } } },
      dramas: { orderBy: { title: "asc" } },
    },
  });

  if (!agency) notFound();
  const id = agency.id;

  const performers = agency.performers.map((pa) => pa.performer);

  const currentUser = await getCurrentUser();
  let isFavorited = false;
  const favoritedPerformerIds = new Set<string>();
  if (currentUser) {
    const [favorite, favPerformers] = await Promise.all([
      prisma.favoriteAgency.findUnique({
        where: { userId_agencyId: { userId: currentUser.id, agencyId: id } },
      }),
      performers.length > 0
        ? prisma.favoritePerformer.findMany({
            where: {
              userId: currentUser.id,
              performerId: { in: performers.map((p) => p.id) },
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
      <Link href="/artists?view=agencies" className="eyebrow text-decoration-none">
        ← Все агентства
      </Link>

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
              className="rounded-circle flex-shrink-0"
              style={{ width: "6rem", height: "6rem", background: "var(--bs-secondary-bg)" }}
            />
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

      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        Исполнители
      </h2>
      {performers.length === 0 ? (
        <p className="small text-secondary mb-4">Пока нет исполнителей.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-4">
          {performers.map((p) => (
            <div
              key={p.id}
              className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <Link
                href={performerHref(p)}
                className="text-decoration-none d-flex align-items-center gap-2"
                style={{ minWidth: 0 }}
              >
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photoUrl}
                    alt=""
                    style={{
                      width: "2.25rem",
                      height: "2.25rem",
                      borderRadius: "50%",
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "2.25rem",
                      height: "2.25rem",
                      borderRadius: "50%",
                      background: "var(--bs-secondary-bg)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span className="font-display fw-medium text-white text-truncate">{p.name}</span>
              </Link>
              <FavoriteButton
                kind="performer"
                id={p.id}
                isFavorited={favoritedPerformerIds.has(p.id)}
                variant="icon"
                className="flex-shrink-0"
              />
            </div>
          ))}
        </div>
      )}

      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        Сериалы
      </h2>
      {agency.dramas.length === 0 ? (
        <p className="small text-secondary">Пока нет сериалов.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {agency.dramas.map((d) => (
            <div
              key={d.id}
              className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <Link
                href={dramaHref(d)}
                className="text-decoration-none d-flex align-items-center gap-3"
                style={{ minWidth: 0 }}
              >
                <div
                  style={{
                    width: "2.75rem",
                    height: "3.75rem",
                    borderRadius: "0.5rem",
                    background: "var(--bs-secondary-bg)",
                    flexShrink: 0,
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
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className="font-display fw-medium text-white mb-0 text-truncate">{d.title}</p>
                  {d.year && <p className="small text-secondary mb-0">{d.year}</p>}
                </div>
              </Link>
              <DramaStatusButton
                dramaId={d.id}
                status={statusByDramaId.get(d.id) ?? null}
                className="flex-shrink-0"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
