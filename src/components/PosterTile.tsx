import UploadImage from "@/components/UploadImage";
import AppLink from "@/components/AppLink";
import { EpisodeProgressBar } from "@/components/EpisodeProgress";

/** Постерная карточка (.poster-tile в globals.css): изображение фоном,
 *  текст поверх градиента, опциональный чип в углу. Без постера —
 *  первая буква на тёплом градиенте. */
export default function PosterTile({
  href,
  posterUrl,
  title,
  subtitle,
  chip,
  progress,
}: {
  href: string;
  posterUrl: string | null;
  title: string;
  subtitle?: string | null;
  chip?: string | null;
  /** Прогресс по сериям — тонкая полоса над подписью. Только показ:
   *  вся карточка это ссылка, кнопку внутрь неё класть нельзя. */
  progress?: { watched: number; total: number; label: string } | null;
}) {
  return (
    <AppLink href={href} className="poster-tile">
      {posterUrl ? (
        <UploadImage
          src={posterUrl}
          alt=""
          /* Плитки каталога: на телефоне по две в ряд, на широком —
             около 10rem каждая. */
          sizes="(max-width: 575.98px) 45vw, 10rem"
        />
      ) : (
        <span className="poster-tile-fallback" aria-hidden>
          {title.trim().charAt(0).toUpperCase()}
        </span>
      )}
      {chip && (
        <span className="poster-tile-chip">
          <span className="date-chip">{chip}</span>
        </span>
      )}
      <span className="poster-tile-body">
        {progress && (
          <EpisodeProgressBar
            watched={progress.watched}
            total={progress.total}
            label={progress.label}
          />
        )}
        <span className="font-display fw-medium text-white d-block text-truncate">
          {title}
        </span>
        {subtitle && (
          <span className="small d-block text-truncate" style={{ color: "rgba(255,255,255,0.72)" }}>
            {subtitle}
          </span>
        )}
      </span>
    </AppLink>
  );
}
