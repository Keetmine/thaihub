import Link from "next/link";

/** Плитка-счётчик (кабинет, профиль, админ-дашборд) — одна на всех. */
export default function StatTile({
  value,
  label,
  href,
}: {
  value: number;
  label: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="font-display fw-bold d-block" style={{ fontSize: "1.5rem" }}>
        {value}
      </span>
      <span className="small text-secondary">{label}</span>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="surface surface-hover text-decoration-none text-reset text-center p-3 flex-fill"
      style={{ minWidth: "8rem" }}
    >
      {inner}
    </Link>
  ) : (
    <div className="surface text-center p-3 flex-fill" style={{ minWidth: "8rem" }}>
      {inner}
    </div>
  );
}
