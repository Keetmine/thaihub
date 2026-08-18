import Link from "next/link";

/** Плитка-счётчик (кабинет, профиль, админ-дашборд) — одна на всех.
 *  Иконка-эмодзи и акцентная цифра: раньше ряд одинаковых серых
 *  прямоугольников читался как таблица без иерархии. */
export default function StatTile({
  value,
  label,
  href,
  icon,
  muted = false,
}: {
  value: number;
  label: string;
  href?: string;
  /** Эмодзи слева от цифры. */
  icon?: string;
  /** Вторичная плитка (фан-профиль) — цифра спокойнее. */
  muted?: boolean;
}) {
  const inner = (
    <>
      <span className="stat-tile-value">
        {icon && <span className="stat-tile-icon">{icon}</span>}
        <span className={muted ? "text-white" : "stat-tile-number"}>{value}</span>
      </span>
      <span className="stat-tile-label">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="stat-tile stat-tile-link text-decoration-none text-reset">
      {inner}
    </Link>
  ) : (
    <div className="stat-tile">{inner}</div>
  );
}
