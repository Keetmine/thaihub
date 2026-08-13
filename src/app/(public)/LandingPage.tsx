import Link from "next/link";
import Logo from "@/components/Logo";
import { CalendarIcon, HeartIcon, TvIcon, UsersIcon } from "@/components/icons";

const FEATURES = [
  {
    icon: <CalendarIcon />,
    title: "Афиша событий",
    body: "Календарь концертов и фан-встреч тайских актёров — по дням, с препродажами и билетами.",
  },
  {
    icon: <HeartIcon />,
    title: "Профили и избранное",
    body: "Актёры, группы, пейринги и агентства — с полной инфой. Отмечайте любимых сердечком.",
  },
  {
    icon: <TvIcon />,
    title: "Статусы просмотра",
    body: "Смотрю сейчас, посмотрено, в планах, отложено, заброшено — как в MyDramaList, но для своей коллекции.",
  },
  {
    icon: <UsersIcon />,
    title: "Друзья",
    body: "Находите друзей, следите за тем, кто на какие события идёт, делитесь впечатлениями.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Зарегистрируйтесь",
    body: "Один email и пароль — доступ ко всей афише, профилям и сохранённому.",
  },
  {
    n: "02",
    title: "Найдите своих",
    body: "Актёры, группы, сериалы, пейринги, агентства — добавляйте в избранное одним кликом.",
  },
  {
    n: "03",
    title: "Следите за событиями",
    body: "Отмечайте «Я пойду», получайте .ics в календарь, не пропускайте препродажи.",
  },
];

export default function LandingPage() {
  return (
    <div className="d-flex flex-column gap-5">
      {/* ---------- Hero ---------- */}
      <section className="dot-grid text-center py-4 py-md-5">
        <div className="d-flex justify-content-center mb-4">
          <Logo />
        </div>
        <span className="eyebrow d-inline-flex mb-3">Личный трекер тайских BL-событий</span>
        <h1
          className="display-1-tight mx-auto mb-3"
          style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", maxWidth: "44rem" }}
        >
          Все концерты, актёры и сериалы — в одном месте
        </h1>
        <p className="text-secondary mx-auto mb-4" style={{ maxWidth: "34rem", fontSize: "1.05rem" }}>
          ThaiHub собирает афишу фан-событий, профили исполнителей и дорам, избранное
          и статусы просмотра — чтобы вы ничего не упустили.
        </p>
        <div className="d-flex flex-wrap justify-content-center gap-2">
          <Link href="/signup" className="btn btn-primary">
            Зарегистрироваться
          </Link>
          <Link href="/login" className="btn btn-ghost">
            Войти
          </Link>
        </div>
      </section>

      {/* ---------- What is this ---------- */}
      <section className="surface p-4 p-md-5">
        <div className="row g-4 align-items-center">
          <div className="col-12 col-lg-7">
            <span className="eyebrow mb-2 d-inline-flex">О проекте</span>
            <h2 className="display-1-tight mb-3" style={{ fontSize: "1.9rem" }}>
              Сделано фанатами — для фанатов
            </h2>
            <p className="text-secondary mb-0">
              Тайская BL-индустрия огромна: концерты, фан-мит-апы, десятки актёров и
              пейрингов, сотни дорам. ThaiHub — это личный трекер, который держит всё это
              в одном удобном месте: от даты препродажи билетов до статуса «досмотрел
              ли я этот сериал».
            </p>
          </div>
          <div className="col-12 col-lg-5">
            <div className="d-flex flex-column gap-2">
              <div className="agenda-row">
                <div className="agenda-time">
                  <span className="agenda-time-start">19:00</span>
                </div>
                <span className="agenda-dash">—</span>
                <div className="agenda-body">
                  <p className="h6 font-display mb-1">Bodyslam Live in Bangkok</p>
                  <p className="small text-secondary mb-0">Impact Arena, Bangkok</p>
                </div>
              </div>
              <div className="event-chip d-inline-flex align-self-start">NuNew × Palmy</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section>
        <div className="text-center mb-4">
          <span className="eyebrow d-inline-flex mb-2">Возможности</span>
          <h2 className="display-1-tight" style={{ fontSize: "1.9rem" }}>
            Что внутри
          </h2>
        </div>
        <div className="row g-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="col-12 col-sm-6 col-lg-3">
              <div className="surface surface-hover h-100 p-4">
                <div
                  className="d-inline-flex align-items-center justify-content-center mb-3"
                  style={{
                    width: "2.75rem",
                    height: "2.75rem",
                    borderRadius: "0.85rem",
                    background: "var(--bs-primary-bg-subtle)",
                    color: "var(--bs-primary-text-emphasis)",
                  }}
                >
                  {f.icon}
                </div>
                <p className="font-display fw-medium text-white mb-2">{f.title}</p>
                <p className="small text-secondary mb-0">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section>
        <div className="text-center mb-4">
          <span className="eyebrow d-inline-flex mb-2">Как это работает</span>
          <h2 className="display-1-tight" style={{ fontSize: "1.9rem" }}>
            Три шага — и вы в курсе всего
          </h2>
        </div>
        <div className="row g-3">
          {STEPS.map((s) => (
            <div key={s.n} className="col-12 col-md-4">
              <div className="surface h-100 p-4">
                <span
                  className="font-display fw-bold d-block mb-2"
                  style={{ fontSize: "1.5rem", color: "var(--bs-primary-text-emphasis)" }}
                >
                  {s.n}
                </span>
                <p className="font-display fw-medium text-white mb-2">{s.title}</p>
                <p className="small text-secondary mb-0">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="surface dot-grid text-center p-4 p-md-5">
        <h2 className="display-1-tight mb-3" style={{ fontSize: "1.9rem" }}>
          Готовы начать?
        </h2>
        <p className="text-secondary mx-auto mb-4" style={{ maxWidth: "28rem" }}>
          Регистрация занимает меньше минуты — email и пароль, без лишних вопросов.
        </p>
        <div className="d-flex flex-wrap justify-content-center gap-2">
          <Link href="/signup" className="btn btn-primary">
            Создать аккаунт
          </Link>
          <Link href="/login" className="btn btn-ghost">
            У меня уже есть аккаунт
          </Link>
        </div>
      </section>
    </div>
  );
}
