import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getT, localeHref } from "@/lib/i18n";
import { markNotificationRead } from "../../actions";

export const dynamic = "force-dynamic";

/**
 * Перевалочный маршрут клика по уведомлению: отмечает его прочитанным и
 * передаёт дальше по `href`. Отдельная страница, а не onClick в ленте,
 * потому что так пометка не зависит от JS вовсе — обычный переход по
 * ссылке с редиректом, RSC-лента остаётся без клиентских обёрток, и к
 * приходу на целевую страницу пометка уже в базе — счётчик на
 * колокольчике при смене маршрута сразу видит новое число, без гонки с
 * fire-and-forget запросом.
 *
 * В ленте сюда ведут ТОЛЬКО непрочитанные строки (прочитанные — прямой
 * ссылкой), и обязательно с prefetch={false}: префетч этой страницы
 * отметил бы уведомление прочитанным без клика.
 *
 * Никакой разметки у страницы нет — она всегда редиректит: чужое или
 * исчезнувшее уведомление молча возвращает в ленту, как и строка без
 * `href` (та приходит сюда ради самой пометки).
 */
export default async function NotificationGoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  const { id } = await params;

  const n = await prisma.notification.findFirst({
    // Владелец — прямо в where: чужое уведомление неотличимо от
    // несуществующего, и по id нельзя узнать даже того, что оно есть.
    where: { id, userId: user.id },
    select: { href: true, readAt: true },
  });

  // Прочитанное не трогаем (лишний UPDATE), хотя штатно прочитанные
  // сюда и не ведут — только если человек вернулся по истории браузера.
  if (n && !n.readAt) await markNotificationRead(id);

  // href пишет только наш код и только внутренними путями, но проверка
  // дешёвая: во внешний открытый редирект через свою же базу не ходим.
  const target =
    n?.href && n.href.startsWith("/") && !n.href.startsWith("//")
      ? n.href
      : "/notifications";
  redirect(localeHref(target, locale));
}
