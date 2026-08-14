export type SocialPlatform = "instagram" | "tiktok" | "twitter";

const PLATFORM_PATTERNS: Record<SocialPlatform, RegExp> = {
  instagram: /instagram\.com/i,
  tiktok: /tiktok\.com/i,
  twitter: /twitter\.com|x\.com/i,
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "Twitter",
};

/** Recognizes a link's platform from its URL (host, not the free-text
 *  label) — used to pull Instagram/TikTok/Twitter out of the generic
 *  PerformerLink list for the dedicated icon row/form fields, so the same
 *  recognition works regardless of what label an import or admin typed. */
export function detectSocialPlatform(url: string): SocialPlatform | null {
  for (const platform of Object.keys(PLATFORM_PATTERNS) as SocialPlatform[]) {
    if (PLATFORM_PATTERNS[platform].test(url)) return platform;
  }
  return null;
}
