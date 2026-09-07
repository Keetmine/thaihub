"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { notifyUser, type NotifyUserRecipient } from "@/lib/notifications";

/**
 * Обсуждения сообщества (АА25, этап 2): темы и комментарии к ним.
 *
 * Правило доступа тут одно и то же во всех экшенах: **писать может
 * только участник**. Проверка живёт на сервере, а не в том, какие
 * кнопки нарисованы: страница сообщества открывается и гостю (см.
 * docs/features/communities.md), а форму можно отправить и мимо
 * интерфейса.
 *
 * Комментарии — та же модель `Comment`, что у сериалов и событий, через
 * новую связь `postId`. Своей модели нет намеренно: лайки
 * (`CommentLike`) и ответы (`parentId`, один уровень) уже написаны и
 * работают, а вторая копия того же кода разъехалась бы с первой.
 */

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action, и клиент видит generic error boundary
 *  вместо причины (то же правило, что в communities/actions.ts). */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

/** Потолки текста. Те же числа стоят в `maxLength` полей формы
 *  (PostForm.tsx, PostCard.tsx) — браузер подсказывает предел заранее,
 *  сервер режет то, что пришло мимо браузера. */
const POST_TITLE_MAX = 120;
const POST_TEXT_MAX = 5000;
const POST_COMMENT_MAX = 3000;

/** Что мы знаем о зрителе внутри сообщества. */
type Membership = {
  user: { id: string; name: string | null; isAdmin: boolean };
  community: { id: string; title: string; slug: string | null };
  isOwner: boolean;
  /** Владелец или модератор: закрепляет темы и убирает чужое. */
  canManage: boolean;
};

/**
 * Участник сообщества — или null, и вызывающий превращает его в ошибку.
 *
 * Владелец считается участником всегда: строка `CommunityMember` у него
 * есть (её заводит создание), но полагаться на неё одну не хочется —
 * хозяин не должен терять доступ к своему сообществу из-за кривой
 * строки в базе.
 */
async function requireMember(communityId: string): Promise<Membership | null> {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: {
      id: true,
      title: true,
      slug: true,
      ownerId: true,
      members: { where: { userId: user.id }, select: { role: true, status: true } },
    },
  });
  if (!community) return null;

  const isOwner = community.ownerId === user.id;
  const membership = community.members[0];
  if (!isOwner && membership?.status !== "ACTIVE") return null;

  return {
    user: { id: user.id, name: user.name, isAdmin: user.isAdmin },
    community: { id: community.id, title: community.title, slug: community.slug },
    isOwner,
    canManage: isOwner || membership?.role === "MODERATOR",
  };
}

function communityPath(community: { id: string; slug: string | null }): string {
  return `/communities/${community.slug ?? community.id}`;
}

/** Обсуждения открываются своей вкладкой: ссылка из колокольчика должна
 *  вести к теме, а не на первую попавшуюся панель сообщества. */
function discussionsPath(community: { id: string; slug: string | null }): string {
  return `${communityPath(community)}?tab=discussions`;
}

// ---------- темы ----------

/**
 * Новая тема. Заголовок необязателен: половина обсуждений начинается
 * репликой («кто идёт на фанмит?»), и обязательное поле заставляло бы
 * придумывать ей название.
 */
export async function createPost(
  communityId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { t } = await getT();
  const member = await requireMember(communityId);
  if (!member) return { ok: false, error: t.communities.posts.errors.notMember };

  const title = String(formData.get("title") ?? "").trim().slice(0, POST_TITLE_MAX);
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: t.communities.posts.errors.textRequired };
  if (text.length > POST_TEXT_MAX) {
    return { ok: false, error: t.communities.posts.errors.textTooLong(POST_TEXT_MAX) };
  }

  const post = await prisma.communityPost.create({
    data: { communityId, authorId: member.user.id, title: title || null, text },
  });

  await notifyMembersAboutPost(member, post.id, title || text);
  revalidatePath(communityPath(member.community));
  return { ok: true };
}

/**
 * Уведомить участников о новой теме.
 *
 * Получатели читаются ОДНИМ запросом вместе с их настройками и языком и
 * отдаются в `notifyUser` готовыми: иначе на каждого участника ушёл бы
 * свой `findUnique` (N+1 в сообществе на сотню человек).
 *
 * В Telegram это уведомление не уходит намеренно — его нет в
 * `TELEGRAM_KINDS` (`src/lib/notifications.ts`): у живого сообщества тем
 * много, и бот превратился бы в спамера. Тема остаётся в колокольчике.
 *
 * Автору себе не шлём: `notifyUser` отсекает это сам по `actorId`, но и
 * из выборки он убран — незачем заводить строку, которую тут же выкинут.
 */
async function notifyMembersAboutPost(
  member: Membership,
  postId: string,
  preview: string,
): Promise<void> {
  const recipients = await prisma.communityMember.findMany({
    where: {
      communityId: member.community.id,
      status: "ACTIVE",
      userId: { not: member.user.id },
    },
    select: {
      userId: true,
      user: {
        select: {
          locale: true,
          telegramId: true,
          tgNotifyInvites: true,
          tgNotifyFriends: true,
          tgNotifyReplies: true,
          tgNotifyEvents: true,
          tgNotifyBirthdays: true,
          tgNotifyEpisodes: true,
        },
      },
    },
  });

  const href = `${discussionsPath(member.community)}#post-${postId}`;
  for (const r of recipients) {
    await notifyUser({
      userId: r.userId,
      actorId: member.user.id,
      kind: "COMMUNITY_POST",
      actorName: member.user.name,
      subject: member.community.title,
      body: preview.slice(0, 200),
      href,
      user: r.user as NotifyUserRecipient,
    });
  }
}

/**
 * Убрать тему. Может автор, владелец сообщества, модератор и админ
 * сайта: в чужом сообществе порядок наводят его хозяева, а админ — на
 * случай, когда хозяева и есть проблема.
 */
export async function deletePost(postId: string): Promise<ActionResult> {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));

  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, communityId: true, community: { select: { id: true, slug: true } } },
  });
  // Темы уже нет — считаем, что задача выполнена: жать «удалить» дважды
  // человек мог просто из-за двойного клика.
  if (!post) return { ok: true };

  const member = await requireMember(post.communityId);
  const allowed =
    user.isAdmin || post.authorId === user.id || !!member?.canManage;
  if (!allowed) return { ok: false, error: t.communities.posts.errors.cannotDelete };

  // Комментарии уходят каскадом (Comment.post onDelete: Cascade).
  await prisma.communityPost.delete({ where: { id: postId } });
  revalidatePath(communityPath(post.community));
  return { ok: true };
}

/**
 * Закрепить/открепить тему — только владелец и модератор. Закреп — это
 * правила сообщества и знакомство: право решать, что висит наверху,
 * принадлежит тем, кто за сообщество отвечает, а не любому участнику.
 */
export async function togglePostPin(postId: string): Promise<ActionResult> {
  const { t } = await getT();
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { id: true, pinned: true, communityId: true, community: { select: { id: true, slug: true } } },
  });
  if (!post) return { ok: false, error: t.communities.posts.errors.postNotFound };

  const member = await requireMember(post.communityId);
  if (!member?.canManage) return { ok: false, error: t.communities.posts.errors.cannotPin };

  await prisma.communityPost.update({
    where: { id: postId },
    data: { pinned: !post.pinned },
  });
  revalidatePath(communityPath(post.community));
  return { ok: true };
}

// ---------- комментарии к темам ----------

/**
 * Комментарий к теме (и ответ на комментарий — один уровень, как везде
 * на сайте: ответ на ответ прикрепляется к корню треда).
 */
export async function addPostComment(
  postId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { t } = await getT();
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { id: true, communityId: true, community: { select: { id: true, slug: true } } },
  });
  if (!post) return { ok: false, error: t.communities.posts.errors.postNotFound };

  const member = await requireMember(post.communityId);
  if (!member) return { ok: false, error: t.communities.posts.errors.notMember };

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: t.communities.posts.errors.commentRequired };
  if (text.length > POST_COMMENT_MAX) {
    return { ok: false, error: t.communities.posts.errors.commentTooLong(POST_COMMENT_MAX) };
  }

  // Родитель ищется В ПРЕДЕЛАХ ТЕМЫ: иначе чужой commentId из другой
  // темы (или вовсе с сериала) пришил бы ответ не туда.
  let parentId: string | null = String(formData.get("parentId") ?? "").trim() || null;
  let parentAuthor: { id: string; name: string | null } | null = null;
  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, postId },
      select: { id: true, parentId: true, user: { select: { id: true, name: true } } },
    });
    if (!parent) return { ok: false, error: t.communities.posts.errors.parentNotFound };
    parentId = parent.parentId ?? parent.id;
    parentAuthor = parent.user;
  }

  await prisma.comment.create({
    data: { userId: member.user.id, postId, parentId, text },
  });

  // Ответ автору родителя — обычным COMMENT_REPLY: для читателя это тот
  // же повод, что ответ под сериалом, и отдельного вида он не стоит.
  if (parentAuthor) {
    await notifyUser({
      userId: parentAuthor.id,
      actorId: member.user.id,
      kind: "COMMENT_REPLY",
      actorName: member.user.name,
      body: text.slice(0, 200),
      href: `${discussionsPath(member.community)}#post-${postId}`,
    });
  }
  revalidatePath(communityPath(post.community));
  return { ok: true };
}

/**
 * Убрать комментарий к теме. Права те же, что у темы: автор, хозяева
 * сообщества, админ сайта. Своим экшеном, а не общим `deleteComment`
 * из reviews/actions.ts: тот не знает про роли в сообществе и пускал бы
 * к чужому комментарию только админа.
 */
export async function deletePostComment(commentId: string): Promise<ActionResult> {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      userId: true,
      post: { select: { communityId: true, community: { select: { id: true, slug: true } } } },
    },
  });
  if (!comment) return { ok: true };
  // Не комментарий темы — не наше дело: для сериалов и событий есть свой
  // экшен со своими правами.
  if (!comment.post) return { ok: false, error: t.communities.posts.errors.cannotDelete };

  const member = await requireMember(comment.post.communityId);
  const allowed = user.isAdmin || comment.userId === user.id || !!member?.canManage;
  if (!allowed) return { ok: false, error: t.communities.posts.errors.cannotDelete };

  await prisma.comment.delete({ where: { id: commentId } });
  revalidatePath(communityPath(comment.post.community));
  return { ok: true };
}
