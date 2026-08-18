import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import { novelHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Новеллы",
  description:
    "Новеллы, по которым сняты тайские BL-сериалы: авторы, описания и экранизации.",
  path: "/novels",
});


export const dynamic = "force-dynamic";

export default async function NovelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const novels = await prisma.novel.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { author: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { _count: { select: { dramas: true } } },
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
        Новеллы
      </h1>

      <NameSearchBox action="/novels" q={q} placeholder="Поиск по названию или автору…" />

      {novels.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Новеллы скоро появятся."}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {novels.map((n) => (
            <Link
              key={n.id}
              href={novelHref(n)}
              className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3"
            >
              <div
                className="d-flex align-items-center justify-content-center flex-shrink-0"
                style={{
                  width: "2.75rem",
                  height: "3.75rem",
                  borderRadius: "0.5rem",
                  background: "var(--bs-secondary-bg)",
                  overflow: "hidden",
                  color: "var(--bs-secondary-color)",
                }}
              >
                {n.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.coverUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span className="fw-semibold" style={{ opacity: 0.6 }}>
                    {n.title.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="font-display fw-medium text-white mb-0 text-truncate">{n.title}</p>
                <p className="small text-secondary mb-0">
                  {[n.author, n._count.dramas > 0 ? `экранизаций: ${n._count.dramas}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
