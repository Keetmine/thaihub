import Link from "next/link";

/** Единая шапка страницы: eyebrow + заголовок (+ действия справа).
 *  Заменяет 17+ рукописных копий «eyebrow + display-1-tight с инлайновым
 *  размером» — размеры теперь только здесь. backHref превращает eyebrow
 *  в ссылку «← назад» (паттерн детальных страниц). */
export default function PageHeader({
  eyebrow,
  backHref,
  title,
  action,
  size = "md",
  className,
}: {
  eyebrow: string;
  backHref?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  /** md — списки/кабинет (2.25rem), lg — витринные страницы (2.5rem). */
  size?: "md" | "lg";
  className?: string;
}) {
  const fontSize = size === "lg" ? "2.5rem" : "2.25rem";
  return (
    <div
      className={`d-flex flex-wrap align-items-end justify-content-between gap-3 ${className ?? "mb-4"}`}
    >
      <div>
        {backHref ? (
          <Link href={backHref} className="eyebrow text-decoration-none">
            ← {eyebrow}
          </Link>
        ) : (
          <span className="eyebrow">{eyebrow}</span>
        )}
        <h1 className="display-1-tight mt-3 mb-0" style={{ fontSize }}>
          {title}
        </h1>
      </div>
      {action && <div className="d-flex flex-wrap align-items-center gap-2">{action}</div>}
    </div>
  );
}
