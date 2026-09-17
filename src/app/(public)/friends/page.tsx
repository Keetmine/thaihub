import { redirect } from "next/navigation";
import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/userAuth";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import FriendActionButton from "@/components/FriendActionButton";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import { sendFriendRequest, acceptFriendRequest, removeFriendship } from "./actions";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref, type Locale } from "@/lib/i18n";
import { userHref, userDisplayName } from "@/lib/userProfile";
import LetterAvatar from "@/components/LetterAvatar";
import { hasPaidPremium } from "@/lib/premium";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.social.friends.metaTitle,
    description: t.social.friends.metaDescription,
    path: "/friends",
    noIndex: true,
    locale,
  });
}


export const dynamic = "force-dynamic";

type RowPerson = {
  id: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  deletedAt: Date | null;
};

function UserRow({
  person,
  locale,
  noName,
  action,
}: {
  person: RowPerson;
  locale: Locale;
  noName: string;
  action: React.ReactNode;
}) {
  const { name, username, photoUrl } = person;
  // У удалённого аккаунта в базе лежит подпись со дня удаления — её
  // переводит userDisplayName. Ник при этом не показываем: аккаунт
  // обезличен, и его профиль всё равно недоступен.
  const displayName = person.deletedAt
    ? userDisplayName(person, locale)
    : name || (username ? `@${username}` : noName);
  return (
    <div className="surface d-flex align-items-center justify-content-between gap-3 p-3">
      <AppLink href={userHref(person)} className="text-decoration-none d-flex align-items-center gap-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy"
            decoding="async"
            src={photoUrl}
            alt=""
            style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "50%",
              background: "var(--bs-secondary-bg)",
            }}
          />
        )}
        <div>
          <p className="font-display fw-medium text-white mb-0">{displayName}</p>
          {!person.deletedAt && name && username && (
            <p className="small text-secondary mb-0">@{username}</p>
          )}
        </div>
      </AppLink>
      {action}
    </div>
  );
}

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale, t } = await getT();
  const f = t.social.friends;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));

  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  // Ник люди вводят и с собачкой — «@katerina3116» (правка владельца
  // 2026-09-10): в профиле он показан именно так, её и копируют. Ищем
  // по обоим вариантам сразу: по введённому и по нему же без «@».
  // Имени с собачкой не бывает, так что лишних совпадений не будет.
  const qBare = q.replace(/^@+/, "");

  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: { requester: true, addressee: true },
    orderBy: { createdAt: "desc" },
  });

  const other = (f: (typeof friendships)[number]) =>
    f.requesterId === user.id ? f.addressee : f.requester;

  const accepted = friendships.filter((f) => f.status === "ACCEPTED");
  const incoming = friendships.filter((f) => f.status === "PENDING" && f.addresseeId === user.id);
  const outgoing = friendships.filter((f) => f.status === "PENDING" && f.requesterId === user.id);

  const excludedIds = new Set([user.id, ...friendships.map((f) => other(f).id)]);
  const searchResults = q
    ? await prisma.user.findMany({
        where: { deletedAt: null,
          id: { notIn: Array.from(excludedIds) },
          // Почта — только ТОЧНЫМ совпадением: поиск по подстроке позволял
          // перебирать чужие адреса, а в результатах email больше не
          // показывается вовсе (Э1.9).
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { username: { contains: qBare, mode: "insensitive" } },
            { email: { equals: qBare, mode: "insensitive" } },
          ],
        },
        take: 20,
      })
    : [];

  // «Кого вы можете знать» — друзья друзей, кого ещё нет ни в друзьях,
  // ни в заявках (переделка страницы 2026-09-17: без этого она была
  // «пустой и непонятной» — поиск и список, и всё). Один запрос по
  // дружбам своих друзей, счёт общих — в памяти, до шести человек.
  const friendIds = accepted.map((fr) => other(fr).id);
  const fofRows =
    friendIds.length > 0
      ? await prisma.friendship.findMany({
          where: {
            status: "ACCEPTED",
            OR: [{ requesterId: { in: friendIds } }, { addresseeId: { in: friendIds } }],
          },
          select: { requesterId: true, addresseeId: true },
        })
      : [];
  const friendIdSet = new Set(friendIds);
  const mutualCount = new Map<string, number>();
  for (const row of fofRows) {
    // Обе стороны могут быть моими друзьями — тогда это не кандидат.
    const candidates = [row.requesterId, row.addresseeId].filter((id) => !friendIdSet.has(id));
    for (const id of candidates) {
      if (excludedIds.has(id)) continue;
      mutualCount.set(id, (mutualCount.get(id) ?? 0) + 1);
    }
  }
  const suggestionIds = Array.from(mutualCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);
  const suggestionUsers =
    suggestionIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: suggestionIds }, deletedAt: null },
          select: {
            id: true,
            name: true,
            username: true,
            photoUrl: true,
            deletedAt: true,
            premiumUntil: true,
            premiumLifetime: true,
          },
        })
      : [];
  const suggestions = suggestionIds
    .map((id) => suggestionUsers.find((u) => u.id === id))
    .filter((u): u is (typeof suggestionUsers)[number] => !!u);

  // Список друзей — по имени, а не по дате дружбы: карточек много, и
  // искать глазами знакомое имя проще в алфавите.
  const acceptedSorted = [...accepted].sort((a, b) =>
    userDisplayName(other(a), locale).localeCompare(userDisplayName(other(b), locale), locale),
  );

  // Поиск — акцентной панелью с крупным полем (правка владельца
  // 2026-09-17: «надо заметнее и сам блок поиска больше»): на этой
  // странице он главный инструмент, а не второстепенное поле сбоку.
  // Единственный glow-panel на странице — правило «один акцентный
  // градиент на экран» соблюдено.
  const searchBlock = (
    <div className="glow-panel p-4">
      <h2 className="display-1-tight mb-1" style={{ fontSize: "1.35rem" }}>
        {f.findTitle}
      </h2>
      <p className="small text-secondary mb-3">{f.findHint}</p>
      <NameSearchBox
        action="/friends"
        q={q}
        placeholder={f.searchPlaceholder}
        big
        className={q ? "mb-3" : "mb-0"}
      />
      {q && (
        <>
          <h3 className="section-heading mb-2">{f.searchResults}</h3>
          {searchResults.length === 0 ? (
            <p className="small text-secondary mb-4">{t.common.nobodyFound}</p>
          ) : (
            <div className="d-flex flex-column gap-2 mb-4">
              {searchResults.map((u) => (
                <UserRow
                  key={u.id}
                  person={u}
                  locale={locale}
                  noName={f.noName}
                  action={
                    <FriendActionButton
                      action={sendFriendRequest}
                      id={u.id}
                      label={f.add}
                      pendingLabel={f.adding}
                    />
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow={f.eyebrow} title={f.title} className="mb-3" />
      {/* Подводка: что вообще даёт дружба на сайте. Страница открывалась
          голым поиском, и было непонятно, зачем тут кто-то нужен. */}
      <p className="text-secondary mb-4" style={{ maxWidth: "38rem" }}>
        {f.lead}
      </p>

      {/* Поиск — над списком, на всю ширину (правка владельца 2026-09-17:
          «сверху привычнее»); сбоку остаются только подсказки «кого вы
          можете знать», и колонка нужна лишь когда они есть. */}
      <div className="friends-search mb-4">{searchBlock}</div>

      <div className={suggestions.length > 0 ? "friends-layout" : ""}>
      <div className="friends-main">

      {incoming.length > 0 && (
        <>
          <h2 className="section-heading mb-2">{f.incoming}</h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {incoming.map((request) => (
              <UserRow
                key={request.id}
                person={other(request)}
                locale={locale}
                noName={f.noName}
                action={
                  <div className="d-flex align-items-center gap-2">
                    <FriendActionButton
                      action={acceptFriendRequest}
                      id={request.id}
                      label={f.accept}
                      pendingLabel="…"
                    />
                    <ConfirmForm
                      action={removeFriendship.bind(null, request.id)}
                      confirmMessage={f.declineConfirm}
                    >
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        aria-label={f.decline}
                      >
                        <TrashIcon />
                      </button>
                    </ConfirmForm>
                  </div>
                }
              />
            ))}
          </div>
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <h2 className="section-heading mb-2">{f.outgoing}</h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {outgoing.map((request) => (
              <UserRow
                key={request.id}
                person={other(request)}
                locale={locale}
                noName={f.noName}
                action={
                  <ConfirmForm
                    action={removeFriendship.bind(null, request.id)}
                    confirmMessage={f.cancelConfirm}
                  >
                    <button type="button" className="btn btn-outline-secondary btn-sm">
                      {f.cancel}
                    </button>
                  </ConfirmForm>
                }
              />
            ))}
          </div>
        </>
      )}

      <h2 className="section-heading mb-2">
        {f.mine}
        {accepted.length > 0 && (
          <span className="text-secondary ms-2" style={{ letterSpacing: 0 }}>
            {accepted.length}
          </span>
        )}
      </h2>
      {accepted.length === 0 ? (
        <EmptyState emoji="👥" title={f.emptyTitle} hint={f.emptyHint} compact />
      ) : (
        /* Карточки сеткой, а не строки на всю ширину: сто друзей —
           это сто строк по пятьдесят пикселей, а в сетке они умещаются
           в четыре колонки. Удаление — тихой иконкой в углу карточки. */
        <div className="friend-grid">
          {acceptedSorted.map((friendship) => {
            const friend = other(friendship);
            const friendName = friend.deletedAt
              ? userDisplayName(friend, locale)
              : friend.name || (friend.username ? `@${friend.username}` : f.noName);
            return (
              <div key={friendship.id} className="surface friend-card">
                <AppLink href={userHref(friend)} aria-label={friendName} className="d-block">
                  <LetterAvatar
                    name={friendName}
                    photoUrl={friend.photoUrl}
                    size={2.8}
                    premiumRing={hasPaidPremium(friend)}
                  />
                </AppLink>
                <div className="min-w-0">
                  <AppLink href={userHref(friend)} className="friend-card-name d-block text-decoration-none">
                    {friendName}
                  </AppLink>
                  {!friend.deletedAt && friend.name && friend.username && (
                    <span className="friend-card-nick d-block">@{friend.username}</span>
                  )}
                </div>
                <div className="friend-card-action">
                  <ConfirmForm
                    action={removeFriendship.bind(null, friendship.id)}
                    confirmMessage={f.removeConfirm(
                      friend.name || friend.username
                        ? userDisplayName(friend, locale)
                        : f.noNameInline,
                    )}
                  >
                    <button type="button" className="icon-btn icon-btn-danger" aria-label={f.remove}>
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="small text-secondary mt-4 mb-0">
        <AppLink href="/account" className="link-body-emphasis">
          {f.backToProfile}
        </AppLink>
      </p>
      </div>

      {suggestions.length > 0 && (
      <aside className="friends-side">
        {(
          <div className="surface p-3">
            <h2 className="section-heading mb-0">{f.suggestions}</h2>
            <p className="small text-secondary mb-2">{f.suggestionsHint}</p>
            <div className="d-flex flex-column">
              {suggestions.map((u) => {
                const uName = u.name || (u.username ? `@${u.username}` : f.noName);
                return (
                  <div key={u.id} className="friend-suggestion">
                    <AppLink href={userHref(u)} aria-label={uName} className="d-block">
                      <LetterAvatar
                        name={uName}
                        photoUrl={u.photoUrl}
                        size={2.5}
                        premiumRing={hasPaidPremium(u)}
                      />
                    </AppLink>
                    <div className="min-w-0">
                      <AppLink href={userHref(u)} className="friend-card-name d-block text-decoration-none">
                        {uName}
                      </AppLink>
                      <span className="friend-card-mutual d-block">
                        {f.mutual(mutualCount.get(u.id) ?? 0)}
                      </span>
                    </div>
                    <FriendActionButton
                      action={sendFriendRequest}
                      id={u.id}
                      label={f.add}
                      pendingLabel={f.adding}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>
      )}
      </div>
    </div>
  );
}
