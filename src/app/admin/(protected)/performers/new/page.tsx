import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PerformerForm from "../PerformerForm";
import { createPerformer } from "../actions";

export const dynamic = "force-dynamic";

const TYPE_TITLES: Record<string, string> = {
  SOLO: "Новый исполнитель",
  BAND: "Новая группа",
  MASCOT: "Новый маскот",
};

export default async function NewPerformerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; view?: string }>;
}) {
  // Тип задан разделом, из которого пришли («+ Добавить…» в списках
  // групп и маскотов ведёт сюда с ?type=): селекта типа при создании
  // нет (правка владельца 2026-09-26).
  const { type: rawType, view } = await searchParams;
  const type = rawType === "BAND" || rawType === "MASCOT" ? rawType : "SOLO";
  // ?view — для подсветки «Группы»/«Маскоты» в меню, как на правке.
  const expectedView = type === "BAND" ? "bands" : type === "MASCOT" ? "mascots" : null;
  if ((view ?? null) !== expectedView) {
    redirect(`/admin/performers/new${type === "SOLO" ? "" : `?type=${type}&view=${expectedView}`}`);
  }
  // Тяжёлые каталоги (исполнители/сериалы/события) в комбобоксы не
  // грузятся — они ищутся на сервере по мере ввода (searchOptions).
  const agencies = await prisma.agency.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, logoUrl: true },
  });

  return (
    <div>
      <Link
        href={expectedView ? `/admin/performers?view=${expectedView}` : "/admin/performers"}
        className="eyebrow text-decoration-none"
      >
        {type === "BAND" ? "← К списку групп" : type === "MASCOT" ? "← К списку маскотов" : "← К списку исполнителей"}
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        {TYPE_TITLES[type]}
      </h1>

      <PerformerForm
        action={createPerformer}
        initialType={type}
        submitLabel={type === "BAND" ? "Создать группу" : type === "MASCOT" ? "Создать маскота" : "Создать исполнителя"}
        soloPerformers={[]}
        agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
        dramas={[]}
        events={[]}
      />
    </div>
  );
}
