import Link from "next/link";
import { prisma } from "@/lib/prisma";
import TtmImportFlow from "./TtmImportFlow";

export const dynamic = "force-dynamic";

export default async function ImportTtmPage() {
  const [performers, dramas] = await Promise.all([
    prisma.performer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrl: true },
    }),
    prisma.drama.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, posterUrl: true },
    }),
  ]);

  return (
    <div>
      <Link href="/admin" className="eyebrow text-decoration-none">
        ← К списку событий
      </Link>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        Импорт с ThaiTicketMajor
      </h1>
      <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
        Вставьте ссылку на страницу события — подтянем название, место, дату,
        цену и список артистов. Исполнителей с уже существующим ником просто
        привяжем к событию, остальных создадим как новых после вашего
        подтверждения.
      </p>
      <TtmImportFlow
        performers={performers}
        dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
      />
    </div>
  );
}
