import AppLink from "@/components/AppLink";
import LetterAvatar from "@/components/LetterAvatar";
import { performerHref } from "@/lib/performerSlug";
import type { NewsItem } from "@/lib/whatsNew";
import type { Dict } from "@/lib/i18n";

/** «Сингл · 2025» под названием релиза: тип (у отдельной песни — просто
 *  «песня») и год, если он известен. */
function releaseSubtitle(item: NewsItem, t: Dict): string {
  const kind = item.albumType ? t.catalog.albumType[item.albumType] : t.catalog.songType;
  return [kind, item.year].filter(Boolean).join(" · ");
}

/**
 * Карточка музыкального релиза — обложка, название, артист-ссылка,
 * тип/год и кнопка «Слушать». Общая для ленты «Что нового» на главной
 * и витрины релизов /music: выглядеть новинка должна одинаково, где бы
 * ни встретилась.
 */
export default function MusicReleaseCard({ item, t }: { item: NewsItem; t: Dict }) {
  return (
    <div className="surface surface-hover d-flex align-items-center gap-3 p-3 h-100">
      <LetterAvatar
        name={item.title}
        photoUrl={item.coverUrl ?? item.performer.photoUrl}
        size={4}
        rounded={false}
      />
      <div style={{ minWidth: 0 }} className="flex-grow-1">
        <span className="text-white d-block text-truncate">{item.title}</span>
        <AppLink
          href={performerHref(item.performer)}
          className="small text-secondary text-decoration-none d-block text-truncate"
        >
          {item.performer.name}
        </AppLink>
        <span className="small text-secondary">{releaseSubtitle(item, t)}</span>
      </div>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm flex-shrink-0"
        >
          {t.home.listen}
        </a>
      )}
    </div>
  );
}
