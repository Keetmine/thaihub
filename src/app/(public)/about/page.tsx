import LandingPage from "../LandingPage";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "О нас",
  description:
    "MyBLHub — трекер концертов и фан-событий тайских BL-актёров: афиша, профили исполнителей и дорам, избранное и статусы просмотра.",
  path: "/about",
});

// «О нас» — тот же лендинг, что видят незалогиненные на главной, но по
// постоянному адресу (ссылка в футере работает и для залогиненных, у
// которых на главной лента событий).
export default function AboutPage() {
  return <LandingPage />;
}
