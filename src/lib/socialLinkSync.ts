import { prisma } from "@/lib/prisma";
import { oneProfilePlatformOf, socialLinkKey, socialLinkLabel } from "@/lib/socialLinks";

/**
 * Долить импортированные соцсети в карточку — артиста или агентства
 * (просьба владельца 2026-09-23: «с tpop.fandom и других таких сайтов
 * нужно также тянуть ссылки на соцсети»).
 *
 * Правила те же, что у импорта с MyDramaList, и по тем же причинам:
 *  - **сравнение по ключу, а не по строке** (`socialLinkKey`): один и
 *    тот же профиль приходит и как `instagram.com/x`, и как
 *    `www.instagram.com/x/` — буквальное сравнение копило дубли;
 *  - **сеть «один профиль» не занимают дважды** (`oneProfilePlatformOf`):
 *    вторая ссылка на Instagram/TikTok/X почти всегда переименованный
 *    аккаунт, и какая из двух живая — решает человек. Такие считаем
 *    конфликтом и показываем в сводке. У музыкальных площадок и YouTube
 *    несколько страниц законны, там правило не действует;
 *  - **существующие ссылки не трогаем вовсе**: импорт только дополняет.
 *
 * Отдельным модулем, а не внутри импортёра: тем же правилом теперь
 * пользуются обе стороны фэндом-импорта — артисты и агентства.
 */
export type LinkSyncResult = { added: number; conflicts: number };

type ExistingLink = { url: string };

function planLinks(existing: ExistingLink[], urls: string[]): { toAdd: string[]; conflicts: number } {
  const haveKeys = new Set(existing.map((l) => socialLinkKey(l.url)));
  const haveNetworks = new Set(
    existing.map((l) => oneProfilePlatformOf(l.url)).filter((p): p is NonNullable<typeof p> => p !== null),
  );
  const toAdd: string[] = [];
  let conflicts = 0;
  for (const raw of urls) {
    const url = raw.trim();
    if (!url) continue;
    const key = socialLinkKey(url);
    if (haveKeys.has(key)) continue;
    const network = oneProfilePlatformOf(url);
    if (network && haveNetworks.has(network)) {
      conflicts += 1;
      continue;
    }
    if (network) haveNetworks.add(network);
    haveKeys.add(key);
    toAdd.push(url);
  }
  return { toAdd, conflicts };
}

export async function addMissingPerformerLinks(
  performerId: string,
  urls: string[],
): Promise<LinkSyncResult> {
  if (urls.length === 0) return { added: 0, conflicts: 0 };
  const existing = await prisma.performerLink.findMany({
    where: { performerId },
    select: { url: true },
  });
  const { toAdd, conflicts } = planLinks(existing, urls);
  for (const url of toAdd) {
    await prisma.performerLink.create({
      data: { performerId, label: socialLinkLabel(url), url },
    });
  }
  return { added: toAdd.length, conflicts };
}

export async function addMissingAgencyLinks(
  agencyId: string,
  urls: string[],
): Promise<LinkSyncResult> {
  if (urls.length === 0) return { added: 0, conflicts: 0 };
  const existing = await prisma.agencyLink.findMany({
    where: { agencyId },
    select: { url: true },
  });
  const { toAdd, conflicts } = planLinks(existing, urls);
  for (const url of toAdd) {
    await prisma.agencyLink.create({
      data: { agencyId, label: socialLinkLabel(url), url },
    });
  }
  return { added: toAdd.length, conflicts };
}

/** Чистая часть правила — для юнит-теста (tests/unit/socialLinkSync.test.ts). */
export const __planLinks = planLinks;
