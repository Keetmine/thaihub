import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getT, localeHref } from "@/lib/i18n";
import { dramaFilterWhere, type FilterParams } from "@/lib/catalogFilters";
import { dramaTitleWhere } from "@/lib/searchWhere";
import { dramaHref } from "@/lib/dramaSlug";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Рулетка «что посмотреть» (аудит, п. 6.3): 302 на СЛУЧАЙНЫЙ сериал.
 *
 * Случайность — count + skip на случайное смещение, а не выгрузка
 * каталога в память: в базе тысячи сериалов, и тащить их все ради
 * одного адреса было бы дорого. Порядок под skip фиксирован (`id asc`),
 * иначе смещение считалось бы по плавающему списку.
 *
 * Залогинённому уже отмеченные (ЛЮБЫМ статусом) не выпадают: рулетка —
 * про «что бы нового», а не про «вот твоё же „Заброшено“».
 *
 * Фильтры берутся из адреса и понимают тот же язык, что фильтры
 * сериалов на /search (dramaFilterWhere): country, type, yearFrom/
 * yearTo, genres, tags, status (ЭФИРНЫЙ статус, enum DramaStatus —
 * вкладки статусов ПРОСМОТРА с /dramas сюда не транслируются, их чужие
 * значения отсекает whitelist внутри dramaFilterWhere), network,
 * agency; плюс поисковая строка q. Так ссылку на рулетку можно ставить
 * и с /dramas (кнопка проносит q), и со страницы результатов /search.
 */
export async function GET(request: NextRequest) {
  const [user, { locale }] = await Promise.all([getCurrentUser(), getT()]);

  const sp = request.nextUrl.searchParams;
  const params: FilterParams = {};
  for (const key of [
    "genres",
    "tags",
    "country",
    "type",
    "status",
    "network",
    "agency",
    "yearFrom",
    "yearTo",
  ]) {
    const v = sp.get(key);
    if (v) params[key] = v;
  }

  const filters: Prisma.DramaWhereInput[] = dramaFilterWhere(params);
  const q = sp.get("q")?.trim();
  if (q) filters.push(dramaTitleWhere(q));
  if (user) {
    filters.push({ watchStatuses: { none: { userId: user.id } } });
  }
  const where: Prisma.DramaWhereInput = { AND: filters };

  const count = await prisma.drama.count({ where });
  const winner =
    count > 0
      ? await prisma.drama.findFirst({
          where,
          // title нужен dramaHref: у записи без слага он строит адрес
          // от названия (см. slugHelpers).
          select: { id: true, slug: true, title: true },
          orderBy: { id: "asc" },
          skip: Math.floor(Math.random() * count),
        })
      : null;

  // Пусто (всё пересмотрено или фильтр слишком узкий) — честно обратно
  // в каталог, а не 404: адрес зовётся кнопкой, тупика за ней быть не
  // должно.
  const target = winner ? dramaHref(winner) : "/dramas";
  const res = NextResponse.redirect(
    new URL(localeHref(target, locale), request.url),
    // Именно 302, а не дефолтный 307: адрес каждый раз ведёт в новое
    // место, и «временный» тут — точное слово.
    302,
  );
  // Редирект со случайным исходом кэшировать нельзя: закэшированная
  // «рулетка» всегда выпадала бы одним и тем же сериалом.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
