import { prisma } from "@/lib/prisma";
import { fetchMdlPerson, absMdlUrl, type MdlPerson } from "@/lib/mydramalist";
import { oneProfilePlatformOf, socialLinkKey, socialLinkLabel } from "@/lib/socialLinks";
import { isAlternateVersionError, upsertDramaFromMdl } from "@/lib/mdlDramaImport";
import { downloadRemoteImage } from "@/lib/localImage";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import { logAudit, diffRecords, fieldLabel, type AuditChange } from "@/lib/audit";

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
    /** Ход прогона — строка для журнала и окна прогресса на странице
     *  артиста (кнопка «Обновить инфу»). */
    onProgress?: (message: string) => void;
  },
): Promise<MdlPerformerSummary> {
  const withFilmography = options?.withFilmography ?? false;
  const progress = options?.onProgress ?? (() => {});
  progress("Открываем профиль на MyDramaList…");
  const person: MdlPerson = await fetchMdlPerson(url.trim());
  progress(`Профиль ${person.name} загружен — заполняем карточку`);

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

  // Что парсер поменял — для истории правок карточки (просьба
  // владельца 2026-09-05): пишем одной записью после блока соцссылок,
  // чтобы «+N ссылок» попало туда же.
  const auditChanges: AuditChange[] = [];

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
    // Гражданство, пол и альтернативное имя раньше не писались вовсе —
    // ни здесь, ни при заведении новой карточки. Импорт отчитывался
    // успехом, а поля оставались пустыми (жалоба владельца 2026-09-25:
    // «запустила импорт, а инфу не подтянуло»). Дозаполняем только
    // пустое, как и остальные поля этого импортёра.
    if (!existing.nationality && person.nationality) {
      data.nationality = person.nationality;
      filled.push("гражданство");
    }
    if (!existing.gender && person.gender) {
      data.gender = person.gender;
      filled.push("пол");
    }
    if (!existing.alsoKnownAs && person.alsoKnownAs) {
      data.alsoKnownAs = person.alsoKnownAs;
      filled.push("другие имена");
    }
    if (!existing.mydramalistUrl) data.mydramalistUrl = person.url;
    if (Object.keys(data).length > 0) {
      await prisma.performer.update({ where: { id: existing.id }, data });
      auditChanges.push(
        ...diffRecords(existing as unknown as Record<string, unknown>, data, Object.keys(data)),
      );
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
        nationality: person.nationality,
        gender: person.gender,
        alsoKnownAs: person.alsoKnownAs,
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
  if (person.socialLinks.length) progress("Сверяем соцсети");
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
      data: { performerId: performer.id, label: socialLinkLabel(link), url: link },
    });
    linksAdded += 1;
  }

  // Одна запись в историю на весь импорт карточки: поля + «+N ссылок».
  if (linksAdded > 0) {
    auditChanges.push({
      field: "links",
      label: fieldLabel("links"),
      from: null,
      to: `+${linksAdded}`,
    });
  }
  if (created) {
    await logAudit({
      action: "CREATE",
      entityType: "Performer",
      entityId: performer.id,
      entityLabel: person.name,
      note: "импорт с MyDramaList",
    });
  } else {
    await logAudit({
      action: "UPDATE",
      entityType: "Performer",
      entityId: performer.id,
      entityLabel: person.name,
      changes: auditChanges,
      note: "импорт с MyDramaList",
    });
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

  for (const [index, row] of person.filmography.entries()) {
    await checkImportCancelled(runId ?? null);
    progress(`Сериалы: ${index + 1} из ${person.filmography.length} — ${row.title}`);
    const mdlUrl = absMdlUrl(row.mdlPath);
    let drama = await prisma.drama.findFirst({
      where: {
        OR: [
          { mydramalistUrl: mdlUrl },
          { title: { equals: row.title, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        synopsis: true,
        posterUrl: true,
        year: true,
        mdlSyncedAt: true,
        type: true,
      },
    });

    // Тип записи — из секции фильмографии (Drama/Movie/TV Show): у
    // записей, заведённых не с MDL, тип неизвестен, и без него фильмы с
    // шоу не отделить от сериалов на странице артиста.
    //
    // С 2026-09-16 «неизвестен» пишется как "Drama" (умолчание
    // каталога, миграция 20260916T01), поэтому дозаполнять только
    // ПУСТОЙ тип уже недостаточно: у фильма, заведённого с TMDB, стоит
    // умолчание «Drama», и фильмография MDL — единственный шанс это
    // поправить. Значит, "Drama" секция тоже вправе переписать на
    // Movie / TV Show. А вот Movie или TV Show обратно в Drama не
    // трогаем: такое значение могло прийти только явно — с карточки
    // самого тайтла (Details → Type), а она точнее секции.
    const typeFromSection =
      row.section && row.section !== "Drama" && (!drama?.type || drama.type === "Drama");
    if (drama && (!drama.type || typeFromSection) && row.section) {
      await prisma.drama.update({
        where: { id: drama.id },
        data: { type: row.section },
      });
      await logAudit({
        action: "UPDATE",
        entityType: "Drama",
        entityId: drama.id,
        entityLabel: row.title,
        changes: [{ field: "type", label: fieldLabel("type"), from: drama.type, to: row.section }],
        note: "секция фильмографии MyDramaList",
      });
    }

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
            // Страница тайтла уже разобрана upsert'ом — тип оттуда
            // записан, дозаполнять его из секции не нужно.
            type: res.mdl.type,
          };
          if (res.created) dramasCreated += 1;
          else if (res.filled.length > 0) dramasEnriched += 1;
        } catch (e) {
          // Отмену пробрасываем, остальное — не повод ронять импорт
          // актёра: связь с уже существующими сериалами важнее.
          if (isImportCancelledError(e)) throw e;
          // Нарезка («… Uncut») — не сбой: карточка не заведётся, и
          // строка уйдёт в dramasSkipped ниже по `if (!drama)`.
          if (!isAlternateVersionError(e)) dramasFailed += 1;
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
