import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetIndexList from "@/components/AlphabetIndexList";
import FavoriteButton from "@/components/FavoriteButton";
import { getCurrentUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export default async function AgenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

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

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.5rem" }}>
        Агентства
      </h1>

      <NameSearchBox action="/agencies" q={q} placeholder="Поиск по названию…" />

      <AlphabetIndexList
        items={agencies.map((a) => ({ id: a.id, name: a.name, agency: a }))}
        emptyMessage="Пока нет агентств."
        renderItem={({ agency: a }) => (
          <div
            key={a.id}
            className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
          >
            <Link
              href={`/agencies/${a.id}`}
              className="text-decoration-none d-flex align-items-center gap-3"
              style={{ minWidth: 0 }}
            >
              {a.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
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
                  style={{
                    width: "2.75rem",
                    height: "2.75rem",
                    borderRadius: "50%",
                    background: "var(--bs-secondary-bg)",
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <p className="font-display fw-medium text-white mb-0 text-truncate">{a.name}</p>
                <p className="small text-secondary mb-0">{a._count.performers} исполнит.</p>
              </div>
            </Link>
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
    </div>
  );
}
