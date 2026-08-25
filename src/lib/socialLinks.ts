export type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "twitter"
  | "spotify"
  | "applemusic"
  | "youtube";

const PLATFORM_PATTERNS: Record<SocialPlatform, RegExp> = {
  instagram: /instagram\.com/i,
  tiktok: /tiktok\.com/i,
  twitter: /twitter\.com|x\.com/i,
  spotify: /open\.spotify\.com/i,
  applemusic: /music\.apple\.com/i,
  youtube: /youtube\.com|youtu\.be/i,
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "Twitter",
  spotify: "Spotify",
  applemusic: "Apple Music",
  youtube: "YouTube",
};

/**
 * Ключ «это один и тот же адрес»: схема, `www.`, хвостовой слеш,
 * query и якорь отбрасываются, регистр гасится. Нужен, чтобы
 * `https://www.instagram.com/ppoohkt/` и `https://instagram.com/ppoohkt`
 * не превращались в две ссылки на один и тот же профиль — импорт и
 * форма сравнивали адреса буквально, и у артистов копились дубли.
 * Для twitter.com/x.com даём общий ключ: это один аккаунт.
 */
export function socialLinkKey(url: string): string {
  const raw = url.trim();
  let host = "";
  let path = "";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    path = u.pathname;
  } catch {
    // Не разобрали — работаем со строкой как есть.
    const cleaned = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    const slash = cleaned.indexOf("/");
    host = (slash === -1 ? cleaned : cleaned.slice(0, slash)).toLowerCase();
    path = slash === -1 ? "" : cleaned.slice(slash);
  }
  if (host === "twitter.com" || host === "x.com") host = "x.com";
  path = path.replace(/\/+$/, "").toLowerCase();
  return `${host}${path}`;
}

/** Recognizes a link's platform from its URL (host, not the free-text
 *  label) — used to pull Instagram/TikTok/Twitter/музплощадки out of the
 *  generic PerformerLink list for the dedicated icon row/form fields, so
 *  the same recognition works regardless of what label an import or admin
 *  typed. */
export function detectSocialPlatform(url: string): SocialPlatform | null {
  for (const platform of Object.keys(PLATFORM_PATTERNS) as SocialPlatform[]) {
    if (PLATFORM_PATTERNS[platform].test(url)) return platform;
  }
  return null;
}
