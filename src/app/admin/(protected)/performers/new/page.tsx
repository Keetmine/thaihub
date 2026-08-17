import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PerformerForm from "../PerformerForm";
import { createPerformer } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPerformerPage() {
  // Тяжёлые каталоги (исполнители/сериалы/события) в комбобоксы не
  // грузятся — они ищутся на сервере по мере ввода (searchOptions).
  const [agencies, pairings] = await Promise.all([
    prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    }),
    // для привязки маскота к пейрингу — список короткий, грузим целиком
    prisma.pairing.findMany({
      include: { performerA: true, performerB: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div>
      <Link href="/admin/performers" className="eyebrow text-decoration-none">
        ← К списку исполнителей
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новый исполнитель
      </h1>

      <PerformerForm
        action={createPerformer}
        submitLabel="Создать исполнителя"
        soloPerformers={[]}
        pairingOptions={pairings.map((p) => ({
          id: p.id,
          name: p.name || `${p.performerA.name} × ${p.performerB.name}`,
        }))}
        agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
        dramas={[]}
        events={[]}
      />
    </div>
  );
}
