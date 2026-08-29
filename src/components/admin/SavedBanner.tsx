"use client";

import { useEffect } from "react";

/** «Сохранено» над формой после правки: сохранение больше не уводит в
 *  список (просьба владельца — страница не должна закрываться), а без
 *  отметки было непонятно, сработала ли кнопка.
 *
 *  Флаг приезжает адресом (?saved=1 из redirect'а экшена) и вычищается
 *  из него, чтобы обновление страницы или возврат по истории не
 *  показывали «Сохранено» за старое сохранение. Чистим ГОЛЫМ
 *  history.replaceState, не router.replace: роутер перерисовал бы
 *  серверную страницу уже без ?saved — условие показа гасло, и баннер
 *  жил долю секунды. */
export default function SavedBanner() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("saved")) return;
    url.searchParams.delete("saved");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return (
    <p className="alert alert-success py-2 mb-3" role="status">
      Сохранено
    </p>
  );
}
