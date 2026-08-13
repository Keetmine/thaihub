import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEventICS } from "@/lib/ics";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });

  if (!event) {
    return new NextResponse("Событие не найдено", { status: 404 });
  }

  const ics = buildEventICS(event);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-${event.id}.ics"`,
    },
  });
}
