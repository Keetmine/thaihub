import Link from "next/link";
import SavedBanner from "@/components/admin/SavedBanner";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import NovelForm from "../../NovelForm";
import { updateNovel } from "../../actions";
import { novelHref } from "@/lib/slugHelpers";
import AuditTrail from "@/components/admin/AuditTrail";
import TranslationEditor from "@/components/admin/TranslationEditor";

export const dynamic = "force-dynamic";

export default async function EditNovelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
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
      {saved === "1" && <SavedBanner />}
      <NovelForm
        action={boundUpdate}
        submitLabel="Сохранить изменения"
        dramas={novel.dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
        defaultDramaIds={novel.dramas.map((d) => d.id)}
        defaultValues={{
          title: novel.title,
          ficbookUrl: novel.ficbookUrl ?? "",
          author: novel.author ?? "",
          originalAuthor: novel.originalAuthor ?? "",
          size: novel.size ?? "",
          tags: novel.tags.join(", "),
          coverUrl: novel.coverUrl ?? "",
          description: novel.description ?? "",
          links: novel.links.map((l) => ({ label: l.label, url: l.url })),
        }}
      />
      {/* Перевод на русский — отдельным блоком со своей формой:
          сохранять перевод, проходя валидацию всей карточки, не нужно
          (правка владельца 2026-09-10). */}
      <div className="mt-4">
        <TranslationEditor
          entity="novel"
          id={novel.id}
          original={{
title: novel.title,
            description: novel.description,
          }}
          translations={novel.translations}
        />
      </div>
      <div className="mt-4">
        <AuditTrail entityType="Novel" entityId={novel.id} hideWhenEmpty />
      </div>
    </div>
  );
}
