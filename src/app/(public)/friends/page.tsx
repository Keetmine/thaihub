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
            { username: { contains: q, mode: "insensitive" } },
            { email: { equals: q, mode: "insensitive" } },
          ],
        },
        take: 20,
      })
    : [];

  return (
    <div>
      <PageHeader eyebrow={f.eyebrow} title={f.title} className="mb-5" />

      <NameSearchBox action="/friends" q={q} placeholder={f.searchPlaceholder} />

      {q && (
        <>
          <h2 className="section-heading mb-2">{f.searchResults}</h2>
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

      <h2 className="section-heading mb-2">{f.mine}</h2>
      {accepted.length === 0 ? (
        <EmptyState emoji="👥" title={f.emptyTitle} hint={f.emptyHint} compact />
      ) : (
        <div className="d-flex flex-column gap-2">
          {accepted.map((friendship) => {
            const friend = other(friendship);
            return (
              <UserRow
                key={friendship.id}
                person={friend}
                locale={locale}
                noName={f.noName}
                action={
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
                }
              />
            );
          })}
        </div>
      )}

      <p className="small text-secondary mt-4">
        <AppLink href="/account" className="link-body-emphasis">
          {f.backToProfile}
        </AppLink>
      </p>
    </div>
  );
}
