import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DramaForm from "../DramaForm";
import { createDrama } from "../actions";
import { loadDramaFilterOptions } from "@/lib/catalogFilters";

export const dynamic = "force-dynamic";

export default async function NewDramaPage() {
  // Каталог локаций комбобокс ищет асинхронно — заранее не грузим.
  // filterOptions — подсказки для полей «Страна» и «Тип записи».
  const [agencies, filterOptions] = await Promise.all([
    prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    }),
    loadDramaFilterOptions(),
  ]);

  return (
    <div>
      <Link href="/admin/dramas" className="eyebrow text-decoration-none">
        ← К списку сериалов
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новый сериал
      </h1>
      <DramaForm
        action={createDrama}
        agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
        locations={[]}
        countryOptions={filterOptions.countries}
        typeOptions={filterOptions.types}
        submitLabel="Создать сериал"
      />
    </div>
  );
}
