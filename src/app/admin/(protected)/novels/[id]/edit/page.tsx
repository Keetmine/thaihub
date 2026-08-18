import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import NovelForm from "../../NovelForm";
import { updateNovel } from "../../actions";
import { novelHref } from "@/lib/slugHelpers";
import AuditTrail from "@/components/admin/AuditTrail";

export const dynamic = "force-dynamic";

export default async function EditNovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const novel = await prisma.novel.findUnique({
    where: { id },
    include: { links: true, dramas: { select: { id: true, title: true, posterUrl: true } } },
  });
  if (!novel) notFound();

  const boundUpdate = updateNovel.bind(null, id);

  return (
    <div>
      <Link href="/admin/novels" className="eyebrow text-decoration-none">
        ← К списку новелл
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Редактировать новеллу
        </h1>
        <a
          href={novelHref(novel)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          Посмотреть на сайте ↗
        </a>
      </div>
      <NovelForm
        action={boundUpdate}
        submitLabel="Сохранить изменения"
        dramas={novel.dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
        defaultDramaIds={novel.dramas.map((d) => d.id)}
        defaultValues={{
          title: novel.title,
          author: novel.author ?? "",
          originalAuthor: novel.originalAuthor ?? "",
          size: novel.size ?? "",
          tags: novel.tags.join(", "),
          coverUrl: novel.coverUrl ?? "",
          description: novel.description ?? "",
          links: novel.links.map((l) => ({ label: l.label, url: l.url })),
        }}
      />
      <div className="mt-4">
        <AuditTrail entityType="Novel" entityId={novel.id} hideWhenEmpty />
      </div>
    </div>
  );
}
