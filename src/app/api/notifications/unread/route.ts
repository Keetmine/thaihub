import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/userAuth";
import { unreadNotificationCount } from "@/lib/notifications";

// Счётчик непрочитанного для живого обновления колокольчика: страница
// рендерит число один раз, а NotificationBell дальше опрашивает этот
// роут (Ж8). Без сессии отдаём 0, а не 401 — колокольчик у гостей всё
// равно не рендерится, и лишний шум в консоли ни к чему.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const unread = user ? await unreadNotificationCount(user.id) : 0;
  return NextResponse.json(
    { unread },
    { headers: { "Cache-Control": "no-store" } },
  );
}
