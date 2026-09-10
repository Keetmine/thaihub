"use client";

import { useEffect, useState } from "react";

/**
 * Одна вспышка конфетти при заходе на страницу артиста в его день
 * рождения (просьба владельца 2026-09-10).
 *
 * Своими руками, без библиотеки: сотня пустых `<span>` с CSS-анимацией
 * весит ноль, а canvas-конфетти — это ещё один пакет в бандле ради трёх
 * секунд в году на артиста.
 *
 * Разброс считается в `useEffect`, а не при рендере: случайные числа на
 * сервере и на клиенте разные, и гидрация ругалась бы на каждый кусочек.
 * До эффекта компонент не рисует ничего — на сервере его в разметке нет
 * вовсе, поэтому и мигать нечему.
 *
 * `prefers-reduced-motion` уважаем полностью: не «помедленнее», а вообще
 * без конфетти — человеку с вестибулярными проблемами падающая мелочь
 * поперёк экрана это не украшение.
 */

/** Сколько кусочков летит. Тридцати было мало на широкий экран
 *  (правка владельца 2026-09-10) — сотня закрывает всю ширину и при
 *  этом остаётся пустыми span'ами без единой картинки. */
const PIECES = 100;
/** Когда снимать разметку: максимальная задержка (1100) плюс самое
 *  долгое падение (4000) плюс запас. Меньше — и последние кусочки
 *  исчезали бы на полпути. */
const FALL_MS = 5400;

/** Цвета — акцент сайта и его соседи по кругу, чтобы праздник не спорил
 *  с оформлением. */
const COLORS = ["#ff8a4c", "#ff568c", "#ffd166", "#7aa2ff", "#56d364"];

type Piece = {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  color: string;
  width: number;
  height: number;
};

export default function BirthdayConfetti() {
  const [pieces, setPieces] = useState<Piece[] | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let removeTimer: ReturnType<typeof setTimeout> | undefined;
    // Раскладываем конфетти в КАДРЕ, а не в теле эффекта: хлопушке всё
    // равно нужен первый отрисованный кадр, а React не любит setState
    // прямо в эффекте (каскадный ререндер, react-hooks/set-state-in-effect).
    const frame = requestAnimationFrame(() => {
      setPieces(
        Array.from({ length: PIECES }, () => ({
          left: Math.random() * 100,
          delay: Math.random() * 1100,
          duration: 2600 + Math.random() * 1400,
          // Снос вбок: без него это дождь, а не хлопушка.
          drift: (Math.random() - 0.5) * 30,
          spin: 360 + Math.random() * 720,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          width: 5 + Math.random() * 4,
          height: 8 + Math.random() * 6,
        })),
      );
      // Снимаем с себя разметку, когда всё долетело: сотне элементов
      // висеть на странице до перехода незачем.
      removeTimer = setTimeout(() => setPieces(null), FALL_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (removeTimer) clearTimeout(removeTimer);
    };
  }, []);

  if (!pieces) return null;

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              width: `${p.width}px`,
              height: `${p.height}px`,
              background: p.color,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              "--confetti-drift": `${p.drift}vw`,
              "--confetti-spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
