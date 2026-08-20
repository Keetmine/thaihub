"use client";

import { useEffect, useRef } from "react";

/**
 * Официальный Telegram Login Widget. Скрипт вставляется в DOM руками, а
 * не тегом <script> в JSX: React поднимает такие теги в <head>, а виджет
 * рисует кнопку рядом с собственным тегом — то есть внутрь <head>, где
 * её никто не увидит. Здесь скрипт живёт в этом самом div, и кнопка
 * появляется на своём месте.
 *
 * Работает только с домена, привязанного к боту через /setdomain у
 * BotFather. После подтверждения Telegram редиректит на data-auth-url с
 * подписанным профилем (подпись проверяется в /api/auth/telegram).
 */
export default function TelegramLoginButton({
  botUsername,
  /** «link» — привязка Telegram к текущему аккаунту из настроек,
   *  иначе обычный вход. */
  mode,
}: {
  botUsername: string;
  mode?: "link";
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    // В dev React монтирует эффекты дважды — без этой проверки кнопок
    // было бы две.
    if (!container || container.childElementCount > 0) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    // Абсолютный URL обязателен: с относительным путём виджет
    // подтверждает вход и никуда не переходит — с виду «кнопка не
    // работает». Режим — отдельным адресом, а не query: свой параметр
    // виджет не сохраняет, из-за чего привязка уходила в обычный вход и
    // создавала второй аккаунт.
    script.setAttribute(
      "data-auth-url",
      `${window.location.origin}/api/auth/telegram${mode === "link" ? "/link" : ""}`,
    );
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);
  }, [botUsername, mode]);

  return <div ref={containerRef} className="d-flex justify-content-center" />;
}
