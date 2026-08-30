"use client";

import { useState } from "react";

/** Форма для server action, возвращающего `{ ok: false, error }`
 *  значением (текст исключения в проде до клиента не доезжает — см.
 *  docs/architecture.md): голому `<form action>` результат некуда деть,
 *  а тут ошибка выводится под полями. Успех ведёт себя как обычно —
 *  revalidate/redirect делает сам экшен. */
export default function ActionResultForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string } | void>;
  className?: string;
  children: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={className}
      action={async (formData) => {
        setError(null);
        const result = await action(formData);
        if (result && !result.ok && result.error) setError(result.error);
      }}
    >
      {children}
      {error && <p className="small text-danger mb-0 mt-2">{error}</p>}
    </form>
  );
}
