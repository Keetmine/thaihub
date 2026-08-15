// Scraper for CHANGE 2561's own artist roster
// (change2561.com/changeartist). Unlike memindy.com/drama.fandom.com,
// this needs no browser at all — the listing page's artist cards are
// server-rendered (their `data-key` ids are right there in the raw
// HTML), and each artist's full profile is a clean JSON endpoint
// (`/changeartist/getModel/{id}`, the same one the site's own "click a
// card to open a modal" UI calls) that plain `fetch` reaches directly.
// Names come back in both Thai and English (`name_th`/`name_en`); this
// always prefers `_en`. Productions aren't scraped from here at all —
// this agency's dramas come from its Wikipedia page instead (see
// change2561Import.ts), since this site's own "works" listing mixes
// dramas together with music videos/ad campaigns under labels that
// don't cleanly separate by a stable marker.

const UA = "MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";
const LIST_URL = "https://www.change2561.com/changeartist";

export async function fetchChange2561ArtistIds(): Promise<string[]> {
  const res = await fetch(LIST_URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`CHANGE 2561 artist list -> HTTP ${res.status}`);
  const html = await res.text();
  const ids = new Set<string>();
  for (const match of html.matchAll(/data-key="(\d+)"/g)) ids.add(match[1]);
  return [...ids];
}

export type Change2561Artist = {
  fullName: string;
  nickname: string;
  socialLinks: { label: string; url: string }[];
};

export async function fetchChange2561Artist(id: string): Promise<Change2561Artist | null> {
  const res = await fetch(`https://www.change2561.com/changeartist/getModel/${id}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`CHANGE 2561 artist ${id} -> HTTP ${res.status}`);
  const data = await res.json();
  const a = data?.data?.artist;
  if (!a) return null;

  const fullName: string = (a.name_en || a.name_th || "").trim();
  const nickname: string = (a.nickname_en || a.nickname_th || fullName).trim();
  if (!fullName && !nickname) return null;

  const socialLinks: { label: string; url: string }[] = [];
  if (a.url_ig) socialLinks.push({ label: "Instagram", url: a.url_ig });
  if (a.url_twitter) socialLinks.push({ label: "Twitter", url: a.url_twitter });
  if (a.url_tiktok) socialLinks.push({ label: "TikTok", url: a.url_tiktok });

  return { fullName: fullName || nickname, nickname: nickname || fullName, socialLinks };
}
