import Link from "next/link";
import PageHeader from "@/components/PageHeader";
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
      <PageHeader eyebrow="Каталог" title="Новеллы" size="lg" className="mb-5" watermark="Novels" />

      <NameSearchBox action="/novels" q={q} placeholder="Поиск по названию или автору…" />

      {novels.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Новеллы скоро появятся."}
        </p>
      ) : (
        /* Постерная сетка — как в каталоге дорам (Э2.4). */
        <div className="poster-grid mt-4">
          {novels.map((n) => (
            <Link key={n.id} href={novelHref(n)} className="text-decoration-none d-block">
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "2 / 3",
                  borderRadius: "0.9rem",
                  background: "var(--bs-secondary-bg)",
                  overflow: "hidden",
                }}
              >
                {n.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async"
                    src={n.coverUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span
                    className="d-flex align-items-center justify-content-center h-100 font-display fw-bold"
                    style={{ fontSize: "2rem", color: "rgba(255,154,114,0.45)" }}
                    aria-hidden
                  >
                    {n.title.charAt(0).toUpperCase()}
                  </span>
                )}
                {n._count.dramas > 0 && (
                  <span
                    className="date-chip position-absolute"
                    style={{ left: "0.5rem", bottom: "0.5rem" }}
                  >
                    📺 {n._count.dramas}
                  </span>
                )}
              </div>
              <p className="small text-white mb-0 mt-2 text-truncate" style={{ lineHeight: 1.3 }}>
                {n.title}
              </p>
              {n.author && (
                <p className="small text-secondary mb-0 text-truncate">{n.author}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
