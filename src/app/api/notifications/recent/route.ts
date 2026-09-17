import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/userAuth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, getDict, isLocale } from "@/lib/i18n";
import { notificationTitle } from "@/lib/notificationText";
import { notificationIcon } from "@/lib/notificationIcons";

/** Сколько строк показывает выпадающий блок у колокольчика. */
const RECENT_LIMIT = 6;

/** Строка выпадающего блока — уже с собранным заголовком на языке
 *  читателя (заголовки собираются при чтении, см. notificationText). */
export type RecentNotification = {
  id: string;
  icon: string;
  title: string;
  body: string | null;
  /** Цель уведомления. Непрочитанную строку клиент ведёт через
   *  /notifications/go/[id] (пометка без JS, как в ленте), прочитанную —
   *  сюда напрямую. */
  href: string | null;
  read: boolean;
  createdAt: string;
  actor: { name: string | null; photoUrl: string | null } | null;
};

// Последние уведомления для выпадающего блока у колокольчика
// (правка владельца 2026-09-17: «показывается выпадающий блок, где
// выводятся n уведомлений»). Гостю — пустой список, как и счётчик.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  // Язык — параметром от клиента: у /api/… нет языкового префикса, и
  // заголовок локали от прокси здесь всегда английский. Колокольчик
  // знает язык страницы и передаёт его сам.
  const wanted = request.nextUrl.searchParams.get("locale");
  const t = getDict(isLocale(wanted) ? wanted : DEFAULT_LOCALE);
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    include: { actor: { select: { name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
  });
  const items: RecentNotification[] = rows.map((n) => ({
    id: n.id,
    icon: notificationIcon(n.kind),
    title: notificationTitle(n, t),
    body: n.body,
    href: n.href,
    read: !!n.readAt,
    createdAt: n.createdAt.toISOString(),
    actor: n.actor,
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
