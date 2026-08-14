import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetIndexList from "@/components/AlphabetIndexList";
import FavoriteButton from "@/components/FavoriteButton";
import { getCurrentUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export default async function DramasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const dramas = await prisma.drama.findMany({
    where: q ? { title: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { title: "asc" },
  });

  const currentUser = await getCurrentUser();
  const favoritedIds = new Set<string>();
  if (currentUser && dramas.length > 0) {
    const favorites = await prisma.favoriteDrama.findMany({
      where: { userId: currentUser.id, dramaId: { in: dramas.map((d) => d.id) } },
      select: { dramaId: true },
    });
    for (const f of favorites) favoritedIds.add(f.dramaId);
  }

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.5rem" }}>
        Сериалы
      </h1>

      <NameSearchBox action="/dramas" q={q} placeholder="Поиск по названию…" />

      <AlphabetIndexList
        items={dramas.map((d) => ({ id: d.id, name: d.title, drama: d }))}
        emptyMessage="Пока нет сериалов."
        renderItem={({ drama: d }) => (
          <div
            key={d.id}
            className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
          >
            <Link
              href={`/dramas/${d.id}`}
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
            <FavoriteButton
              kind="drama"
              id={d.id}
              isFavorited={favoritedIds.has(d.id)}
              variant="icon"
              className="flex-shrink-0"
            />
          </div>
        )}
      />
    </div>
  );
}
