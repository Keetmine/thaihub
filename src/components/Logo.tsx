export default function Logo() {
  return (
    <span className="d-inline-flex align-items-center gap-2">
      <span className="logo-badge">
        <svg width="15" height="15" viewBox="0 0 24 24">
          <path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
            style={{ fill: "#100613" }}
          />
          <circle cx="12" cy="9" r="2.6" style={{ fill: "var(--bs-primary)" }} />
        </svg>
      </span>
      <span className="font-display fw-bold text-white">
        Thai
        <span style={{ color: "var(--bs-primary-text-emphasis)" }}>Hub</span>
      </span>
    </span>
  );
}
