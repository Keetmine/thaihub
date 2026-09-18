import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { premiumActiveWhere } from "@/lib/premium";
import { formatShortDate, shortMonthNames } from "@/lib/dates";

export const metadata = { title: "Дашборд" };

export const dynamic = "force-dynamic";

/** Сколько строк в каждом списке «последние добавленные». Пять, а не
 *  шесть: списки подняты выше аналитики и должны читаться одним
 *  взглядом (правка владельца 2026-09-18). */
const RECENT_LIMIT = 5;

/**
 * Админ-дашборд (Г10, переделан 2026-09-18 по просьбе владельца —
 * «в таком же формате, как статистика профиля»).
 *
 * Раньше это была стена одинаковых рядов плиток и четыре отдельных
 * списка «недавно добавленные»: чтобы понять состояние продукта,
 * приходилось читать всё подряд. Теперь тот же язык, что на вкладке
 * «Статистика» в профиле: ряд ключевых цифр (`.kpi-tile`) сверху, ниже
 * карточки `.stats-card` — очередь работы, люди с тепловым календарём
 * регистраций, каталог полосками по разделам и одна общая лента
 * последнего вместо четырёх списков. Примитивы общие (globals.css), а
 * акцент внутри админки фиолетовый: `--accent-rgb` переопределён в
 * `.admin-shell` (admin.css), и полосы с ячейками красятся сами.
 */
export default async function AdminStatsPage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    usersTotal,
    premiumActive,
    usersThisWeek,
    withTelegram,
    eventsTotal,
    dramasTotal,
    performersTotal,
    locationsTotal,
    tripsTotal,
    novelsTotal,
    dramasThisWeek,
    performersThisWeek,
    eventsThisWeek,
    recentUsers,
    recentEvents,
    recentDramas,
    recentPerformers,
    newFeedback,
    openReports,
    failedImports,
    recentErrors,
    dramasWithoutPoster,
    eventsWithoutPerformers,
    stubPerformers,
    signupsByMonth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: premiumActiveWhere(now) }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { telegramId: { not: null } } }),
    // Счётчики и списки дашборда — про КАТАЛОГ (см. lib/catalogEvents):
    // «событий 88» должно значить афишу, а не афишу плюс чьи-то
    // домашние посиделки.
    prisma.event.count({ where: catalogEventsWhere() }),
    prisma.drama.count(),
    prisma.performer.count(),
    prisma.location.count(),
    prisma.trip.count(),
    prisma.novel.count(),
    // Пополнение каталога: сериалы и исполнители приезжают из импортов и
    // парсеров, и «сколько за неделю» — быстрый способ увидеть, что они
    // живы.
    prisma.drama.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.performer.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.event.count({ where: { ...catalogEventsWhere(), createdAt: { gte: weekAgo } } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        email: true,
        telegramUsername: true,
        premiumUntil: true,
        premiumLifetime: true,
        createdAt: true,
      },
    }),
    prisma.event.findMany({
      where: catalogEventsWhere(),
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        venue: true,
        createdAt: true,
        occurrences: { orderBy: { startsAt: "asc" }, take: 1, select: { startsAt: true } },
      },
    }),
    prisma.drama.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, title: true, type: true, year: true, createdAt: true },
    }),
    prisma.performer.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, name: true, type: true, stub: true, createdAt: true },
    }),
    // «Требует внимания»: очереди, о которых иначе узнаёшь случайно.
    prisma.feedback.count({ where: { status: "NEW" } }),
    prisma.report.count({ where: { status: "NEW" } }),
    prisma.importRun.count({ where: { status: "FAILED" } }),
    prisma.errorLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
    prisma.drama.count({ where: { posterUrl: null } }),
    // «События без состава» — очередь работы по каталогу: у встречи
    // сообщества состава и не бывает, в очередь ей не надо.
    prisma.event.count({ where: { ...catalogEventsWhere(), performers: { none: {} } } }),
    // Заготовки исполнителей из лайнапов фестивалей — ждут заполнения
    // (docs/features/musicfestival-import.md).
    prisma.performer.count({ where: { stub: true } }),
    // Регистрации по месяцам — для теплового календаря. groupBy в Prisma
    // по месяцу не умеет, поэтому date_trunc сырым запросом; строк тут
    // столько же, сколько месяцев жизни сайта.
    prisma.$queryRaw<{ month: Date; count: bigint }[]>`
      SELECT date_trunc('month', "createdAt") AS month, COUNT(*) AS count
      FROM "User"
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const attention = [
    { count: newFeedback, label: "новых обращений", href: "/admin/feedback", urgent: true },
    { count: openReports, label: "открытых жалоб", href: "/admin/moderation", urgent: true },
    // Ссылки ведут не в раздел вообще, а сразу к проблемным записям —
    // иначе из «12 сериалов без постера» приходилось искать эти двенадцать
    // руками по всему каталогу.
    { count: failedImports, label: "упавших импортов", href: "/admin/imports?status=FAILED", urgent: true },
    { count: recentErrors, label: "ошибок за сутки", href: "/admin/errors?period=day", urgent: true },
    { count: dramasWithoutPoster, label: "сериалов без постера", href: "/admin/dramas?issue=no-poster", urgent: false },
    { count: eventsWithoutPerformers, label: "событий без состава", href: "/admin/events?issue=no-lineup", urgent: false },
    { count: stubPerformers, label: "заготовок исполнителей", href: "/admin/performers?stub=1", urgent: false },
  ].filter((a) => a.count > 0);
  // «Срочных задач» — только то, где ждёт ЖИВОЙ человек (правка
  // владельца 2026-09-18): обращения и жалобы. Упавшие импорты и ошибки
  // остаются в очереди ниже — их разбирают, когда дойдут руки, а не
  // «срочно».
  const urgentTotal = newFeedback + openReports;

  // ---- Тепловой календарь регистраций (как «События по годам» в профиле) ----
  const byYear = new Map<number, number[]>();
  for (const row of signupsByMonth) {
    const d = new Date(row.month);
    const year = d.getUTCFullYear();
    const months = byYear.get(year) ?? Array<number>(12).fill(0);
    months[d.getUTCMonth()] += Number(row.count);
    byYear.set(year, months);
  }
  const years = [...byYear.entries()]
    .map(([year, months]) => ({ year, months, total: months.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => a.year - b.year);
  // Интенсивность — от самого людного месяца за всё время: иначе тихий
  // месяц светился бы так же, как месяц запуска.
  const maxMonth = Math.max(1, ...years.flatMap((y) => y.months));
  const monthNames = shortMonthNames("ru");

  // ---- Каталог полосками (как «Чаще всего видела вживую») ----
  const catalog = [
    { label: "исполнители", value: performersTotal, href: "/admin/performers" },
    { label: "сериалы", value: dramasTotal, href: "/admin/dramas" },
    { label: "локации", value: locationsTotal, href: "/admin/locations" },
    { label: "события", value: eventsTotal, href: "/admin/events" },
    { label: "новеллы", value: novelsTotal, href: "/admin/novels" },
    { label: "поездки", value: tripsTotal, href: undefined },
  ];
  const maxCatalog = Math.max(1, ...catalog.map((c) => c.value));

  // ---- Последние добавленные, по разделам ----
  // Общей ленты вперемешку больше нет (правка владельца 2026-09-18):
  // разделы смотрят по отдельности — «что приехало из импорта сериалов»
  // и «кто зарегистрировался» это разные вопросы.
  const DRAMA_TYPES: Record<string, string> = {
    Drama: "сериал",
    Movie: "фильм",
    "TV Show": "шоу",
    "TV Program": "программа",
  };
  const PERFORMER_TYPES: Record<string, string> = {
    SOLO: "актёр",
    BAND: "группа",
    MASCOT: "маскот",
  };
  const usersList = recentUsers.map((u) => ({
    id: u.id,
    title: u.name || u.email || (u.telegramUsername ? `tg:${u.telegramUsername}` : "без имени"),
    sub: u.premiumLifetime || (u.premiumUntil && u.premiumUntil > now) ? "с подпиской" : null,
    href: `/admin/users/${u.id}`,
    at: u.createdAt,
  }));
  const eventsList = recentEvents.map((e) => ({
    id: e.id,
    title: e.title,
    // Дата первого показа полезнее площадки: по ней видно, свежее
    // событие завели или архивное.
    sub: e.occurrences[0] ? formatShortDate(e.occurrences[0].startsAt) : e.venue || null,
    href: `/admin/events/${e.id}/edit`,
    at: e.createdAt,
  }));
  const dramasList = recentDramas.map((d) => ({
    id: d.id,
    title: d.title,
    sub: [DRAMA_TYPES[d.type ?? "Drama"] ?? d.type, d.year].filter(Boolean).join(" · ") || null,
    href: `/admin/dramas/${d.id}/edit`,
    at: d.createdAt,
  }));
  const performersList = recentPerformers.map((p) => ({
    id: p.id,
    title: p.name,
    // Заготовка с фестиваля — это очередь работы, и в списке её видно
    // сразу, а не после захода в карточку.
    sub: [PERFORMER_TYPES[p.type] ?? p.type, p.stub ? "заготовка" : null].filter(Boolean).join(" · "),
    href: `/admin/performers/${p.id}/edit`,
    at: p.createdAt,
  }));

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Дашборд
      </h1>

      {/* Ключевые цифры — тем же рядом плиток, что в профиле. */}
      <div className="kpi-tiles mb-3">
        <Link href="/admin/users" className="kpi-tile text-decoration-none">
          <span className="kpi-tile-icon" aria-hidden>
            👤
          </span>
          <span className="kpi-tile-value">{usersTotal}</span>
          <span className="kpi-tile-label">пользователей</span>
          <span className="kpi-tile-hint">+{usersThisWeek} за неделю</span>
        </Link>
        {/* Не «с подпиской» (правка владельца 2026-09-18): это число
            теперь стоит в карточке «Люди» вместе с остальными, а плитке
            наверху место под объём каталога — вторую по важности цифру
            после самих людей. */}
        <Link href="/admin/dramas" className="kpi-tile text-decoration-none">
          <span className="kpi-tile-icon" aria-hidden>
            📺
          </span>
          <span className="kpi-tile-value">{dramasTotal}</span>
          <span className="kpi-tile-label">сериалов и шоу</span>
          <span className="kpi-tile-hint">+{dramasThisWeek} за неделю</span>
        </Link>
        <Link href="/admin/events" className="kpi-tile text-decoration-none">
          <span className="kpi-tile-icon" aria-hidden>
            🎤
          </span>
          <span className="kpi-tile-value">{eventsTotal}</span>
          <span className="kpi-tile-label">событий в афише</span>
          <span className="kpi-tile-hint">+{eventsThisWeek} за неделю</span>
        </Link>
        <div className="kpi-tile">
          <span className="kpi-tile-icon" aria-hidden>
            {urgentTotal > 0 ? "🔥" : "✅"}
          </span>
          <span className="kpi-tile-value">{urgentTotal}</span>
          <span className="kpi-tile-label">срочных задач</span>
          <span className="kpi-tile-hint">
            {urgentTotal > 0 ? "обращения и жалобы" : "обращений и жалоб нет"}
          </span>
        </div>
      </div>

      {/* Новинки — сразу под цифрами (правка владельца 2026-09-18):
          на них смотрят каждый день, а аналитика — раз в неделю. */}
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <RecentCard title="Новые пользователи" icon="👤" allHref="/admin/users" items={usersList} />
        </div>
        <div className="col-12 col-lg-6">
          <RecentCard title="Новые события" icon="🎤" allHref="/admin/events" items={eventsList} />
        </div>
        <div className="col-12 col-lg-6">
          <RecentCard title="Новые сериалы и шоу" icon="📺" allHref="/admin/dramas" items={dramasList} />
        </div>
        <div className="col-12 col-lg-6">
          <RecentCard title="Новые исполнители" icon="✨" allHref="/admin/performers" items={performersList} />
        </div>
      </div>

      {/* Аналитика — одной строкой из трёх карточек: очередь работы,
          объём каталога и регистрации. */}
      <div className="row g-3 mt-0 align-items-start">
        <div className="col-12 col-lg-4">
          {/* Очередь работы: всё, что ждёт разбора. Обращения и жалобы —
              ещё и в плитке «срочных задач» наверху. */}
          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Требует внимания</h2>
              {attention.length > 0 && <span className="stats-card-meta">{attention.length} очереди</span>}
            </div>
            {attention.length === 0 ? (
              <p className="small text-secondary mb-0">Всё разобрано — очередей нет.</p>
            ) : (
              <div className="d-flex flex-column gap-1">
                {attention.map((a) => (
                  <Link
                    key={a.label}
                    href={a.href}
                    className={`attention-row text-decoration-none${a.urgent ? " is-urgent" : ""}`}
                  >
                    <span className="attention-row-count">{a.count}</span>
                    <span className="attention-row-label">{a.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="col-12 col-lg-4">
          {/* Каталог: полоски от самого большого раздела — как рейтинг
              артистов в профиле. Числа разной величины (десять тысяч
              артистов против сотни событий) в общей полосе-доле были бы
              нечитаемы. */}
          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Каталог</h2>
              <span className="stats-card-meta">
                +{dramasThisWeek} сериалов · +{performersThisWeek} артистов за неделю
              </span>
            </div>
            <div className="stats-rank">
              {catalog.map((c) => {
                const inner = (
                  <>
                    <span className="stats-rank-name">{c.label}</span>
                    <span className="stats-rank-count">{c.value}</span>
                    <span className="stats-rank-bar">
                      <span style={{ width: `${(c.value / maxCatalog) * 100}%` }} />
                    </span>
                  </>
                );
                return c.href ? (
                  <Link key={c.label} href={c.href} className="stats-rank-row is-flat">
                    {inner}
                  </Link>
                ) : (
                  <div key={c.label} className="stats-rank-row is-flat">
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-4">
          {/* Регистрации — компактным тепловым календарём (правка
              владельца: «сильно меньше»): ячейки мельче, подписи месяцев
              заменены осью «янв → дек», месяц читается по подсказке. */}
          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">Люди</h2>
            </div>
            {/* Четыре числа сеткой 2×2 (правка владельца 2026-09-18):
                раньше «всего» и «с подпиской» жались подписью в шапке, а
                «за неделю» и «через Telegram» были только в плитках
                наверху — в карточке про людей им и место. */}
            <div className="admin-figures">
              <div className="admin-figure">
                <span className="admin-figure-value">{usersTotal}</span>
                <span className="admin-figure-label">всего</span>
              </div>
              <div className="admin-figure">
                <span className="admin-figure-value">{premiumActive}</span>
                <span className="admin-figure-label">с подпиской</span>
              </div>
              <div className="admin-figure">
                <span className="admin-figure-value">{usersThisWeek}</span>
                <span className="admin-figure-label">за неделю</span>
              </div>
              <div className="admin-figure">
                <span className="admin-figure-value">{withTelegram}</span>
                <span className="admin-figure-label">через Telegram</span>
              </div>
            </div>
            <p className="small text-secondary mb-2">Регистрации по месяцам</p>
            {years.length === 0 ? (
              <p className="small text-secondary mb-0">Регистраций пока нет.</p>
            ) : (
              <div className="stats-heat stats-heat-compact">
                {years.map((y) => (
                  <div key={y.year} className="stats-heat-row">
                    <span className="stats-heat-year">{y.year}</span>
                    {y.months.map((count, i) => (
                      <span
                        key={i}
                        className={`stats-heat-cell${count === 0 ? " is-empty" : ""}`}
                        style={{ "--heat": count / maxMonth } as React.CSSProperties}
                        title={`${monthNames[i]} ${y.year}: ${count}`}
                      />
                    ))}
                    <span className="stats-heat-total">{y.total}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="stats-heat-axis mb-0">янв → дек</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Карточка «последние добавленные» — одна на все разделы. Строки те
 *  же, что в ленте обновлений профиля (`.activity-row*`): иконка типа,
 *  название ссылкой на админ-карточку, тихий подзаголовок и дата
 *  создания справа. Пустой список — фраза, а не пустое место. */
function RecentCard({
  title,
  icon,
  allHref,
  items,
}: {
  title: string;
  icon: string;
  /** Ссылка «все» в шапке карточки — в соответствующий список админки. */
  allHref: string;
  items: { id: string; title: string; sub?: string | null; href: string; at: Date }[];
}) {
  return (
    <div className="surface stats-card">
      <div className="stats-card-head">
        <h2 className="section-heading">{title}</h2>
        <Link href={allHref} className="stats-card-meta text-decoration-none">
          все →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="small text-secondary mb-0">Пока пусто.</p>
      ) : (
        <div className="d-flex flex-column gap-1">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className="activity-row text-decoration-none">
              <span className="activity-row-icon" aria-hidden>
                {icon}
              </span>
              <span className="activity-row-body">
                <span className="activity-row-title">{item.title}</span>
                {item.sub && <span className="activity-row-action">{item.sub}</span>}
              </span>
              <span className="activity-row-date">{formatShortDate(item.at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
