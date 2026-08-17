import type { Metadata } from "next";
import LandingPage from "../LandingPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "О нас — MyBLHub",
  description:
    "MyBLHub — трекер концертов и фан-событий тайских BL-актёров: афиша, профили исполнителей и дорам, избранное и статусы просмотра.",
};

// «О нас» — тот же лендинг, что видят незалогиненные на главной, но по
// постоянному адресу (ссылка в футере работает и для залогиненных, у
// которых на главной лента событий).
export default function AboutPage() {
  return <LandingPage />;
}
