"use client";

import { useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { setDramaRating } from "@/app/(public)/favorites/actions";
import { useT } from "@/components/LocaleProvider";
import StarRatingInput, { formatRating } from "@/components/StarRatingInput";

/**
 * Попап «поставьте оценку» после перехода сериала в «Просмотрено»
 * (аудит 2026-09, п.5.2: 208 досмотренных — 0 оценок; момент
 * «досмотрела» — единственный, когда оценку ставят охотно).
 *
 * Мягкое приглашение, не модалка: маленькое окошко у того контрола,
 * который перевёл сериал в «Просмотрено» (кнопка статуса, селект в
 * строке каталога, счётчик серий), с теми же звёздами, что ставят
 * оценку везде (АА2, `StarRatingInput`), и кнопкой «позже». Показывает
 * его ХОЗЯИН контрола — сам попап только рисует и отправляет: где
 * встать, знает лишь вызвавший, а «стоит ли вообще» отвечает сервер
 * (`completedNow && !hasRating` в ответе экшена — у кнопки в
 * фильмографии оценки в пропсах просто нет).
 *
 * Любое закрытие — «позже», клик мимо, прокрутка (fixed-попап уезжает
 * из-под строки — то же поведение, что у соседних дропдаунов) — глушит
 * попап за этот сериал до конца вкладки: закрыл — значит, не хочет, и
 * переспрашивать на каждом клике по статусу навязчиво. sessionStorage,
 * а не localStorage: «в этой сессии», после нового захода спросить
 * снова не грех. Оценка уходит тем же setDramaRating, что и всегда.
 */

const DISMISSED_KEY = "ratePromptDismissed";
/** Запасная память на случай, когда sessionStorage недоступен
 *  (приватный режим с запретом на данные сайтов): жизнь вкладки —
 *  достаточное «в этой сессии». */
const dismissedInMemory = new Set<string>();

export function isRatePromptDismissed(dramaId: string): boolean {
  if (dismissedInMemory.has(dramaId)) return true;
  try {
    return (
      sessionStorage.getItem(`${DISMISSED_KEY}:${dramaId}`) !== null
    );
  } catch {
    return false;
  }
}

function dismissRatePrompt(dramaId: string) {
  dismissedInMemory.add(dramaId);
  try {
    sessionStorage.setItem(`${DISMISSED_KEY}:${dramaId}`, "1");
  } catch {
    // Память вкладки уже помнит — этого хватит.
  }
}

export type RatePromptCoords = { top: number; left: number };

/** Куда вставать попапу: под рект контрола, не вылезая за экран по
 *  своей ширине (~260px, как у окошка оценки в таблице). */
export function ratePromptCoords(rect: DOMRect): RatePromptCoords {
  return {
    top: rect.bottom + 6,
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
  };
}

export default function RatePromptPopover({
  dramaId,
  coords,
  onClose,
}: {
  dramaId: string;
  coords: RatePromptCoords;
  onClose: () => void;
}) {
  const t = useT();
  const s = t.catalog.rating;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Закрыть — всегда с «больше не приставать»: и «позже», и клик мимо,
  // и прокрутка означают одно и то же «не сейчас».
  function close() {
    dismissRatePrompt(dramaId);
    onClose();
  }
  // В обработчиках документа нужна СВЕЖАЯ close (замыкание эффекта
  // держало бы первую), а перевешивать слушатели на каждый рендер —
  // шумно. Обычный приём ref-на-колбэк; обновление — в эффекте, не в
  // рендере (react-hooks/refs).
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      closeRef.current();
    }
    function onScroll() {
      closeRef.current();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  function choose(next: number | null) {
    // Клик по звезде в приглашении оценку только ставит: «передумал»
    // здесь значит «не буду оценивать» — просто закрываем.
    if (next === null) {
      close();
      return;
    }
    startTransition(async () => {
      // Ошибку экшен отдаёт значением (текст исключения в проде до
      // клиента не доезжает) — попап молча закрывается: приглашение не
      // место для разборов, оценить можно и обычными звёздами.
      await setDramaRating(dramaId, next);
      dismissRatePrompt(dramaId);
      onClose();
      router.refresh();
    });
  }

  return createPortal(
    <div
      ref={ref}
      className="performer-select-dropdown rating-popover rate-prompt-popover"
      role="dialog"
      aria-label={s.promptTitle}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        right: "auto",
        zIndex: 2000,
      }}
    >
      <p className="rate-prompt-title mb-0">{s.promptTitle}</p>
      <StarRatingInput
        value={null}
        onChange={choose}
        disabled={isPending}
        labelFor={(n) => s.choose(formatRating(n))}
        hintFor={(n) => s.hint(formatRating(n))}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={isPending}
        onClick={close}
      >
        {s.promptLater}
      </button>
    </div>,
    document.body,
  );
}
