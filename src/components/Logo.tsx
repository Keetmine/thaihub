// Фирменный знак: тёплый квадрат и «волны любви» — концентрические
// сердца вокруг сплошного сердечка. Те же формы, что в
// public/icons/logo.svg (фавикон/PWA): правишь тут — правь и там
// (icon-192/512 генерятся из logo.svg через sharp).
const HEART_PATH =
  "M170 414c-4 0-8-1.6-11-4.6-11.4-10.8-42-37.6-56-56C92 339 86 324 86 308c0-31 24-54 53-54 12.6 0 24.4 5 31 14 6.6-9 18.4-14 31-14 29 0 53 23 53 54 0 16-6 31-17 45.4-14 18.4-44.6 45.2-56 56-3 3-7 4.6-11 4.6z";

export default function Logo() {
  return (
    <span className="d-inline-flex align-items-center gap-2">
      <svg
        width="1.9rem"
        height="1.9rem"
        viewBox="0 0 512 512"
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe3bd" />
            <stop offset="1" stopColor="#ffd096" />
          </linearGradient>
          <linearGradient id="logo-c1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb469" />
            <stop offset="1" stopColor="#ff9040" />
          </linearGradient>
          <linearGradient id="logo-c2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff8f45" />
            <stop offset="1" stopColor="#f96a1b" />
          </linearGradient>
          <clipPath id="logo-clip">
            <rect width="512" height="512" rx="118" />
          </clipPath>
        </defs>
        <rect width="512" height="512" rx="118" fill="url(#logo-bg)" />
        <g clipPath="url(#logo-clip)">
          <g transform="translate(170 330) scale(3.6) translate(-170 -334)">
            <path fill="url(#logo-c1)" opacity="0.55" d={HEART_PATH} />
          </g>
          <g transform="translate(170 330) scale(2.2) translate(-170 -334)">
            <path fill="url(#logo-c2)" opacity="0.75" d={HEART_PATH} />
          </g>
        </g>
        <g transform="translate(170 330) scale(1.18) translate(-170 -334)">
          <path fill="#e8431f" d={HEART_PATH} />
        </g>
      </svg>
      <span className="font-display fw-bold text-white">
        MyBL
        <span style={{ color: "var(--bs-primary-text-emphasis)" }}>Hub</span>
      </span>
    </span>
  );
}
