/** Цвет секции: полоска слева, плашка иконки, отсвет в углу и рамка
 *  фокуса у полей внутри. Палитра та же, что у линий стоянок в плане
 *  поездки (`--stay-line-*`) плюс оранжевый акцент витрины. */
export type SectionTone = "orange" | "teal" | "violet" | "pink" | "blue" | "gold";

/** Смысловая секция админ-формы: заголовок + пояснение + содержимое.
 *  Раньше поля шли сплошным потоком на 500 строк — глазу не за что
 *  зацепиться; теперь форма читается как список блоков.
 *
 *  Цвет и иконка (правка владельца 2026-09-26: «всё однообразное,
 *  серое на сером, хочется акцентов как на странице статистики») —
 *  чтобы секции различались с одного взгляда. Без `tone` цвет
 *  подбирается по порядку секций (см. admin.css). */
export default function FormSection({
  title,
  hint,
  icon,
  tone,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: SectionTone;
  children: React.ReactNode;
  /** Редко используемые блоки (данные импорта) можно свернуть. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const body = <div className="admin-section-body d-flex flex-column gap-3">{children}</div>;
  const head = (
    <>
      {icon && (
        <span className="admin-section-icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="admin-section-titles">
        <span className="admin-section-title">{title}</span>
        {hint && <span className="admin-section-hint">{hint}</span>}
      </span>
    </>
  );

  if (collapsible) {
    return (
      <details className="admin-section" data-tone={tone} open={defaultOpen}>
        <summary className="admin-section-head">{head}</summary>
        {body}
      </details>
    );
  }

  return (
    <section className="admin-section" data-tone={tone}>
      <div className="admin-section-head">{head}</div>
      {body}
    </section>
  );
}
