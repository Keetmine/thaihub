import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import GameClient from "./GameClient";
import { buildGameRound } from "@/lib/posterGame";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.game.metaTitle,
    description: t.game.metaDescription,
    path: "/game",
    locale,
  });
}

export const dynamic = "force-dynamic";

/**
 * Мини-игра «Угадай сериал по постеру». Страница открыта гостю (см.
 * PUBLIC_PATHS в src/proxy.ts) — это витринная фишка, а не кабинет.
 *
 * Первый раунд собирает сервер: игра начинается сразу, без спиннера на
 * входе. Следующие раунды и проверку ответа клиент берёт экшенами из
 * ./actions.ts — правильный ответ на клиента заранее не уезжает.
 */
export default async function GamePage() {
  const { t, locale } = await getT();
  const round = await buildGameRound(locale);

  return (
    <div>
      <PageHeader eyebrow={t.game.eyebrow} title={t.game.title} watermark="Game" />
      <p className="text-secondary mb-4 mx-auto text-center" style={{ maxWidth: "34rem" }}>
        {t.game.intro}
      </p>
      {round ? (
        <GameClient initialRound={round} />
      ) : (
        <EmptyState
          emoji="🎬"
          title={t.game.emptyTitle}
          hint={t.game.emptyHint}
          cta={{ href: "/dramas", label: t.game.emptyCta }}
        />
      )}
    </div>
  );
}
