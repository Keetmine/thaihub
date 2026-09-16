"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/userAuth";
import { kindWhere } from "@/lib/catalogKinds";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { getT } from "@/lib/i18n";
import {
  PICK_POOL,
  PICK_RESULTS,
  parseAnswers,
  pickSteps,
  shuffleTake,
  type PickAnswers,
} from "@/lib/dramaPicker";

export type PickResult = {
  id: string;
  href: string;
  title: string;
  posterUrl: string | null;
  year: number | null;
};

/**
 * Подобрать сериалы по ответам квиза (см. src/lib/dramaPicker.ts).
 *
 * Квиз НЕ ИМЕЕТ ПРАВА вернуть пусто: человек ответил на четыре вопроса,
 * и «ничего не найдено» после этого обиднее, чем обычно. Поэтому
 * условия снимаются по одному, от наименее важного, пока что-нибудь не
 * найдётся; в пределе остаётся весь раздел сериалов.
 *
 * Про «новое / пересмотреть»: это условие не снимается никогда —
 * подсунуть просмотренное тому, кто просил новое, хуже, чем показать
 * меньше вариантов. Гостю такого вопроса вовсе не задаётся (отметок у
 * него нет), и сюда приходит `any`.
 */
export async function pickDramas(raw: Partial<Record<keyof PickAnswers, string>>): Promise<{
  results: PickResult[];
  /** Пришлось ли ослабить условия — попап честно говорит об этом. */
  relaxed: boolean;
}> {
  const answers = parseAnswers(raw);
  const { locale } = await getT();
  const user = await getCurrentUser();

  // Личное условие — только для своих и только если спросили.
  const seenWhere: Prisma.DramaWhereInput = !user
    ? {}
    : answers.seen === "fresh"
      ? { watchStatuses: { none: { userId: user.id } } }
      : answers.seen === "rewatch"
        ? { watchStatuses: { some: { userId: user.id, status: "COMPLETED" } } }
        : {};

  const steps = pickSteps(answers);

  // Снимаем по одному условию с конца списка «ступеней»: первым уходит
  // уточняющий жанр, последним — статус выхода (порядок и его причины —
  // в pickSteps).
  for (let drop = 0; drop <= steps.length; drop++) {
    const active = steps.slice(drop);
    const where: Prisma.DramaWhereInput = {
      AND: [
        kindWhere("series"),
        seenWhere,
        ...active.map((s) =>
          s.genres ? { genres: { hasSome: s.genres } } : { status: s.status },
        ),
      ],
    };
    const pool = await prisma.drama.findMany({
      where,
      select: { id: true, slug: true, title: true, titleRu: true, posterUrl: true, year: true },
      // Сначала то, что у нас реально смотрят: подбор должен звать
      // хорошее, а не случайную строку из пяти тысяч. Тасуем уже внутри
      // этой полусотни.
      orderBy: [{ watchStatuses: { _count: "desc" } }, { year: { sort: "desc", nulls: "last" } }],
      take: PICK_POOL,
    });
    if (pool.length === 0) continue;
    return {
      results: shuffleTake(pool, PICK_RESULTS).map((d) => ({
        id: d.id,
        href: dramaHref(d),
        title: dramaTitleForLocale(d, locale),
        posterUrl: d.posterUrl,
        year: d.year,
      })),
      relaxed: drop > 0,
    };
  }

  return { results: [], relaxed: true };
}
