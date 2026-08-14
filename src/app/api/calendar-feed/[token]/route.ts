import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFeedICS } from "@/lib/ics";

// Public by design (no session cookie) — calendar apps poll this on their
// own, so the unguessable token in the URL *is* the credential.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await prisma.user.findUnique({ where: { icsToken: token } });
  if (!user) {
    return new NextResponse("Ссылка недействительна", { status: 404 });
  }

  const attendances = await prisma.eventAttendance.findMany({
    where: { userId: user.id },
    include: { event: { include: { occurrences: { orderBy: { startsAt: "asc" } } } } },
  });
  const events = attendances.map((a) => a.event);

  return new NextResponse(buildFeedICS(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="thaihub-${user.id}.ics"`,
    },
  });
}
