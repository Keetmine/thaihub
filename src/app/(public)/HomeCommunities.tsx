import Link from "@/components/AppLink";
import EventCard from "@/components/EventCard";
import LetterAvatar from "@/components/LetterAvatar";
import { viewerMeetupsWhere } from "@/lib/catalogEvents";
import { viewerCommunitiesWhere } from "@/lib/communities";
import { formatShortDate } from "@/lib/dates";
import {
  getGoingOccurrenceIds,
  getMaybeOccurrenceIds,
} from "@/lib/favorites";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { communityHref } from "@/lib/slugHelpers";
import type { EventWithPerformers } from "@/lib/types";

/**
 * Блок «В ваших сообществах» на главной (АА25).
 *
 * ЧТО показываем и почему именно это. Витрина `/communities` отвечает на
 * вопрос «какие сообщества бывают» — и человеку, который уже вступил,
 * она не нужна ни разу. Возвращается он за другим: **что там нового и
 * куда идти**. Поэтому блок собран из двух вещей, и обе — из сообществ,
 * где зритель СОСТОИТ:
 *
 * - **ближайшие встречи** — то, что требует действия и имеет срок.
 *   Стоят первыми: пропущенная встреча не догоняется, а тема подождёт;
 * - **свежие темы обсуждений** — то, ради чего в сообщество заходят
 *   каждый день (своего чата у нас нет и не будет первым, см.
 *   docs/features/communities.md).
 *
 * Списка самих сообществ тут нет намеренно: он уже есть на витрине и в
 * меню, а повторять его на главной — значит показывать оглавление
 * вместо содержания.
 *
 * ПРИВАТНОСТЬ — главное в этом блоке. Внутри сообщества живут чужие
 * домашние адреса и разговоры, которые наружу не уходят никогда. Отсюда
 * три правила, и все три держатся ЗАПРОСОМ, а не разметкой:
 *
 * 1. отбор идёт через общие фильтры `viewerMeetupsWhere` и
 *    `viewerCommunitiesWhere` — те же самые, что кормят вкладку
 *    «Сообщества» в афише и страницу сообщества. Своей копии правила
 *    «где я состою» тут нет: разъехавшись, она молча показала бы чужое;
 * 2. гостю блока нет вовсе — главная гостю и не отдаётся
 *    (`page.tsx` показывает лендинг), а обе функции при пустом `userId`
 *    возвращают невозможное условие, а не «всё подряд»;
 * 3. закрытое не доезжает даже в пропсы: страница ничего не фильтрует и
 *    ничего не прячет стилями — скрытое стилями всё равно уехало бы в
 *    HTML.
 *
 * ЦЕНА для главной. Это самая посещаемая страница, поэтому запросов
 * тут нет ВООБЩЕ, пока человек не в сообществах: гейт (`hasCommunities`)
 * считает `page.tsx` одним `count` в общей пачке `Promise.all`, и без
 * участия компонент даже не рендерится. У участника это две пачки: темы
 * со встречами разом, следом «иду»/«в избранном» по горстке найденных id
 * (иначе кнопки на карточке врали бы о своём состоянии).
 */

/** Три встречи — это ровно то, что помещается в колонку рядом с
 *  обсуждениями и не превращает главную в расписание. Всё остальное — на
 *  вкладке «Встречи» своего сообщества. */
const MEETUPS_SHOWN = 3;
/** Четыре темы: колонки должны сойтись по высоте с тремя карточками
 *  встреч, а лента разговоров на главной — оставаться анонсом. */
const POSTS_SHOWN = 4;
/** Сколько текста показать вместо заголовка. Заголовка у темы может не
 *  быть намеренно (половина разговоров начинается репликой) — то же
 *  правило, что в строке списка тем (`PostCard`). */
const EXCERPT_MAX = 80;

export default async function HomeCommunities({ userId }: { userId: string }) {
  const { t, locale } = await getT();

  const [occurrences, posts] = await Promise.all([
    // Встречи берём СО СТОРОНЫ ДАТЫ, а не события: нужны ближайшие по
    // времени, и сортировка с ограничением должны считаться в базе.
    // У встречи дата ровно одна (см. eventActions.ts), поэтому строка
    // occurrence и есть встреча, дублей не будет.
    prisma.eventOccurrence.findMany({
      where: {
        startsAt: { gte: new Date() },
        event: viewerMeetupsWhere(userId),
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        hasTime: true,
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
            venue: true,
            // Онлайн-встреча: бейдж «Онлайн» на месте площадки.
            isOnline: true,
            timezone: true,
            description: true,
            posterUrl: true,
            community: { select: { id: true, slug: true, title: true } },
          },
        },
      },
      orderBy: { startsAt: "asc" },
      take: MEETUPS_SHOWN,
    }),
    prisma.communityPost.findMany({
      where: { community: viewerCommunitiesWhere(userId) },
      select: {
        id: true,
        title: true,
        text: true,
        createdAt: true,
        author: { select: { name: true, photoUrl: true, deletedAt: true } },
        community: { select: { id: true, slug: true, title: true } },
        // Число ответов считает база: строке нужно одно число, а не сами
        // реплики с картинками (то же, что во вкладке «Обсуждения»).
        _count: { select: { comments: true } },
      },
      // Закреп здесь НЕ учитывается, в отличие от вкладки: закреплённые
      // правила сообщества — это его собственная витрина, а главная
      // отвечает на «что нового», и месячный закреп занимал бы её
      // вечно.
      orderBy: { createdAt: "desc" },
      take: POSTS_SHOWN,
    }),
  ]);

  // Участник без единой темы и без ближайших встреч видит не пустой
  // блок, а его отсутствие — как и остальные секции главной.
  if (occurrences.length === 0 && posts.length === 0) return null;

  // Состояние кнопок карточки — теми же общими выборками, что кормят
  // афишу: карточка одна, и «иду» с «возможно» должны считаться
  // одинаково везде. Запрос идёт по горстке уже найденных id.
  const [goingIds, maybeIds] = await Promise.all([
    getGoingOccurrenceIds(
      occurrences.map((o) => o.id),
      userId,
    ),
    getMaybeOccurrenceIds(
      occurrences.map((o) => o.id),
      userId,
    ),
  ]);

  const twoColumns = occurrences.length > 0 && posts.length > 0;

  return (
    // Отступ задаёт бенто-сетка (gap), свой mt-4 внутри плитки
    // сдвигал бы заголовок вниз относительно соседей.
    <section>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h2 className="section-heading mb-0">{t.home.communities}</h2>
        <Link href="/communities" className="small text-secondary">
          {t.common.all}
        </Link>
      </div>

      <div className="row g-4 align-items-stretch">
        {occurrences.length > 0 && (
          <div className={twoColumns ? "col-12 col-lg-6" : "col-12"}>
            <h3 className="small text-secondary mb-2">
              {t.home.communityMeetups}
            </h3>
            <div className="d-flex flex-column gap-2 stagger">
              {occurrences.map((o) => {
                // Ровно та же плоская строка, что везёт афиша
                // (`flattenOccurrence`): карточка встречи — ТА ЖЕ, что
                // карточка события, своей верстки у встречи нет.
                const event: EventWithPerformers = {
                  id: o.event.id,
                  occurrenceId: o.id,
                  title: o.event.title,
                  slug: o.event.slug,
                  venue: o.event.venue,
                  isOnline: o.event.isOnline,
                  description: o.event.description,
                  posterUrl: o.event.posterUrl,
                  startsAt: o.startsAt,
                  hasTime: o.hasTime,
                  endsAt: o.endsAt,
                  timezone: o.event.timezone,
                  // Артистов на домашней встрече не бывает.
                  performers: [],
                  // А вот сообщество здесь нужно (в отличие от вкладки
                  // самого сообщества, где чип повторял бы шапку): на
                  // главной встречи идут вперемешку, и без чипа не
                  // видно, чья это встреча.
                  community: o.event.community,
                };
                return (
                  <EventCard
                    key={o.id}
                    event={event}
                    isGoing={goingIds.has(o.id)}
                    isMaybe={maybeIds.has(o.id)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {posts.length > 0 && (
          <div className={twoColumns ? "col-12 col-lg-6" : "col-12"}>
            <h3 className="small text-secondary mb-2">
              {t.home.communityPosts}
            </h3>
            <div className="d-flex flex-column gap-2 stagger">
              {posts.map((post) => {
                const authorName = post.author.deletedAt
                  ? t.common.deletedAccount
                  : post.author.name;
                const excerpt =
                  post.text.length > EXCERPT_MAX
                    ? `${post.text.slice(0, EXCERPT_MAX).trimEnd()}…`
                    : post.text;
                // Строка целиком — ссылка на тему, поэтому название
                // сообщества внутри неё обычным текстом: ссылка в ссылке
                // невалидна, а на главной человеку нужен разговор, а не
                // ещё один переход на витрину сообщества.
                return (
                  <Link
                    key={post.id}
                    href={`${communityHref(post.community)}/posts/${post.id}`}
                    className="surface surface-hover p-3 d-flex align-items-start gap-2 text-decoration-none"
                  >
                    <LetterAvatar
                      name={authorName}
                      photoUrl={post.author.photoUrl}
                      size={2.25}
                    />
                    <span className="flex-fill" style={{ minWidth: 0 }}>
                      <span className="text-white d-block text-truncate">
                        {post.title ?? excerpt}
                      </span>
                      {/* Подпись отвечает на «откуда это и стоит ли
                          открывать»: сообщество первым — тем оно и
                          отличается от соседней строки. Автора без имени
                          в строке просто нет: пустое « · » выглядит
                          поломкой. */}
                      <span className="small text-secondary d-block text-truncate">
                        {[
                          post.community.title,
                          authorName,
                          formatShortDate(post.createdAt, locale),
                          t.home.communityReplies(post._count.comments),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
