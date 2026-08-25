import AppLink from "@/components/AppLink";

export default function EntityMiniCard({
  href,
  photoUrl,
  name,
  subtitle,
  round = true,
  className = "",
  style,
  variant = "row",
}: {
  href: string;
  photoUrl?: string | null;
  name: string;
  subtitle?: string | null;
  /** Circular avatar (performers) vs rounded-rect poster (dramas). */
  round?: boolean;
  className?: string;
  /** Переопределение размеров (по умолчанию фикс 11rem). */
  style?: React.CSSProperties;
  /** "row" — горизонтальная плашка (как раньше); "grid" — вертикальная
   *  карточка для каст-сетки (Э2ф): крупное фото, под ним имя и роль.
   *  Классы .cast-card* — в globals.css, секция «Э2ф: каст-сетка». */
  variant?: "row" | "grid";
}) {
  if (variant === "grid") {
    return (
      <AppLink
        href={href}
        className={`cast-card ${className}`}
        style={style}
        title={subtitle ? `${name} — ${subtitle}` : name}
      >
        <span
          className="cast-card-photo"
          style={round ? undefined : { borderRadius: "0.9rem" }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={photoUrl} alt="" />
          ) : (
            <span className="cast-card-letter">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <span className="cast-card-name text-truncate">{name}</span>
        {subtitle && (
          <span className="cast-card-role text-truncate">{subtitle}</span>
        )}
      </AppLink>
    );
  }

  return (
    <AppLink
      href={href}
      className={`surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2 ${className}`}
      style={style ?? { width: "11rem" }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          loading="lazy"
          decoding="async"
          src={photoUrl}
          alt=""
          style={{
            width: "2.5rem",
            height: "2.5rem",
            borderRadius: round ? "50%" : "0.375rem",
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          className="d-flex align-items-center justify-content-center"
          style={{
            width: "2.5rem",
            height: "2.5rem",
            borderRadius: round ? "50%" : "0.375rem",
            background: "var(--bs-secondary-bg)",
            flexShrink: 0,
            color: "var(--bs-secondary-color)",
            opacity: 0.7,
            fontWeight: 600,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span style={{ minWidth: 0 }}>
        <span className="d-block font-display fw-medium text-white text-truncate">{name}</span>
        {subtitle && <span className="d-block small text-secondary text-truncate">{subtitle}</span>}
      </span>
    </AppLink>
  );
}
