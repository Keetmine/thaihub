import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import AppLink from "@/components/AppLink";
import ConfirmForm from "@/components/ConfirmForm";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getT } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { communityAccess } from "@/lib/communities";
import { userDisplayName } from "@/lib/userProfile";
import { leaveCommunity } from "../actions";
import JoinButton from "./JoinButton";
import MemberRequests from "./MemberRequests";
import CommunityAdmin from "./CommunityAdmin";
import CommunityTabs, { type CommunityTabKey } from "./CommunityTabs";
import MembersList from "./MembersList";
import MembersBlock from "./MembersBlock";
import MemberRowActions from "./MemberRowActions";
import InviteMemberButton from "./InviteMemberButton";
import InviteBanner, { InviteCancelButton } from "./InviteBanner";
import AchievementsBlock from "./AchievementsBlock";
import DiscussionsTab from "./DiscussionsTab";
import MeetupsTab from "./MeetupsTab";
import PlacesTab from "./PlacesTab";
import TripsTab from "./TripsTab";

export const dynamic = "force-dynamic";

/** Общая выборка страницы: и метаданным, и самой странице нужно одно и
 *  то же, а запрос тут не из дешёвых. */
async function loadCommunity(param: string) {
  return prisma.community.findFirst({
    where: slugOrIdWhere(param),
    include: {
      owner: { select: { id: true, name: true } },
      links: { orderBy: { createdAt: "asc" } },
      members: {
        include: {
          user: {
            select: { id: true, name: true, photoUrl: true, username: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      // Приглашения нужны и управляющим (кого уже позвали), и самому
      // приглашённому (баннер «вас зовут»), поэтому едут одной выборкой
      // со всем остальным — их тут единицы.
      invites: {
        include: {
          user: {
            select: { id: true, name: true, photoUrl: true, username: true },
          },
          invitedBy: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t } = await getT();
  const community = await loadCommunity(id);
  if (!community) {
    return pageMetadata({
      title: t.communities.errors.notFound,
      description: t.communities.metaDescription,
      noIndex: true,
    });
  }
  return pageMetadata({
    title: community.title,
    description: community.description ?? t.communities.metaDescription,
    path: `/communities/${community.slug ?? community.id}`,
    // Закрытое сообщество поисковикам не отдаём: его и в списке нет.
    noIndex: community.visibility === "PRIVATE",
  });
}

/**
 * Страница сообщества (АА25) — раскладкой как профиль (правка владельца
 * 2026-09-08): слева колонка с самим сообществом, справа вкладки с
 * содержимым. Классы раскладки общие с профилем (`.profile-layout` и
 * соседние): страницы устроены одинаково, и вторая копия тех же правил
 * разъехалась бы с первой.
 *
 * Витрина — всем, содержимое — участникам: внутри живут ссылки на
 * закрытые чаты и встречи с адресами (см.
 * docs/features/communities.md). Гость видит обложку, название,
 * описание и число участников — этого хватает, чтобы захотеть войти, и
 * не хватает, чтобы что-то утекло.
 */
export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const { locale, t } = await getT();
  const s = t.communities;
  const community = await loadCommunity(id);
  if (!community) notFound();

  const viewer = await getCurrentUser();
  const membership = viewer
    ? community.members.find((m) => m.userId === viewer.id)
    : undefined;
  // Админ сайта видит содержимое любого сообщества, включая закрытое:
  // без этого модерация упиралась бы в заглушку «внутри для
  // участников». Участником он при этом не становится — см.
  // communityAccess.
  const access = communityAccess(
    community,
    viewer?.id ?? null,
    membership ? { role: membership.role, status: membership.status } : null,
    { isSiteAdmin: !!viewer?.isAdmin },
  );

  const active = community.members.filter((m) => m.status === "ACTIVE");
  const pending = community.members.filter((m) => m.status === "PENDING");
  // Убранные (BANNED) не участники нигде: ни в списке, ни в счётчике.
  // Их строки живут только затем, чтобы человек не вступил заново, и
  // видит их лишь тот, кто может запрет снять.
  const banned = community.members.filter((m) => m.status === "BANNED");
  const myInvite = viewer
    ? community.invites.find((i) => i.userId === viewer.id)
    : undefined;

  const memberRow = (m: (typeof community.members)[number]) => ({
    userId: m.userId,
    name: m.user.name,
    username: m.user.username,
    photoUrl: m.user.photoUrl,
    role: m.role,
  });

  // Вкладки собираются по правам: закрытое зрителю не попадает даже в
  // пропсы, потому что панели для него просто не создаются.
  // Счётчики в подписях вкладок (правка владельца 2026-09-08): по ним
  // сразу видно, живое ли сообщество. Ноль не показываем — пустые
  // скобки только шумят, как и на вкладках поездки.
  const [postCount, meetupCount] =
    access.canSeeInside || access.canBrowse
      ? await Promise.all([
          prisma.communityPost.count({
            // Снаружи приватные темы не считаем: иначе счётчик выдавал
            // бы их существование, а весь смысл приватной темы в том,
            // чтобы её снаружи не было видно.
            where: {
              communityId: community.id,
              ...(access.canSeeInside ? {} : { isPrivate: false }),
            },
          }),
          prisma.event.count({ where: { communityId: community.id } }),
        ])
      : [0, 0];
  const withCount = (label: string, n: number) =>
    n > 0 ? `${label} (${n})` : label;

  const tabs: {
    key: CommunityTabKey;
    label: string;
    content: React.ReactNode;
  }[] = [];
  // Обсуждения и встречи видны и снаружи, но в закрытом виде (правка
  // владельца 2026-09-09): заголовки публичных тем и карточки встреч
  // без содержимого. Так человек с улицы понимает, ради чего вступать,
  // — пустая заглушка «внутри для участников» об этом молчала.
  if (access.canSeeInside || access.canBrowse) {
    tabs.push({
      key: "discussions",
      label: withCount(s.tabs.discussions, postCount),
      content: (
        <DiscussionsTab
          communityId={community.id}
          canPost={access.isMember}
          locked={!access.canSeeInside}
        />
      ),
    });
    tabs.push({
      key: "meetups",
      label: withCount(s.tabs.meetups, meetupCount),
      content: (
        <MeetupsTab
          communityId={community.id}
          canCreate={access.isMember}
          locked={!access.canSeeInside}
        />
      ),
    });
  }
  // Всё остальное — только участникам: списки людей, поездки и места
  // это уже содержимое, а не витрина.
  if (access.canSeeInside) {
    tabs.push({
      key: "trips",
      label: s.tabs.trips,
      content: (
        <TripsTab communityId={community.id} canCreate={access.isMember} />
      ),
    });
    tabs.push({
      key: "places",
      // Считаем РАЗНЫЕ локации, а не строки списков: одно место может
      // лежать в двух списках сообщества, и по строкам счётчик врал бы.
      label: withCount(
        s.tabs.places,
        await prisma.location.count({
          where: {
            listItems: { some: { list: { communityId: community.id } } },
          },
        }),
      ),
      content: (
        <PlacesTab communityId={community.id} canEdit={access.canManage} />
      ),
    });
    if (access.canManage && pending.length > 0) {
      tabs.push({
        key: "requests",
        label: `${s.tabs.requests} (${pending.length})`,
        content: (
          <MemberRequests
            communityId={community.id}
            requests={pending.map((m) => ({
              userId: m.userId,
              name: m.user.name ?? t.common.deletedAccount,
            }))}
          />
        ),
      });
    }
  }

  return (
    <div>
      <BackLink fallbackHref="/communities" fallbackLabel={s.heading} />

      <div className="profile-layout mt-3">
        <aside className="profile-side">
          {/* Обложка — главный визуал колонки, как фото в профиле, и
              квадратная: сообщество показывается квадратом и на витрине,
              и в профиле (правка владельца 2026-09-09). Без неё остаётся
              тёплая заливка: пустой серый прямоугольник смотрелся бы
              поломкой. */}
          <div className="community-cover">
            {community.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={community.coverUrl}
                alt=""
                loading="eager"
                decoding="async"
              />
            )}
          </div>

          <div>
            <h1 className="font-display h3 mb-1">{community.title}</h1>
            <p className="small text-secondary mb-0">
              {s.membersCount(active.length)}
              {/* Где живёт сообщество — тут же, под названием (правка
                  владельца 2026-09-09): его вводят в настройках, а
                  видно оно было только в карточке на витрине, то есть
                  везде, кроме самой страницы сообщества. */}
              {community.country &&
                ` · ${[community.country, community.city].filter(Boolean).join(", ")}`}
              {community.visibility === "PRIVATE" &&
                ` · ${s.visibility.PRIVATE}`}
            </p>
          </div>

          {community.description && (
            <p
              className="small text-secondary mb-0"
              style={{ whiteSpace: "pre-line" }}
            >
              {community.description}
            </p>
          )}

          <div className="d-flex flex-wrap gap-2">
            {access.canJoin && (
              <JoinButton
                communityId={community.id}
                needsApproval={community.joinMode === "APPROVAL"}
              />
            )}
            {/* Гостю — та же кнопка, но ведущая на вход (правка
                владельца 2026-09-09): раньше кнопки не было вовсе, и
                страница не отвечала на главный вопрос «как сюда
                попасть». Подпись честная — «Подать заявку» у сообщества
                с одобрением: после входа человек увидит ровно её. */}
            {!viewer && (
              <AppLink href="/login" className="btn btn-primary btn-sm">
                {community.joinMode === "APPROVAL" ? s.joinRequest : s.join}
              </AppLink>
            )}
            {access.isPending && <span className="date-chip">{s.pending}</span>}
            {/* Убранному говорим прямо, почему кнопки «Вступить» нет:
                молча спрятать её значило бы притвориться поломкой. */}
            {access.isBanned && (
              <span className="small text-secondary">
                {s.people.bannedNotice}
              </span>
            )}
            {access.isMember && !access.isOwner && (
              <ConfirmForm
                action={leaveCommunity.bind(null, community.id)}
                confirmMessage={s.leaveConfirm}
                confirmLabel={s.leave}
              >
                <button type="button" className="btn btn-ghost btn-sm">
                  {s.leave}
                </button>
              </ConfirmForm>
            )}
            {/* «Собрать поездку» живёт во вкладке «Поездки», рядом со
                списком уже собранных: здесь она была вторым экземпляром
                той же кнопки. */}
            {access.canManage && (
              <CommunityAdmin
                communityId={community.id}
                isOwner={access.isOwner}
                community={{
                  title: community.title,
                  description: community.description,
                  visibility: community.visibility,
                  joinMode: community.joinMode,
                }}
                links={community.links}
              />
            )}
          </div>

          {/* Приглашение — в колонке, а не во вкладках: в закрытое
              сообщество приглашённого ещё не пускают, вкладок у него
              нет, а решение принимать надо. */}
          {myInvite && !access.isMember && (
            <InviteBanner
              communityId={community.id}
              invitedBy={userDisplayName(myInvite.invitedBy, locale)}
            />
          )}

          {/* Ссылки — только участникам: за ними обычно закрытый чат.
              Стоят ВЫШЕ медалей (правка владельца 2026-09-09): за
              ссылкой человек идёт по делу, в чат, а медали — украшение,
              и держать их первыми значило отодвигать дело за украшение. */}
          {access.canSeeInside && community.links.length > 0 && (
            <div>
              <h2 className="section-heading mb-2">{s.linksTitle}</h2>
              <div className="d-flex flex-column gap-2">
                {community.links.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="surface surface-hover text-decoration-none p-2 px-3 small"
                  >
                    {l.label} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Медали сообщества — там же, где личные в профиле: в левой
              колонке под самим сообществом. Видят их те же, кто видит
              содержимое: правило одно на страницу (`canSeeInside`), а
              не своя копия условий. */}
          {access.canSeeInside && (
            <AchievementsBlock communityId={community.id} />
          )}

          {/* Участники — аватарками под медалями, как друзья в профиле
              (правка владельца 2026-09-09). Тот же `canSeeInside`, что и
              у вкладки «Участники»: снаружи блока нет вовсе — список
              людей это персональные данные. */}
          {access.canSeeInside && (
            <MembersBlock
              members={active.map(memberRow)}
              // Полный список — в окне «Смотреть всех» (правка владельца
              // 2026-09-09: вкладку «Участники» убрали). Управление —
              // роли, бан, разбан, приглашения — переехало вместе с ним:
              // другого места у этих кнопок не осталось.
              fullList={
                <MembersList
                  members={active.map(memberRow)}
                  // Кнопки управления собирает страница: только она знает, кто
                  // тут владелец. Права всё равно перепроверяются в экшенах —
                  // спрятанная кнопка правом не является.
                  actions={
                    access.canManage
                      ? (m) =>
                          // На своей строке кнопок нет: разжаловать и убрать
                          // себя незачем, для ухода есть «покинуть сообщество».
                          m.userId === viewer?.id ? null : (
                            <MemberRowActions
                              communityId={community.id}
                              userId={m.userId}
                              name={m.name ?? t.common.deletedAccount}
                              role={m.role}
                              viewerIsOwner={access.isOwner}
                            />
                          )
                      : undefined
                  }
                  inviteButton={
                    access.canManage ? (
                      <InviteMemberButton communityId={community.id} />
                    ) : undefined
                  }
                  invites={
                    access.canManage
                      ? community.invites.map((i) => ({
                          userId: i.userId,
                          name: i.user.name,
                          username: i.user.username,
                          photoUrl: i.user.photoUrl,
                        }))
                      : undefined
                  }
                  inviteActions={(userId) => (
                    <InviteCancelButton
                      communityId={community.id}
                      userId={userId}
                    />
                  )}
                  banned={access.canManage ? banned.map(memberRow) : undefined}
                  bannedActions={(m) => (
                    <MemberRowActions
                      communityId={community.id}
                      userId={m.userId}
                      name={m.name ?? t.common.deletedAccount}
                      role={m.role}
                      banned
                      viewerIsOwner={access.isOwner}
                    />
                  )}
                />
              }
            />
          )}
        </aside>

        <div className="profile-main">
          {tabs.length > 0 ? (
            <CommunityTabs
              initialTab={(tab as CommunityTabKey) ?? "discussions"}
              tabs={tabs}
            />
          ) : (
            // Сюда попадает только ЗАКРЫТОЕ сообщество: у него нет и
            // витрины — снаружи ему рассказывать о себе нечем.
            <div className="surface p-3">
              <p className="fw-medium text-white mb-1">{s.privateTitle}</p>
              <p className="small text-secondary mb-0">{s.privateHint}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
