"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getT } from "@/lib/i18n";
import {
  setDramaEpisodesWatched,
  type ActionError,
  type ActionResult,
} from "@/app/(public)/favorites/actions";

/** Та же верхняя граница, что у счётчика серий в favorites/actions.ts:
 *  номер серии заведомо конечен, даже когда `Drama.episodes` неизвестно. */
const MAX_EPISODE = 9999;

/** Лимит заметки. Дневник — однострочные впечатления, не рецензии:
 *  длинному тексту место в отзыве, а строка без потолка — приглашение
 *  залить в базу мегабайт. */
const MAX_NOTE_LENGTH = 500;

/** Номер серии, каким его можно пускать в базу. Проверка на сервере, а
 *  не только в разметке: экшен вызывается напрямую, мимо страницы. */
function isValidEpisode(episode: number): boolean {
  return Number.isInteger(episode) && episode >= 1 && episode <= MAX_EPISODE;
}

/**
 * Галочка «смотрела» у конкретной серии в дневнике: создаёт или удаляет
 * строку `EpisodeWatch` (дата — момент отметки).
 *
 * СВЯЗЬ со счётчиком серий — в одну сторону. Отметка серии N подтягивает
 * `episodesWatched` до max(текущее, N) тем же экшеном, что и «+» у
 * счётчика (`setDramaEpisodesWatched`), — вместе с его автопереходами
 * статуса: досмотренный целиком сериал уйдёт в «Просмотрено», отмеченный
 * из планов — в «Смотрю сейчас». Обратной связи нет НАМЕРЕННО: «+» на
 * счётчике дневник не заполняет — человек, щёлкающий счётчик, мог не
 * хотеть дат задним числом, а дневник ценен именно честными датами.
 * Снятие галочки счётчик тоже не откатывает: галочку снимают, чтобы
 * поправить случайный клик, а не чтобы «разсмотреть» серию.
 */
export async function toggleEpisodeWatch(
  dramaId: string,
  episode: number,
): Promise<{ ok: true; watched: boolean } | ActionError> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isValidEpisode(episode)) {
    return { ok: false, error: (await getT()).t.catalog.errors.badEpisodes };
  }
  // Несуществующий сериал — то же «не найдено», что у соседних экшенов:
  // подделанный id не должен ронять 500 и не должен плодить сирот.
  const drama = await prisma.drama.findUnique({
    where: { id: dramaId },
    select: { id: true },
  });
  if (!drama) {
    return { ok: false, error: (await getT()).t.catalog.errors.dramaNotFound };
  }

  // Составной ключ включает user.id из СЕССИИ — чужую строку этим
  // экшеном не тронуть, какие бы аргументы ни прислали.
  const key = { userId_dramaId_episode: { userId: user.id, dramaId, episode } };
  const existing = await prisma.episodeWatch.findUnique({ where: key });

  if (existing) {
    await prisma.episodeWatch.delete({ where: key });
    revalidatePath(`/dramas/${dramaId}`);
    return { ok: true, watched: false };
  }

  await prisma.episodeWatch.create({
    data: { userId: user.id, dramaId, episode },
  });

  const current = await prisma.dramaWatchStatus.findUnique({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    select: { episodesWatched: true },
  });
  if ((current?.episodesWatched ?? 0) < episode) {
    // setDramaEpisodesWatched сам ревалидирует страницы и двигает статус.
    const result = await setDramaEpisodesWatched(dramaId, episode);
    if (!result.ok) return result;
  } else {
    revalidatePath(`/dramas/${dramaId}`);
  }
  return { ok: true, watched: true };
}

/**
 * Заметка к отмеченной серии; сохраняется по уходу из поля. Пустая
 * строка стирает заметку (NULL), а не хранит «пусто». Заметка живёт
 * только на существующей отметке: впечатление без факта просмотра —
 * противоречие, и разметка поле у неотмеченной серии выключает; проверка
 * здесь — на прямой вызов экшена.
 */
export async function setEpisodeNote(
  dramaId: string,
  episode: number,
  note: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isValidEpisode(episode)) {
    return { ok: false, error: (await getT()).t.catalog.errors.badEpisodes };
  }
  // typeof — не формальность: типы TS на границе экшена ничего не
  // гарантируют, прислать сюда объект можно прямым POST.
  if (typeof note !== "string" || note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: (await getT()).t.catalog.errors.noteTooLong };
  }

  const key = { userId_dramaId_episode: { userId: user.id, dramaId, episode } };
  const existing = await prisma.episodeWatch.findUnique({
    where: key,
    select: { userId: true },
  });
  if (!existing) {
    return {
      ok: false,
      error: (await getT()).t.catalog.errors.episodeNotMarked,
    };
  }

  const trimmed = note.trim();
  await prisma.episodeWatch.update({
    where: key,
    data: { note: trimmed || null },
  });
  revalidatePath(`/dramas/${dramaId}`);
  return { ok: true };
}
