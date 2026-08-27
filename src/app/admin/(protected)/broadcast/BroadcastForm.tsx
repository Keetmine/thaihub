"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";
import { sendBroadcast, type BroadcastResult } from "./actions";

export default function BroadcastForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  // Подтверждение — через общий ConfirmForm (модалка), а не window.confirm.
  // Кнопка-триггер живёт внутри <form>, но с type="button": сабмитит не
  // форма, а кнопка «Отправить» в модалке — экшену данные формы отдаём
  // сами через ref.
  async function confirmedSend(): Promise<{ error?: string } | undefined> {
    const form = formRef.current;
    if (!form) return;
    setResult(null);
    try {
      const res = await sendBroadcast(new FormData(form));
      setResult(res);
      form.reset();
      router.refresh();
      return undefined;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Не удалось отправить" };
    }
  }

  return (
    <form
      ref={formRef}
      // Сабмитить форму напрямую нечем (кнопка-триггер — type="button"),
      // но implicit submission перезагрузил бы страницу — глушим.
      onSubmit={(e) => e.preventDefault()}
      className="surface d-flex flex-column gap-3 p-4 mb-4"
    >
      <div>
        <label className="form-label" htmlFor="broadcast-form-audience">Аудитория</label>
        <select id="broadcast-form-audience" name="audience" className="form-select" defaultValue="all">
          <option value="all">Все с Telegram</option>
          <option value="premium">Только с подпиской</option>
        </select>
      </div>
      <div>
        <label className="form-label" htmlFor="broadcast-form-text">Текст сообщения</label>
        <textarea id="broadcast-form-text" name="text" rows={4} required maxLength={3500} className="form-control" />
      </div>
      {result && (
        <p className="small text-success mb-0">
          ✓ Отправлено {result.sent} из {result.total}.
        </p>
      )}
      <div>
        <ConfirmForm
          action={confirmedSend}
          confirmMessage="Отправить рассылку? Отменить будет нельзя."
          confirmLabel="Отправить"
          busyLabel="Отправка…"
          className="d-inline"
        >
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              // Триггер не сабмитит форму, поэтому браузерная валидация
              // (required у текста) сама не сработает — прогоняем её до
              // открытия модалки; stopPropagation не даёт обёртке
              // ConfirmForm открыть подтверждение для пустой формы.
              if (!formRef.current?.reportValidity()) e.stopPropagation();
            }}
          >
            Отправить рассылку
          </button>
        </ConfirmForm>
      </div>
    </form>
  );
}
