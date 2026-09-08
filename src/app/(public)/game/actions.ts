"use server";

import { getT } from "@/lib/i18n";
import {
  buildGameRound,
  resolveGameAnswer,
  type GameAnswer,
  type GameRound,
} from "@/lib/posterGame";

/**
 * Экшены игры «Угадай сериал по постеру». Открыты гостю — как и сама
 * страница /game: ни сессии, ни записи в базу тут нет, стрик живёт в
 * localStorage у клиента.
 *
 * Язык берём из заголовка запроса (server actions его видят): варианты
 * ответов и название в развязке приходят на языке зрителя.
 */

/** Следующий раунд — кнопка «Ещё». null — играть не из чего. */
export async function newGameRound(): Promise<GameRound | null> {
  const { locale } = await getT();
  return buildGameRound(locale);
}

/** Проверка ответа. Правильный вариант клиент узнаёт только отсюда —
 *  в раунде он не помечен (см. src/lib/posterGame.ts). */
export async function answerGameRound(token: string, chosenId: string): Promise<GameAnswer> {
  const { locale } = await getT();
  return resolveGameAnswer(token, chosenId, locale);
}
