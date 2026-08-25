import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFeedICS } from "@/lib/ics";
import { isPremiumActive } from "@/lib/premium";

// Public by design (no session cookie) — calendar apps poll this on their
// own, so the unguessable token in the URL *is* the credential.
//
// Тела ответов английские и языком не управляются: адрес без языкового
// префикса, сессии и своего языка у календарного приложения нет. Это
// служебные строки для того, кто откроет ссылку руками, а не интерфейс.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await prisma.user.findUnique({ where: { icsToken: token } });
  if (!user) {
    return new NextResponse("This link is no longer valid", { status: 404 });
  }
  // Подписка на календарь — часть платного «расписания»: у кого флаг
  // сняли, у того фид перестаёт отдаваться (календарные приложения
  // просто увидят 403 при следующем опросе).
  if (!isPremiumActive(user)) {
    return new NextResponse("Available with a subscription", { status: 403 });
  }

  const attendances = await prisma.eventAttendance.findMany({
    where: { userId: user.id },
    include: { event: true, occurrence: true },
  });
  // «Иду» per-дата: в фид попадают только отмеченные даты события.
  const byEvent = new Map<string, { event: (typeof attendances)[number]["event"] & { occurrences: (typeof attendances)[number]["occurrence"][] } }>();
  for (const a of attendances) {
    const cur = byEvent.get(a.eventId);
    if (cur) cur.event.occurrences.push(a.occurrence);
    else byEvent.set(a.eventId, { event: { ...a.event, occurrences: [a.occurrence] } });
  }
  const events = Array.from(byEvent.values()).map((e) => e.event);

  return new NextResponse(buildFeedICS(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="myblhub-${user.id}.ics"`,
    },
  });
}
