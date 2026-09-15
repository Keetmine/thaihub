"use client";

import { useState, useSyncExternalStore } from "react";
import AppLink from "@/components/AppLink";
import { useT } from "@/components/LocaleProvider";

/** Кука-«прочитано». Год — как у согласия на куки: промо-период длиннее
 *  любой сессии, а показывать плашку на каждом заходе значит приучить
 *  её не замечать. */
export const FREE_ACCESS_COOKIE = "free_access_notice";

/**
 * Плашка акции «полный доступ в подарок» (решение владельца 2026-09-15).
 *
 * Зачем она вообще: на время промо открыт весь платный функционал
 * (`FREE_ACCESS` в src/lib/premium.ts). Молча этого делать нельзя —
 * человек решит, что сайт бесплатный по устройству, и встретит будущий
 * пейволл как обман.
 *
 * ТОН — подарок, а не предупреждение (правка владельца 2026-09-15:
 * первая редакция говорила «пока открыто, позже станет платным, сейчас
 * не продаём» — «не нравится формулировка про позже, пока, тем более
 * что не продаём»). Слово «акция» само по себе означает, что это не
 * навсегда, и делает это лучше любого «пока»: то же сообщение, но не
 * похоже на предупреждение об отключении.
 *
 * Обещание в тексте ровно одно, и его мы держим: созданное останется
 * с человеком (данные при истечении подписки и сейчас не удаляются).
 * Срок окончания акции НЕ назван — его никто не назначал, а названная
 * дата стала бы вторым обещанием. Про заблаговременное предупреждение
 * сказано отдельно в `/terms`, где такому обязательству и место.
 *
 * Рендерится в потоке страницы, а не поверх неё: угол экрана уже занят
 * баннером куки, и две всплывашки разом — верный способ закрыть обе не
 * читая.
 *
 * Куку читаем через useSyncExternalStore: на сервере снимок `null`,
 * поэтому плашки нет в разметке и она не мигает при гидратации у того,
 * кто её уже закрыл. Подписка пустая — кука меняется только из dismiss().
 */
const noopSubscribe = () => () => {};
const clientSnapshot = (): "seen" | "new" =>
  typeof document !== "undefined" && document.cookie.includes(`${FREE_ACCESS_COOKIE}=1`)
    ? "seen"
    : "new";
const serverSnapshot = () => null;

export default function FreeAccessBanner() {
  const t = useT();
  const stored = useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || stored !== "new") return null;

  function dismiss() {
    document.cookie = `${FREE_ACCESS_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setDismissed(true);
  }

  return (
    <div className="promo-banner" role="note" aria-label={t.widgets.freeAccess.ariaLabel}>
      <span className="promo-banner-emoji" aria-hidden>
        🎁
      </span>
      <p className="promo-banner-text mb-0">
        {t.widgets.freeAccess.text}{" "}
        <AppLink href="/help#topic-premium" className="link-body-emphasis">
          {t.widgets.freeAccess.link}
        </AppLink>
        .
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm promo-banner-close"
        onClick={dismiss}
      >
        {t.widgets.freeAccess.dismiss}
      </button>
    </div>
  );
}
