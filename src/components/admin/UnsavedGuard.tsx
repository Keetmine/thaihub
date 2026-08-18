"use client";

import { useEffect, useState } from "react";

/** Следит за правками внутри формы и:
 *  1) предупреждает браузерным диалогом при закрытии/перезагрузке вкладки;
 *  2) отдаёт `dirty` наружу, чтобы переключение вкладок формы спрашивало
 *     подтверждение (правки вкладок сохраняются одной кнопкой, и уход со
 *     страницы без сохранения раньше молча терял их).
 *  Возвращает пару [dirty, markClean] через колбэк onChange. */
export default function useUnsavedGuard(formRef: React.RefObject<HTMLFormElement | null>) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onInput = () => setDirty(true);
    const onSubmit = () => setDirty(false);
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    form.addEventListener("submit", onSubmit);
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      form.removeEventListener("submit", onSubmit);
    };
  }, [formRef]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return { dirty, markClean: () => setDirty(false) };
}
