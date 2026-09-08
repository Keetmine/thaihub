import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, localeHref } from "@/lib/i18n";
import { communityAccess } from "@/lib/communities";

/**
 * Серверная половина правил сообщества (АА25).
 *
 * Отдельный файл, а не продолжение `lib/communities.ts`, потому что тот
 * импортируют клиентские компоненты (константы полей в
 * `CreateCommunityButton`/`CommunityAdmin`) — prisma отсюда уехала бы в
 * клиентский бандл. И не внутри файлов с `"use server"`: там любой
 * экспорт становится вызываемой снаружи точкой входа, из-за чего
 * `requireManaged` и жил тремя копиями (actions.ts, coverActions.ts,
 * whereActions.ts). Копии успели разъехаться ровно так, как это бывает:
 * смотрели роль без `status: "ACTIVE"` и держались на том, что бан
 * сбрасывает роль (аудит 2026-09, п.1.8).
 */

/**
 * Сообщество, которым текущий пользователь вправе управлять (владелец
 * или ДЕЙСТВУЮЩИЙ модератор), либо null — вызывающий превращает его в
 * ошибку. Само правило не здесь, а в `communityAccess` (`canManage`):
 * модератор — только участник со `status: "ACTIVE"`, роль в строке
 * может остаться со времён, когда человека уже убрали.
 */
export async function requireManagedCommunity(communityId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/communities", await getLocale()));
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: { members: { where: { userId: user.id } } },
  });
  if (!community) return null;
  const mine = community.members[0];
  const access = communityAccess(
    community,
    user.id,
    mine ? { role: mine.role, status: mine.status } : null,
  );
  if (!access.canManage) return null;
  return { user, community, isOwner: access.isOwner };
}
