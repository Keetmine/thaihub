import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DramasPage() {
  const dramas = await prisma.drama.findMany({
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.5rem" }}>
        Сериалы
      </h1>

      {dramas.length === 0 ? (
        <p className="text-secondary">Пока нет сериалов.</p>
      ) : (
        <div className="row g-3 row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5">
          {dramas.map((d) => (
            <div className="col" key={d.id}>
              <Link
                href={`/dramas/${d.id}`}
                className="surface surface-hover text-decoration-none d-block h-100 overflow-hidden"
              >
                <div
                  style={{
                    aspectRatio: "2 / 3",
                    background: "var(--bs-secondary-bg)",
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
                <div className="p-2">
                  <p className="font-display fw-medium text-white mb-0 small">
                    {d.title}
                  </p>
                  {d.year && (
                    <p className="small text-secondary mb-0">{d.year}</p>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
