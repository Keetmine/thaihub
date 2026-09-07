import EntityMiniCard from "@/components/EntityMiniCard";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n";
import { communityHref } from "@/lib/slugHelpers";

/**
 * Блок «Сообщества» на странице артиста и сериала (АА25).
 *
 * Это и есть главный смысл привязок: сообщества умирают не от плохого
 * функционала, а оттого, что их никто не находит. Человек пришёл на
 * страницу любимого актёра — и видит «есть сообщество фанатов, 40
 * участников».
 *
 * Компонент один на обе страницы и запрос делает сам, а не принимает
 * готовые строки пропсом. Причина ровно одна, и она важнее удобства:
 * **фильтр `visibility: "PUBLIC"` должен существовать в единственном
 * экземпляре.** Закрытое сообщество прячут затем, чтобы о нём не
 * узнавали со стороны, и обнаружиться через каталог — это ровно то, от
 * чего его закрывали. Две копии запроса на двух страницах однажды
 * разъехались бы, и разъехались бы молча.
 *
 * Место (`country`/`city`) здесь НЕ показывается и в отборе не
 * участвует: у географических сообществ свой путь — фильтр витрины
 * `/communities` (см. docs/features/communities.md).
 */

/** Сколько сообществ показываем. Больше горсти — это уже не подсказка,
 *  а раздел: страница артиста и без того длинная. */
const MAX_SHOWN = 6;

export default async function CommunityTopicBlock({
  performerId,
  dramaId,
}: {
  performerId?: string;
  dramaId?: string;
}) {
  if (!performerId && !dramaId) return null;
  const { t } = await getT();

  const communities = await prisma.community.findMany({
    where: {
      // Приватность — в самом запросе, а не в разметке: закрытое
      // сообщество не должно доезжать даже в пропсы.
      visibility: "PUBLIC",
      topics: { some: performerId ? { performerId } : { dramaId } },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      coverUrl: true,
      _count: { select: { members: { where: { status: "ACTIVE" } } } },
    },
    take: MAX_SHOWN,
  });
  if (communities.length === 0) return null;

  // По числу участников, как на витрине: живое сообщество вперёд.
  // Сортировка в памяти — строк максимум горсть, а orderBy по _count в
  // Prisma считал бы ВСЕХ участников, включая заявки и убранных.
  const rows = [...communities].sort(
    (a, b) => b._count.members - a._count.members || a.title.localeCompare(b.title),
  );

  return (
    <div className="mb-4">
      <h2 className="section-heading mb-2">{t.communities.topics.blockHeading}</h2>
      <div className="d-flex flex-wrap gap-2">
        {rows.map((c) => (
          <EntityMiniCard
            key={c.id}
            href={communityHref(c)}
            photoUrl={c.coverUrl}
            name={c.title}
            subtitle={t.communities.membersCount(c._count.members)}
            round={false}
          />
        ))}
      </div>
    </div>
  );
}
