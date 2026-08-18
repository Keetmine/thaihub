/** Смысловая секция админ-формы: заголовок + пояснение + содержимое.
 *  Раньше поля шли сплошным потоком на 500 строк — глазу не за что
 *  зацепиться; теперь форма читается как список блоков. */
export default function FormSection({
  title,
  hint,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  /** Редко используемые блоки (данные импорта) можно свернуть. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const body = <div className="admin-section-body d-flex flex-column gap-3">{children}</div>;

  if (collapsible) {
    return (
      <details className="admin-section" open={defaultOpen}>
        <summary className="admin-section-head">
          <span className="admin-section-title">{title}</span>
          {hint && <span className="admin-section-hint">{hint}</span>}
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <span className="admin-section-title">{title}</span>
        {hint && <span className="admin-section-hint">{hint}</span>}
      </div>
      {body}
    </section>
  );
}
