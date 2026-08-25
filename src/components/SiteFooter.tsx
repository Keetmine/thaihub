import Link from "@/components/AppLink";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Logo from "@/components/Logo";
import { getT } from "@/lib/i18n";

// Футер публичного сайта: ссылки по разделам; вики и «О нас» (лендинг)
// доступны отсюда и без логина.
export default async function SiteFooter() {
  const { t } = await getT();
  const col = "d-flex flex-column gap-1";
  const link = "small text-secondary text-decoration-none footer-link";

  return (
    <footer className="container mt-5 pb-4 public-footer">
      <div className="surface p-4">
        <div className="row g-4">
          <div className="col-12 col-md-3">
            <Logo />
            <p className="small text-secondary mt-2 mb-0">{t.footer.tagline}</p>
          </div>
          <div className="col-6 col-md-3">
            <p className="section-heading mb-2">{t.footer.catalogue}</p>
            <div className={col}>
              <Link href="/events" className={link}>{t.nav.events}</Link>
              <Link href="/artists" className={link}>{t.nav.artists}</Link>
              <Link href="/dramas" className={link}>{t.nav.series}</Link>
              <Link href="/novels" className={link}>{t.nav.novels}</Link>
              <Link href="/locations" className={link}>{t.nav.locations}</Link>
              <Link href="/calendar" className={link}>{t.nav.calendar}</Link>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <p className="section-heading mb-2">{t.footer.personal}</p>
            <div className={col}>
              <Link href="/account" className={link}>{t.nav.profile}</Link>
              <Link href="/trips" className={link}>{t.nav.trips}</Link>
              <Link href="/lists" className={link}>{t.nav.myPlaces}</Link>
              <Link href="/friends" className={link}>{t.nav.friends}</Link>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <p className="section-heading mb-2">{t.footer.useful}</p>
            <div className={col}>
              <Link href="/help" className={link}>{t.nav.help}</Link>
              <Link href="/help#feedback" className={link}>{t.nav.contact}</Link>
              <Link href="/wiki" className={link}>{t.nav.wiki}</Link>
              <Link href="/about" className={link}>{t.nav.about}</Link>
              <Link href="/terms" className={link}>{t.nav.terms}</Link>
              <Link href="/privacy" className={link}>{t.nav.privacy}</Link>
            </div>
          </div>
        </div>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-4">
          <p className="small text-secondary mb-0" style={{ opacity: 0.6 }}>
            © {new Date().getFullYear()} MyBLHub
          </p>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
