import Link from "next/link";
import Logo from "@/components/Logo";

// Футер публичного сайта: ссылки по разделам; вики и «О нас» (лендинг)
// доступны отсюда и без логина.
export default function SiteFooter() {
  const col = "d-flex flex-column gap-1";
  const link = "small text-secondary text-decoration-none footer-link";

  return (
    <footer className="container mt-5 pb-4 public-footer">
      <div className="surface p-4">
        <div className="row g-4">
          <div className="col-12 col-md-3">
            <Logo />
            <p className="small text-secondary mt-2 mb-0">
              Трекер концертов и фан-событий тайских BL-актёров.
            </p>
          </div>
          <div className="col-6 col-md-3">
            <p className="section-heading mb-2">Каталог</p>
            <div className={col}>
              <Link href="/events" className={link}>Афиша</Link>
              <Link href="/artists" className={link}>Артисты</Link>
              <Link href="/dramas" className={link}>Сериалы</Link>
              <Link href="/novels" className={link}>Новеллы</Link>
              <Link href="/locations" className={link}>Локации</Link>
              <Link href="/calendar" className={link}>Календарь</Link>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <p className="section-heading mb-2">Личное</p>
            <div className={col}>
              <Link href="/account" className={link}>Профиль</Link>
              <Link href="/trips" className={link}>Поездки</Link>
              <Link href="/lists" className={link}>Списки мест</Link>
              <Link href="/friends" className={link}>Друзья</Link>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <p className="section-heading mb-2">Полезное</p>
            <div className={col}>
              <Link href="/help" className={link}>Помощь</Link>
              <Link href="/help#feedback" className={link}>Написать нам</Link>
              <Link href="/wiki" className={link}>Вики</Link>
              <Link href="/about" className={link}>О нас</Link>
              <Link href="/terms" className={link}>Условия</Link>
              <Link href="/privacy" className={link}>Конфиденциальность</Link>
            </div>
          </div>
        </div>
        <p className="small text-secondary mb-0 mt-4" style={{ opacity: 0.6 }}>
          © {new Date().getFullYear()} MyBLHub
        </p>
      </div>
    </footer>
  );
}
