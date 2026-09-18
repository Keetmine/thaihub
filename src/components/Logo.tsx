// Фирменный знак (переделан 2026-09-18 по референсу владельца — иконка
// 1.1.1.1: скруглённый квадрат, мягкие волны, белая монограмма).
// Волны — дуги, которые закручиваются и пересекаются, в оранжевой
// гамме прежнего знака (персиковый завиток, фирменная оранжевая
// основа, дуги к красно-оранжевому #e8431f, светлая дуга внизу справа).
// Радужные версии — пастельная, тёплая, в порядке прайд-флага и
// инвертированная маской — владелец посмотрела и вернулась к
// оранжевой: «сделаем в цветах старой svg»;
// буквы MBH — короткая марка бренда (полное имя MyBLHub остаётся в
// вордмарке рядом и в домене). Буквы нарисованы контурами, а не
// шрифтом: знак повторяется в public/icons/logo.svg (фавикон/PWA, из
// него sharp собирает icon-192/512 и apple-touch-icon) и в
// src/app/icon.svg — там веб-шрифта нет, и текст поплыл бы. Правишь
// формы тут — правь и там (или пересобери из одного источника).
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
          <stop offset="0" stopColor="#ff9a40"/>
          <stop offset="1" stopColor="#ff7a2a"/>
        </linearGradient>
        <linearGradient id="logo-pink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc98f"/>
          <stop offset="1" stopColor="#ffad63"/>
        </linearGradient>
        <linearGradient id="logo-coral" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff7a3d"/>
          <stop offset="1" stopColor="#f96a1b"/>
        </linearGradient>
        <linearGradient id="logo-orange" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f25a1f"/>
          <stop offset="1" stopColor="#e8431f"/>
        </linearGradient>
        <linearGradient id="logo-gold" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ffb469"/>
          <stop offset="1" stopColor="#ff9a40"/>
        </linearGradient>
        <linearGradient id="logo-mint" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d63a18"/>
          <stop offset="1" stopColor="#c22f12"/>
        </linearGradient>
        <clipPath id="logo-clip">
          <rect width="512" height="512" rx="118"/>
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="118" fill="url(#logo-bg)"/>
      <g clipPath="url(#logo-clip)">
        <path fill="url(#logo-pink)" d="M-40-40H330C400 30 330 150 200 170C80 190-10 130-40 60Z"/>
          <path fill="url(#logo-coral)" d="M-40 560V320C90 260 190 420 330 330C420 270 500 140 560 40V560Z"/>
        <path fill="url(#logo-orange)" d="M-40 560V440C110 400 240 520 380 430C460 380 520 300 560 230V560Z"/>
        <path fill="url(#logo-gold)" d="M150 560C240 490 400 470 560 360V560Z"/>
      <path fill="url(#logo-mint)" d="M-40 560V425C70 410 170 465 250 560Z"/>
      </g>
      <g fill="#fff" fillRule="evenodd" transform="translate(-5 0)">
        <path d="M81 331V181h38l21 66 21-66h38v150h-34v-87l-18 58h-14l-18-58v87z"/>
        <path d="M219 331V181h52c30 0 48 16 48 40 0 15-8 26-20 31 16 5 26 18 26 36 0 26-20 43-52 43zm34-119v32h16c12 0 18-6 18-16s-6-16-18-16zm0 62v27h20c13 0 20-6 20-14s-7-13-20-13z"/>
        <path d="M345 331V181h34v56h28v-56h34v150h-34v-60h-28v60z"/>
      </g>
      </svg>
      <span className="font-display fw-bold text-white">
        MyBL
        <span style={{ color: "var(--bs-primary-text-emphasis)" }}>Hub</span>
      </span>
    </span>
  );
}
