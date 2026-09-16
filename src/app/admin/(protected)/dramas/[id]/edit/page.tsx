import Link from "next/link";
import SavedBanner from "@/components/admin/SavedBanner";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dramaHref } from "@/lib/dramaSlug";
import DramaForm from "../../DramaForm";
import { updateDrama, deleteDrama } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";
import AuditTrail from "@/components/admin/AuditTrail";
import TranslationEditor from "@/components/admin/TranslationEditor";
import EntityTabs from "@/components/admin/EntityTabs";
import { loadDramaFilterOptions } from "@/lib/catalogFilters";

export const dynamic = "force-dynamic";

export default async function EditDramaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  // Подсказки для полей «Страна» и «Тип записи» — те же значения, по
  // которым фильтруется публичный каталог (кэш на полчаса, тег catalog).
  const [drama, agencies, filterOptions] = await Promise.all([
    prisma.drama.findUnique({
      where: { id },
      include: {
        performers: { include: { performer: true } },
        locations: { select: { location: { select: { id: true, name: true, photoUrl: true } } } },
        novel: { select: { id: true, title: true, coverUrl: true } },
        agencies: { select: { agencyId: true } },
      },
    }),
    prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    }),
    loadDramaFilterOptions(),
  ]);

  if (!drama) notFound();

  const boundUpdate = updateDrama.bind(null, id);
  const boundDelete = deleteDrama.bind(null, id);

  return (
    <div>
      <Link href="/admin/dramas" className="eyebrow text-decoration-none">
        ← К списку сериалов
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Редактировать сериал
        </h1>
        <a
          href={dramaHref(drama)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          Посмотреть на сайте ↗
        </a>
      </div>
      {saved === "1" && <SavedBanner />}
      {/* Вкладки «Запись / Перевод / История» — одинаково у всех
          сущностей каталога (правка владельца 2026-09-10). Русские
          название и описание уехали во вкладку «Перевод»: они лежат
          колонками titleRu/synopsisRu, но форма у них общая со всеми
          остальными сущностями. */}
      <EntityTabs
        tabs={[
          {
            key: "record",
            label: "Запись",
            content: (
              <>
          <DramaForm
            action={boundUpdate}
            agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
            locations={drama.locations.map((dl) => dl.location)}
            novels={drama.novel ? [{ id: drama.novel.id, name: drama.novel.title, photoUrl: drama.novel.coverUrl }] : []}
            defaultLocationIds={drama.locations.map((dl) => dl.location.id)}
            countryOptions={filterOptions.countries}
            typeOptions={filterOptions.types}
            submitLabel="Сохранить изменения"
            defaultValues={{
              title: drama.title,
              year: drama.year ? String(drama.year) : "",
              posterUrl: drama.posterUrl ?? "",
              synopsis: drama.synopsis ?? "",
              mydramalistUrl: drama.mydramalistUrl ?? "",
              doramalandUrl: drama.doramalandUrl ?? "",
              agencyIds: drama.agencies.map((a) => a.agencyId),
              novelId: drama.novelId ?? "",
              nativeTitle: drama.nativeTitle ?? "",
              alsoKnownAs: drama.alsoKnownAs ?? "",
              director: drama.director ?? "",
              screenwriter: drama.screenwriter ?? "",
              genres: drama.genres.join(", "),
              tags: drama.tags.join(", "),
              episodes: drama.episodes != null ? String(drama.episodes) : "",
              airedOn: drama.airedOn ?? "",
              duration: drama.duration ?? "",
              contentRating: drama.contentRating ?? "",
              network: drama.network ?? "",
              status: drama.status ?? "",
              country: drama.country ?? "",
              type: drama.type ?? "",
              cast: drama.performers.map((p) => ({
                id: p.performerId,
                name: p.performer.name,
                photoUrl: p.performer.photoUrl,
                role: p.role ?? "",
              })),
            }}
          />

          <ConfirmForm
            action={boundDelete}
            confirmMessage={`Удалить сериал «${drama.title}»?`}
            className="mt-4 pt-4"
          >
            <button type="button" className="btn btn-outline-danger btn-sm">
              Удалить сериал
            </button>
          </ConfirmForm>
              </>
            ),
          },
          {
            key: "translation",
            label: "Перевод",
            content: (
              <TranslationEditor
                entity="drama"
                id={drama.id}
                original={{ title: drama.title, synopsis: drama.synopsis }}
                values={{ title: drama.titleRu, synopsis: drama.synopsisRu }}
              />
            ),
          },
          {
            key: "history",
            label: "История",
            content: <AuditTrail entityType="Drama" entityId={drama.id} />,
          },
        ]}
      />
    </div>
  );
}
