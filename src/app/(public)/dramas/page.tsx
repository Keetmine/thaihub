import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetIndexList from "@/components/AlphabetIndexList";

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
          <Link
            key={d.id}
            href={`/dramas/${d.id}`}
            className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3"
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
            <div>
              <p className="font-display fw-medium text-white mb-0">{d.title}</p>
              {d.year && <p className="small text-secondary mb-0">{d.year}</p>}
            </div>
          </Link>
        )}
      />
    </div>
  );
}
