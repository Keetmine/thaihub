import Link from "@/components/AppLink";
import NavLink from "@/components/NavLink";
import { NAV_PREFIXES } from "@/components/publicNavItems";
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
              <NavLink href="/events" matchPrefixes={NAV_PREFIXES["/events"]} className={link}>{t.nav.events}</NavLink>
              <NavLink href="/artists" matchPrefixes={NAV_PREFIXES["/artists"]} className={link}>{t.nav.artists}</NavLink>
              <NavLink href="/dramas" matchPrefixes={NAV_PREFIXES["/dramas"]} className={link}>{t.nav.series}</NavLink>
              <NavLink href="/novels" matchPrefixes={NAV_PREFIXES["/novels"]} className={link}>{t.nav.novels}</NavLink>
              <NavLink href="/locations" matchPrefixes={NAV_PREFIXES["/locations"]} className={link}>{t.nav.locations}</NavLink>
              <NavLink href="/calendar" matchPrefixes={NAV_PREFIXES["/calendar"]} className={link}>{t.nav.calendar}</NavLink>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <p className="section-heading mb-2">{t.footer.personal}</p>
            <div className={col}>
              <NavLink href="/account" matchPrefixes={NAV_PREFIXES["/account"]} className={link}>{t.nav.profile}</NavLink>
              <NavLink href="/trips" matchPrefixes={NAV_PREFIXES["/trips"]} className={link}>{t.nav.trips}</NavLink>
              <NavLink href="/lists" matchPrefixes={NAV_PREFIXES["/lists"]} className={link}>{t.nav.myPlaces}</NavLink>
              <NavLink href="/friends" matchPrefixes={NAV_PREFIXES["/friends"]} className={link}>{t.nav.friends}</NavLink>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <p className="section-heading mb-2">{t.footer.useful}</p>
            <div className={col}>
              <NavLink href="/help" matchPrefixes={NAV_PREFIXES["/help"]} className={link}>{t.nav.help}</NavLink>
              <Link href="/help#feedback" className={link}>{t.nav.contact}</Link>
              <NavLink href="/wiki" matchPrefixes={NAV_PREFIXES["/wiki"]} className={link}>{t.nav.wiki}</NavLink>
              <NavLink href="/about" matchPrefixes={NAV_PREFIXES["/about"]} className={link}>{t.nav.about}</NavLink>
              <NavLink href="/terms" matchPrefixes={NAV_PREFIXES["/terms"]} className={link}>{t.nav.terms}</NavLink>
              <NavLink href="/privacy" matchPrefixes={NAV_PREFIXES["/privacy"]} className={link}>{t.nav.privacy}</NavLink>
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
