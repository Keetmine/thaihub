"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import AppLink from "@/components/AppLink";
import { useT } from "@/components/LocaleProvider";
import { answerGameRound, newGameRound } from "./actions";
import type { GameAnswer, GameRound } from "@/lib/posterGame";

/** Стрик держим в localStorage, а не в базе: игра открыта гостю, и
 *  заводить ради счётчика таблицу (и логин) незачем. Слетел браузерный
 *  профиль — слетел и стрик, для витринной игры это честная цена. */
const STREAK_KEY = "posterGame.streak";
const BEST_KEY = "posterGame.best";

function readNumber(key: string): number {
  // localStorage может быть недоступен (приватный режим) — игра обязана
  // работать и без него, просто счёт не переживёт перезагрузку.
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Некуда писать — молча играем без сохранения.
  }
}

// Сохранённый счёт читаем через useSyncExternalStore (паттерн
// CookieConsent): на сервере снимок — ноль, на клиенте — фактический,
// без расхождения гидрации и без setState в эффекте, который ловит
// линтер. Подписка пустая: счёт меняет только сама игра ниже.
const noopSubscribe = () => () => {};
const streakSnapshot = () => readNumber(STREAK_KEY);
const bestSnapshot = () => readNumber(BEST_KEY);
const serverZero = () => 0;

export default function GameClient({ initialRound }: { initialRound: GameRound }) {
  const t = useT();
  const [round, setRound] = useState<GameRound>(initialRound);
  const [answer, setAnswer] = useState<GameAnswer | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [isPending, startTransition] = useTransition();

  const storedStreak = useSyncExternalStore(noopSubscribe, streakSnapshot, serverZero);
  const storedBest = useSyncExternalStore(noopSubscribe, bestSnapshot, serverZero);
  // Счёт этой сессии — приоритетнее сохранённого снимка.
  const [sessionStreak, setSessionStreak] = useState<number | null>(null);
  const [sessionBest, setSessionBest] = useState<number | null>(null);
  const streak = sessionStreak ?? storedStreak;
  const best = sessionBest ?? storedBest;

  const answered = answer?.status === "answered" ? answer : null;

  function nextRound() {
    startTransition(async () => {
      const fresh = await newGameRound();
      // Каталог мог опустеть прямо под ногами — крайне маловероятно;
      // остаёмся на текущем раунде, чтобы не рисовать дыру.
      if (!fresh) return;
      setRound(fresh);
      setAnswer(null);
      setChosenId(null);
      setExpired(false);
    });
  }

  function choose(id: string) {
    if (answered || isPending) return;
    setChosenId(id);
    startTransition(async () => {
      const result = await answerGameRound(round.token, id);
      if (result.status === "expired") {
        // Сервер перезапустили, пока человек думал: показываем мягкое
        // объяснение и тут же готовим новый раунд.
        setChosenId(null);
        setExpired(true);
        return;
      }
      setAnswer(result);
      const next = result.correct ? streak + 1 : 0;
      setSessionStreak(next);
      writeNumber(STREAK_KEY, next);
      if (next > best) {
        setSessionBest(next);
        writeNumber(BEST_KEY, next);
      }
    });
  }

  return (
    <div className="mx-auto" style={{ maxWidth: "26rem" }}>
      <div className="d-flex justify-content-between small text-secondary mb-3">
        <span>{t.game.streak(streak)}</span>
        {best > 0 && <span>{t.game.best(best)}</span>}
      </div>

      {/* Постер размывается CSS-фильтром: сам файл не трогаем. scale
          прячет прозрачную кайму, которую blur оставляет по краям. */}
      <div
        className="surface overflow-hidden mx-auto mb-3"
        style={{ maxWidth: "18rem", aspectRatio: "2 / 3" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- постеры
            уже лежат в /uploads готового размера, оптимизатор не нужен
            (как и в остальных карточках каталога). */}
        <img
          src={round.posterUrl}
          alt={answered ? answered.drama.title : t.game.posterAlt}
          className="w-100 h-100"
          style={{
            objectFit: "cover",
            filter: answered ? "none" : "blur(18px) saturate(1.1)",
            transform: answered ? "none" : "scale(1.12)",
            transition: "filter 0.6s ease, transform 0.6s ease",
            opacity: isPending && !answered ? 0.5 : 1,
          }}
        />
      </div>

      {expired && <p className="small text-secondary text-center mb-3">{t.game.expired}</p>}

      {answered ? (
        <div className="text-center mb-3">
          <p className={`fw-medium mb-1 ${answered.correct ? "text-success" : "text-danger"}`}>
            {answered.correct ? t.game.right : t.game.wrong}
          </p>
          {/* Развязка: ссылка на страницу сериала — угадал или нет,
              постер уже раскрыт, самое время пойти посмотреть. */}
          <AppLink href={answered.drama.href} className="fw-medium">
            {answered.drama.title}
            {answered.drama.year ? ` (${answered.drama.year})` : ""}
          </AppLink>
        </div>
      ) : (
        <p className="small text-secondary text-center mb-3">{t.game.question}</p>
      )}

      {/* Четыре варианта столбиком — так и на телефоне, и на десктопе:
          длинные названия сериалов в два столбца не влезают. */}
      <div className="d-grid gap-2 mb-3">
        {round.options.map((o) => {
          // Подсветка после ответа: правильный — зелёный всегда, свой
          // неверный — красный; остальные гаснут.
          const cls = !answered
            ? "btn-outline-secondary"
            : o.id === answered.correctId
              ? "btn-success"
              : o.id === chosenId
                ? "btn-danger"
                : "btn-outline-secondary opacity-50";
          return (
            <button
              key={o.id}
              type="button"
              className={`btn ${cls} text-start`}
              disabled={!!answered || isPending}
              onClick={() => choose(o.id)}
            >
              {o.title}
            </button>
          );
        })}
      </div>

      {(answered || expired) && (
        <div className="text-center">
          <button type="button" className="btn btn-primary" disabled={isPending} onClick={nextRound}>
            {isPending ? t.game.loading : t.game.next}
          </button>
        </div>
      )}
    </div>
  );
}
