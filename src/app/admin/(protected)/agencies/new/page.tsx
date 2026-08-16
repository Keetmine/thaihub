import Link from "next/link";
import AgencyForm from "../AgencyForm";
import { createAgency } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewAgencyPage() {
  // Каталоги ищутся асинхронно (searchOptions) — заранее ничего не грузим.
  const performers: { id: string; name: string; photoUrl: string | null }[] = [];
  const dramas: { id: string; title: string; posterUrl: string | null }[] = [];

  return (
    <div>
      <Link href="/admin/performers?view=agencies" className="eyebrow text-decoration-none">
        ← К списку агентств
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новое агентство
      </h1>
      <AgencyForm
        action={createAgency}
        submitLabel="Создать агентство"
        performers={performers}
        dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
      />
    </div>
  );
}
