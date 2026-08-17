import {
  InstagramIcon,
  TikTokIcon,
  TwitterIcon,
  MyDramaListIcon,
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
} from "@/components/icons";
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/socialLinks";

type Platform = SocialPlatform | "mydramalist";

const PLATFORM_ICONS: Record<Platform, React.ComponentType> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  twitter: TwitterIcon,
  spotify: SpotifyIcon,
  applemusic: AppleMusicIcon,
  youtube: YouTubeIcon,
  mydramalist: MyDramaListIcon,
};

const PLATFORM_LABELS: Record<Platform, string> = {
  ...SOCIAL_PLATFORM_LABELS,
  mydramalist: "MyDramaList",
};

/** Branded icon-only buttons for the handful of platforms MyBLHub
 *  recognizes (Instagram/TikTok/Twitter by URL, MyDramaList from its own
 *  field) — everything else stays a labeled text pill, rendered by the
 *  caller from whatever PerformerLink rows this filtered out. */
export default function SocialLinkIcons({
  items,
  className = "",
}: {
  items: { platform: Platform; url: string }[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={`d-flex flex-wrap gap-2 ${className}`}>
      {items.map(({ platform, url }) => {
        const Icon = PLATFORM_ICONS[platform];
        const label = PLATFORM_LABELS[platform];
        return (
          <a
            key={platform}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-btn"
            aria-label={label}
            data-tooltip={label}
          >
            <Icon />
          </a>
        );
      })}
    </div>
  );
}
