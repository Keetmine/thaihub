import { prisma } from "@/lib/prisma";
import { fetchMdlPerson, absMdlUrl, type MdlPerson } from "@/lib/mydramalist";
import { oneProfilePlatformOf, socialLinkKey } from "@/lib/socialLinks";
import { upsertDramaFromMdl } from "@/lib/mdlDramaImport";
import { downloadRemoteImage } from "@/lib/localImage";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";

export type MdlPerformerSummary = {
  performerId: string;
  name: string;
  created: boolean;
  /** Какие поля заполнили — пустые до импорта. */
  filled: string[];
  linksAdded: number;
  /** Ссылки, НЕ добавленные из-за занятой сети (см. oneProfilePlatformOf):
   *  на артисте уже висит другой хэндл той же сети — вероятно, старое имя
   *  аккаунта; чинится руками в форме. */
  linkConflicts: number;
  dramasLinked: number;
  /** Сериалы из фильмографии, которых нет в каталоге: без галочки
   *  «парсить фильмографию» их не заводим. */
  dramasSkipped: number;
  /** Заведено и дозаполнено сериалов (только с галочкой). */
  dramasCreated: number;
  dramasEnriched: number;
  /** Страница сериала не открылась. */
  dramasFailed: number;
};

const SOCIAL_LABELS: [RegExp, string][] = [
  [/instagram\.com/i, "Instagram"],
  [/(twitter|x)\.com/i, "X"],
  [/tiktok\.com/i, "TikTok"],
  [/youtube\.com/i, "YouTube"],
  [/facebook\.com/i, "Facebook"],
];

function labelFor(url: string): string {
  return SOCIAL_LABELS.find(([re]) => re.test(url))?.[1] ?? "Ссылка";
}

/**
 * Импорт одного человека с MyDramaList в карточку исполнителя.
 *
 * Пришёл на смену массовым обходам TMDB: те шли по всему каталогу и
 * сопоставляли людей по имени, беря первого кандидата — тайскому актёру
 * могли приписать французский сериал, а в каталог заезжали сотни чужих
 * персон. Здесь адрес страницы даёт человек, поэтому ошибиться
 * адресатом невозможно.
 *
 * Заполняются только пустые поля. Уже занесённое (в том числе руками)
 * не трогаем: импорт дополняет карточку, а не переписывает её.
 */
export async function importMdlPerformer(
  url: string,
  /** Куда писать. Без него исполнитель заводится новый. */
  performerId?: string,
  runId?: string,
  options?: {
    /** Галочка «парсить фильмографию»: заводить недостающие сериалы и
     *  дозаполнять существующие (только карточка, без каста). */
    withFilmography?: boolean;
  },
): Promise<MdlPerformerSummary> {
  const withFilmography = options?.withFilmography ?? false;
  const person: MdlPerson = await fetchMdlPerson(url.trim());

  const existing = performerId
    ? await prisma.performer.findUnique({
        where: { id: performerId },
        include: { links: true },
      })
    : await prisma.performer.findFirst({
        // Повторный импорт того же адреса должен обновлять ту же
        // карточку, а не плодить дубли.
        where: { mydramalistUrl: person.url },
        include: { links: true },
      });

  const filled: string[] = [];
  // downloadRemoteImage не бросает: если скачать не удалось, вернёт
  // исходный адрес — тогда в карточке останется внешняя ссылка на
  // i.mydramalist.com. Так же ведут себя остальные импортёры.
  const photoUrl =
    !existing?.photoUrl && person.photoUrl
      ? await downloadRemoteImage(person.photoUrl, "mdl")
      : null;

  // Настоящее имя MDL пишет по частям; в карточке оно одной строкой.
  const realName =
    [person.firstName, person.familyName].filter(Boolean).join(" ").trim() || null;

  let performer: { id: string; name: string };
  let created = false;

  if (existing) {
    const data: Record<string, unknown> = {};
    if (!existing.realName && realName) {
      data.realName = realName;
      filled.push("настоящее имя");
    }
    if (!existing.birthDate && person.born) {
      data.birthDate = person.born;
      filled.push("дата рождения");
    }
    if (!existing.bio && person.bio) {
      data.bio = person.bio;
      filled.push("биография");
    }
    if (!existing.photoUrl && photoUrl) {
      data.photoUrl = photoUrl;
      filled.push("фото");
    }
    if (!existing.mydramalistUrl) data.mydramalistUrl = person.url;
    if (Object.keys(data).length > 0) {
      await prisma.performer.update({ where: { id: existing.id }, data });
    }
    performer = existing;
  } else {
    const row = await prisma.performer.create({
      data: {
        name: person.name,
        type: "SOLO",
        realName,
        birthDate: person.born,
        bio: person.bio,
        photoUrl,
        mydramalistUrl: person.url,
      },
    });
    performer = row;
    created = true;
    filled.push("карточка целиком");
  }

  // Соцссылки — только недостающие. Сравниваем по нормализованному
  // ключу (socialLinkKey), а не по строке: у MDL один и тот же профиль
  // встречается и как instagram.com/x, и как www.instagram.com/x/, и
  // такие «разные» адреса копились дублями в карточке.
  const haveUrls = new Set((existing?.links ?? []).map((l) => socialLinkKey(l.url)));
  // Сети «один профиль»: вторую ссылку на занятую сеть не доливаем —
  // это почти всегда переименованный аккаунт (у Sea так задвоились
  // Instagram/TikTok/Twitter: старый хэндл в базе, новый у MDL).
  // Какой из двух живой, решает человек — в отчёт идёт конфликт.
  const haveNetworks = new Set(
    (existing?.links ?? [])
      .map((l) => oneProfilePlatformOf(l.url))
      .filter((p): p is NonNullable<typeof p> => p !== null),
  );
  let linksAdded = 0;
  let linkConflicts = 0;
  for (const link of person.socialLinks) {
    // Остановка по кнопке: карточка уже заведена и остаётся такой, как
    // получилось, — повторный импорт того же адреса её дозаполнит.
    await checkImportCancelled(runId ?? null);
    const key = socialLinkKey(link);
    if (haveUrls.has(key)) continue;
    const network = oneProfilePlatformOf(link);
    if (network && haveNetworks.has(network)) {
      linkConflicts += 1;
      continue;
    }
    if (network) haveNetworks.add(network);
    haveUrls.add(key);
    await prisma.performerLink.create({
      data: { performerId: performer.id, label: labelFor(link), url: link },
    });
    linksAdded += 1;
  }

  // Фильмография. По умолчанию связываем только с тем, что уже есть в
  // каталоге: заводить сериалы пачкой — как раз то, чем массовый синк
  // засорял базу. С галочкой «парсить фильмографию» недостающие
  // заводятся, а у существующих дозаполняются пустые поля — но только
  // карточка сериала: каст оттуда НЕ разбираем, иначе получилась бы
  // цепочка актёр → сериалы → их актёры → их сериалы.
  let dramasLinked = 0;
  let dramasSkipped = 0;
  let dramasCreated = 0;
  let dramasEnriched = 0;
  let dramasFailed = 0;
  // Потолок: у заметного актёра фильмография — это десятки страниц, а
  // каждая может открываться через браузер.
  const DRAMA_LIMIT = 25;
  const dramaStaleBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const row of person.filmography) {
    await checkImportCancelled(runId ?? null);
    const mdlUrl = absMdlUrl(row.mdlPath);
    let drama = await prisma.drama.findFirst({
      where: {
        OR: [
          { mydramalistUrl: mdlUrl },
          { title: { equals: row.title, mode: "insensitive" } },
        ],
      },
      select: { id: true, synopsis: true, posterUrl: true, year: true, mdlSyncedAt: true },
    });

    if (withFilmography && dramasCreated + dramasEnriched + dramasFailed < DRAMA_LIMIT) {
      const incomplete = !drama || !drama.synopsis || !drama.posterUrl || !drama.year;
      const stale = !drama?.mdlSyncedAt || drama.mdlSyncedAt < dramaStaleBefore;
      if (incomplete && stale) {
        try {
          const res = await upsertDramaFromMdl(mdlUrl);
          drama = {
            id: res.id,
            synopsis: null,
            posterUrl: null,
            year: null,
            mdlSyncedAt: new Date(),
          };
          if (res.created) dramasCreated += 1;
          else if (res.filled.length > 0) dramasEnriched += 1;
        } catch (e) {
          // Отмену пробрасываем, остальное — не повод ронять импорт
          // актёра: связь с уже существующими сериалами важнее.
          if (isImportCancelledError(e)) throw e;
          dramasFailed += 1;
        }
      }
    }

    if (!drama) {
      dramasSkipped += 1;
      continue;
    }
    // Считаем только новые связи: upsert возвращает строку и когда
    // ничего не создал, и «связано 30» на повторном прогоне вводило бы
    // в заблуждение.
    const already = await prisma.performerDrama.findUnique({
      where: { performerId_dramaId: { performerId: performer.id, dramaId: drama.id } },
      select: { dramaId: true },
    });
    if (already) continue;
    await prisma.performerDrama.create({
      data: { performerId: performer.id, dramaId: drama.id, role: row.role ?? null },
    });
    dramasLinked += 1;
  }

  if (runId) {
    await prisma.importedItem.create({
      data: {
        runId,
        entityType: "performer",
        entityId: performer.id,
        action: created ? "created" : "updated",
        label: person.name,
      },
    });
  }

  return {
    performerId: performer.id,
    name: person.name,
    created,
    filled,
    linksAdded,
    linkConflicts,
    dramasLinked,
    dramasSkipped,
    dramasCreated,
    dramasEnriched,
    dramasFailed,
  };
}
