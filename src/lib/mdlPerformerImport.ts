import { prisma } from "@/lib/prisma";
import { fetchMdlPerson, absMdlUrl, type MdlPerson } from "@/lib/mydramalist";
import { downloadRemoteImage } from "@/lib/localImage";

export type MdlPerformerSummary = {
  performerId: string;
  name: string;
  created: boolean;
  /** Какие поля заполнили — пустые до импорта. */
  filled: string[];
  linksAdded: number;
  dramasLinked: number;
  /** Сериалы из фильмографии, которых нет в каталоге: их не заводим. */
  dramasSkipped: number;
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
): Promise<MdlPerformerSummary> {
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
  const photoUrl =
    !existing?.photoUrl && person.photoUrl
      ? await downloadRemoteImage(person.photoUrl, "mdl").catch(() => null)
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

  // Соцссылки — только недостающие: сравниваем по адресу, чтобы
  // повторный импорт не плодил одинаковые строки.
  const haveUrls = new Set((existing?.links ?? []).map((l) => l.url));
  let linksAdded = 0;
  for (const link of person.socialLinks) {
    if (haveUrls.has(link)) continue;
    await prisma.performerLink.create({
      data: { performerId: performer.id, label: labelFor(link), url: link },
    });
    linksAdded += 1;
  }

  // Фильмография: связываем только с тем, что уже есть в каталоге.
  // Заводить сериалы пачкой — как раз то, чем массовый синк засорял
  // базу; сериал добавляется своим импортом, осознанно.
  let dramasLinked = 0;
  let dramasSkipped = 0;
  for (const row of person.filmography) {
    const mdlUrl = absMdlUrl(row.mdlPath);
    const drama = await prisma.drama.findFirst({
      where: {
        OR: [
          { mydramalistUrl: mdlUrl },
          { title: { equals: row.title, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
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
    dramasLinked,
    dramasSkipped,
  };
}
