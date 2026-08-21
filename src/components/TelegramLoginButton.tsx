"use client";

import { useEffect, useRef } from "react";

/** Профиль, который Telegram отдаёт виджету в режиме data-onauth. */
export type TelegramAuthResult = Record<string, string | number>;

/**
 * Официальный Telegram Login Widget. Скрипт вставляется в DOM руками, а
 * не тегом <script> в JSX: React поднимает такие теги в <head>, а виджет
 * рисует кнопку рядом с собственным тегом — то есть внутрь <head>, где
 * её никто не увидит. Здесь скрипт живёт в этом самом div, и кнопка
 * появляется на своём месте.
 *
 * Работает только с домена, привязанного к боту через /setdomain у
 * BotFather.
 *
 * Два режима возврата:
 * - `onAuth` — виджет вызывает JS-функцию с профилем и никуда не
 *   уходит. Так работает привязка из настроек: страница не моргает, и
 *   подтверждение переноса показывается попапом на месте.
 * - без `onAuth` — обычный переход на data-auth-url. Так работает вход
 *   на /login, где перезагрузка всё равно неизбежна.
 */
export default function TelegramLoginButton({
  botUsername,
  /** «link» — привязка Telegram к текущему аккаунту из настроек,
   *  иначе обычный вход. */
  mode,
  onAuth,
}: {
  botUsername: string;
  mode?: "link";
  onAuth?: (user: TelegramAuthResult) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Колбэк держим в ref: виджет зовёт глобальную функцию, а она не
  // должна пересоздаваться вместе с кнопкой — иначе после каждого
  // ререндера скрипт пришлось бы вставлять заново.
  const onAuthRef = useRef(onAuth);
  // Обновляем в эффекте, а не в теле: правка ref во время рендера
  // запрещена. Начальное значение уже пришло через useRef, и этот
  // эффект объявлен раньше вставки скрипта — к моменту, когда виджет
  // позовёт колбэк, ref заведомо актуален.
  useEffect(() => {
    onAuthRef.current = onAuth;
  });

  // Имя привязано к боту, а не случайное: Math.random() запрещён в
  // рендере, а двух таких кнопок на странице всё равно не бывает.
  const callbackName = `onTelegramAuth_${botUsername.replace(/\W/g, "")}`;

  // Регистрация колбэка — отдельным эффектом от вставки скрипта.
  // Вместе они не уживались: в dev React монтирует эффекты дважды,
  // очистка удаляла функцию, а повторный проход выходил раньше (скрипт
  // уже вставлен) и не регистрировал её снова — виджет звал имя,
  // которого больше нет.
  useEffect(() => {
    if (!onAuth) return;
    (window as unknown as Record<string, unknown>)[callbackName] = (
      user: TelegramAuthResult,
    ) => onAuthRef.current?.(user);
    return () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };
  }, [callbackName, onAuth]);

  useEffect(() => {
    const container = containerRef.current;
    // Та же двойная сборка: без этой проверки кнопок было бы две.
    if (!container || container.childElementCount > 0) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-request-access", "write");

    if (onAuthRef.current) {
      script.setAttribute("data-onauth", `${callbackName}(user)`);
    } else {
      // Абсолютный URL обязателен: с относительным путём виджет
      // подтверждает вход и никуда не переходит — с виду «кнопка не
      // работает». Режим — отдельным адресом, а не query: свой параметр
      // виджет не сохраняет, из-за чего привязка уходила в обычный вход
      // и создавала второй аккаунт.
      script.setAttribute(
        "data-auth-url",
        `${window.location.origin}/api/auth/telegram${mode === "link" ? "/link" : ""}`,
      );
    }

    container.appendChild(script);
  }, [botUsername, mode, callbackName]);

  return <div ref={containerRef} className="d-flex justify-content-center" />;
}
