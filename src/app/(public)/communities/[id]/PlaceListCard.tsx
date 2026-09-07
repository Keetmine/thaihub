import AppLink from "@/components/AppLink";
import { getT } from "@/lib/i18n";
import { listHref } from "@/lib/slugHelpers";
import type { TripVisibility } from "@/generated/prisma/client";

/**
 * Карточка СПИСКА мест сообщества — во вкладке «Места» и в каталоге
 * локаций.
 *
 * Разметка та же, что у карточки списка в разделе «Мои места»
 * (`/lists`): плашка `surface surface-hover`, слева название и описание,
 * справа счёт мест и кто список видит. Своей вёрстки у списка
 * сообщества больше нет намеренно — список один и тот же, и выглядеть
 * он должен одинаково, где бы ни показывался (правка владельца
 * 2026-09-09: «сделай, как соседние блоки»).
 *
 * Ссылкой служит ВСЯ карточка, а название — её видимая часть: строки
 * «Открыть список →» под карточкой больше нет. Она повторяла ссылку,
 * которой уже был заголовок, и была единственным местом на сайте, где
 * карточку открывали подписью снизу.
 *
 * Поэтому же внутри карточки нет ссылок на сами места: вложенная ссылка
 * в ссылке — невалидная разметка. Места видны на карте над списками и на
 * странице самого списка.
 */
export default async function PlaceListCard({
  list,
  placeCount,
  communityTitle,
}: {
  list: {
    id: string;
    slug: string | null;
    title: string;
    description: string | null;
    visibility: TripVisibility;
  };
  placeCount: number;
  /** Чей это список — нужно там, где списки разных сообществ вперемешку
   *  (каталог локаций). Во вкладке самого сообщества и так понятно. */
  communityTitle?: string | null;
}) {
  const { t } = await getT();
  const s = t.communities.places;

  return (
    <AppLink
      href={listHref(list)}
      className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
    >
      <div style={{ minWidth: 0 }}>
        <p className="font-display fw-medium text-white mb-0 text-truncate">{list.title}</p>
        {communityTitle && (
          <p className="small text-secondary mb-0 text-truncate">
            {s.ofCommunity(communityTitle)}
          </p>
        )}
        {list.description && (
          <p className="small text-secondary mb-0 text-truncate">{list.description}</p>
        )}
      </div>
      <span className="small text-secondary text-end flex-shrink-0">
        {t.lists.places.placeCount(placeCount)}
        {/* Видимость видна всем участникам, а не только тем, кто её
            меняет: по открытому списку люди должны понимать, что он ушёл
            наружу. */}
        <span className="d-block" style={{ fontSize: "0.7rem", opacity: 0.7 }}>
          {list.visibility === "PUBLIC" ? s.openToEveryone : s.membersOnly}
        </span>
      </span>
    </AppLink>
  );
}
