"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { communityHref } from "@/lib/slugHelpers";
import { COMMUNITY_TOPIC_LIMIT } from "@/lib/communities";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import { performerNameWhere, performerOptionLabel } from "@/lib/searchWhere";

/**
 * Привязки сообщества к каталогу и место сообщества (АА25).
 *
 * Два РАЗНЫХ способа быть найденным, и путать их нельзя:
 *
 * 1. **привязки** (`CommunityTopic`) — артисты и сериалы, о ком
 *    сообщество. Ровно они показываются на страницах артиста и сериала
 *    (`src/components/CommunityTopicBlock.tsx`), и их не больше
 *    `COMMUNITY_TOPIC_LIMIT`;
 * 2. **место** (`country`/`city`) — для сообществ вроде «Лакорны
 *    Беларусь». Их ищут ПО МЕСТУ, а не по актёру, поэтому у места свой
 *    фильтр на витрине `/communities`, а на страницах артистов место не
 *    показывается вовсе.
 *
 * Почему именно так — docs/features/communities.md, раздел «Связь с
 * каталогом и место».
 *
 * Отдельный файл экшенов (а не общий `actions.ts`) — граница та же, что
 * у обложки и встреч: свой кусок фичи правится, не задевая настройки
 * сообщества.
 *
 * Ошибки — значением, а не броском: в проде Next минифицирует текст
 * исключения из server action, и клиент видит generic error boundary
 * вместо причины (то же правило, что в actions.ts рядом).
 */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

/** Потолки полей места. Живут здесь, а не в lib/communities.ts: это
 *  подробность формы, а не правило доступа. */
const COUNTRY_MAX = 60;
const CITY_MAX = 60;

export type CommunityTopicsState =
  | {
      ok: true;
      /** Готовые варианты для комбобоксов: id + подпись + картинка. */
      performers: { id: string; name: string; photoUrl: string | null }[];
      dramas: { id: string; name: string; photoUrl: string | null }[];
      country: string;
      city: string;
    }
  | ActionError;

/** Сообщество, которым текущий пользователь вправе управлять (владелец
 *  или модератор), либо null. Своя копия проверки — как в
 *  coverActions.ts: в actions.ts она модульно-приватная, а тянуть её
 *  наружу ради одного вызова значит расширять чужой интерфейс. Правило
 *  то же: кто правит название и описание, тот правит и привязки —
 *  это про наполнение сообщества, а не про его устройство (видимость и
 *  правила вступления остаются владельцу). */
async function requireManaged(communityId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/communities", await getLocale()));
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: { members: { where: { userId: user.id } } },
  });
  if (!community) return null;
  const isOwner = community.ownerId === user.id;
  const isModerator = community.members[0]?.role === "MODERATOR";
  if (!isOwner && !isModerator) return null;
  return community;
}

/**
 * Текущие привязки и место — окну управления, когда оно открывается.
 *
 * Страница сообщества их в `CommunityAdmin` не передаёт (там свой набор
 * пропсов), поэтому окно берёт их само — ровно как обложку
 * (`loadCommunityCover`). Заодно это отвечает на вопрос «а что уже
 * выбрано»: комбобокс должен показать имена, а не голые id.
 */
export async function loadCommunityTopics(communityId: string): Promise<CommunityTopicsState> {
  const { locale, t } = await getT();
  const community = await requireManaged(communityId);
  if (!community) return { ok: false, error: t.communities.errors.notFound };

  const topics = await prisma.communityTopic.findMany({
    where: { communityId: community.id },
    select: {
      performer: { select: { id: true, name: true, realName: true, photoUrl: true } },
      drama: { select: { id: true, posterUrl: true, ...DRAMA_TITLE_SELECT } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    ok: true,
    performers: topics
      .map((row) => row.performer)
      .filter((p) => p !== null)
      .map((p) => ({ id: p.id, name: performerOptionLabel(p), photoUrl: p.photoUrl })),
    dramas: topics
      .map((row) => row.drama)
      .filter((d) => d !== null)
      // Название на языке зрителя — как везде в витрине.
      .map((d) => ({ id: d.id, name: dramaTitleForLocale(d, locale), photoUrl: d.posterUrl })),
    country: community.country ?? "",
    city: community.city ?? "",
  };
}

/**
 * Сохранить привязки и место одной формой.
 *
 * Набор привязок перезаписывается целиком (снесли — записали заново): их
 * максимум три, и аккуратный diff тут стоил бы больше кода, чем
 * экономит. Всё вместе — в одной транзакции: пустой промежуток между
 * удалением и вставкой виден на публичных страницах артистов.
 */
export async function saveCommunityTopics(
  communityId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { t } = await getT();
  const s = t.communities.topics.errors;
  const community = await requireManaged(communityId);
  if (!community) return { ok: false, error: t.communities.errors.notFound };

  const ids = (key: string) =>
    [...new Set(formData.getAll(key).map((v) => String(v).trim()).filter(Boolean))];
  const performerIds = ids("performerId");
  const dramaIds = ids("dramaId");

  // Потолок общий на артистов и сериалы: три привязки — это ответ на
  // вопрос «о ком сообщество», а не каталог интересов (см.
  // COMMUNITY_TOPIC_LIMIT). Проверка на сервере, а не только подсказкой
  // в форме: форму можно отправить и мимо интерфейса.
  if (performerIds.length + dramaIds.length > COMMUNITY_TOPIC_LIMIT) {
    return { ok: false, error: s.limit(COMMUNITY_TOPIC_LIMIT) };
  }

  // Несуществующие id молча выбрасываем, а не превращаем в ошибку формы:
  // человек их не набирал руками — это могла быть запись, удалённая
  // из каталога, пока окно было открыто.
  const [performers, dramas] = await Promise.all([
    performerIds.length
      ? prisma.performer.findMany({ where: { id: { in: performerIds } }, select: { id: true } })
      : [],
    dramaIds.length
      ? prisma.drama.findMany({ where: { id: { in: dramaIds } }, select: { id: true } })
      : [],
  ]);

  const country = String(formData.get("country") ?? "").trim().slice(0, COUNTRY_MAX);
  const city = String(formData.get("city") ?? "").trim().slice(0, CITY_MAX);
  // Город без страны на витрине не находится вовсе: фильтр там
  // страна → город, и одинокий «Минск» остался бы невидимым. Молча
  // подставить страну неоткуда, поэтому просим её у человека.
  if (city && !country) return { ok: false, error: s.cityWithoutCountry };

  await prisma.$transaction([
    prisma.communityTopic.deleteMany({ where: { communityId: community.id } }),
    prisma.communityTopic.createMany({
      data: [
        ...performers.map((p) => ({ communityId: community.id, performerId: p.id })),
        ...dramas.map((d) => ({ communityId: community.id, dramaId: d.id })),
      ],
    }),
    prisma.community.update({
      where: { id: community.id },
      data: { country: country || null, city: city || null },
    }),
  ]);

  // Страницы артиста и сериала сбрасывать не нужно: они
  // force-dynamic — блок сообществ там собирается на каждый запрос.
  revalidatePath(communityHref(community));
  revalidatePath("/communities");
  return { ok: true };
}

/**
 * Подсказки к полю «Артисты».
 *
 * Каталог исполнителей — семнадцать тысяч строк, целиком в выпадашку он
 * не поместится: общий комбобокс ищет на сервере по мере ввода (так же
 * устроен выбор сериала в форме встречи, см. `searchMeetupDramas`).
 * Отсюда и форма ответа — `{ id, name, photoUrl }`, как ждёт комбобокс.
 *
 * Анониму — пустой список, а не ошибка: окно управления открывает только
 * владелец или модератор, а бросок в проде превратился бы в generic
 * error boundary.
 */
export async function searchTopicPerformers(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  const user = await getCurrentUser();
  const q = query.trim();
  if (!user || q.length < 2) return [];
  const rows = await prisma.performer.findMany({
    where: performerNameWhere(q),
    select: { id: true, name: true, realName: true, photoUrl: true },
    orderBy: { name: "asc" },
    take: 8,
  });
  // Ник + настоящее имя в скобках: тёзок по нику в каталоге хватает.
  return rows.map((p) => ({ id: p.id, name: performerOptionLabel(p), photoUrl: p.photoUrl }));
}

/** То же для поля «Сериалы». Свой экшен, а не общий с формой встречи:
 *  там выбирают один сериал события, здесь — тему сообщества, и
 *  подписи/картинки у вариантов свои (постер в чипе). */
export async function searchTopicDramas(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  const user = await getCurrentUser();
  const q = query.trim();
  if (!user || q.length < 2) return [];
  const { locale } = await getT();
  const rows = await prisma.drama.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { titleRu: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, posterUrl: true, ...DRAMA_TITLE_SELECT },
    orderBy: { title: "asc" },
    take: 8,
  });
  return rows.map((d) => ({
    id: d.id,
    name: dramaTitleForLocale(d, locale),
    photoUrl: d.posterUrl,
  }));
}
