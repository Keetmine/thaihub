import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { importDoramaLandTranslation,
  runMdlDramaImport,
  runMdlDramaImportAndSchedule,
  runMdlSearchImport,
  runMdlSearchImportAndSchedule,
  runMdlPerformerImport,
  runTpopArtistImport,
  markImportsReviewed,
  runYoutubeMusicImport,
  runYoutubeMusicImportAndSchedule,
} from "./actions";
import RunningImportsWatcher from "./RunningImportsWatcher";
import BlsceneLocationsSyncButton from "./BlsceneLocationsSyncButton";
import StopImportButton from "./StopImportButton";
import TtmImportFlow from "./ttm/TtmImportFlow";
import SubmitButton from "@/components/admin/SubmitButton";
import Pagination from "@/components/Pagination";
import { DENSE_PAGE_SIZE } from "@/lib/pagination";
import EntitySelect from "@/components/EntitySelect";
import { searchPerformerOptions } from "../performers/actions";

export const metadata = { title: "Импорты" };

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  "mdl-performer": "MyDramaList: актёр",
  "mdl-drama": "MyDramaList: сериал",
  blscene: "blscene: локации",
  "ttm-event": "ThaiTicketMajor: событие",
  "tpop-agency": "tpop.fandom: агентство",
  "tpop-artist": "tpop.fandom: артист",
};

// Куда вести из ленты «последнего спарсенного» — на админ-редактирование.
const ITEM_EDIT_HREF: Record<string, (id: string) => string> = {
  performer: (id) => `/admin/performers/${id}/edit`,
  agency: (id) => `/admin/agencies/${id}/edit`,
  event: (id) => `/admin/events/${id}/edit`,
  album: () => `/admin/performers`,
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  performer: "исполнитель",
  agency: "агентство",
  event: "событие",
  album: "альбом",
  song: "песня",
};

// Журнал запусков импортов из админки (пишется logImportRun) + быстрые
// ссылки на места, откуда они запускаются. Массовые прогоны из консоли
// (scripts/*.ts) сюда не пишут — у них свои логи.

// Спарсенное и запуски — два независимых журнала, и раньше они шли
// простынёй друг за другом: чтобы добраться до запусков, нужно было
// пролистать все находки. Табы дают каждому свою страницу и свою
// пагинацию (`page` относится к активной вкладке).
const LOG_TABS = [
  { key: "items", label: "Последнее спарсенное" },
  { key: "runs", label: "Последние запуски" },
] as const;
type LogTab = (typeof LOG_TABS)[number]["key"];

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; log?: string; dl?: string }>;
}) {
  const { page: rawPage, status: rawStatus, log: rawLog, dl } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);
  // Фильтр по статусу: с дашборда «упавшие импорты» ведут сразу сюда,
  // иначе пришлось бы искать их глазами в общем журнале. Он же решает,
  // какая вкладка открыта: со ссылки про упавшие ждут именно запуски.
  const status = ["RUNNING", "DONE", "FAILED", "CANCELLED"].includes(rawStatus ?? "")
    ? rawStatus!
    : null;
  const logTab: LogTab =
    LOG_TABS.find((t) => t.key === rawLog)?.key ?? (status ? "runs" : "items");
  const runsWhere = status ? { status } : {};
  const skip = (page - 1) * DENSE_PAGE_SIZE;
  const hasRunningPromise = prisma.importRun.findFirst({ where: { status: "RUNNING" } });
  const [runs, totalRuns, unreviewedFailed, recentItems, totalItems] = await Promise.all([
    logTab === "runs"
      ? prisma.importRun.findMany({
          where: runsWhere,
          orderBy: { startedAt: "desc" },
          skip,
          take: DENSE_PAGE_SIZE,
        })
      : Promise.resolve([]),
    prisma.importRun.count({ where: runsWhere }),
    prisma.importRun.count({ where: { status: "FAILED", reviewedAt: null } }),
    logTab === "items"
      ? prisma.importedItem.findMany({ orderBy: { createdAt: "desc" }, skip, take: DENSE_PAGE_SIZE })
      : Promise.resolve([]),
    prisma.importedItem.count(),
  ]);
  const totalPages = Math.max(
    1,
    Math.ceil((logTab === "runs" ? totalRuns : totalItems) / DENSE_PAGE_SIZE),
  );
  const logHref = (tab: LogTab, p = 1) =>
    `/admin/imports?log=${tab}&page=${p}` + (tab === "runs" && status ? `&status=${status}` : "");

  const runningRun = await hasRunningPromise;
  // Ключ для форм с выбором исполнителя: поле ссылки сбрасывается само
  // при перерисовке, а выбранный артист живёт в состоянии EntitySelect
  // и оставался после импорта. Появился новый прогон — ключ сменился,
  // компонент перемонтировался, поле пустое.
  const lastRun = await prisma.importRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Импорты
      </h1>

      {/* Карточки разложены по темам: раньше это была ровная стопка, и
          глазами приходилось искать нужный импорт по названию
          источника, а не по тому, что он заводит. */}
      <h2 className="eyebrow mt-4 mb-2">Актёры и артисты</h2>
      <p className="small text-secondary mb-3">Карточка человека: профиль, соцсети, дискография.</p>
      <div className="row g-3 mb-4">
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
              Ссылка на канал артиста — и /channel/UC…, и с хендлом
              (music.youtube.com/@FREEZEDROP): по хендлу сами найдём id
              канала. Заберём
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

      <h2 className="eyebrow mt-4 mb-2">Сериалы</h2>
      <p className="small text-secondary mb-3">Карточка сериала и его состав.</p>
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
              не только первую; ход виден в журнале ниже, там же «Остановить».
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
      </div>

      <h2 className="eyebrow mt-4 mb-2">События</h2>
      <p className="small text-secondary mb-3">Афиша: концерты и фан-миты.</p>
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="surface p-4 h-100">
            <h2 className="section-heading mb-2">ThaiTicketMajor: импорт события</h2>
            <p className="small text-secondary mb-3">
              Ссылка на страницу события — подтянем название, место, дату, цену
              и список артистов. Исполнителей с уже существующим ником просто
              привяжем к событию, остальных создадим как новых после вашего
              подтверждения. Раньше это была отдельная страница: импорт, до
              которого надо идти по ссылке, легко не заметить.
            </p>
            <TtmImportFlow performers={[]} dramas={[]} />
          </div>
        </div>
      </div>

      <h2 className="eyebrow mt-4 mb-2">Локации</h2>
      <p className="small text-secondary mb-3">Места съёмок.</p>
      <div className="row g-3 mb-4">
        <div className="col-12 col-xl-6">
          <div className="surface p-4 h-100">
            <h2 className="section-heading mb-2">blscene: новые локации съёмок</h2>
            <p className="small text-secondary mb-3">
              Разовая проверка «не появилось ли новых мест». Обходим на blscene
              страницы тех сериалов, что УЖЕ есть в каталоге, и добавляем
              локации, которых у нас ещё нет. Новые сериалы этой кнопкой не
              заводятся, существующие локации не перезаписываются — операция
              только добавляет. Занимает несколько минут: страницы открываются
              по очереди в браузере. Раньше кнопка жила в разделе локаций, где
              её не было видно.
            </p>
            <BlsceneLocationsSyncButton />
          </div>
        </div>
      </div>


      <RunningImportsWatcher hasRunning={!!runningRun} />

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
              href={`/admin/imports?log=runs${f.value ? `&status=${f.value}` : ""}`}
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
    </div>
  );
}
