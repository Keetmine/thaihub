import { prisma } from "@/lib/prisma";
import type { TtmArtist } from "@/lib/thaiticketmajor";

// Сопоставление спарсенного состава события с нашим каталогом.
// Вынесено из importActions.ts («событие по ссылке»), потому что тем же
// правилом пользуется краулер афиши (src/lib/ttmCrawl.ts): у решения
// «этот артист — наш» должна быть одна реализация, а не две копии,
// которые разъедутся.

/** Артист со страницы события + найденный (или нет) исполнитель. */
export type MatchedArtist = {
  fullName: string;
  nickname: string;
  matchedPerformerId: string | null;
};

/**
 * Матчит артистов по нику: точное совпадение без учёта регистра с
 * `Performer.name` (name — это и есть поле-ник, см.
 * docs/features/catalog.md). Никакого фаззи-поиска намеренно: ложная
 * привязка хуже пропуска — пропуск добирается руками, ложную ещё надо
 * заметить.
 */
export async function matchArtistsByNickname(artists: TtmArtist[]): Promise<MatchedArtist[]> {
  const existingPerformers = await prisma.performer.findMany({
    select: { id: true, name: true },
  });
  const byNickname = new Map(existingPerformers.map((p) => [p.name.toLowerCase().trim(), p.id]));

  return artists.map((a) => ({
    fullName: a.fullName,
    nickname: a.nickname,
    matchedPerformerId: byNickname.get(a.nickname.toLowerCase().trim()) ?? null,
  }));
}
