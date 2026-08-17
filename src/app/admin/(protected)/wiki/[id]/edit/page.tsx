import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WikiForm from "../../WikiForm";
import { updateWikiArticle } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditWikiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await prisma.wikiArticle.findUnique({ where: { id } });
  if (!article) notFound();

  return (
    <div>
      <Link href="/admin/wiki" className="eyebrow text-decoration-none">
        ← К списку статей
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Редактировать статью
        </h1>
        {article.published && (
          <a
            href={`/wiki/${article.slug ?? article.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            Посмотреть на сайте ↗
          </a>
        )}
      </div>
      <WikiForm
        action={updateWikiArticle.bind(null, article.id)}
        submitLabel="Сохранить"
        defaultValues={{
          title: article.title,
          content: article.content,
          published: article.published,
        }}
      />
    </div>
  );
}
