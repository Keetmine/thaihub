import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEventICS, buildPresaleICS } from "@/lib/ics";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { getT } from "@/lib/i18n";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // События за подпиской — экспорт в календарь тоже (скачивается кнопкой
  // из браузера, кука сессии при этом есть; маршрут остаётся вне
  // login-гейта proxy.ts, но проверяет доступ сам).
  const { t, locale } = await getT();
  const user = await getCurrentUser();
  if (!isPremiumActive(user)) {
    return new NextResponse(t.events.ics.subscriptionOnly, { status: 403 });
  }

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: { occurrences: { orderBy: { startsAt: "asc" } } },
  });

  if (!event) {
    return new NextResponse(t.events.ics.notFound, { status: 404 });
  }

  const isPresale = new URL(request.url).searchParams.get("presale") === "1";
  if (isPresale && !event.presaleAt) {
    return new NextResponse(t.events.ics.noPresale, { status: 404 });
  }

  const ics = isPresale
    ? buildPresaleICS({ ...event, presaleAt: event.presaleAt! }, locale)
    : buildEventICS(event);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${isPresale ? "presale" : "event"}-${event.id}.ics"`,
    },
  });
}
