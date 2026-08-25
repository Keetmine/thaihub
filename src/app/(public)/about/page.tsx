import LandingPage from "../LandingPage";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.legal.about.metaTitle,
    description: t.legal.about.metaDescription,
    path: "/about",
    locale,
  });
}

// «О нас» — тот же лендинг, что видят незалогиненные на главной, но по
// постоянному адресу (ссылка в футере работает и для залогиненных, у
// которых на главной лента событий).
export default function AboutPage() {
  return <LandingPage />;
}
