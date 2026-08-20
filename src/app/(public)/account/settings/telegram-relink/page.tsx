import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { verifyTelegramAuth } from "@/lib/telegram";
import { TELEGRAM_RELINK_COOKIE } from "@/lib/telegramRelink";
import { pageMetadata } from "@/lib/seo";
import { confirmTelegramRelink } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Перенести Telegram",
  description: "Подтверждение переноса Telegram на этот аккаунт.",
  path: "/account/settings/telegram-relink",
  noIndex: true,
});

// Telegram уже привязан к другому аккаунту. Перенос лишает тот аккаунт
// входа, поэтому показываем, что именно будет потеряно, и просим
// подтвердить — вместо молчаливой перезаписи.
export default async function TelegramRelinkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const raw = (await cookies()).get(TELEGRAM_RELINK_COOKIE)?.value;
  if (!raw) redirect("/account/settings");

  const payload = verifyTelegramAuth(new URLSearchParams(raw));
  if (!payload) redirect("/account/settings?telegram=failed");

  const other = await prisma.user.findUnique({
    where: { telegramId: payload.id },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: {
        select: {
          favoriteEvents: true,
          favoritePerformers: true,
          trips: true,
          eventAttendances: true,
        },
      },
    },
  });
  if (!other || other.id === user.id) redirect("/account/settings");

  const counts = [
    { n: other._count.favoritePerformers, label: "любимых артистов" },
    { n: other._count.favoriteEvents, label: "событий в избранном" },
    { n: other._count.eventAttendances, label: "отметок «иду»" },
    { n: other._count.trips, label: "поездок" },
  ].filter((c) => c.n > 0);

  return (
    <div style={{ maxWidth: "40rem" }}>
      <Link href="/account/settings" className="eyebrow text-decoration-none">
        ← Настройки
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "1.75rem" }}>
        Перенести Telegram на этот аккаунт?
      </h1>

      <div className="surface p-4 d-flex flex-column gap-3">
        <p className="mb-0">
          Telegram{payload.username ? ` @${payload.username}` : ""} уже привязан
          к другому аккаунту{other.name ? ` — «${other.name}»` : ""}. Один
          Telegram может принадлежать только одному аккаунту.
        </p>

        <div>
          <p className="fw-medium text-white mb-1">Что произойдёт</p>
          <ul className="text-secondary mb-0 d-flex flex-column gap-1">
            <li>Telegram привяжется к аккаунту, в котором вы сейчас.</li>
            <li>
              Старый аккаунт будет удалён — войти в него больше не получится.
            </li>
            {counts.length > 0 ? (
              <li>
                Вместе с ним пропадут: {counts.map((c) => `${c.n} ${c.label}`).join(", ")}.
              </li>
            ) : (
              <li>Данных в нём нет — терять нечего.</li>
            )}
          </ul>
        </div>

        <div className="d-flex flex-wrap gap-2">
          <form action={confirmTelegramRelink}>
            <button type="submit" className="btn btn-primary">
              Перенести и удалить старый
            </button>
          </form>
          <Link href="/account/settings" className="btn btn-ghost">
            Отмена
          </Link>
        </div>
      </div>
    </div>
  );
}
