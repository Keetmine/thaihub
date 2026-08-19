/** Круглая аватарка с фолбэком на первую букву имени — единый компонент
 *  для админки и публичных списков (не клиентский). size — в rem. */
export default function LetterAvatar({
  name,
  photoUrl,
  size = 2.5,
  height,
  rounded = true,
}: {
  name: string | null;
  photoUrl: string | null;
  size?: number;
  /** Высота в rem, если не квадрат (постеры) — по умолчанию size. */
  height?: number;
  rounded?: boolean;
}) {
  const radius = rounded ? "50%" : "0.5rem";
  const h = height ?? size;
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        loading="lazy"
        decoding="async"
        src={photoUrl}
        alt=""
        className="flex-shrink-0"
        style={{ width: `${size}rem`, height: `${h}rem`, borderRadius: radius, objectFit: "cover" }}
      />
    );
  }
  return (
    <span
      className="flex-shrink-0 d-inline-flex align-items-center justify-content-center fw-semibold"
      style={{
        width: `${size}rem`,
        height: `${h}rem`,
        borderRadius: radius,
        background: "var(--bs-secondary-bg)",
        color: "var(--bs-secondary-color)",
        fontSize: `${size * 0.4}rem`,
        opacity: 0.85,
      }}
    >
      {(name ?? "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
