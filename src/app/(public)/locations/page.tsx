import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetIndexList from "@/components/AlphabetIndexList";
import VisitedButton from "@/components/VisitedButton";
import { getCurrentUser } from "@/lib/userAuth";
import { PinIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const locations = await prisma.location.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
  });

  const currentUser = await getCurrentUser();
  const visitedIds = new Set<string>();
  if (currentUser && locations.length > 0) {
    const visits = await prisma.locationVisit.findMany({
      where: { userId: currentUser.id, locationId: { in: locations.map((l) => l.id) } },
      select: { locationId: true },
    });
    for (const v of visits) visitedIds.add(v.locationId);
  }

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          Локации
        </h1>
        <Link href="/locations/map" className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2">
          <PinIcon />
          На карте
        </Link>
      </div>

      <NameSearchBox action="/locations" q={q} placeholder="Поиск по названию…" />

      <AlphabetIndexList
        items={locations.map((l) => ({ id: l.id, name: l.name, location: l }))}
        emptyMessage="Пока нет локаций."
        renderItem={({ location: l }) => (
          <div
            key={l.id}
            className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
          >
            <Link
              href={`/locations/${l.id}`}
              className="text-decoration-none d-flex align-items-center gap-3"
              style={{ minWidth: 0 }}
            >
              <div
                style={{
                  width: "2.75rem",
                  height: "2.75rem",
                  borderRadius: "0.5rem",
                  background: "var(--bs-secondary-bg)",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {l.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.photoUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
              </div>
              <span className="font-display fw-medium text-white text-truncate">{l.name}</span>
            </Link>
            <VisitedButton
              locationId={l.id}
              isVisited={visitedIds.has(l.id)}
              className="flex-shrink-0"
            />
          </div>
        )}
      />
    </div>
  );
}
