import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEventICS, buildPresaleICS } from "@/lib/ics";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });

  if (!event) {
    return new NextResponse("Событие не найдено", { status: 404 });
  }

  const isPresale = new URL(request.url).searchParams.get("presale") === "1";
  if (isPresale && !event.presaleAt) {
    return new NextResponse("Препродажа не указана", { status: 404 });
  }

  const ics = isPresale
    ? buildPresaleICS({ ...event, presaleAt: event.presaleAt! })
    : buildEventICS(event);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${isPresale ? "presale" : "event"}-${event.id}.ics"`,
    },
  });
}
