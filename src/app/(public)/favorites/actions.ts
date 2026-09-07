"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { canSeeMeetup } from "@/lib/meetups";
import { getT } from "@/lib/i18n";
import type { DramaStatus } from "@/generated/prisma/client";

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action (см. promoActions.ts). */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

export async function toggleFavoritePerformer(performerId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.favoritePerformer.findUnique({
    where: { userId_performerId: { userId: user.id, performerId } },
  });

  if (existing) {
    await prisma.favoritePerformer.delete({
      where: { userId_performerId: { userId: user.id, performerId } },
    });
  } else {
    await prisma.favoritePerformer.create({
      data: { userId: user.id, performerId },
    });
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
}

export async function toggleFavoriteAgency(agencyId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.favoriteAgency.findUnique({
    where: { userId_agencyId: { userId: user.id, agencyId } },
  });

  if (existing) {
    await prisma.favoriteAgency.delete({
      where: { userId_agencyId: { userId: user.id, agencyId } },
    });
  } else {
    await prisma.favoriteAgency.create({
      data: { userId: user.id, agencyId },
    });
  }

  revalidatePath("/account");
  revalidatePath("/artists");
  revalidatePath(`/agencies/${agencyId}`);
}

export async function toggleFavoriteEvent(eventId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.favoriteEvent.findUnique({
    where: { userId_eventId: { userId: user.id, eventId } },
  });

  if (existing) {
    await prisma.favoriteEvent.delete({
      where: { userId_eventId: { userId: user.id, eventId } },
    });
  } else {
    await prisma.favoriteEvent.create({
      data: { userId: user.id, eventId },
    });
  }

  revalidatePath("/account");
  revalidatePath(`/event/${eventId}`);
}

const WATCH_STATUSES = ["WATCHING", "COMPLETED", "ON_HOLD", "PLAN_TO_WATCH", "DROPPED"] as const;
export type DramaWatchStatusValue = (typeof WATCH_STATUSES)[number];

export async function setDramaWatchStatus(
  dramaId: string,
  status: DramaWatchStatusValue,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!WATCH_STATUSES.includes(status)) {
    return { ok: false, error: (await getT()).t.catalog.errors.badStatus };
  }

  // «Просмотрено» вручную — значит просмотрено всё: досчитывать серии
  // после этого человек не должен. Если число серий неизвестно, оставляем
  // счётчик как есть — врать нечем.
  const [total, current] = await Promise.all([
    status === "COMPLETED"
      ? prisma.drama
          .findUnique({ where: { id: dramaId }, select: { episodes: true } })
          .then((d) => d?.episodes ?? null)
      : Promise.resolve(null),
    prisma.dramaWatchStatus.findUnique({
      where: { userId_dramaId: { userId: user.id, dramaId } },
      select: { status: true },
    }),
  ]);

  // Колокольчик серий (З1): при ПЕРЕХОДЕ в «Смотрю сейчас» включается,
  // при уходе из него — гаснет. Только при смене статуса: повторный клик
  // по тому же статусу не должен перебивать выключенный руками
  // колокольчик.
  const statusChanged = current?.status !== status;
  await prisma.dramaWatchStatus.upsert({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    update: {
      status,
      ...(total ? { episodesWatched: total } : {}),
      ...(statusChanged ? { notifyEpisodes: status === "WATCHING" } : {}),
    },
    create: {
      userId: user.id,
      dramaId,
      status,
      episodesWatched: total,
      notifyEpisodes: status === "WATCHING",
    },
  });

  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
  return { ok: true };
}

/** Верхняя граница, когда число серий у сериала неизвестно: счётчик всё
 *  равно должен быть конечным, иначе форма примет любое число. */
const MAX_EPISODES = 9999;

/**
 * Вышел ли сериал целиком.
 *
 * От этого зависит, закрывать ли его автоматически: у выходящего
 * «последняя серия» — это последняя из ВЫШЕДШИХ, дальше будут новые, и
 * переносить такое в «Просмотрено» нельзя. Неизвестный статус считаем
 * вышедшим: у половины импортированного сериала статуса нет вовсе, и
 * иначе автоматика там не работала бы никогда. Придерживаем только то,
 * про что точно знаем, что продолжение впереди.
 */
function hasFinishedAiring(status: DramaStatus | null): boolean {
  if (status === null) return true;
  return !["RETURNING_SERIES", "PLANNED", "IN_PRODUCTION"].includes(status);
}

/**
 * Отметить, на какой серии человек остановился.
 *
 * Заодно двигает статус, потому что иначе список «Смотрю сейчас» врёт:
 * досмотрел последнюю — сериал уходит в «Просмотрено», убавил обратно —
 * возвращается в «Смотрю сейчас». Отметил серию у того, что лежало в
 * планах, — значит уже смотрит. Руками статус после этого поменять
 * по-прежнему можно: автоматика только предугадывает очевидное.
 */
export async function setDramaEpisodesWatched(
  dramaId: string,
  episodes: number,
): Promise<{ ok: true; watched: number; status: DramaWatchStatusValue } | ActionError> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!Number.isFinite(episodes)) {
    return { ok: false, error: (await getT()).t.catalog.errors.badEpisodes };
  }

  const [drama, current] = await Promise.all([
    prisma.drama.findUnique({
      where: { id: dramaId },
      select: { episodes: true, status: true },
    }),
    prisma.dramaWatchStatus.findUnique({
      where: { userId_dramaId: { userId: user.id, dramaId } },
      select: { status: true },
    }),
  ]);
  if (!drama) return { ok: false, error: (await getT()).t.catalog.errors.dramaNotFound };

  const total = drama.episodes ?? null;
  const watched = Math.max(0, Math.min(Math.floor(episodes), total ?? MAX_EPISODES));
  const finishedAll = total !== null && watched >= total;

  let status: DramaWatchStatusValue = current?.status ?? "WATCHING";
  if (finishedAll && hasFinishedAiring(drama.status)) status = "COMPLETED";
  else if (status === "COMPLETED" && !finishedAll) status = "WATCHING";
  else if (watched > 0 && status === "PLAN_TO_WATCH") status = "WATCHING";

  await prisma.dramaWatchStatus.upsert({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    update: {
      episodesWatched: watched,
      status,
      // Автосмена статуса двигает и колокольчик (как в setDramaWatchStatus);
      // при том же статусе не трогаем — выключенный руками не включаем.
      ...(current?.status !== status ? { notifyEpisodes: status === "WATCHING" } : {}),
    },
    create: {
      userId: user.id,
      dramaId,
      status,
      episodesWatched: watched,
      notifyEpisodes: status === "WATCHING",
    },
  });

  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
  return { ok: true, watched, status };
}

/**
 * Колокольчик «уведомлять о новых сериях» на странице сериала (З1):
 * переключает подписку per-сериал. Без статуса просмотра подписка
 * заводит «Смотрю сейчас» — хотеть новости серий и значит смотреть.
 */
export async function toggleEpisodeNotifications(
  dramaId: string,
): Promise<{ enabled: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = await prisma.dramaWatchStatus.findUnique({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    select: { notifyEpisodes: true },
  });
  const enabled = !(current?.notifyEpisodes ?? false);
  await prisma.dramaWatchStatus.upsert({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    update: { notifyEpisodes: enabled },
    create: { userId: user.id, dramaId, status: "WATCHING", notifyEpisodes: true },
  });

  revalidatePath(`/dramas/${dramaId}`);
  return { enabled };
}

/**
 * Своя оценка сериалу, 1-10 (АА2).
 *
 * Живёт на строке просмотра, а не в отзыве: `Drama.mdlScore` — ОБЩАЯ
 * оценка с MyDramaList, а личную поставить было негде, кроме отзыва, и
 * ради «поставить 9» приходилось писать текст.
 *
 * Оценка подразумевает, что человек сериал смотрел: если строки
 * просмотра ещё нет, заводим её со статусом «Смотрю сейчас» — это
 * мягче, чем объявить сериал просмотренным за человека. `null` —
 * снять оценку; сама отметка просмотра при этом остаётся.
 */
export async function setDramaRating(
  dramaId: string,
  rating: number | null,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let value: number | null = null;
  if (rating !== null) {
    // Шкала десятибалльная (пять звёзд по два балла). Дробное сюда
    // приходит только от импорта с MDL — его половинки не режем,
    // округляем лишь к ближайшей половине балла.
    if (!Number.isFinite(rating)) {
      return { ok: false, error: (await getT()).t.catalog.errors.badRating };
    }
    value = Math.max(0.5, Math.min(10, Math.round(rating * 2) / 2));
  }

  await prisma.dramaWatchStatus.upsert({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    update: { rating: value },
    create: { userId: user.id, dramaId, status: "WATCHING", rating: value },
  });

  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
  return { ok: true };
}

export async function clearDramaWatchStatus(dramaId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await prisma.dramaWatchStatus.deleteMany({ where: { userId: user.id, dramaId } });

  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
}

// «Я пойду» — на конкретную ДАТУ события (occurrence): у двухдневного
// концерта можно идти только на один день.
export async function toggleGoing(occurrenceId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const occurrence = await prisma.eventOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { event: { select: { communityId: true } } },
  });
  if (!occurrence) return { ok: false, error: (await getT()).t.events.going.dateNotFound };
  // Отметиться на встречу сообщества может только тот, кто вправе её
  // видеть: id даты угадать нельзя, но и полагаться на это не станем —
  // экшен вызывается напрямую, мимо любой страницы (см. lib/meetups.ts).
  if (!(await canSeeMeetup(occurrence.event, user.id))) {
    return { ok: false, error: (await getT()).t.events.going.dateNotFound };
  }

  const existing = await prisma.eventAttendance.findUnique({
    where: { userId_occurrenceId: { userId: user.id, occurrenceId } },
  });

  if (existing) {
    await prisma.eventAttendance.delete({
      where: { userId_occurrenceId: { userId: user.id, occurrenceId } },
    });
  } else {
    await prisma.eventAttendance.create({
      data: { userId: user.id, occurrenceId, eventId: occurrence.eventId },
    });
    // Друзьям — «X идёт на …» (Г2). Fire-and-forget: сбой телеграма не
    // должен ломать саму отметку.
    void import("@/lib/telegramNotifications")
      .then((m) => m.notifyFriendsAboutGoing(user.id, occurrenceId))
      .catch(() => {});
  }

  revalidatePath("/account");
  revalidatePath(`/event/${occurrence.eventId}`);
  return { ok: true };
}
