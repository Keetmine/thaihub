import { permanentRedirect, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import { getT, localeHref } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Кабинет объединён с публичным профилем: /users/[id] — единая страница
 * и для себя, и для зрителей (см. users/[id]/page.tsx). Здесь остался
 * permanent redirect, чтобы сохранённые ссылки продолжали работать:
 * /account?tab=stats → соответствующая вкладка профиля; аноним с
 * /account — на /login, как раньше. /account/settings остаётся
 * отдельным адресом.
 *
 * Ответ у force-dynamic страницы уходит с no-store, поэтому браузер не
 * закеширует 308 на профиль конкретного пользователя.
 */
const TAB_MAP: Record<string, string> = {
  profile: "overview",
  stats: "stats",
  events: "events",
  reviews: "reviews",
  tickets: "tickets",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await getT();
  const user = await getCurrentUser();
  if (!user) {
    redirect(localeHref("/login", locale));
  }

  const { tab } = await searchParams;
  const mapped = tab ? TAB_MAP[tab] : undefined;
  const target = `/users/${user.username ?? user.id}${mapped ? `?tab=${mapped}` : ""}`;
  permanentRedirect(localeHref(target, locale));
}
