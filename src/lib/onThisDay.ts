import { prisma } from "@/lib/prisma";

// «В этот день» — ностальгический блок главной: сериалы, стартовавшие
// в этот же день и месяц в прошлые годы (Drama.airedFrom). Функция
// намеренно принимает месяц/день/год параметрами, а не берёт «сегодня»
// сама: так её можно вызвать с подставной датой (юнит-проверка), а на
// главной дата входит в ключ unstable_cache и смена суток заводит
// свежую запись.

export type OnThisDayDrama = {
  id: string;
  slug: string | null;
  title: string;
  titleRu: string | null;
  posterUrl: string | null;
  airedFrom: Date;
};

/**
 * Сериалы, вышедшие `month`/`day` в любом году ДО `year`. Сравнение
 * месяца/дня — в SQL, как у дней рождения на главной: каталог на тысячи
 * строк, тянуть его целиком ради семи строк нельзя. Свежие годовщины
 * первыми: «год назад» цепляет сильнее, чем «13 лет назад».
 */
export async function queryOnThisDayDramas(
  month: number,
  day: number,
  year: number,
  limit = 5,
): Promise<OnThisDayDrama[]> {
  return prisma.$queryRaw<OnThisDayDrama[]>`
    SELECT d.id, d.slug, d.title, d."titleRu", d."posterUrl", d."airedFrom"
    FROM "Drama" d
    WHERE d."airedFrom" IS NOT NULL
      AND EXTRACT(MONTH FROM d."airedFrom") = ${month}
      AND EXTRACT(DAY FROM d."airedFrom") = ${day}
      AND EXTRACT(YEAR FROM d."airedFrom") < ${year}
    ORDER BY d."airedFrom" DESC
    LIMIT ${limit}
  `;
}
