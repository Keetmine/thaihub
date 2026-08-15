/** Единый заголовок секции (h2) — стиль в .section-heading (globals.css),
 *  опциональная иконка слева. Используется на всех страницах вместо
 *  копипасты "small text-secondary text-uppercase" + letterSpacing. */
export default function SectionHeading({
  icon,
  children,
  className,
  action,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Кнопка/контрол справа (заголовок растягивается на всю ширину). */
  action?: React.ReactNode;
}) {
  if (action) {
    return (
      <div className={`d-flex align-items-center justify-content-between gap-2 ${className ?? "mb-2"}`}>
        <h2 className="section-heading mb-0">
          {icon}
          {children}
        </h2>
        {action}
      </div>
    );
  }
  return (
    <h2 className={`section-heading ${className ?? "mb-2"}`}>
      {icon}
      {children}
    </h2>
  );
}
