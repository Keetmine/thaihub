"use client";

import { useState, useTransition } from "react";
import { EyeIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

/**
 * «Видела всех» / «Никого» на одном дне фестиваля.
 *
 * У дня со своим лайнапом по умолчанию не отмечен никто (правка
 * владельца 2026-09-15: «вместо 6 заявленных артистов я сходила только
 * на 1»), и на тридцать групп проще нажать одну кнопку, чем снять
 * двадцать девять галочек. Обратная сторона тоже нужна: сходила на день
 * целиком — отметила всех разом.
 *
 * Кнопка не показывает состояние: она не переключатель, а два действия
 * подряд («все», потом «никого»). Состояние видно по самим глазикам.
 */
export default function SeenDayButton({
  eventId,
  occurrenceId,
  action,
}: {
  eventId: string;
  occurrenceId: string;
  action: (eventId: string, occurrenceId: string, seen: boolean) => Promise<{ ok: true }>;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [all, setAll] = useState(true);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-1"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await action(eventId, occurrenceId, all).catch(() => null);
          setAll((prev) => !prev);
        })
      }
    >
      <EyeIcon filled={all} />
      {all ? t.widgets.seenLive.markAll : t.widgets.seenLive.markNone}
    </button>
  );
}
