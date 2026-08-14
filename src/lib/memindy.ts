import type { Page } from "playwright";

// Scraper for Me Mind Y's artist roster (memindy.com/en/artist/) — a
// WordPress "artist" custom post type not exposed via the standard
// wp-json REST API, and the listing itself is rendered by an isotope
// grid script rather than present in the raw server HTML, so this needs
// a real browser page (same reasoning as gmmtv.ts). Every artist's full
// profile — including their "Previous Works" credits — is on this one
// listing page; there are no separate per-artist profile pages to
// crawl.

export type MemindyArtist = {
  fullName: string;
  nickname: string;
  photoUrl: string | null;
  series: string[];
  socialLinks: { label: string; url: string }[];
};

/** "Full Name (Nickname)" — same shape as the Wikipedia/drama.fandom.com
 *  agency artist lists, just without a shared parser to reuse since this
 *  page's DOM extraction already happens inside `page.evaluate`. */
function parseNameNickname(raw: string): { fullName: string; nickname: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  const match = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) return { fullName: match[1].trim(), nickname: match[2].trim() };
  return { fullName: text, nickname: text };
}

export async function fetchMemindyArtists(page: Page): Promise<MemindyArtist[]> {
  await page.goto("https://www.memindy.com/en/artist/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);

  const raw = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("article.type-artist"));
    return cards.map((card) => {
      const nameRaw = card.querySelector(".artist-title-detail")?.textContent?.trim() ?? "";
      const photoUrl = card.querySelector(".artist-image img")?.getAttribute("src") ?? null;

      // "Previous Works" is one <p> of stats followed by a <ul> of
      // labeled sub-lists ("Series", "Artist's '...'", "Project", …) —
      // only "Series" is dramas, everything else (music releases,
      // side projects) is out of scope for this catalog.
      const series: string[] = [];
      const topLis = Array.from(card.querySelectorAll(".artist-detail > ul > li"));
      for (const li of topLis) {
        const clone = li.cloneNode(true);
        const nestedUl = (clone as Element).querySelector("ul");
        const label = nestedUl
          ? (clone as Element).textContent?.replace(nestedUl.textContent ?? "", "").trim()
          : (clone as Element).textContent?.trim();
        if (label === "Series" && nestedUl) {
          series.push(
            ...Array.from(nestedUl.querySelectorAll(":scope > li"))
              .map((s) => s.textContent?.trim() ?? "")
              .filter(Boolean),
          );
        }
      }

      // Social handles are the last <p> in .artist-detail, one
      // "Label : value" per line (<br>-separated, so .innerText keeps
      // them on separate lines unlike .textContent).
      const paragraphs = Array.from(card.querySelectorAll(".artist-detail > p"));
      const socialP = paragraphs[paragraphs.length - 1] as HTMLElement | undefined;
      const socialLinks: { label: string; url: string }[] = [];
      if (socialP) {
        const lines = socialP.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const m = line.match(/^(IG|X|Tiktok)\s*:\s*(.+)$/i);
          if (!m) continue;
          const handle = m[2].trim().replace(/^@/, "");
          if (!handle) continue;
          const platform = m[1].toLowerCase();
          const url =
            platform === "ig"
              ? `https://instagram.com/${handle}`
              : platform === "x"
                ? `https://x.com/${handle}`
                : `https://tiktok.com/@${handle}`;
          socialLinks.push({ label: m[1], url });
        }
      }

      return { nameRaw, photoUrl, series, socialLinks };
    });
  });

  return raw.map((r) => ({ ...parseNameNickname(r.nameRaw), photoUrl: r.photoUrl, series: r.series, socialLinks: r.socialLinks }));
}
