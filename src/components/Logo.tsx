"use client";

import { useRef, useSyncExternalStore } from "react";

// Фирменный знак (переделан 2026-09-18 по референсу владельца — иконка
// 1.1.1.1: скруглённый квадрат, дуги, которые закручиваются и
// пересекаются, белая монограмма). Буквы MBH — короткая марка бренда
// (полное имя MyBLHub остаётся в вордмарке рядом и в домене). Буквы
// нарисованы контурами, а не шрифтом: знак повторяется в
// public/icons/logo.svg (фавикон/PWA, из него sharp собирает
// icon-192/512 и apple-touch-icon) и в src/app/icon.svg — там
// веб-шрифта нет, и текст поплыл бы. Правишь формы тут — правь и там.
//
// Гамма — оранжевая, как у прежнего знака: персиковый завиток,
// фирменная оранжевая основа, дуги к красно-оранжевому #e8431f, светлая
// дуга внизу справа. Радужные версии владелец посмотрела и вернулась
// к оранжевой — но радуга осталась ПАСХАЛКОЙ (просьба владельца
// 2026-09-18): удержать знак полторы секунды — и он становится
// радужным в порядке прайд-флага, ещё одно удержание возвращает
// оранжевый. Выбор помнит браузер (localStorage). Жест — удержание, а
// не тройной клик: знак лежит в ссылке на главную, и каждый клик
// уводил бы туда; клик же срабатывает на отпускании, и после
// сработавшего удержания мы его гасим (onClickCapture).

type Palette = Record<"bg" | "pink" | "coral" | "orange" | "gold" | "mint", [string, string]>;

const ORANGE: Palette = {
  bg: ["#ff9a40", "#ff7a2a"],
  pink: ["#ffc98f", "#ffad63"],
  coral: ["#ff7a3d", "#f96a1b"],
  orange: ["#f25a1f", "#e8431f"],
  gold: ["#ffb469", "#ff9a40"],
  mint: ["#d63a18", "#c22f12"],
};

const RAINBOW: Palette = {
  pink: ["#ff4d63", "#ff6f6a"],
  bg: ["#ff7b58", "#ffa04a"],
  coral: ["#ffd03a", "#ffb400"],
  orange: ["#5fd27e", "#2fbf6a"],
  gold: ["#4f9cff", "#3572f0"],
  mint: ["#a763ff", "#8b4dff"],
};

const STORAGE_KEY = "mbh-rainbow";
const HOLD_MS = 1500;

// Выбор живёт в localStorage и читается через useSyncExternalStore:
// на сервере снимок всегда «оранжевый» (разметка совпадает), в
// браузере — что сохранено. Переключение пишет в хранилище и будит
// подписчиков; в приватном режиме, где хранилище бросает, значение
// держится в памяти до перезагрузки.
const listeners = new Set<() => void>();
let memory = false;
function readRainbow(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return memory;
  }
}
function writeRainbow(next: boolean) {
  memory = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // приватный режим — см. выше
  }
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export default function Logo() {
  const rainbow = useSyncExternalStore(subscribe, readRainbow, () => false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    fired.current = false;
    clear();
    timer.current = setTimeout(() => {
      fired.current = true;
      writeRainbow(!readRainbow());
    }, HOLD_MS);
  };

  const p = rainbow ? RAINBOW : ORANGE;
  const grad = (key: keyof Palette) => (
    <linearGradient id={`logo-${key}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor={p[key][0]} />
      <stop offset="1" stopColor={p[key][1]} />
    </linearGradient>
  );

  return (
    <span className="d-inline-flex align-items-center gap-2">
      <svg
        width="1.9rem"
        height="1.9rem"
        viewBox="0 0 512 512"
        className={`flex-shrink-0 logo-mark${rainbow ? " is-rainbow" : ""}`}
        aria-hidden="true"
        onPointerDown={start}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        // Сработало удержание — клик по ссылке-обёртке не должен увести
        // на главную. Флаг сбрасывается на следующем нажатии.
        onClickCapture={(e) => {
          if (fired.current) {
            e.preventDefault();
            e.stopPropagation();
            fired.current = false;
          }
        }}
        // Долгое касание на телефоне вызывает контекстное меню — гасим.
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          {grad("bg")}
          {grad("pink")}
          {grad("coral")}
          {grad("orange")}
          {grad("gold")}
          {grad("mint")}
          <clipPath id="logo-clip">
            <rect width="512" height="512" rx="118" />
          </clipPath>
        </defs>
        <rect width="512" height="512" rx="118" fill="url(#logo-bg)" />
        <g clipPath="url(#logo-clip)">
          <path fill="url(#logo-pink)" d="M-40-40H330C400 30 330 150 200 170C80 190-10 130-40 60Z"/>
          <path fill="url(#logo-coral)" d="M-40 560V320C90 260 190 420 330 330C420 270 500 140 560 40V560Z"/>
          <path fill="url(#logo-orange)" d="M-40 560V440C110 400 240 520 380 430C460 380 520 300 560 230V560Z"/>
          <path fill="url(#logo-gold)" d="M150 560C240 490 400 470 560 360V560Z"/>
          <path fill="url(#logo-mint)" d="M-40 560V425C70 410 170 465 250 560Z"/>
        </g>
        <g fill="#fff" fillRule="evenodd" transform="translate(-5 0)">
          <path d="M81 331V181h38l21 66 21-66h38v150h-34v-87l-18 58h-14l-18-58v87z"/>
          <path d="M219 331V181h52c30 0 48 16 48 40 0 15-8 26-20 31 16 5 26 18 26 36 0 26-20 43-52 43zm34-119v32h16c12 0 18-6 18-16s-6-16-18-16zm0 62v27h20c13 0 20-6 20-14s-7-13-20-13z"/>
          <path d="M345 331V181h34v56h28v-56h34v150h-34v-60h-28v60z"/>
        </g>
      </svg>
      <span className="font-display fw-bold text-white">
        MyBL
        <span style={{ color: "var(--bs-primary-text-emphasis)" }}>Hub</span>
      </span>
    </span>
  );
}
