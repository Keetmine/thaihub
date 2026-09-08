"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { canSeeMeetup } from "@/lib/meetups";
import { isPremiumActive } from "@/lib/premium";
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

export async function toggleFavoriteEvent(eventId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Добавить в избранное встречу сообщества может только тот, кто
  // вправе её видеть — по образцу toggleGoing ниже: id угадать нельзя,
  // но экшен вызывается напрямую, мимо любой страницы (см.
  // lib/meetups.ts). Несуществующее событие отвечает тем же «не
  // найдено» — и это же чинит 500 на подделанный id.
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { communityId: true },
  });
  if (!event || !(await canSeeMeetup(event, user.id))) {
    return { ok: false, error: (await getT()).t.events.errors.notFound };
  }

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
  return { ok: true };
}

const WATCH_STATUSES = [
  "WATCHING",
  "COMPLETED",
  "ON_HOLD",
  "PLAN_TO_WATCH",
  "DROPPED",
] as const;
export type DramaWatchStatusValue = (typeof WATCH_STATUSES)[number];

/**
 * Ответ смены статуса чуть богаче обычного `{ ok: true }`: клиенту нужно
 * знать, был ли это ПЕРЕХОД в «Просмотрено» и стоит ли уже своя оценка —
 * от этого зависит, показывать ли попап «поставьте оценку». Считать это
 * на клиенте нельзя: у кнопки в фильмографии оценки просто нет в пропсах.
 */
export type SetStatusResult =
  | { ok: true; completedNow: boolean; hasRating: boolean }
  | ActionError;

export async function setDramaWatchStatus(
  dramaId: string,
  status: DramaWatchStatusValue,
): Promise<SetStatusResult> {
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
      select: { status: true, rating: true },
    }),
  ]);

  // Колокольчик серий (З1): при ПЕРЕХОДЕ в «Смотрю сейчас» включается,
  // при уходе из него — гаснет. Только при смене статуса: повторный клик
  // по тому же статусу не должен перебивать выключенный руками
  // колокольчик.
  const statusChanged = current?.status !== status;
  // Дата досмотра — только при ПЕРЕХОДЕ в «Просмотрено»: повторный клик
  // по уже стоящему статусу дату не переписывает. Уход из «Просмотрено»
  // её не стирает (история просмотра честнее с датой), а новое досмотрение
  // после «Смотреть заново» перезапишет её на свежую — итоги года считают
  // по последней.
  const completedNow = status === "COMPLETED" && statusChanged;
  await prisma.dramaWatchStatus.upsert({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    update: {
      status,
      ...(total ? { episodesWatched: total } : {}),
      ...(statusChanged ? { notifyEpisodes: status === "WATCHING" } : {}),
      ...(completedNow ? { completedAt: new Date() } : {}),
    },
    create: {
      userId: user.id,
      dramaId,
      status,
      episodesWatched: total,
      notifyEpisodes: status === "WATCHING",
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
  return { ok: true, completedNow, hasRating: current?.rating != null };
}

/** Потолок пересмотров. Число заведомо больше любой правды и нужно
 *  только затем, чтобы залипшая кнопка не записала в базу миллион. */
const MAX_REWATCHES = 99;

/**
 * «Смотрела этот сериал ещё раз»: ±1 к счётчику пересмотров.
 *
 * Счётчик держит просмотры СВЕРХ первого, поэтому «смотрела 3 раза» —
 * это `rewatchCount = 2`. Минус нужен не меньше плюса: промахнуться по
 * соседней кнопке легко, а иначе цифру уже не поправить.
 *
 * Строка статуса должна существовать: пересмотр — это про сериал,
 * который человек уже отметил у себя. Без строки не заводим её молча:
 * непонятно, какой статус тогда ставить, а угаданный статус потом ищут
 * глазами и не находят.
 */
export async function changeRewatchCount(
  dramaId: string,
  delta: 1 | -1,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = await prisma.dramaWatchStatus.findUnique({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    select: { rewatchCount: true },
  });
  if (!current) return { ok: false, error: (await getT()).t.catalog.errors.dramaNotFound };

  const next = Math.min(MAX_REWATCHES, Math.max(0, current.rewatchCount + delta));
  // Считаем от прочитанного значения, а не `increment`: так же ведёт
  // себя счётчик серий, и клиент рисует ровно то, что окажется в базе.
  if (next !== current.rewatchCount) {
    await prisma.dramaWatchStatus.update({
      where: { userId_dramaId: { userId: user.id, dramaId } },
      data: { rewatchCount: next },
    });
  }

  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
  return { ok: true };
}

/**
 * «Смотреть заново»: начать пересмотр досмотренного сериала.
 *
 * Одной кнопкой делает всё, что человек иначе делал бы руками и в
 * непонятном порядке: возвращает статус «Смотрю сейчас», обнуляет
 * счётчик серий и добавляет просмотр к пересмотрам. Без неё начать
 * пересмотр было негде — статус «Просмотрено» стоял, серии показывали
 * «22 из 22», и на вопрос «я смотрю это заново» интерфейс не отвечал
 * (замечание владельца 2026-09-09).
 *
 * Пересмотр считаем в момент НАЧАЛА, а не окончания: иначе пришлось бы
 * держать скрытый признак «идёт пересмотр» и гадать, чем кончилось.
 * Брошенный пересмотр человек снимет минусом у счётчика — он рядом.
 *
 * Колокольчик новых серий включаем, как и при обычном переходе в
 * «Смотрю сейчас» (см. setDramaWatchStatus).
 */
export async function startRewatch(dramaId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = await prisma.dramaWatchStatus.findUnique({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    select: { rewatchCount: true, status: true },
  });
  // Заново смотрят то, что досмотрели. У остального кнопки нет, и
  // прямой вызов экшена её себе не выпишет.
  if (!current || current.status !== "COMPLETED") {
    return { ok: false, error: (await getT()).t.catalog.errors.dramaNotFound };
  }

  await prisma.dramaWatchStatus.update({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    data: {
      status: "WATCHING",
      episodesWatched: 0,
      notifyEpisodes: true,
      rewatchCount: Math.min(MAX_REWATCHES, current.rewatchCount + 1),
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
): Promise<
  | {
      ok: true;
      watched: number;
      status: DramaWatchStatusValue;
      /** Автопереход в «Просмотрено» случился именно сейчас — клиент по
       *  нему решает, звать ли попап оценки (см. setDramaWatchStatus). */
      completedNow: boolean;
      hasRating: boolean;
    }
  | ActionError
> {
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
      select: { status: true, rating: true },
    }),
  ]);
  if (!drama)
    return { ok: false, error: (await getT()).t.catalog.errors.dramaNotFound };

  const total = drama.episodes ?? null;
  const watched = Math.max(
    0,
    Math.min(Math.floor(episodes), total ?? MAX_EPISODES),
  );
  const finishedAll = total !== null && watched >= total;

  let status: DramaWatchStatusValue = current?.status ?? "WATCHING";
  if (finishedAll && hasFinishedAiring(drama.status)) status = "COMPLETED";
  else if (status === "COMPLETED" && !finishedAll) status = "WATCHING";
  else if (watched > 0 && status === "PLAN_TO_WATCH") status = "WATCHING";

  // Автопереход в «Просмотрено» ставит дату досмотра по тем же правилам,
  // что и ручной (см. setDramaWatchStatus): только при переходе, откат
  // серии назад дату не стирает.
  const completedNow = status === "COMPLETED" && current?.status !== status;
  await prisma.dramaWatchStatus.upsert({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    update: {
      episodesWatched: watched,
      status,
      // Автосмена статуса двигает и колокольчик (как в setDramaWatchStatus);
      // при том же статусе не трогаем — выключенный руками не включаем.
      ...(current?.status !== status
        ? { notifyEpisodes: status === "WATCHING" }
        : {}),
      ...(completedNow ? { completedAt: new Date() } : {}),
    },
    create: {
      userId: user.id,
      dramaId,
      status,
      episodesWatched: watched,
      notifyEpisodes: status === "WATCHING",
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
  return {
    ok: true,
    watched,
    status,
    completedNow,
    hasRating: current?.rating != null,
  };
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
    create: {
      userId: user.id,
      dramaId,
      status: "WATCHING",
      notifyEpisodes: true,
    },
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

  await prisma.dramaWatchStatus.deleteMany({
    where: { userId: user.id, dramaId },
  });

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
  if (!occurrence)
    return { ok: false, error: (await getT()).t.events.going.dateNotFound };
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
    // Отметка «иду» на событие АФИШИ — часть подписки. Проверяем здесь,
    // а не только в разметке: страница события кнопки без подписки не
    // рисует, но экшен вызывается и напрямую, мимо любой страницы.
    //
    // Встречи сообществ — исключение, как и на странице события
    // (`isPremium || isMeetup`): участие в сообществе бесплатное, и
    // отметиться на встречу своего сообщества можно без подписки.
    //
    // Снятие отметки свободно всегда: у истёкшей подписки человек иначе
    // остался бы с планами в календаре и без способа их убрать (то же
    // правило, что у своих списков, — платно создание).
    if (!occurrence.event.communityId && !isPremiumActive(user)) {
      return { ok: false, error: (await getT()).t.events.going.premium };
    }
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
