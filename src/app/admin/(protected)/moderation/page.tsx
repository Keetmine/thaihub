import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/dates";
import {
  listHref,
  artistListHref,
  locationHref,
  eventHref,
  dramaHref,
  novelHref,
  communityHref,
} from "@/lib/slugHelpers";
import Pagination from "@/components/Pagination";
import NameSearchBox from "@/components/NameSearchBox";
import { DENSE_PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import ConfirmForm from "@/components/ConfirmForm";
import CommentPhotos from "@/components/CommentPhotos";
import SubmitButton from "@/components/admin/SubmitButton";
import { TrashIcon } from "@/components/icons";
import {
  resolveReport,
  reopenReport,
  deleteReport,
  adminDeleteContent,
  adminUpdateContentText,
  type ModContentType,
} from "./actions";

export const metadata = { title: "Модерация" };

export const dynamic = "force-dynamic";

const TABS = [
  { key: "reports", label: "Жалобы" },
  { key: "reviews", label: "Отзывы" },
  { key: "comments", label: "Комментарии" },
  { key: "notes", label: "Заметки" },
  { key: "placeLists", label: "Списки мест" },
  { key: "artistLists", label: "Списки актёров" },
  { key: "places", label: "Свои места" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const REPORT_STATES = [
  { key: "open", label: "Открытые" },
  { key: "resolved", label: "Разобранные" },
  { key: "all", label: "Все" },
] as const;
type ReportState = (typeof REPORT_STATES)[number]["key"];

function UserLink({ u }: { u: { id: string; name: string | null; email: string | null } | null }) {
  return u ? (
    <Link href={`/admin/users/${u.id}`} className="link-body-emphasis">
      {u.name || u.email}
    </Link>
  ) : (
    <span className="text-secondary">аккаунт удалён</span>
  );
}

/** Ссылка «на ресурс» — публичная страница, где живёт контент (в новой
 *  вкладке). */
function OpenOnSite({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-ghost btn-sm flex-shrink-0"
    >
      Открыть ↗
    </a>
  );
}

/** Правка текста + удаление — общий хвост карточки контента. */
function ContentControls({
  type,
  id,
  text,
  editable = true,
}: {
  type: ModContentType;
  id: string;
  text?: string;
  editable?: boolean;
}) {
  return (
    <>
      {editable && text !== undefined && (
        <details className="w-100 mt-2">
          <summary className="small text-secondary" style={{ cursor: "pointer" }}>
            Редактировать текст
          </summary>
          <form
            action={adminUpdateContentText.bind(null, type, id)}
            className="d-flex flex-column gap-2 mt-2"
          >
            <textarea
              name="text"
              rows={3}
              defaultValue={text}
              aria-label="Текст записи"
              className="form-control form-control-sm"
            />
            <SubmitButton
              label="Сохранить"
              busyLabel="Сохранение…"
              className="btn btn-primary btn-sm align-self-start"
            />
          </form>
        </details>
      )}
    </>
  );
}

/** Предупреждение под тип: снести сообщество — не то же самое, что
 *  убрать комментарий, и общее «Удалить контент?» этого не показывало. */
const DELETE_CONFIRM: Partial<Record<ModContentType, string>> = {
  community: "Удалить сообщество целиком? Вместе с ним исчезнут его темы, встречи и участники.",
  communityPost: "Удалить тему? Комментарии к ней тоже исчезнут.",
  communityMeetup: "Удалить встречу сообщества?",
  communityLink: "Удалить ссылку сообщества?",
};

function DeleteContentButton({ type, id }: { type: ModContentType; id: string }) {
  return (
    <ConfirmForm
      action={adminDeleteContent.bind(null, type, id)}
      confirmMessage={DELETE_CONFIRM[type] ?? "Удалить контент?"}
    >
      <button type="button" className="icon-btn icon-btn-danger flex-shrink-0" aria-label="Удалить">
        <TrashIcon />
      </button>
    </ConfirmForm>
  );
}

/** Куда ведёт отзыв/комментарий: страница сериала/новеллы/события. */
function targetHref(item: {
  drama: { slug: string | null; id: string; title: string } | null;
  novel: { slug: string | null; id: string; title: string } | null;
  event: { slug: string | null; id: string; title: string } | null;
}): { href: string; label: string } | null {
  if (item.drama) return { href: dramaHref(item.drama), label: item.drama.title };
  if (item.novel) return { href: novelHref(item.novel), label: item.novel.title };
  if (item.event) return { href: eventHref(item.event), label: item.event.title };
  return null;
}

const userSelect = { select: { id: true, name: true, email: true } } as const;
const targetInclude = {
  drama: { select: { id: true, slug: true, title: true } },
  novel: { select: { id: true, slug: true, title: true } },
  event: { select: { id: true, slug: true, title: true } },
} as const;

// Очередь модерации: жалобы + весь юзер-контент по табам с пагинацией.
// У каждой карточки — автор, ссылка на публичную страницу (новая
// вкладка), удаление и (для текстов) правка на месте.
export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; state?: string; q?: string }>;
}) {
  await requireAdminPage();
  const { tab: rawTab, page: rawPage, state: rawState, q: rawQ } = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === rawTab)?.key ?? "reports") as TabKey;
  // Состояние очереди жалоб. Раньше показывались только открытые, и
  // разобранная жалоба исчезала навсегда: ни истории, ни возможности
  // проверить, что именно закрыли.
  const reportState: ReportState =
    rawState === "resolved" || rawState === "all" ? rawState : "open";
  const stateWhere =
    reportState === "all" ? {} : { status: reportState === "open" ? ("NEW" as const) : ("RESOLVED" as const) };
  const page = parsePage(rawPage);
  const skip = (page - 1) * DENSE_PAGE_SIZE;
  const pageArgs = { skip, take: DENSE_PAGE_SIZE };

  // Поиск по очереди: текст (жалоба, отзыв, комментарий, заметка,
  // название списка/места) плюс автор — имя или почта. Счётчики на табах
  // тоже считаются с фильтром, чтобы сразу было видно, в каком разделе
  // нашлось.
  const q = (rawQ ?? "").trim();
  const like = { contains: q, mode: "insensitive" as const };
  const byAuthor = { OR: [{ name: like }, { email: like }] };
  const textOrAuthor = q ? { OR: [{ text: like }, { user: byAuthor }] } : {};
  const titleOrAuthor = q ? { OR: [{ title: like }, { user: byAuthor }] } : {};
  const reportWhere = {
    ...stateWhere,
    ...(q ? { OR: [{ reason: like }, { reporter: byAuthor }] } : {}),
  };
  const placesWhere = {
    createdByUserId: { not: null },
    ...(q ? { OR: [{ name: like }, { createdBy: byAuthor }] } : {}),
  };

  const [reportCount, counts] = await Promise.all([
    prisma.report.count({ where: reportWhere }),
    Promise.all([
      prisma.review.count({ where: textOrAuthor }),
      prisma.comment.count({ where: textOrAuthor }),
      prisma.eventNote.count({ where: textOrAuthor }),
      prisma.placeList.count({ where: titleOrAuthor }),
      prisma.performerList.count({ where: titleOrAuthor }),
      prisma.location.count({ where: placesWhere }),
    ]),
  ]);
  const countByTab: Record<TabKey, number> = {
    reports: reportCount,
    reviews: counts[0],
    comments: counts[1],
    notes: counts[2],
    placeLists: counts[3],
    artistLists: counts[4],
    places: counts[5],
  };
  const totalPages = totalPagesFor(countByTab[tab], DENSE_PAGE_SIZE);
  const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
  const buildHref = (p: number) =>
    `/admin/moderation?tab=${tab}&page=${p}` +
    (tab === "reports" ? `&state=${reportState}` : "") +
    qParam;
  const nothingFound = q ? "Ничего не найдено." : null;

  let body: React.ReactNode;

  if (tab === "reports") {
    const reports = await prisma.report.findMany({
      where: reportWhere,
      include: { reporter: userSelect },
      orderBy: { createdAt: "desc" },
      ...pageArgs,
    });
    const listTargets = new Map(
      (
        await prisma.placeList.findMany({
          where: { id: { in: reports.filter((r) => r.targetType === "placeList").map((r) => r.targetId) } },
          select: { id: true, slug: true, title: true },
        })
      ).map((l) => [l.id, l]),
    );
    // На кого жалуются: у Report только targetType/targetId без связи,
    // поэтому профили догружаем пачкой. Без имени очередь была безликой —
    // не видно ни адресата, ни повторных жалоб на одного человека.
    const profileTargets = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: reports.filter((r) => r.targetType === "profile").map((r) => r.targetId) } },
          select: { id: true, name: true, email: true },
        })
      ).map((u) => [u.id, u]),
    );
    // Жалобы на комментарии и отзывы: показываем отрывок текста и автора.
    // У комментария тянем ещё и приложенные картинки (АА20): жалуются
    // чаще всего именно на картинку, и решать «удалять или нет» по
    // одному тексту вслепую нельзя — иначе за каждой жалобой пришлось бы
    // идти на публичную страницу.
    const commentTargets = new Map(
      (
        await prisma.comment.findMany({
          where: { id: { in: reports.filter((r) => r.targetType === "comment").map((r) => r.targetId) } },
          select: {
            id: true,
            text: true,
            user: { select: { id: true, name: true, email: true } },
            photos: { select: { id: true, url: true }, orderBy: { sort: "asc" } },
          },
        })
      ).map((c) => [c.id, c]),
    );
    const reviewTargets = new Map(
      (
        await prisma.review.findMany({
          where: { id: { in: reports.filter((r) => r.targetType === "review").map((r) => r.targetId) } },
          select: { id: true, text: true, user: { select: { id: true, name: true, email: true } } },
        })
      ).map((rv) => [rv.id, rv]),
    );
    // Жалобы на темы обсуждений в сообществах (АА25). Само сообщество
    // тянем вместе с темой: ссылка ведёт на страницу темы внутри
    // сообщества, а название сообщества в очереди отвечает на вопрос
    // «где это происходит» — по нему видно, что жалоб на одно и то же
    // сообщество уже третья.
    const postTargets = new Map(
      (
        await prisma.communityPost.findMany({
          where: { id: { in: reports.filter((r) => r.targetType === "communityPost").map((r) => r.targetId) } },
          select: {
            id: true,
            title: true,
            text: true,
            author: { select: { id: true, name: true, email: true } },
            community: { select: { id: true, slug: true, title: true } },
          },
        })
      ).map((p) => [p.id, p]),
    );
    // Жалобы на само сообщество, его встречу и его ссылку (АА25,
    // админский этап). Раньше принималась жалоба только на тему, и
    // «сообщество целиком не то» сказать было нечем — приходилось
    // жаловаться на случайную тему внутри.
    const communityTargets = new Map(
      (
        await prisma.community.findMany({
          where: { id: { in: reports.filter((r) => r.targetType === "community").map((r) => r.targetId) } },
          select: {
            id: true,
            slug: true,
            title: true,
            visibility: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        })
      ).map((c) => [c.id, c]),
    );
    // Встреча — Event со ссылкой на сообщество; условие `communityId`
    // отсекает попытку выдать за встречу каталожное событие афиши.
    const meetupTargets = new Map(
      (
        await prisma.event.findMany({
          where: {
            id: { in: reports.filter((r) => r.targetType === "communityMeetup").map((r) => r.targetId) },
            communityId: { not: null },
          },
          select: {
            id: true,
            slug: true,
            title: true,
            community: { select: { id: true, slug: true, title: true } },
          },
        })
      ).map((e) => [e.id, e]),
    );
    // У ссылки своей страницы нет — ведём в сообщество, где она висит,
    // а в очереди показываем подпись и сам адрес: жалуются как раз на
    // то, куда ссылка ведёт.
    const linkTargets = new Map(
      (
        await prisma.communityLink.findMany({
          where: { id: { in: reports.filter((r) => r.targetType === "communityLink").map((r) => r.targetId) } },
          select: {
            id: true,
            label: true,
            url: true,
            community: { select: { id: true, slug: true, title: true } },
          },
        })
      ).map((l) => [l.id, l]),
    );
    /**
     * Что удалять по этой жалобе прямо из очереди. Только контент
     * сообществ: у отзыва, комментария и списка есть своя вкладка с
     * поиском, а у сообщества, темы, встречи и ссылки её нет — сходить
     * за ними было некуда, и жалоба закрывалась «на словах».
     *
     * null — объект уже удалён (кнопке нечего сносить).
     */
    const deletableTarget = (r: { targetType: string; targetId: string }): ModContentType | null => {
      if (r.targetType === "community") return communityTargets.has(r.targetId) ? "community" : null;
      if (r.targetType === "communityPost") return postTargets.has(r.targetId) ? "communityPost" : null;
      if (r.targetType === "communityMeetup") return meetupTargets.has(r.targetId) ? "communityMeetup" : null;
      if (r.targetType === "communityLink") return linkTargets.has(r.targetId) ? "communityLink" : null;
      return null;
    };
    const reportsPerTarget = new Map<string, number>();
    for (const r of reports) {
      reportsPerTarget.set(r.targetId, (reportsPerTarget.get(r.targetId) ?? 0) + 1);
    }
    const stateSwitch = (
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        {REPORT_STATES.map((st) => (
          <Link
            key={st.key}
            href={`/admin/moderation?tab=reports&state=${st.key}${qParam}`}
            className={
              st.key === reportState ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"
            }
          >
            {st.label}
          </Link>
        ))}
      </div>
    );

    body = reports.length === 0 ? (
      <>
        {stateSwitch}
        <p className="small text-secondary">
          {nothingFound ??
            (reportState === "open"
              ? "Открытых жалоб нет."
              : reportState === "resolved"
                ? "Разобранных жалоб пока нет."
                : "Жалоб нет.")}
        </p>
      </>
    ) : (
      <div className="d-flex flex-column gap-2">
        {stateSwitch}
        {reports.map((r) => {
          const target =
            r.targetType === "placeList" ? (
              listTargets.has(r.targetId) ? (
                <a
                  href={listHref(listTargets.get(r.targetId)!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-body-emphasis"
                >
                  список «{listTargets.get(r.targetId)!.title}» ↗
                </a>
              ) : (
                <span className="text-secondary">список удалён</span>
              )
            ) : r.targetType === "profile" ? (
              profileTargets.has(r.targetId) ? (
                <>
                  <Link href={`/admin/users/${r.targetId}`} className="link-body-emphasis">
                    {profileTargets.get(r.targetId)!.name ||
                      profileTargets.get(r.targetId)!.email ||
                      "профиль без имени"}
                  </Link>
                  {(reportsPerTarget.get(r.targetId) ?? 0) > 1 && (
                    <span className="badge rounded-pill text-bg-danger ms-2">
                      жалоб: {reportsPerTarget.get(r.targetId)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-secondary">аккаунт удалён</span>
              )
            ) : r.targetType === "comment" ? (
              commentTargets.has(r.targetId) ? (
                <>
                  комментарий «{commentTargets.get(r.targetId)!.text.slice(0, 80)}» —{" "}
                  <Link
                    href={`/admin/users/${commentTargets.get(r.targetId)!.user.id}`}
                    className="link-body-emphasis"
                  >
                    {commentTargets.get(r.targetId)!.user.name ||
                      commentTargets.get(r.targetId)!.user.email ||
                      "без имени"}
                  </Link>
                </>
              ) : (
                <span className="text-secondary">комментарий удалён</span>
              )
            ) : r.targetType === "review" ? (
              reviewTargets.has(r.targetId) ? (
                <>
                  отзыв «{reviewTargets.get(r.targetId)!.text.slice(0, 80)}» —{" "}
                  <Link
                    href={`/admin/users/${reviewTargets.get(r.targetId)!.user.id}`}
                    className="link-body-emphasis"
                  >
                    {reviewTargets.get(r.targetId)!.user.name ||
                      reviewTargets.get(r.targetId)!.user.email ||
                      "без имени"}
                  </Link>
                </>
              ) : (
                <span className="text-secondary">отзыв удалён</span>
              )
            ) : r.targetType === "communityPost" ? (
              postTargets.has(r.targetId) ? (
                <>
                  {/* Ссылка ведёт на страницу самой темы. Раньше вела на
                      `?tab=discussions#post-<id>` — адрес тех времён,
                      когда своей страницы у темы не было; после её
                      появления якорь приводил в список, где разговор ещё
                      надо было открывать руками. */}
                  <a
                    href={`${communityHref(postTargets.get(r.targetId)!.community)}/posts/${r.targetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-body-emphasis"
                  >
                    тему «
                    {(postTargets.get(r.targetId)!.title ?? postTargets.get(r.targetId)!.text).slice(0, 80)}
                    » ↗
                  </a>{" "}
                  в «{postTargets.get(r.targetId)!.community.title}» —{" "}
                  <Link
                    href={`/admin/users/${postTargets.get(r.targetId)!.author.id}`}
                    className="link-body-emphasis"
                  >
                    {postTargets.get(r.targetId)!.author.name ||
                      postTargets.get(r.targetId)!.author.email ||
                      "без имени"}
                  </Link>
                </>
              ) : (
                <span className="text-secondary">тема удалена</span>
              )
            ) : r.targetType === "community" ? (
              communityTargets.has(r.targetId) ? (
                <>
                  сообщество{" "}
                  <Link
                    href={`/admin/communities/${r.targetId}`}
                    className="link-body-emphasis"
                  >
                    «{communityTargets.get(r.targetId)!.title}»
                  </Link>
                  {communityTargets.get(r.targetId)!.visibility === "PRIVATE" && (
                    <span className="badge rounded-pill text-bg-secondary ms-2">закрытое</span>
                  )}{" "}
                  —{" "}
                  <Link
                    href={`/admin/users/${communityTargets.get(r.targetId)!.owner.id}`}
                    className="link-body-emphasis"
                  >
                    {communityTargets.get(r.targetId)!.owner.name ||
                      communityTargets.get(r.targetId)!.owner.email ||
                      "без имени"}
                  </Link>
                  {(reportsPerTarget.get(r.targetId) ?? 0) > 1 && (
                    <span className="badge rounded-pill text-bg-danger ms-2">
                      жалоб: {reportsPerTarget.get(r.targetId)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-secondary">сообщество удалено</span>
              )
            ) : r.targetType === "communityMeetup" ? (
              meetupTargets.has(r.targetId) ? (
                <>
                  встречу{" "}
                  <a
                    href={eventHref(meetupTargets.get(r.targetId)!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-body-emphasis"
                  >
                    «{meetupTargets.get(r.targetId)!.title}» ↗
                  </a>{" "}
                  в «{meetupTargets.get(r.targetId)!.community?.title ?? "сообществе"}»
                </>
              ) : (
                <span className="text-secondary">встреча удалена</span>
              )
            ) : r.targetType === "communityLink" ? (
              linkTargets.has(r.targetId) ? (
                <>
                  ссылку «{linkTargets.get(r.targetId)!.label}» (
                  <span className="text-secondary">
                    {linkTargets.get(r.targetId)!.url.slice(0, 80)}
                  </span>
                  ) в{" "}
                  <Link
                    href={`/admin/communities/${linkTargets.get(r.targetId)!.community.id}`}
                    className="link-body-emphasis"
                  >
                    «{linkTargets.get(r.targetId)!.community.title}»
                  </Link>
                </>
              ) : (
                <span className="text-secondary">ссылка удалена</span>
              )
            ) : (
              <span>
                {r.targetType} {r.targetId}
              </span>
            );
          const deletable = deletableTarget(r);
          return (
            <div key={r.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small mb-1">
                  Жалоба на {target}{" "}
                  <span className="text-secondary">
                    · от <UserLink u={r.reporter} /> · {formatShortDate(r.createdAt)}
                  </span>
                  {r.status === "RESOLVED" && (
                    <span className="badge rounded-pill text-bg-secondary ms-2">решено</span>
                  )}
                </p>
                {r.reason && <p className="small text-secondary mb-0">{r.reason}</p>}
                {/* Картинки из комментария, на который жалуются — тем же
                    компонентом, что и на публичной странице: каждая
                    открывается в полный размер в новой вкладке. */}
                {r.targetType === "comment" && commentTargets.has(r.targetId) && (
                  <CommentPhotos photos={commentTargets.get(r.targetId)!.photos} />
                )}
              </div>
              <div className="d-flex align-items-start gap-2 flex-shrink-0">
                {/* Удаление прямо из очереди — только для контента
                    сообществ: у остальных типов есть своя вкладка, а
                    сюда админ приходит именно затем, чтобы убрать
                    сообщество, тему, встречу или ссылку и закрыть
                    жалобу, не уходя со страницы. */}
                {deletable && <DeleteContentButton type={deletable} id={r.targetId} />}
                {r.status === "RESOLVED" ? (
                  <form action={reopenReport.bind(null, r.id)}>
                    <SubmitButton label="↩ Вернуть в работу" busyLabel="Возвращаем…" className="btn btn-ghost btn-sm" />
                  </form>
                ) : (
                  <form action={resolveReport.bind(null, r.id)}>
                    <SubmitButton label="✓ Решено" busyLabel="Сохраняем…" className="btn btn-ghost btn-sm" />
                  </form>
                )}
                <ConfirmForm
                  action={deleteReport.bind(null, r.id)}
                  confirmMessage="Скрыть жалобу? Запись удалится безвозвратно."
                >
                  <button type="button" className="btn btn-link btn-sm text-secondary">
                    Скрыть
                  </button>
                </ConfirmForm>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (tab === "reviews" || tab === "comments") {
    const isReview = tab === "reviews";
    const items = isReview
      ? await prisma.review.findMany({
          where: textOrAuthor,
          include: { user: userSelect, ...targetInclude },
          orderBy: { createdAt: "desc" },
          ...pageArgs,
        })
      : await prisma.comment.findMany({
          where: textOrAuthor,
          include: {
            user: userSelect,
            ...targetInclude,
            // Приложенные фото (АА20) — чтобы вкладку «Комментарии» можно
            // было просматривать как ленту и ловить лишнее до жалобы.
            photos: { select: { id: true, url: true }, orderBy: { sort: "asc" } },
          },
          orderBy: { createdAt: "desc" },
          ...pageArgs,
        });
    body = items.length === 0 ? (
      <p className="small text-secondary">{nothingFound ?? "Пока пусто."}</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {items.map((item) => {
          const target = targetHref(item);
          return (
            <div key={item.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small mb-1">
                  <UserLink u={item.user} />{" "}
                  {"rating" in item && (
                    <span className="fw-semibold">{(item as { rating: number }).rating}/10</span>
                  )}{" "}
                  <span className="text-secondary">
                    → {target?.label ?? "объект удалён"} · {formatShortDate(item.createdAt)}
                  </span>
                </p>
                <p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>{item.text}</p>
                {/* Фото есть только у комментариев: у отзыва своей модели
                    картинок нет (см. docs/features/catalog.md). */}
                {"photos" in item && <CommentPhotos photos={item.photos} />}
                <ContentControls type={isReview ? "review" : "comment"} id={item.id} text={item.text} />
              </div>
              <div className="d-flex align-items-start gap-2 flex-shrink-0">
                {target && <OpenOnSite href={target.href} />}
                <DeleteContentButton type={isReview ? "review" : "comment"} id={item.id} />
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (tab === "notes") {
    const notes = await prisma.eventNote.findMany({
      where: textOrAuthor,
      include: {
        user: userSelect,
        event: { select: { id: true, slug: true, title: true } },
      },
      orderBy: { id: "desc" },
      ...pageArgs,
    });
    body = notes.length === 0 ? (
      <p className="small text-secondary">{nothingFound ?? "Нет заметок."}</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {notes.map((n) => (
          <div key={n.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="small mb-1">
                <UserLink u={n.user} />{" "}
                <span className="text-secondary">→ {n.event.title} · {n.visibility}</span>
              </p>
              <p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>{n.text}</p>
              <ContentControls type="note" id={n.id} text={n.text} />
            </div>
            <div className="d-flex align-items-start gap-2 flex-shrink-0">
              <OpenOnSite href={eventHref(n.event)} />
              <DeleteContentButton type="note" id={n.id} />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (tab === "placeLists" || tab === "artistLists") {
    const isPlaces = tab === "placeLists";
    const lists = isPlaces
      ? await prisma.placeList.findMany({
          where: titleOrAuthor,
          include: { user: userSelect, _count: { select: { items: true } } },
          orderBy: { createdAt: "desc" },
          ...pageArgs,
        })
      : await prisma.performerList.findMany({
          where: titleOrAuthor,
          include: { user: userSelect, _count: { select: { items: true } } },
          orderBy: { createdAt: "desc" },
          ...pageArgs,
        });
    body = lists.length === 0 ? (
      <p className="small text-secondary">{nothingFound ?? "Нет списков."}</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {lists.map((l) => (
          <div key={l.id} className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3">
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="d-block">{l.title} <span className="small text-secondary">({l._count.items})</span></span>
              <span className="small text-secondary">
                <UserLink u={l.user} /> · {formatShortDate(l.createdAt)} · {l.visibility}
              </span>
            </div>
            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              <OpenOnSite href={isPlaces ? listHref(l) : artistListHref(l)} />
              <DeleteContentButton type={isPlaces ? "placeList" : "artistList"} id={l.id} />
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    const places = await prisma.location.findMany({
      where: placesWhere,
      include: { createdBy: userSelect },
      orderBy: { createdAt: "desc" },
      ...pageArgs,
    });
    body = places.length === 0 ? (
      <p className="small text-secondary">{nothingFound ?? "Нет мест."}</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {places.map((loc) => (
          <div key={loc.id} className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3">
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="d-block">{loc.name}</span>
              <span className="small text-secondary">
                <UserLink u={loc.createdBy} /> · {formatShortDate(loc.createdAt)}
              </span>
            </div>
            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              <OpenOnSite href={locationHref(loc)} />
              <DeleteContentButton type="place" id={loc.id} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <span className="eyebrow">Коммьюнити</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Модерация
      </h1>

      <div className="tab-bar mb-3 flex-wrap">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/moderation?tab=${t.key}${qParam}`}
            prefetch={false}
            className={`tab-bar-item ${tab === t.key ? "active" : ""}`}
          >
            {t.label} ({countByTab[t.key]})
          </Link>
        ))}
      </div>

      <NameSearchBox
        action="/admin/moderation"
        q={q}
        hiddenFields={
          tab === "reports" ? { tab, state: reportState } : { tab }
        }
        placeholder="Поиск по тексту или автору…"
        className="admin-search-lg mb-4"
      />

      {body}

      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
