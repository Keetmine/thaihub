import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { importDoramaLandTranslation,
  runMdlDramaImport,
  runMdlDramaImportAndSchedule,
  runMdlRequestImport,
  rejectMdlRequest,
  importSelectedMdlRequests,
  importAllOpenMdlRequests,
  rejectSelectedMdlRequests,
  runMdlSearchImport,
  runMdlSearchImportAndSchedule,
  runMdlPerformerImport,
  runTpopArtistImport,
  markImportsReviewed,
  runYoutubeMusicImport,
  runYoutubeMusicImportAndSchedule,
} from "./actions";
import { approveEventDraft, rejectEventDraft } from "./eventDraftActions";
import { OPEN_MDL_REQUEST_WHERE } from "@/lib/mdlDramaRequests";
import type { TtmEvent } from "@/lib/thaiticketmajor";
import type { EventDraftMatch } from "@/lib/ttmCrawl";
import type { PossibleDuplicate } from "@/lib/eventDedupe";
import { adminListHref } from "@/lib/adminListHref";
import { pluralized } from "@/lib/plural";
import RunningImportsWatcher from "./RunningImportsWatcher";
import BlsceneLocationsSyncButton from "./BlsceneLocationsSyncButton";
import StopImportButton from "./StopImportButton";
import TtmImportFlow from "./ttm/TtmImportFlow";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import BulkList from "@/components/admin/BulkList";
import Pagination from "@/components/Pagination";
import { DENSE_PAGE_SIZE } from "@/lib/pagination";
import EntitySelect from "@/components/EntitySelect";
import { searchPerformerOptions } from "../performers/actions";

export const metadata = { title: "Импорты" };

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  "mdl-performer": "MyDramaList: актёр",
  "mdl-drama": "MyDramaList: сериал",
  "mdl-search": "MyDramaList: страница поиска",
  "mdl-requests": "Заявки: импорт сериалов",
  "youtube-music": "YouTube Music: дискография",
  cleanup: "Расписание: чистка просроченного",
  blscene: "blscene: локации",
  "ttm-event": "ThaiTicketMajor: событие",
  "ttm-crawl": "ThaiTicketMajor: обход афиши",
  "tpop-agency": "tpop.fandom: агентство",
  "tpop-artist": "tpop.fandom: артист",
};

// Куда вести из ленты «последнего спарсенного» — на админ-редактирование.
const ITEM_EDIT_HREF: Record<string, (id: string) => string> = {
  performer: (id) => `/admin/performers/${id}/edit`,
  agency: (id) => `/admin/agencies/${id}/edit`,
  event: (id) => `/admin/events/${id}/edit`,
  drama: (id) => `/admin/dramas/${id}/edit`,
  album: () => `/admin/performers`,
  // У черновика нет своей страницы — ведём в очередь на вкладке
  // «События» (разобранный там уже не висит, но идти больше некуда).
  "event-draft": () => `/admin/imports?tab=events`,
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  performer: "исполнитель",
  agency: "агентство",
  event: "событие",
  "event-draft": "черновик события",
  drama: "сериал",
  album: "альбом",
  song: "песня",
};

// Страница разложена по вкладкам (?tab=), как остальные разделы
// админки: раньше все карточки импортов, заявки и оба журнала шли одной
// простынёй, и нужное приходилось искать прокруткой. Группировка — по
// тому, ЧТО заводится, а не по источнику (то же правило, что было у
// групп-заголовков): сериалы с их актёрами и локациями — один смысловой
// кусок, музыка — другой, события — третий; заявки пользователей и
// журналы — свои вкладки со счётчиками.
const TABS = [
  { key: "series", label: "Сериалы и актёры" },
  { key: "music", label: "Музыка и артисты" },
  { key: "events", label: "События" },
  { key: "requests", label: "Заявки" },
  { key: "log", label: "Журнал" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Журнал запусков импортов из админки (пишется logImportRun) + быстрые
// ссылки на места, откуда они запускаются. Массовые прогоны из консоли
// (scripts/*.ts) сюда не пишут — у них свои логи.

// Спарсенное и запуски — два независимых журнала со своей пагинацией
// внутри вкладки «Журнал» (`page` относится к активному подсписку).
const LOG_TABS = [
  { key: "items", label: "Последнее спарсенное" },
  { key: "runs", label: "Последние запуски" },
] as const;
type LogTab = (typeof LOG_TABS)[number]["key"];

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    status?: string;
    log?: string;
    dl?: string;
    draftError?: string;
  }>;
}) {
  const sp = await searchParams;
  const { page: rawPage, status: rawStatus, log: rawLog, tab: rawTab, dl, draftError } = sp;
  const page = Math.max(1, Number(rawPage) || 1);
  // Фильтр по статусу: с дашборда «упавшие импорты» ведут сразу сюда,
  // иначе пришлось бы искать их глазами в общем журнале. Он же решает,
  // какая вкладка открыта: со ссылки про упавшие ждут именно запуски.
  const status = ["RUNNING", "DONE", "FAILED", "CANCELLED"].includes(rawStatus ?? "")
    ? rawStatus!
    : null;
  // Прямые ссылки старого вида (?status=FAILED, ?log=runs) не ломаются:
  // без явного ?tab они открывают вкладку журнала — раньше эти параметры
  // и означали «смотрим журналы».
  const tab: Tab =
    TABS.find((t) => t.key === rawTab)?.key ?? (rawLog || status ? "log" : "series");
  const logTab: LogTab =
    LOG_TABS.find((t) => t.key === rawLog)?.key ?? (status ? "runs" : "items");
  const runsWhere = status ? { status } : {};
  const skip = (page - 1) * DENSE_PAGE_SIZE;
  const [
    runs,
    totalRuns,
    unreviewedFailed,
    recentItems,
    totalItems,
    openRequests,
    runningRun,
  ] = await Promise.all([
    tab === "log" && logTab === "runs"
      ? prisma.importRun.findMany({
          where: runsWhere,
          orderBy: { startedAt: "desc" },
          skip,
          take: DENSE_PAGE_SIZE,
        })
      : Promise.resolve([]),
    tab === "log" ? prisma.importRun.count({ where: runsWhere }) : Promise.resolve(0),
    // Всегда: счётчик на вкладке «Журнал» — часть бейджа сайдбара, по
    // нему видно, куда идти, не открывая вкладку.
    prisma.importRun.count({ where: { status: "FAILED", reviewedAt: null } }),
    tab === "log" && logTab === "items"
      ? prisma.importedItem.findMany({ orderBy: { createdAt: "desc" }, skip, take: DENSE_PAGE_SIZE })
      : Promise.resolve([]),
    tab === "log" ? prisma.importedItem.count() : Promise.resolve(0),
    // Тоже всегда — счётчик вкладки «Заявки» (вторая половина бейджа).
    prisma.mdlDramaRequest.count({ where: OPEN_MDL_REQUEST_WHERE }),
    prisma.importRun.findFirst({ where: { status: "RUNNING" } }),
  ]);
  // Черновики краулера афиши TTM: счётчик — всегда (бейдж вкладки
  // «События», третья часть бейджа сайдбара), сами карточки — только
  // на своей вкладке.
  const pendingDraftCount = await prisma.eventDraft.count({ where: { status: "PENDING" } });
  const eventDrafts =
    tab === "events"
      ? await prisma.eventDraft.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [];
  const totalPages = Math.max(
    1,
    Math.ceil((logTab === "runs" ? totalRuns : totalItems) / DENSE_PAGE_SIZE),
  );

  // Заявки «добавьте сериал» из пользовательского импорта списка MDL:
  // открытые, самые просимые сверху. Резолвятся не кнопкой, а хуком в
  // upsertDramaFromMdl — как только сериал с этой страницей появился в
  // каталоге любым путём. Потолок 100: заявок больше сотни — сигнал
  // разобрать очередь, а не листать её.
  const mdlRequests =
    tab === "requests"
      ? await prisma.mdlDramaRequest.findMany({
          where: OPEN_MDL_REQUEST_WHERE,
          orderBy: [{ users: { _count: "desc" } }, { createdAt: "asc" }],
          include: { _count: { select: { users: true } } },
          take: 100,
        })
      : [];
  // Ключ для форм с выбором исполнителя: поле ссылки сбрасывается само
  // при перерисовке, а выбранный артист живёт в состоянии EntitySelect
  // и оставался после импорта. Появился новый прогон — ключ сменился,
  // компонент перемонтировался, поле пустое.
  const lastRun = await prisma.importRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  // Адреса вкладок и журналов — от ТЕКУЩИХ searchParams (И16): смена
  // вкладки сбрасывает страницу, но не теряет фильтр запусков — вернулся
  // в «Журнал», а «Упавшие» стоят как стояли. `dl` (результат разового
  // dorama.land-импорта) при навигации вычищаем — сообщение одноразовое.
  const tabHref = (t: Tab) =>
    adminListHref("/admin/imports", sp, { tab: t, page: null, dl: null, draftError: null });
  const logHref = (t: LogTab, p = 1) =>
    adminListHref("/admin/imports", sp, {
      tab: "log",
      log: t,
      page: p === 1 ? null : p,
      dl: null,
      draftError: null,
    });

  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Импорты
      </h1>

      <div className="tab-bar-row">
        <div className="tab-bar">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              prefetch={false}
              className={`tab-bar-item ${tab === t.key ? "active" : ""}`}
            >
              {t.label}
              {/* Счётчики — только там, где что-то ждёт разбора: вместе
                  они и есть бейдж «Импорты» в сайдбаре. */}
              {t.key === "events" && pendingDraftCount > 0 && (
                <span className="admin-nav-badge ms-2">{pendingDraftCount}</span>
              )}
              {t.key === "requests" && openRequests > 0 && (
                <span className="admin-nav-badge ms-2">{openRequests}</span>
              )}
              {t.key === "log" && unreviewedFailed > 0 && (
                <span className="admin-nav-badge ms-2">{unreviewedFailed}</span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {tab === "series" && (
        <>
          <p className="small text-secondary mb-3">
            Карточка сериала, его состав, актёры и места съёмок.
          </p>
          <div className="row g-3 mb-4">
            <div className="col-12 col-xl-6">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">MyDramaList: импорт сериала</h2>
                <p className="small text-secondary mb-3">
                  Ссылка на страницу сериала (mydramalist.com/12345-title) — заберём
                  оригинальное название, описание, постер, жанры, режиссёра и
                  сценариста, канал, число серий, даты эфира, возрастной рейтинг и
                  оценку MDL. Если сериала в каталоге ещё нет, он создастся; если
                  есть — дозаполним только пустые поля, занесённое руками не
                  переписываем. Статус («Выходит», «Завершён») выводится из дат
                  эфира и обновляется всегда.
                </p>
                <form action={runMdlDramaImport} className="d-flex flex-wrap gap-2">
                  <input
                    name="mdlUrl"
                    required
                    placeholder="https://mydramalist.com/…"
                    className="form-control flex-grow-1"
                    style={{ minWidth: "16rem" }}
                  />
                  <SubmitButton
                    label={runningRun ? "Импорт идёт…" : "Импортировать"}
                    busyLabel="Запускаем…"
                    className="btn btn-primary btn-sm flex-shrink-0"
                    disabled={!!runningRun}
                  />
                  <SubmitButton
                    label={runningRun ? "Импорт идёт…" : "Импортировать и в расписание"}
                    busyLabel="Запускаем…"
                    className="btn btn-ghost btn-sm flex-shrink-0"
                    disabled={!!runningRun}
                    formAction={runMdlDramaImportAndSchedule}
                    title="Импортировать и отмечать сериал как обновляемый по расписанию"
                  />
                </form>
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">dorama.land: русский перевод</h2>
                <p className="small text-secondary mb-3">
                  Ссылка на страницу сериала (dorama.land/…) — найдём его в нашем
                  каталоге по названию и году и подтянем русское название, описание
                  и все варианты названий. Уже заполненные русские поля
                  переписываются: раз вставили ссылку — значит, так и надо.
                </p>
                {dl && <p className="small mb-3">{dl}</p>}
                <form action={importDoramaLandTranslation} className="d-flex flex-wrap gap-2">
                  <input
                    name="doramalandUrl"
                    required
                    placeholder="https://dorama.land/…"
                    className="form-control flex-grow-1"
                    style={{ minWidth: "16rem" }}
                  />
                  <SubmitButton
                    label="Подтянуть перевод"
                    busyLabel="Тянем…"
                    className="btn btn-primary btn-sm flex-shrink-0"
                  />
                </form>
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">MyDramaList: импорт со страницы поиска</h2>
                <p className="small text-secondary mb-3">
                  Ссылка на страницу поиска MDL — заберём все найденные сериалы,
                  каждый как обычный импорт карточки с составом. Фильтры собирайте
                  на самом MDL (тег, статус, страна) и вставляйте адрес целиком:
                  так не приходится держать здесь копию их справочника тегов,
                  которая всё равно устареет. Обойдём все страницы выдачи,
                  не только первую; ход виден в журнале, там же «Остановить».
                </p>
                <form action={runMdlSearchImport} className="d-flex flex-wrap gap-2">
                  <input
                    name="searchUrl"
                    required
                    placeholder="https://mydramalist.com/search?adv=titles&ty=68&th=15263&st=1"
                    className="form-control flex-grow-1"
                    style={{ minWidth: "16rem" }}
                  />
                  <SubmitButton
                    label={runningRun ? "Импорт идёт…" : "Импортировать"}
                    busyLabel="Запускаем…"
                    className="btn btn-primary btn-sm flex-shrink-0"
                    disabled={!!runningRun}
                  />
                  <SubmitButton
                    label={runningRun ? "Импорт идёт…" : "Импортировать и в расписание"}
                    busyLabel="Запускаем…"
                    className="btn btn-ghost btn-sm flex-shrink-0"
                    disabled={!!runningRun}
                    formAction={runMdlSearchImportAndSchedule}
                    title="Импортировать и отмечать все найденные сериалы как обновляемые по расписанию"
                  />
                </form>
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">MyDramaList: импорт актёра</h2>
                <p className="small text-secondary mb-3">
                  Ссылка на профиль человека (mydramalist.com/people/…) — заберём
                  настоящее имя, дату рождения, биографию, фото и соцсети.
                  Фильмография привяжется к тем сериалам, что уже есть в каталоге
                  (недостающие — только с галочкой ниже). Заполняются лишь пустые
                  поля, занесённое руками не переписываем. Исполнителя можно не
                  выбирать — тогда карточка создастся новая.
                </p>
                <form action={runMdlPerformerImport} className="d-flex flex-column gap-2">
                  <EntitySelect
                    key={`mdl-${lastRun?.id ?? "none"}`}
                    name="performerId"
                    options={[]}
                    placeholder="Исполнитель из каталога (необязательно)…"
                    searchOptions={searchPerformerOptions}
                  />
                  <div className="d-flex flex-wrap gap-2">
                    <input
                      name="mdlUrl"
                      required
                      placeholder="https://mydramalist.com/people/…"
                      className="form-control flex-grow-1"
                      style={{ minWidth: "16rem" }}
                    />
                    <SubmitButton
                      label={runningRun ? "Импорт идёт…" : "Импортировать"}
                      busyLabel="Запускаем…"
                      className="btn btn-primary btn-sm flex-shrink-0"
                      disabled={!!runningRun}
                    />
                  </div>
                  <label className="form-check d-flex align-items-center gap-2 mb-0">
                    <input
                      type="checkbox"
                      name="withFilmography"
                      className="form-check-input m-0"
                    />
                    <span className="form-check-label small text-secondary">
                      <b className="text-white">Разобрать фильмографию.</b> Заведёт
                      сериалы, которых нет в каталоге, и дозаполнит те, где чего-то
                      не хватает — но только карточку: состав по ним не парсится,
                      иначе импорт ушёл бы по цепочке через актёров. До 25 сериалов
                      за прогон, и он станет заметно дольше.
                    </span>
                  </label>
                </form>
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">blscene: новые локации съёмок</h2>
                <p className="small text-secondary mb-3">
                  Разовая проверка «не появилось ли новых мест». Обходим на blscene
                  страницы тех сериалов, что УЖЕ есть в каталоге, и добавляем
                  локации, которых у нас ещё нет. Новые сериалы этой кнопкой не
                  заводятся, существующие локации не перезаписываются — операция
                  только добавляет. Занимает несколько минут: страницы открываются
                  по очереди в браузере.
                </p>
                <BlsceneLocationsSyncButton />
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "music" && (
        <>
          <p className="small text-secondary mb-3">
            Карточка артиста или группы: профиль, соцсети, дискография.
          </p>
          <div className="row g-3 mb-4">
            <div className="col-12 col-xl-6">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">tpop.fandom: импорт артиста</h2>
                <p className="small text-secondary mb-3">
                  Страница артиста или группы (например,
                  https://tpop.fandom.com/wiki/TYTAN): создаст/обновит с полным
                  профилем, дискографией и концертами; агентство возьмётся из поля
                  Agency его страницы.
                </p>
                <form action={runTpopArtistImport} className="d-flex gap-2">
                  <input
                    name="url"
                    required
                    placeholder="https://tpop.fandom.com/wiki/…"
                    className="form-control"
                  />
                  <SubmitButton
                    label={runningRun ? "Импорт идёт…" : "Импортировать"}
                    busyLabel="Запускаем…"
                    className="btn btn-primary btn-sm flex-shrink-0"
                    disabled={!!runningRun}
                  />
                </form>
              </div>
            </div>
            <div className="col-12 col-xl-6">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">YouTube Music: дискография</h2>
                <p className="small text-secondary mb-3">
                  Ссылка на канал артиста — и вида /channel/UC…, и с хендлом
                  (music.youtube.com/@FREEZEDROP): по хендлу id канала найдём
                  сами. Заберём
                  релизы с обложками и годами, песни и ссылки на них. Исполнителя
                  выбираем руками: по имени сопоставлять нельзя, «JASP.ER» и
                  «Jasper» — разные строки, и ошибка привяжет чужие альбомы.
                </p>
                <form action={runYoutubeMusicImport} className="d-flex flex-column gap-2">
                  <EntitySelect
                    key={`ytm-${lastRun?.id ?? "none"}`}
                    name="performerId"
                    options={[]}
                    placeholder="Исполнитель из каталога…"
                    searchOptions={searchPerformerOptions}
                  />
                  <div className="d-flex flex-wrap gap-2">
                    <input
                      name="channelUrl"
                      required
                      placeholder="https://music.youtube.com/channel/UC…"
                      className="form-control flex-grow-1"
                      style={{ minWidth: "16rem" }}
                    />
                    <SubmitButton
                      label={runningRun ? "Импорт идёт…" : "Импортировать"}
                      busyLabel="Запускаем…"
                      className="btn btn-primary btn-sm flex-shrink-0"
                      disabled={!!runningRun}
                    />
                    <SubmitButton
                      label={runningRun ? "Импорт идёт…" : "Импортировать и в расписание"}
                      busyLabel="Запускаем…"
                      className="btn btn-ghost btn-sm flex-shrink-0"
                      disabled={!!runningRun}
                      formAction={runYoutubeMusicImportAndSchedule}
                      title="Импортировать и добавить артиста в ежедневную проверку новинок"
                    />
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "events" && (
        <>
          <p className="small text-secondary mb-3">Афиша: концерты и фанмиты.</p>
          <div className="row g-3 mb-4">
            <div className="col-12">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">Событие по ссылке</h2>
                <p className="small text-secondary mb-3">
                  Одно поле на пять сайтов — ThaiTicketMajor, Eventpop, Ticketmelon,
                  AllTicket, Eventpass: сайт распознаётся по домену. Подтянем
                  название, место, даты, постер, цену и описание; список артистов
                  отдаёт только TTM — там исполнителей с существующим ником
                  привяжем, остальных создадим после вашего подтверждения.
                  theconcert.com не парсится (Cloudflare) — такие заводим руками.
                </p>
                <TtmImportFlow performers={[]} dramas={[]} />
              </div>
            </div>

            {/* Очередь краулера афиши TTM (задача «ttm-crawl», см.
                docs/features/ttm-crawl.md): черновики с совпавшими
                артистами ждут решения владельца. Массовых действий нет
                намеренно — каждый черновик смотрится глазами. */}
            <div className="col-12">
              <div className="surface p-4 h-100">
                <h2 className="section-heading mb-2">
                  Черновики событий ({pendingDraftCount})
                </h2>
                <p className="small text-secondary mb-3">
                  Найдены обходом афиши ThaiTicketMajor: в составе есть кто-то из
                  нашего каталога. «Одобрить» — событие создастся с постером и
                  совпавшими артистами (остальной состав добирается руками в
                  карточке события); «Отклонить» — событие больше не предложится.
                </p>
                {draftError && <p className="alert alert-warning small py-2">{draftError}</p>}
                {eventDrafts.length === 0 ? (
                  <p className="small text-secondary mb-0">
                    Очередь пуста — новые черновики появятся после ближайшего обхода
                    афиши (задача «ThaiTicketMajor: обход афиши» в расписании).
                  </p>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {eventDrafts.map((draft) => {
                      const payload = draft.payload as Partial<TtmEvent> & {
                        possibleDuplicateOf?: PossibleDuplicate;
                      };
                      const matched = (draft.matchedPerformers as EventDraftMatch[] | null) ?? [];
                      const dupe = payload.possibleDuplicateOf;
                      const dates =
                        payload.dateRangeText ??
                        [payload.date, ...(payload.extraDates ?? [])].filter(Boolean).join(", ");
                      return (
                        <div
                          key={draft.id}
                          className="surface d-flex flex-wrap align-items-center gap-3 p-3"
                        >
                          {/* Постер — через наш прокси (./ttm-poster):
                              прямой hotlink с TTM браузер не грузит,
                              их Akamai режет кросс-сайтовые картинки.
                              В базу чужая ссылка не пишется, скачивание
                              к нам — только при одобрении. */}
                          {payload.posterUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/admin/imports/ttm-poster?draft=${draft.id}`}
                              alt=""
                              loading="lazy"
                              style={{ width: "3.5rem", borderRadius: "0.375rem" }}
                            />
                          )}
                          <div className="flex-grow-1" style={{ minWidth: "16rem" }}>
                            <a
                              href={draft.sourceUrl}
                              target="_blank"
                              rel="external nofollow noreferrer"
                              className="fw-medium"
                            >
                              {payload.title || draft.sourceUrl} ↗
                            </a>
                            <div className="small text-secondary">
                              {[dates, payload.startTime, payload.venue]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            <div className="d-flex flex-wrap gap-1 mt-1">
                              {matched.map((m) => (
                                <Link
                                  key={m.performerId}
                                  href={`/admin/performers/${m.performerId}/edit`}
                                  className="event-chip"
                                >
                                  {m.nickname}
                                </Link>
                              ))}
                            </div>
                          </div>
                          <span className="small text-secondary flex-shrink-0">
                            {fmt(draft.createdAt)}
                          </span>
                          {/* Слабое совпадение матчинга дублей (см.
                              eventDedupe.ts): похоже на событие, которое
                              уже есть в каталоге. Чип — рядом с кнопками,
                              чтобы отклонять в один взгляд; название
                              лежит в самой пометке — удалённое событие
                              карточку не роняет. */}
                          {dupe && (
                            <Link
                              href={`/admin/events/${dupe.eventId}/edit`}
                              className="event-chip event-chip-warning flex-shrink-0"
                              style={{ maxWidth: "16rem" }}
                              title="Похоже на событие, которое уже есть в каталоге, — откройте и сравните перед решением"
                            >
                              Возможный дубль: {dupe.eventTitle}
                            </Link>
                          )}
                          <form action={approveEventDraft} className="d-inline">
                            <input type="hidden" name="draftId" value={draft.id} />
                            <SubmitButton
                              label="Одобрить"
                              busyLabel="Создаём…"
                              className="btn btn-primary btn-sm"
                            />
                          </form>
                          <ConfirmForm
                            action={rejectEventDraft.bind(null, draft.id)}
                            confirmMessage={`Отклонить черновик «${payload.title || draft.sourceUrl}»? Обход афиши больше не предложит это событие.`}
                            confirmLabel="Отклонить"
                            busyLabel="Отклоняем…"
                          >
                            <button type="button" className="btn btn-ghost btn-sm">
                              Отклонить
                            </button>
                          </ConfirmForm>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "requests" && (
        <div className="surface p-4 mb-4">
          <p className="small text-secondary mb-3">
            Сериалы, которых не нашлось при импорте пользовательских
            списков с MyDramaList. «Импортировать» — обычный точечный
            импорт по ссылке из заявки; когда сериал появится в каталоге
            (этой кнопкой или любым другим импортом), просившим
            допишется их статус из списка и придёт уведомление со
            ссылкой на сериал. «Отклонить» — для мусорных ссылок:
            повторный импорт списка такую заявку не воскресит. Массовый
            импорт идёт одним фоновым прогоном, по сериалу за раз с
            паузой; ошибка одного не роняет остальных — его заявка
            остаётся открытой, итог виден в журнале.
          </p>
          {mdlRequests.length === 0 ? (
            <p className="small text-secondary mb-0">Открытых заявок нет.</p>
          ) : (
            <>
              <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <ConfirmForm
                  action={importAllOpenMdlRequests}
                  confirmMessage={`Импортировать все открытые заявки (${openRequests > 100 ? "первую сотню из " : ""}${openRequests})? Сериалы пойдут по очереди одним фоновым прогоном — ход и «Остановить» в журнале.`}
                  confirmLabel="Импортировать все"
                  busyLabel="Запускаем…"
                >
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!!runningRun}
                  >
                    {runningRun ? "Импорт идёт…" : `Импортировать все (${openRequests})`}
                  </button>
                </ConfirmForm>
              </div>
              <BulkList
                rows={mdlRequests.map((req) => ({
                  id: req.id,
                  node: (
                    <div className="surface d-flex flex-wrap align-items-center gap-2 px-3 py-2">
                      <div className="flex-grow-1" style={{ minWidth: "14rem" }}>
                        <a
                          href={req.mdlUrl}
                          target="_blank"
                          rel="external nofollow noreferrer"
                          className="fw-medium"
                        >
                          {req.title} ↗
                        </a>
                        <div className="small text-secondary">
                          {pluralized(req._count.users, [
                            "человек просил",
                            "человека просили",
                            "человек просили",
                          ])}{" "}
                          · {fmt(req.createdAt)}
                        </div>
                      </div>
                      <form action={runMdlRequestImport} className="d-inline">
                        <input type="hidden" name="requestId" value={req.id} />
                        <SubmitButton
                          label={runningRun ? "Импорт идёт…" : "Импортировать"}
                          busyLabel="Запускаем…"
                          className="btn btn-primary btn-sm"
                          disabled={!!runningRun}
                        />
                      </form>
                      <form action={rejectMdlRequest} className="d-inline">
                        <input type="hidden" name="requestId" value={req.id} />
                        <SubmitButton
                          label="Отклонить"
                          busyLabel="Отклоняем…"
                          className="btn btn-ghost btn-sm"
                        />
                      </form>
                    </div>
                  ),
                }))}
                actions={[
                  {
                    kind: "confirm",
                    label: "Импортировать выбранные",
                    confirmTemplate:
                      "Импортировать выбранные заявки ({n})? Сериалы пойдут по очереди одним фоновым прогоном — ход и «Остановить» в журнале.",
                    confirmLabel: "Импортировать",
                    busyLabel: "Запускаем…",
                    buttonClassName: "btn btn-primary btn-sm",
                    run: importSelectedMdlRequests,
                  },
                  {
                    kind: "confirm",
                    label: "Отклонить выбранные",
                    confirmTemplate:
                      "Отклонить выбранные заявки ({n})? Повторный импорт списка их не воскресит; если сериал всё же появится в каталоге, просившие узнают.",
                    confirmLabel: "Отклонить",
                    busyLabel: "Отклоняем…",
                    run: rejectSelectedMdlRequests,
                  },
                ]}
              />
            </>
          )}
        </div>
      )}

      <RunningImportsWatcher hasRunning={!!runningRun} />

      {tab === "log" && (
        <>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            {LOG_TABS.map((t) => (
              <Link
                key={t.key}
                href={logHref(t.key)}
                className={`nav-chip ${logTab === t.key ? "is-active" : ""}`}
              >
                {t.label}
                <span className="text-secondary ms-1">
                  {t.key === "runs" ? totalRuns : totalItems}
                </span>
              </Link>
            ))}
          </div>

          {logTab === "items" && (recentItems.length === 0 ? (
            <p className="small text-secondary mb-4">
              Пока пусто — сюда попадает всё, что импортёры создали или обновили
              автоматически (исполнители, события, альбомы…).
            </p>
          ) : (
            <div className="d-flex flex-column gap-1 mb-4">
              {recentItems.map((item) => (
                <div
                  key={item.id}
                  className="surface d-flex flex-wrap align-items-center gap-2 px-3 py-2"
                >
                  <span className="event-chip">{ITEM_TYPE_LABELS[item.entityType] ?? item.entityType}</span>
                  <span className={item.action === "created" ? "text-success small" : "text-secondary small"}>
                    {item.action === "created" ? "создан" : "обновлён"}
                  </span>
                  {ITEM_EDIT_HREF[item.entityType] ? (
                    <Link
                      href={ITEM_EDIT_HREF[item.entityType](item.entityId)}
                      className="link-body-emphasis small text-truncate"
                      style={{ minWidth: 0 }}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="small text-truncate">{item.label}</span>
                  )}
                  <span className="small text-secondary ms-auto flex-shrink-0">
                    {fmt(item.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ))}

          {logTab === "runs" && (
          <>
          <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
            <span className="d-flex flex-wrap gap-2">
              {[
                { value: null, label: "Все" },
                { value: "FAILED", label: "Упавшие" },
                { value: "RUNNING", label: "Идут" },
                { value: "DONE", label: "Успешные" },
              ].map((f) => (
                <Link
                  key={f.label}
                  href={adminListHref("/admin/imports", sp, {
                    tab: "log",
                    log: "runs",
                    status: f.value,
                    page: null,
                    dl: null,
                  })}
                  className={`nav-chip ${status === f.value ? "is-active" : ""}`}
                >
                  {f.label}
                </Link>
              ))}
            </span>
            {/* Гасит бейдж упавших импортов в сайдбаре: он считает только
                неразобранные записи. */}
            {unreviewedFailed > 0 && (
              <form action={markImportsReviewed}>
                <SubmitButton
                  label={`Пометить разобранными (${unreviewedFailed})`}
                  busyLabel="Сохраняем…"
                  className="btn btn-ghost btn-sm"
                />
              </form>
            )}
          </div>
          {runs.length === 0 ? (
            <p className="small text-secondary">
              Запусков ещё не было — здесь появится история всех импортов, запущенных из админки.
            </p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {runs.map((r) => (
                <div key={r.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="small mb-0">
                      <b>{KIND_LABELS[r.kind] ?? r.kind}</b>{" "}
                      <span
                        className={
                          r.status === "DONE"
                            ? "text-success"
                            : r.status === "FAILED"
                              ? "text-danger"
                              : r.status === "CANCELLED"
                                ? "text-secondary"
                                : "text-warning"
                        }
                      >
                        ·{" "}
                        {r.status === "DONE"
                          ? "готово"
                          : r.status === "FAILED"
                            ? "ошибка"
                            : r.status === "CANCELLED"
                              ? "остановлено"
                              : "выполняется"}
                      </span>
                    </p>
                    {r.summary && <p className="small text-secondary mb-0">{r.summary}</p>}
                  </div>
                  <span className="d-flex align-items-center gap-2 flex-shrink-0">
                    {/* Остановить можно только то, что ещё идёт. */}
                    {r.status === "RUNNING" && <StopImportButton runId={r.id} />}
                    <span className="small text-secondary">{fmt(r.startedAt)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          </>
          )}

          <Pagination page={page} totalPages={totalPages} buildHref={(p) => logHref(logTab, p)} />
        </>
      )}
    </div>
  );
}
