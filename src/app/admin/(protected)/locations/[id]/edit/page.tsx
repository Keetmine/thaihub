import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { locationHref } from "@/lib/slugHelpers";
import LocationForm from "../../LocationForm";
import { updateLocation, deleteLocation } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) notFound();

  const boundUpdate = updateLocation.bind(null, id);
  const boundDelete = deleteLocation.bind(null, id);

  return (
    <div>
      <Link href="/admin/locations" className="eyebrow text-decoration-none">
        ← К списку локаций
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Редактировать локацию
        </h1>
        <a
          href={locationHref(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          Посмотреть на сайте ↗
        </a>
      </div>
      <div className="d-flex flex-column gap-3">
        <LocationForm
          action={boundUpdate}
          submitLabel="Сохранить изменения"
          defaultValues={{
            name: location.name,
            description: location.description ?? "",
            photoUrl: location.photoUrl ?? "",
            latitude: location.latitude,
            longitude: location.longitude,
          }}
        />
        <ConfirmForm
          action={boundDelete}
          confirmMessage={`Удалить локацию «${location.name}»?`}
          className="pt-2"
        >
          <button type="button" className="btn btn-outline-danger btn-sm">
            Удалить локацию
          </button>
        </ConfirmForm>
      </div>
    </div>
  );
}
