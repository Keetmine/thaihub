import Link from "next/link";

export default function EntityMiniCard({
  href,
  photoUrl,
  name,
  subtitle,
  round = true,
}: {
  href: string;
  photoUrl?: string | null;
  name: string;
  subtitle?: string | null;
  /** Circular avatar (performers) vs rounded-rect poster (dramas). */
  round?: boolean;
}) {
  return (
    <Link
      href={href}
      className="surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2"
      style={{ width: "11rem" }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
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
    </Link>
  );
}
