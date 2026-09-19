"use server";

import { redirect } from "next/navigation";
import { canUseLocation, createOwnLocation } from "@/lib/ownLocation";
import { canAttachPrivateFile, unlinkPrivateFile } from "@/lib/privateFiles";
import { revalidatePath } from "next/cache";
import { parseAmount, parseCategory, parseCurrency } from "@/lib/tripMoney";
import { prisma } from "@/lib/prisma";
import { sameFlightKey } from "@/lib/tripBookingKey";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import { formatShortDate } from "@/lib/dates";
import { combineDateTime, normalizeTimeValue, parseDateKey, startOfDay, endOfDay } from "@/lib/dates";
import type { TripTodoKind, TripItemVisibility, TripVisibility } from "@/generated/prisma/client";
import { clampItemVisibility, isItemVisibility } from "./itemVisibility";
import { FREE_TRIP_LIMIT, isPremiumActive } from "@/lib/premium";
import { notifyUser } from "@/lib/notifications";
import { getLocale, getT, localeHref } from "@/lib/i18n";

function parseVisibility(raw: unknown): TripVisibility {
  return raw === "PUBLIC" || raw === "FRIENDS" ? raw : "PRIVATE";
}

/** Кто видит отдельную запись поездки (дело, личное событие, бронь).
 *  Присланное значение зажимается видимостью поездки: запись не может
 *  быть виднее её самой, а форму — с её урезанным списком вариантов —
 *  можно обойти. Для новой записи прежнее значение — PARTICIPANTS, как
 *  в схеме. */
function parseItemVisibility(
  raw: FormDataEntryValue | null,
  tripVisibility: TripVisibility,
  current: TripItemVisibility = "PARTICIPANTS",
): TripItemVisibility {
  // Поля в форме нет вовсе (в приватной соло-поездке выбирать не из
  // чего) — прежнее значение остаётся как есть, даже если оно шире
  // нынешнего потолка: зажим работает на чтении, и переписывать чужой
  // выбор при правке заметки незачем.
  if (!isItemVisibility(raw)) return current;
  const picked = clampItemVisibility(raw, tripVisibility);
  // Форма показывает прежнее значение уже зажатым. Если человек его не
  // трогал, в базе остаётся исходный выбор — вернут поездке видимость,
  // вернётся и он.
  return picked === clampItemVisibility(current, tripVisibility) ? current : picked;
}

/** Поля видимости для записи в базу. `isPrivate` — историческое поле:
 *  его ещё читает выдача файлов-вложений, поэтому оно пишется вместе с
 *  visibility и удаляется отдельной миграцией, когда код позеленеет
 *  (порядок специально такой — см. комментарий у enum в схеме). */
function itemVisibilityData(visibility: TripItemVisibility) {
  return { visibility, isPrivate: visibility === "PRIVATE" };
}

/** Ошибки валидации/доступа возвращаются значением, а не броском: в
 *  проде Next минифицирует текст исключения из server action, и клиент
 *  видит generic error boundary вместо причины (см. promoActions.ts).
 *  Экшены, которые при успехе делают redirect, типизированы как
 *  `ActionError | void` — успешная ветка до return не доходит. */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

/**
 * Гейт создания поездки: подписка ИЛИ пробный лимит (аудит 2026-09
 * п.8, решение владельца) — бесплатному одна СВОЯ поездка, чтобы
 * пощупать фичу. Считаются только свои (userId): совместная, куда
 * человека позвали, лимит не съедает — её завёл другой. Остальные
 * действия с поездками для бесплатного не открывались: страница
 * поездки и так показывает события её дат, а вносить свои записи —
 * уже часть подписки.
 */
async function tripCreateGateError(user: {
  id: string;
  premiumUntil: Date | null;
  premiumLifetime: boolean;
}): Promise<string | null> {
  if (isPremiumActive(user)) return null;
  const ownTrips = await prisma.trip.count({ where: { userId: user.id } });
  if (ownTrips < FREE_TRIP_LIMIT) return null;
  return (await getT()).t.trips.errors.freeLimit;
}

export async function createTrip(formData: FormData): Promise<ActionError | void> {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  const gateError = await tripCreateGateError(user);
  if (gateError) return { ok: false, error: gateError };

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  if (!title || !startDate || !endDate) {
    return { ok: false, error: t.trips.errors.fillTitleAndDates };
  }
  const start = combineDateTime(startDate, "00:00");
  const end = combineDateTime(endDate, "00:00");
  if (end < start) {
    return { ok: false, error: t.trips.errors.endBeforeStart };
  }

  // Совместная поездка сразу из формы: выбранным друзьям уходит
  // приглашение (только реальным друзьям — чужие id отбрасываем).
  const requestedMemberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  const friendIds = requestedMemberIds.length > 0 ? await getFriendIds(user.id) : [];
  const memberIds = [...new Set(requestedMemberIds.filter((id) => friendIds.includes(id)))];

  const trip = await prisma.trip.create({
    data: {
      userId: user.id,
      title,
      startDate: start,
      endDate: end,
      visibility: parseVisibility(formData.get("visibility")),
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
  // Fire-and-forget, но с .catch: голый void оставлял отклонённый промис
  // без обработчика — unhandledRejection мог уронить процесс.
  for (const memberId of memberIds) notifyTripInvite(trip.id, memberId).catch(console.error);

  revalidatePath("/trips");
  redirect(localeHref(`/trips/${trip.id}`, locale));
}

/**
 * «Собрать поездку» из сообщества (АА25, связка сообществ с поездками).
 *
 * Близнец `createTrip`, и отличие ровно одно — откуда берётся круг
 * приглашаемых: там друзья, здесь участники сообщества. Слить их в один
 * экшен не вышло бы честно: проверка «а вправе ли зритель звать этих
 * людей» у них разная, а именно она тут и держит приватность.
 *
 * Поездка — вещь личная, поэтому ВСЁ сообщество в неё не зачисляется:
 * человек отмечает в форме, кого зовёт, и позванные получают обычное
 * приглашение (`TripMember` в статусе PENDING) — участниками они станут,
 * когда согласятся. Молча затащить в чужие планы нельзя ровно по той же
 * причине, по какой нельзя молча добавить человека в сообщество.
 *
 * Присланные id проверяются по базе: форму видно, и без этого можно было
 * бы позвать кого угодно, подменив значения. Пройдут только действующие
 * (`ACTIVE`) участники того же сообщества.
 */
export async function createCommunityTrip(
  communityId: string,
  formData: FormData,
): Promise<ActionError | void> {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  // Гейт тот же, что у createTrip: подписка или пробный лимит — поездка
  // из сообщества всё равно СВОЯ поездка и лимит съедает так же.
  const gateError = await tripCreateGateError(user);
  if (gateError) return { ok: false, error: gateError };

  // Звать из сообщества вправе только тот, кто в нём сам состоит:
  // список участников — содержимое сообщества, а оно не для посторонних.
  const membership = await prisma.communityMember.findFirst({
    where: { communityId, userId: user.id, status: "ACTIVE" },
    select: { userId: true },
  });
  if (!membership) return { ok: false, error: t.communities.together.errors.notMember };

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!title || !startDate || !endDate) {
    return { ok: false, error: t.trips.errors.fillTitleAndDates };
  }
  const start = combineDateTime(startDate, "00:00");
  const end = combineDateTime(endDate, "00:00");
  if (end < start) return { ok: false, error: t.trips.errors.endBeforeStart };

  const requested = [...new Set(formData.getAll("memberIds").map(String).filter(Boolean))];
  const memberIds =
    requested.length > 0
      ? (
          await prisma.communityMember.findMany({
            where: {
              communityId,
              status: "ACTIVE",
              // Себя в участники не зовём: владелец поездки и так в ней.
              userId: { in: requested, not: user.id },
              user: { deletedAt: null },
            },
            select: { userId: true },
          })
        ).map((m) => m.userId)
      : [];

  const trip = await prisma.trip.create({
    data: {
      userId: user.id,
      title,
      startDate: start,
      endDate: end,
      visibility: parseVisibility(formData.get("visibility")),
      // Откуда поездка родом: по этому полю она возвращается на вкладку
      // «Поездки» сообщества. Прав оно НЕ раздаёт — вкладка показывает
      // поездку только тем, кто и так вправе её открыть (см. TripsTab):
      // сотня участников сообщества не должна узнать, что четверо из
      // них летят в Бангкок 20 августа.
      communityId,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
  // Fire-and-forget с .catch — как в createTrip: голый void оставлял бы
  // отклонённый промис без обработчика.
  for (const memberId of memberIds) notifyTripInvite(trip.id, memberId).catch(console.error);

  revalidatePath("/trips");
  redirect(localeHref(`/trips/${trip.id}`, locale));
}

/** Редактирование названия/дат/видимости поездки. */
export async function updateTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  if (!isPremiumActive(user)) return { ok: false, error: t.trips.errors.premium };

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!title || !startDate || !endDate) {
    return { ok: false, error: t.trips.errors.fillTitleAndDates };
  }
  const start = combineDateTime(startDate, "00:00");
  const end = combineDateTime(endDate, "00:00");
  if (end < start) return { ok: false, error: t.trips.errors.endBeforeStart };

  await prisma.trip.updateMany({
    where: { id: tripId, userId: user.id },
    data: { title, startDate: start, endDate: end },
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { ok: true };
}

export async function deleteTrip(tripId: string) {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));

  // Файлы броней и личных событий живут в private-uploads/ и каскадом
  // БД не удаляются — собираем пути до удаления, чистим диск после,
  // иначе файлы копились бы бесхозными.
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId: user.id },
    select: {
      bookings: { select: { fileUrl: true } },
      personalEvents: { select: { imageUrl: true } },
    },
  });
  // where включает userId — чужую поездку удалить нельзя.
  await prisma.trip.deleteMany({ where: { id: tripId, userId: user.id } });
  for (const b of trip?.bookings ?? []) await unlinkPrivateFile(b.fileUrl);
  for (const e of trip?.personalEvents ?? []) await unlinkPrivateFile(e.imageUrl);
  revalidatePath("/trips");
  redirect(localeHref("/trips", locale));
}

/** Смена видимости поездки. Записи внутри (дела, личные события, брони)
 *  НЕ переписываются: их видимость зажимается при чтении
 *  (`clampItemVisibility` в `trips/[id]/page.tsx`), поэтому закрытая
 *  поездка сразу закрывает и публичную бронь внутри, а если поездку
 *  снова откроют — вернётся и выбор, который человек сделал. */
export async function setTripVisibility(tripId: string, visibility: string): Promise<ActionResult> {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  if (!isPremiumActive(user)) return { ok: false, error: t.trips.errors.premium };
  await prisma.trip.updateMany({
    where: { id: tripId, userId: user.id },
    data: { visibility: parseVisibility(visibility) },
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { ok: true };
}

// ---------- Личные события внутри поездки ----------

/** Возвращает поездку, только если она принадлежит текущему юзеру и у
 *  него активна подписка — общий гейт всех действий с личными
 *  событиями (весь функционал поездок платный, см. auth.md). Отказ
 *  приходит значением `{ ok: false, error }` — вызывающий экшен отдаёт
 *  его клиенту как есть. */
async function requireOwnTrip(tripId: string) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  if (!isPremiumActive(user)) {
    return { ok: false as const, error: t.trips.errors.premium };
  }
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.userId !== user.id) {
    return { ok: false as const, error: t.trips.errors.tripNotFound };
  }
  return { ok: true as const, trip };
}

/** Доступ владельца ИЛИ со-путешественника (совместные поездки) —
 *  оба могут вносить события/дела; премиум обязателен, как и владельцу. */
async function requireTripAccess(tripId: string) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  if (!isPremiumActive(user)) {
    return { ok: false as const, error: t.trips.errors.premium };
  }
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { userId: user.id },
        { members: { some: { userId: user.id, status: "ACCEPTED" } } },
      ],
    },
  });
  if (!trip) return { ok: false as const, error: t.trips.errors.tripNotFound };
  return { ok: true as const, user, trip, isOwner: trip.userId === user.id };
}

/** Право менять/удалять запись: автор, владелец поездки, или другой
 *  участник при editableByOthers (галочка при создании). */
function canTouchItem(
  item: { createdById: string | null; editableByOthers: boolean },
  userId: string,
  tripOwnerId: string,
): boolean {
  const authorId = item.createdById ?? tripOwnerId;
  if (authorId === userId || tripOwnerId === userId) return true;
  return item.editableByOthers;
}

/**
 * Свои даты участника в общей поездке (АА17): «я лечу 18-го, а ты
 * 22-го». Ставит их КАЖДЫЙ СЕБЕ — и владелец тоже, отдельной строкой в
 * участниках он для этого не становится.
 *
 * Пустые даты — «еду как вся поездка»: строка удаляется, а не
 * заполняется датами поездки, иначе при сдвиге самой поездки чужое
 * присутствие молча осталось бы на старых числах.
 *
 * Рамка поездки при этом расширяется: если человек прилетает раньше
 * или улетает позже, лента дней обязана его дни вместить, иначе его
 * прилёт некуда показать. Сужать поездку по чужим датам, наоборот,
 * нельзя — она общая.
 */
export async function setTripStay(tripId: string, formData: FormData): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const { t } = await getT();

  const startRaw = String(formData.get("startDate") ?? "").trim();
  const endRaw = String(formData.get("endDate") ?? "").trim();

  if (!startRaw && !endRaw) {
    await prisma.tripStay.deleteMany({ where: { tripId, userId: access.user.id } });
    revalidatePath(`/trips/${tripId}`);
    return { ok: true };
  }
  if (!startRaw || !endRaw) return { ok: false, error: t.trips.errors.stayBothDates };

  const startDate = new Date(`${startRaw}T00:00:00.000Z`);
  const endDate = new Date(`${endRaw}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { ok: false, error: t.trips.errors.stayBothDates };
  }
  if (endDate < startDate) return { ok: false, error: t.trips.errors.stayOrder };

  await prisma.$transaction(async (tx) => {
    await tx.tripStay.upsert({
      where: { tripId_userId: { tripId, userId: access.user.id } },
      create: { tripId, userId: access.user.id, startDate, endDate },
      update: { startDate, endDate },
    });
    // Рамку двигаем только наружу — см. комментарий выше.
    const widen: { startDate?: Date; endDate?: Date } = {};
    if (startDate < access.trip.startDate) widen.startDate = startDate;
    if (endDate > access.trip.endDate) widen.endDate = endDate;
    if (Object.keys(widen).length > 0) {
      await tx.trip.update({ where: { id: tripId }, data: widen });
    }
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { ok: true };
}

// ---------- Участники поездки ----------

/** Телеграм приглашённому о новом инвайте (fire-and-forget). */
async function notifyTripInvite(tripId: string, inviteeId: string): Promise<void> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!trip) return;
  // Через notifyUser: строка в колокольчике на сайте + Telegram, если
  // он привязан. Раньше уведомление уходило только в Telegram, поэтому
  // приглашённый без него не узнавал о поездке вовсе.
  await notifyUser({
    userId: inviteeId,
    actorId: trip.user.id,
    kind: "TRIP_INVITE",
    actorName: trip.user.name,
    subject: trip.title,
    // Функцией, а не строкой: даты форматируются на языке того, кому
    // уведомление адресовано, а он известен только внутри notifyUser.
    body: (_t, locale) =>
      `${formatShortDate(trip.startDate, locale)} – ${formatShortDate(trip.endDate, locale)}`,
    href: `/trips/${trip.slug ?? trip.id}`,
  });
}

export async function addTripMember(tripId: string, friendId: string): Promise<ActionResult> {
  const own = await requireOwnTrip(tripId);
  if (!own.ok) return { ok: false, error: own.error };
  if (friendId === own.trip.userId) {
    const { t } = await getT();
    return { ok: false, error: t.trips.errors.ownerAlreadyIn };
  }
  // Только друзей — как при создании поездки: friendId приходит с
  // клиента, и без проверки можно было спамить приглашениями любой id.
  const friendIds = await getFriendIds(own.trip.userId);
  if (!friendIds.includes(friendId)) {
    const { t } = await getT();
    return { ok: false, error: t.trips.errors.notFriend };
  }
  // Добавление — это приглашение: участником друг станет, когда примет.
  await prisma.tripMember.upsert({
    where: { tripId_userId: { tripId, userId: friendId } },
    create: { tripId, userId: friendId },
    update: {},
  });
  // .catch — иначе отклонённый промис остаётся без обработчика.
  notifyTripInvite(tripId, friendId).catch(console.error);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

/** Принять приглашение в поездку (есть PENDING-строка на меня). */
export async function acceptTripInvite(tripId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));
  const updated = await prisma.tripMember.updateMany({
    where: { tripId, userId: user.id, status: "PENDING" },
    data: { status: "ACCEPTED" },
  });
  if (updated.count > 0) {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (trip) {
      await notifyUser({
        userId: trip.userId,
        actorId: user.id,
        kind: "TRIP_INVITE_ACCEPTED",
        actorName: user.name,
        subject: trip.title,
        body: trip.title,
        href: `/trips/${trip.slug ?? trip.id}`,
      });
    }
  }
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

/** Отклонить приглашение — строка удаляется, владелец может позвать снова. */
export async function declineTripInvite(tripId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));
  await prisma.tripMember.deleteMany({
    where: { tripId, userId: user.id, status: "PENDING" },
  });
  // Приглашённый окна ещё не заводил, но если он его когда-то ставил и
  // вышел, а потом его позвали снова — чистим за собой (АА17).
  await prisma.tripStay.deleteMany({ where: { tripId, userId: user.id } });
  revalidatePath("/trips");
}

/**
 * Что убирается из поездки вместе с ушедшим (решение владельца
 * 2026-09-06).
 *
 * Уходит:
 * - окно присутствия (АА17): даты «я тут с 22-го» без самого участника
 *   не значат ничего, а строка-сирота тянула бы за собой рамку поездки;
 * - его ЧЕМОДАН и ПОКУПКИ целиком: это личные списки, чужой поездке они
 *   не нужны ни в каком виде;
 * - все его ПРИВАТНЫЕ записи — дела, личные события, брони: их и так не
 *   видел никто, кроме автора, а без автора они просто мусор в базе.
 *
 * Остаётся то, что он открывал другим: общие дела, личные события и
 * брони видимостью «участникам» и шире. Люди на них рассчитывают —
 * «Лена забронировала ужин» не должно исчезнуть из общего плана оттого,
 * что Лена вышла.
 *
 * Даты САМОЙ поездки не сужаем: она могла быть расширена под чужой
 * прилёт, но в этих днях уже стоят чужие планы — решать владельцу.
 */
async function cleanupAfterLeaving(tripId: string, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.tripStay.deleteMany({ where: { tripId, userId } }),
    prisma.tripTodo.deleteMany({
      where: {
        tripId,
        createdById: userId,
        OR: [{ kind: { in: ["PACKING", "SHOPPING"] } }, { visibility: "PRIVATE" }],
      },
    }),
    prisma.tripPersonalEvent.deleteMany({
      where: { tripId, createdById: userId, visibility: "PRIVATE" },
    }),
    prisma.tripBooking.deleteMany({
      where: { tripId, createdById: userId, visibility: "PRIVATE" },
    }),
  ]);
}

export async function removeTripMember(tripId: string, userId: string): Promise<ActionResult> {
  const own = await requireOwnTrip(tripId);
  if (!own.ok) return { ok: false, error: own.error };

  // Копию заводим ЗА него и сразу (решение владельца 2026-09-06):
  // спросить его в этот момент невозможно, а терять свои записи из-за
  // чужого решения он не должен. Не нужна — удалит сам, это одна
  // кнопка. Копия делается ДО уборки: после неё копировать будет
  // нечего.
  let copyId: string | null = null;
  try {
    copyId = await createTripCopyFor(tripId, userId);
  } catch (e) {
    // Не смогли скопировать — удаление всё равно доводим до конца:
    // владелец попросил убрать человека, и повиснуть на полпути хуже.
    console.error("копия поездки для убранного участника не завелась:", e);
  }

  await prisma.tripMember.deleteMany({ where: { tripId, userId } });
  await cleanupAfterLeaving(tripId, userId);

  // Уведомление обязательно: иначе человек не узнает ни что его убрали,
  // ни что копия у него есть.
  notifyTripRemoved(tripId, userId, copyId).catch(console.error);

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { ok: true };
}

/** «Вас убрали из поездки — ваша копия сохранена». Ведёт в КОПИЮ: в
 *  исходную поездку человеку уже нельзя. */
async function notifyTripRemoved(
  tripId: string,
  userId: string,
  copyId: string | null,
): Promise<void> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { title: true, user: { select: { id: true, name: true } } },
  });
  if (!trip) return;
  await notifyUser({
    userId,
    actorId: trip.user.id,
    kind: "TRIP_REMOVED",
    actorName: trip.user.name,
    subject: trip.title,
    href: copyId ? `/trips/${copyId}` : "/trips",
  });
}

/**
 * «Забрать свою копию» — личная поездка со своими записями, чтобы уход
 * из совместной не заставлял переносить два десятка записей руками
 * (решение владельца 2026-09-06: копию ВСЕГДА спрашиваем, сама она не
 * заводится).
 *
 * Копируются только СВОИ записи: чужие человек видел, но они не его.
 * Отметки «иду» не копируются вовсе — они живут на событиях и уже его,
 * поэтому план новой поездки соберётся сам. Даты берутся из своего окна
 * присутствия, если оно было: своя поездка — про свои дни.
 *
 * Места и списки мест — ссылки на общие сущности, копировать их дёшево
 * и безобидно: сами списки остаются у их владельцев.
 */
export async function copyTripForSelf(tripId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  await createTripCopyFor(tripId, access.user.id);
  revalidatePath("/trips");
  return { ok: true };
}

/** Сама копия. Отдельно от экшена, потому что её заводит и уходящий сам,
 *  и владелец ЗА того, кого убирает: во втором случае проверять права
 *  ушедшего негде и незачем — их уже проверил владелец. Возвращает id
 *  копии, чтобы уведомление вело прямо в неё. */
async function createTripCopyFor(tripId: string, userId: string): Promise<string> {
  const source = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: {
      stays: { where: { userId }, select: { startDate: true, endDate: true } },
      personalEvents: {
        where: { createdById: userId },
        include: { days: { include: { performers: { select: { performerId: true } } } } },
      },
      todos: { where: { createdById: userId } },
      bookings: { where: { createdById: userId } },
      places: { select: { locationId: true, note: true } },
      placeLists: { select: { listId: true } },
    },
  });
  const stay = source.stays[0];

  const copy = await prisma.trip.create({
    data: {
      userId,
      title: source.title,
      startDate: stay?.startDate ?? source.startDate,
      endDate: stay?.endDate ?? source.endDate,
      // Копия — личная: делиться ею человек решит сам.
      visibility: "PRIVATE",
      personalEvents: {
        create: source.personalEvents.map((e) => ({
          title: e.title,
          note: e.note,
          startsAt: e.startsAt,
          locationId: e.locationId,
          createdById: userId,
          visibility: e.visibility,
          days: {
            create: e.days.map((d) => ({
              startsAt: d.startsAt,
              performers: { create: d.performers.map((p) => ({ performerId: p.performerId })) },
            })),
          },
        })),
      },
      todos: {
        create: source.todos.map((todo) => ({
          text: todo.text,
          kind: todo.kind,
          // Галочки переносим: заново отмечать собранный чемодан обидно.
          done: todo.done,
          date: todo.date,
          hasTime: todo.hasTime,
          createdById: userId,
          visibility: todo.visibility,
        })),
      },
      bookings: {
        create: source.bookings.map((b) => ({
          kind: b.kind,
          name: b.name,
          address: b.address,
          fromPlace: b.fromPlace,
          toPlace: b.toPlace,
          url: b.url,
          fileUrl: b.fileUrl,
          note: b.note,
          startAt: b.startAt,
          endAt: b.endAt,
          createdById: userId,
          visibility: b.visibility,
        })),
      },
      places: { create: source.places.map((p) => ({ locationId: p.locationId, note: p.note })) },
      placeLists: { create: source.placeLists.map((l) => ({ listId: l.listId })) },
    },
    select: { id: true },
  });

  // Слаг копии не заводим: createTrip его тоже не ставит, ссылки
  // спокойно откатываются на id (tripHref).

  return copy.id;
}

export async function leaveTrip(tripId: string): Promise<void> {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  await prisma.tripMember.deleteMany({ where: { tripId, userId: user.id } });
  await cleanupAfterLeaving(tripId, user.id);
  revalidatePath("/trips");
  redirect(localeHref("/trips", locale));
}

/** null — не заполнены обязательные поля (название/дата); вызывающий
 *  экшен возвращает клиенту `{ ok: false, error: "Заполните…" }`. */
function parsePersonalEventForm(
  formData: FormData,
  tripVisibility: TripVisibility,
  currentVisibility?: TripItemVisibility,
): {
  title: string;
  note: string | null;
  /** Первый день — для сортировки, главной и расходов. */
  startsAt: Date;
  /** Дни события: дата, время и СВОЙ состав у каждого (правка владельца
   *  2026-09-18). Поля формы индексные: day-0-date, day-0-time,
   *  day-0-performerIds (много), day-0-id — id существующего дня при
   *  правке, чтобы день правился, а не заводился заново. */
  days: { id: string | null; startsAt: Date; performerIds: string[] }[];
  locationId: string | null;
  editableByOthers: boolean;
  visibility: TripItemVisibility;
  isPrivate: boolean;
  showOnHome: boolean;
  imageUrl: string | null;
  url: string | null;
  attending: boolean;
  priceMinor: number | null;
  priceCurrency: "THB" | "RUB" | "BYN" | "USD" | null;
} | null {
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  // Дни — индексные поля day-N-*; читаем подряд, пока есть дата.
  // Строка без даты пропускается (пустой добавленный ряд), дубли дат
  // схлопываются: два одинаковых дня — это один день.
  const days: { id: string | null; startsAt: Date; performerIds: string[] }[] = [];
  for (let i = 0; i < 31; i++) {
    const date = String(formData.get(`day-${i}-date`) ?? "").trim();
    if (!date) continue;
    const time = String(formData.get(`day-${i}-time`) ?? "").trim();
    const performerIds = formData
      .getAll(`day-${i}-performerIds`)
      .map((v) => String(v).trim())
      .filter(Boolean);
    const startsAt = combineDateTime(date, time || "00:00");
    if (days.some((d) => +d.startsAt === +startsAt)) continue;
    days.push({ id: String(formData.get(`day-${i}-id`) ?? "").trim() || null, startsAt, performerIds });
  }
  days.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  // Ссылка «куда посмотреть» (просьба владельца 2026-09-10): бронь на
  // сайте площадки, страница мероприятия, точка на карте. Только
  // http(s) — `javascript:` и `data:` в ссылке, которую откроет другой
  // участник поездки, это уже атака на него (то же правило, что у
  // ссылок сообщества). Мусор молча отбрасываем: запись из-за него
  // сохраняться не перестаёт.
  const rawUrl = String(formData.get("url") ?? "").trim();
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
  if (!title || days.length === 0) return null;
  // Без времени событие встаёт на начало дня — в списке поездки такие
  // сортируются раньше всех событий этого дня.
  return {
    title,
    note: note || null,
    startsAt: days[0].startsAt,
    days,
    locationId: locationId || null,
    editableByOthers: formData.get("editableByOthers") === "on",
    ...itemVisibilityData(
      parseItemVisibility(formData.get("visibility"), tripVisibility, currentVisibility),
    ),
    showOnHome: formData.get("showOnHome") === "on",
    imageUrl: String(formData.get("imageUrl") ?? "").trim() || null,
    url,
    // «Я там буду» — СВОЯ отметка редактирующего (в форме включена по
    // умолчанию): планов создают больше, чем посещают, и артисты
    // события идут в «видел(а) вживую» только отметившимся.
    attending: formData.get("attending") === "on",
    // Цена — она же строка в расходах поездки, если заполнена.
    ...priceFromForm(formData),
  };
}

export async function createTripPersonalEvent(
  tripId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const data = parsePersonalEventForm(formData, access.trip.visibility);
  if (!data) return { ok: false, error: (await getT()).t.trips.errors.fillTitleAndDate };
  // Путь картинки приходит из формы строкой: принимаем только формат
  // /api/upload-personal и файл, не занятый чужой записью, — иначе
  // можно «усыновить» чужой приватный файл (см. lib/privateFiles.ts).
  if (data.imageUrl && !(await canAttachPrivateFile(data.imageUrl, "personal", access.user.id))) {
    return { ok: false, error: (await getT()).t.trips.errors.badFile };
  }
  // Локация — только каталожная или своя (id приходит с клиента).
  if (data.locationId && !(await canUseLocation(data.locationId, access.user.id))) {
    return { ok: false, error: (await getT()).t.lists.errors.placeNotFound };
  }
  const { days, attending, ...fields } = data;
  await prisma.tripPersonalEvent.create({
    data: {
      tripId: access.trip.id,
      createdById: access.user.id,
      ...fields,
      days: {
        create: days.map((d) => ({
          startsAt: d.startsAt,
          performers: { create: d.performerIds.map((performerId) => ({ performerId })) },
        })),
      },
      ...(attending ? { attendances: { create: { userId: access.user.id } } } : {}),
    },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function updateTripPersonalEvent(
  tripId: string,
  personalEventId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const { user, trip } = access;
  // where включает tripId — id чужого события с чужой поездкой не пройдёт.
  const item = await prisma.tripPersonalEvent.findFirst({
    where: { id: personalEventId, tripId: trip.id },
    include: { days: { select: { id: true } } },
  });
  if (!item || !canTouchItem(item, user.id, trip.userId)) {
    return { ok: false, error: (await getT()).t.trips.errors.cannotEditOthers };
  }
  const data = parsePersonalEventForm(formData, trip.visibility, item.visibility);
  if (!data) return { ok: false, error: (await getT()).t.trips.errors.fillTitleAndDate };
  // Новый путь картинки проверяем как при создании; прежнее значение
  // записи пропускаем как есть — оно уже проверено при сохранении.
  if (
    data.imageUrl &&
    data.imageUrl !== item.imageUrl &&
    !(await canAttachPrivateFile(data.imageUrl, "personal", user.id))
  ) {
    return { ok: false, error: (await getT()).t.trips.errors.badFile };
  }
  if (data.locationId && data.locationId !== item.locationId && !(await canUseLocation(data.locationId, user.id))) {
    return { ok: false, error: (await getT()).t.lists.errors.placeNotFound };
  }
  const { days, attending, ...fields } = data;
  // Дни синхронизируем по id, как даты встречи сообщества: известный
  // день правится на месте, новый заводится, пропавший удаляется.
  // Состав дня приходит целиком — старые связи заменяются новыми.
  const known = new Set(item.days.map((d) => d.id));
  const kept = new Set<string>();
  for (const day of days) {
    if (day.id && known.has(day.id)) {
      kept.add(day.id);
      await prisma.tripPersonalEventDay.update({
        where: { id: day.id },
        data: {
          startsAt: day.startsAt,
          performers: {
            deleteMany: {},
            create: day.performerIds.map((performerId) => ({ performerId })),
          },
        },
      });
      continue;
    }
    const created = await prisma.tripPersonalEventDay.create({
      data: {
        personalEventId,
        startsAt: day.startsAt,
        performers: { create: day.performerIds.map((performerId) => ({ performerId })) },
      },
      select: { id: true },
    });
    kept.add(created.id);
  }
  const removed = [...known].filter((id) => !kept.has(id));
  if (removed.length > 0) {
    await prisma.tripPersonalEventDay.deleteMany({ where: { id: { in: removed } } });
  }
  await prisma.tripPersonalEvent.update({
    where: { id: personalEventId },
    data: {
      ...fields,
      // Правится только СВОЯ отметка: галочка в форме — про редактора,
      // отметки других участников не трогаем.
      attendances: attending
        ? {
            connectOrCreate: {
              where: { userId_personalEventId: { userId: user.id, personalEventId } },
              create: { userId: user.id },
            },
          }
        : { deleteMany: { userId: user.id } },
    },
  });
  // Картинку заменили или убрали — старый файл больше никому не нужен,
  // без unlink он оставался бы в private-uploads/ навсегда.
  if (item.imageUrl && item.imageUrl !== data.imageUrl) await unlinkPrivateFile(item.imageUrl);
  revalidatePath(`/trips/${trip.id}`);
  return { ok: true };
}

/** «Я там буду» на чужом (или своём) личном событии — с карточки, без
 *  открытия формы. Доступно любому участнику поездки: отметка своя, к
 *  правам на правку самой записи отношения не имеет. */
export async function togglePersonalEventAttendance(
  tripId: string,
  personalEventId: string,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const { user, trip } = access;
  const item = await prisma.tripPersonalEvent.findFirst({
    where: { id: personalEventId, tripId: trip.id },
    select: { id: true },
  });
  if (!item) return { ok: false, error: (await getT()).t.trips.errors.cannotEditOthers };
  const mine = await prisma.tripPersonalEventAttendance.findUnique({
    where: { userId_personalEventId: { userId: user.id, personalEventId } },
  });
  if (mine) {
    await prisma.tripPersonalEventAttendance.delete({
      where: { userId_personalEventId: { userId: user.id, personalEventId } },
    });
  } else {
    await prisma.tripPersonalEventAttendance.create({
      data: { userId: user.id, personalEventId },
    });
  }
  revalidatePath(`/trips/${trip.id}`);
  return { ok: true };
}

export async function deleteTripPersonalEvent(
  tripId: string,
  personalEventId: string,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const { user, trip } = access;
  const item = await prisma.tripPersonalEvent.findFirst({
    where: { id: personalEventId, tripId: trip.id },
  });
  if (!item || !canTouchItem(item, user.id, trip.userId)) {
    return { ok: false, error: (await getT()).t.trips.errors.cannotDeleteOthers };
  }
  await prisma.tripPersonalEvent.delete({ where: { id: personalEventId } });
  // Картинка события живёт в private-uploads/ — вместе с записью
  // удаляем и её, иначе файл оставался бы бесхозным.
  await unlinkPrivateFile(item.imageUrl);
  revalidatePath(`/trips/${trip.id}`);
  return { ok: true };
}

// ---------- «Что посетить»: списки и отдельные места (Г4+) ----------

export async function attachListToTrip(tripId: string, listId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  // Прикрепить можно только свой ЛИЧНЫЙ список: список сообщества
  // принадлежит сообществу, и через поездку он утёк бы тем, кого в
  // сообщество не звали (АА25).
  const list = await prisma.placeList.findUnique({ where: { id: listId } });
  if (!list || list.communityId !== null || list.userId !== access.user.id) {
    return { ok: false, error: (await getT()).t.trips.errors.listNotFound };
  }
  await prisma.tripPlaceList.upsert({
    where: { tripId_listId: { tripId: access.trip.id, listId } },
    update: {},
    create: { tripId: access.trip.id, listId },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function detachListFromTrip(tripId: string, listId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  await prisma.tripPlaceList.deleteMany({ where: { tripId: access.trip.id, listId } });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function addPlaceToTrip(tripId: string, locationId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  // Только каталожные и свои места: id приходит с клиента, и без
  // проверки в поездку подтягивалось чужое приватное место.
  if (!(await canUseLocation(locationId, access.user.id))) {
    return { ok: false, error: (await getT()).t.lists.errors.placeNotFound };
  }
  await prisma.tripPlace.upsert({
    where: { tripId_locationId: { tripId: access.trip.id, locationId } },
    update: {},
    create: { tripId: access.trip.id, locationId },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

/** Своё место прямо в поездку — без обязательного списка (просьба
 *  владельца: раньше, чтобы добавить одно место, приходилось сперва
 *  завести список, добавить место туда и потом прикрепить список к
 *  поездке). Локацию создаёт общий createOwnLocation, здесь — только
 *  привязка к поездке. */
export async function createTripOwnPlace(
  tripId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };

  const created = await createOwnLocation(formData, access.user.id);
  if (!created.ok) return { ok: false, error: created.error };

  await prisma.tripPlace.create({
    data: { tripId: access.trip.id, locationId: created.locationId },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function removePlaceFromTrip(
  tripId: string,
  locationId: string,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  await prisma.tripPlace.deleteMany({ where: { tripId: access.trip.id, locationId } });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

// ---------- Туду-лист поездки ----------

function parseTodoDate(formData: FormData): { date: Date | null; hasTime: boolean } {
  const dateRaw = String(formData.get("date") ?? "").trim();
  if (!dateRaw) return { date: null, hasTime: false };
  const timeRaw = String(formData.get("time") ?? "").trim();
  // Через normalizeTimeValue и combineDateTime: строка `${date}T${time}`
  // ломалась о «12.30» (браузер рисует поле по настройкам системы), и
  // дело кончалось Invalid Date — а тут это значило «дела без даты
  // вовсе», то есть введённая дата молча пропадала.
  const time = normalizeTimeValue(timeRaw);
  const date = combineDateTime(dateRaw, time ?? "00:00");
  if (Number.isNaN(date.getTime())) return { date: null, hasTime: false };
  return { date, hasTime: Boolean(time) };
}

/** Какой это список: дела, чемодан или покупки (АА10/АА11). Мусор в
 *  поле — обычное дело: список выбирается сегментом на вкладке, и чужой
 *  запрос не должен создавать записи «в никуда». */
function parseTodoKind(value: FormDataEntryValue | null): TripTodoKind {
  const raw = String(value ?? "");
  return raw === "PACKING" || raw === "SHOPPING" ? raw : "TODO";
}

export async function createTripTodo(tripId: string, formData: FormData): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: (await getT()).t.trips.errors.todoTextRequired };
  const { date, hasTime } = parseTodoDate(formData);
  await prisma.tripTodo.create({
    data: {
      tripId,
      text,
      kind: parseTodoKind(formData.get("kind")),
      date,
      hasTime,
      // Цена есть только у покупок, описание и ссылка — только у дел
      // (см. модель TripTodo). Поля нет в форме — приходит null.
      ...priceFromForm(formData),
      ...noteAndUrlFromForm(formData),
      createdById: access.user.id,
      editableByOthers: formData.get("editableByOthers") === "on",
      ...itemVisibilityData(
        parseItemVisibility(formData.get("visibility"), access.trip.visibility),
      ),
    },
  });
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

/** Дело из доступной поездки, которое текущий юзер вправе менять
 *  (автор / владелец поездки / участник при editableByOthers). Отказ —
 *  значением `{ ok: false, error }`, как у requireOwnTrip. */
async function requireOwnTodo(todoId: string) {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: t.trips.errors.signInRequired };
  const todo = await prisma.tripTodo.findFirst({
    where: {
      id: todoId,
      trip: {
        OR: [
          { userId: user.id },
          { members: { some: { userId: user.id, status: "ACCEPTED" } } },
        ],
      },
    },
    // visibility поездки нужна, чтобы зажать видимость дела при сохранении.
    include: { trip: { select: { userId: true, visibility: true } } },
  });
  if (!todo || !canTouchItem(todo, user.id, todo.trip.userId)) {
    return { ok: false as const, error: t.trips.errors.cannotEditOthersTodo };
  }
  return { ok: true as const, todo };
}

export async function toggleTripTodo(todoId: string): Promise<ActionResult> {
  const own = await requireOwnTodo(todoId);
  if (!own.ok) return { ok: false, error: own.error };
  await prisma.tripTodo.update({ where: { id: todoId }, data: { done: !own.todo.done } });
  revalidatePath(`/trips/${own.todo.tripId}`);
  return { ok: true };
}

export async function updateTripTodo(todoId: string, formData: FormData): Promise<ActionResult> {
  const own = await requireOwnTodo(todoId);
  if (!own.ok) return { ok: false, error: own.error };
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: (await getT()).t.trips.errors.todoTextRequired };
  const { date, hasTime } = parseTodoDate(formData);
  await prisma.tripTodo.update({
    where: { id: todoId },
    data: {
      text,
      date,
      hasTime,
      ...priceFromForm(formData),
      ...noteAndUrlFromForm(formData),
      editableByOthers: formData.get("editableByOthers") === "on",
      ...itemVisibilityData(
        parseItemVisibility(
          formData.get("visibility"),
          own.todo.trip.visibility,
          own.todo.visibility,
        ),
      ),
    },
  });
  revalidatePath(`/trips/${own.todo.tripId}`);
  return { ok: true };
}

export async function deleteTripTodo(todoId: string): Promise<ActionResult> {
  const own = await requireOwnTodo(todoId);
  if (!own.ok) return { ok: false, error: own.error };
  await prisma.tripTodo.delete({ where: { id: todoId } });
  revalidatePath(`/trips/${own.todo.tripId}`);
  return { ok: true };
}

/** Право менять/удалять КОНКРЕТНУЮ бронь — то, чего у броней долго не
 *  было (аудит 2026-09: участник мог переписать и удалить чужую
 *  приватную бронь). Правило — как `canTouchItem` у дел и личных
 *  событий, но галочки editableByOthers у брони нет, так что трогают
 *  её только автор и владелец поездки. Чужая ПРИВАТНАЯ бронь закрыта
 *  даже от владельца — `canSeeItem` на странице её ему не показывает,
 *  и сервер отвечает «не найдена», а не «нельзя»: другой ответ через
 *  правку подтверждал бы само её существование. null — можно. */
async function guardBookingTouch(
  booking: { createdById: string | null; visibility: TripItemVisibility },
  userId: string,
  trip: { userId: string; visibility: TripVisibility },
  intent: "edit" | "delete",
): Promise<ActionError | null> {
  const authorId = booking.createdById ?? trip.userId;
  if (authorId === userId) return null;
  // Видимость — зажатая видимостью поездки, как при чтении на странице.
  if (clampItemVisibility(booking.visibility, trip.visibility) === "PRIVATE") {
    return { ok: false, error: (await getT()).t.trips.errors.bookingNotFound };
  }
  if (!canTouchItem({ createdById: booking.createdById, editableByOthers: false }, userId, trip.userId)) {
    const { t } = await getT();
    return {
      ok: false,
      error: intent === "edit" ? t.trips.errors.cannotEditOthers : t.trips.errors.cannotDeleteOthers,
    };
  }
  return null;
}

/** Бронь в поездке — отель или перелёт. Доступ как у дел и событий:
 *  владелец и принятые участники — они едут вместе, и бронь нужна
 *  всем. Тип решает, какие поля осмысленны: у отеля адрес и заезд/
 *  выезд, у перелёта маршрут и время вылета/прилёта. */
export async function saveTripBooking(tripId: string, formData: FormData): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const id = String(formData.get("bookingId") ?? "").trim();
  const kind = formData.get("kind") === "FLIGHT" ? "FLIGHT" : "HOTEL";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getT();
    return {
      ok: false,
      error:
        kind === "FLIGHT"
          ? t.trips.errors.flightNameRequired
          : t.trips.errors.hotelNameRequired,
    };
  }

  const isFlight = kind === "FLIGHT";
  // Кто летит / живёт: галочки формы, зажатые списком участников
  // поездки (владелец + принятые). Пусто — сам автор: бронь без единого
  // человека бессмысленна.
  const tripPeople = await tripParticipantIds(access.trip.id, access.trip.userId);
  const checked = formData
    .getAll("participants")
    .map((v) => String(v))
    .filter((uid) => tripPeople.has(uid));
  const participantIds = checked.length > 0 ? [...new Set(checked)] : [access.user.id];
  const data = {
    kind: kind as "HOTEL" | "FLIGHT",
    name,
    address: isFlight ? null : String(formData.get("address") ?? "").trim() || null,
    fromPlace: isFlight ? String(formData.get("fromPlace") ?? "").trim() || null : null,
    toPlace: isFlight ? String(formData.get("toPlace") ?? "").trim() || null : null,
    url: String(formData.get("url") ?? "").trim() || null,
    fileUrl: String(formData.get("fileUrl") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    // Время нужно обоим видам: в ленте плана заселение и выселение
    // встают среди событий дня по часам, как вылет и прилёт. Время
    // необязательное — без него остаётся чистая дата (00:00).
    startAt: parseTripDateTime(formData.get("startAt"), formData.get("startTime")),
    endAt: parseTripDateTime(formData.get("endAt"), formData.get("endTime")),
    // Цена — она же строка в расходах поездки, если заполнена.
    ...priceFromForm(formData),
  };

  if (id) {
    // Проверяем принадлежность: id приходит из формы, и без этого можно
    // было бы отредактировать бронь чужой поездки.
    const existing = await prisma.tripBooking.findFirst({ where: { id, tripId } });
    if (!existing) return { ok: false, error: (await getT()).t.trips.errors.bookingNotFound };
    const guard = await guardBookingTouch(existing, access.user.id, access.trip, "edit");
    if (guard) return guard;
    // Путь файла приходит из формы строкой: новый — только формат
    // /api/upload-hotel и файл, не занятый чужой записью; прежнее
    // значение записи пропускаем как есть (в т.ч. легаси-пути) — оно
    // уже было проверено. Иначе можно «усыновить» чужой приватный файл
    // (см. lib/privateFiles.ts).
    if (
      data.fileUrl &&
      data.fileUrl !== existing.fileUrl &&
      !(await canAttachPrivateFile(data.fileUrl, "hotels", access.user.id))
    ) {
      return { ok: false, error: (await getT()).t.trips.errors.badFile };
    }
    await prisma.tripBooking.update({
      where: { id },
      data: {
        ...data,
        // У брони исторического isPrivate нет — только visibility.
        visibility: parseItemVisibility(
          formData.get("visibility"),
          access.trip.visibility,
          existing.visibility,
        ),
      },
    });
    // Файл заменили или убрали — старый чистим с диска.
    if (existing.fileUrl && existing.fileUrl !== data.fileUrl) {
      await unlinkPrivateFile(existing.fileUrl);
    }
    await syncBookingParticipants(id, participantIds);
  } else {
    if (data.fileUrl && !(await canAttachPrivateFile(data.fileUrl, "hotels", access.user.id))) {
      return { ok: false, error: (await getT()).t.trips.errors.badFile };
    }
    // Тот же рейс уже есть в поездке (номер + день вылета, см.
    // sameFlightKey) — не вторая бронь, а присоединение к первой:
    // отмеченные люди становятся её участниками, а файл из формы —
    // СВОИМ билетом того, кто заводил (правка владельца 2026-09-19:
    // «подружка добавила свой самолёт, а если я свой добавлю — каша,
    // хотя рейс один»).
    const key = sameFlightKey(data.kind, name, data.startAt);
    if (key) {
      const candidates = await prisma.tripBooking.findMany({
        where: { tripId, kind: "FLIGHT", startAt: { not: null } },
        select: { id: true, name: true, startAt: true, createdById: true, visibility: true },
      });
      const same = candidates.find((c) => sameFlightKey("FLIGHT", c.name, c.startAt) === key);
      if (same && canSeeItemServer(same, access.user.id, access.trip)) {
        for (const uid of participantIds) {
          await prisma.tripBookingParticipant.upsert({
            where: { bookingId_userId: { bookingId: same.id, userId: uid } },
            create: { bookingId: same.id, userId: uid, fileUrl: uid === access.user.id ? data.fileUrl : null },
            update: uid === access.user.id && data.fileUrl ? { fileUrl: data.fileUrl } : {},
          });
        }
        revalidatePath(`/trips/${tripId}`);
        return { ok: true };
      }
    }
  }
  if (!id) {
    await prisma.tripBooking.create({
      data: {
        tripId,
        ...data,
        // Автор — тот, кто завёл: без него приватная бронь участницы
        // считалась приватной бронью ВЛАДЕЛЬЦА и пропадала у автора.
        createdById: access.user.id,
        // По умолчанию бронь видят участники: адрес проживания и номер
        // брони — не то, что показывают всем подряд.
        visibility: parseItemVisibility(formData.get("visibility"), access.trip.visibility),
        participants: { create: participantIds.map((userId) => ({ userId })) },
      },
    });
  }
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

/** Участники поездки, которых можно отметить в брони: владелец и
 *  принятые. Приглашённый, но не принявший, ещё не едет. */
async function tripParticipantIds(tripId: string, ownerId: string): Promise<Set<string>> {
  const members = await prisma.tripMember.findMany({
    where: { tripId, status: "ACCEPTED" },
    select: { userId: true },
  });
  return new Set([ownerId, ...members.map((m) => m.userId)]);
}

/** Видна ли бронь этому участнику — та же логика, что `canSeeItem` на
 *  странице, но на сервере: присоединяться к чужой ПРИВАТНОЙ брони
 *  нельзя, её как бы нет. */
function canSeeItemServer(
  item: { createdById: string | null; visibility: TripItemVisibility },
  userId: string,
  trip: { userId: string; visibility: TripVisibility },
): boolean {
  const authorId = item.createdById ?? trip.userId;
  if (authorId === userId) return true;
  return clampItemVisibility(item.visibility, trip.visibility) !== "PRIVATE";
}

/** Состав участников брони — по галочкам формы. Убранный участник
 *  теряет и свой билет (файл чистится с диска): форму правит автор или
 *  владелец, и вычёркивают человека сознательно. */
async function syncBookingParticipants(bookingId: string, participantIds: string[]): Promise<void> {
  const current = await prisma.tripBookingParticipant.findMany({
    where: { bookingId },
    select: { userId: true, fileUrl: true },
  });
  const keep = new Set(participantIds);
  const gone = current.filter((c) => !keep.has(c.userId));
  if (gone.length > 0) {
    await prisma.tripBookingParticipant.deleteMany({
      where: { bookingId, userId: { in: gone.map((g) => g.userId) } },
    });
    for (const g of gone) await unlinkPrivateFile(g.fileUrl);
  }
  const have = new Set(current.map((c) => c.userId));
  const add = participantIds.filter((uid) => !have.has(uid));
  if (add.length > 0) {
    await prisma.tripBookingParticipant.createMany({
      data: add.map((userId) => ({ bookingId, userId })),
      skipDuplicates: true,
    });
  }
}

/** «Я тоже лечу» / «Я не лечу» — со строки в плане, без формы. Любому
 *  участнику поездки, которому бронь видна; своя отметка — как «я там
 *  буду» на личном событии. Уходя, человек забирает и свой билет. */
export async function toggleBookingParticipation(tripId: string, bookingId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const booking = await prisma.tripBooking.findFirst({
    where: { id: bookingId, tripId },
    select: { id: true, createdById: true, visibility: true },
  });
  if (!booking || !canSeeItemServer(booking, access.user.id, access.trip)) {
    return { ok: false, error: (await getT()).t.trips.errors.bookingNotFound };
  }
  const mine = await prisma.tripBookingParticipant.findUnique({
    where: { bookingId_userId: { bookingId, userId: access.user.id } },
  });
  if (mine) {
    await prisma.tripBookingParticipant.delete({
      where: { bookingId_userId: { bookingId, userId: access.user.id } },
    });
    await unlinkPrivateFile(mine.fileUrl);
  } else {
    await prisma.tripBookingParticipant.create({ data: { bookingId, userId: access.user.id } });
  }
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

/** Свой билет (подтверждение) к общей брони — файл участника, а не
 *  брони. Прикладывать может только тот, кто в этой брони летит/живёт;
 *  пустой файл — убрать свой. */
export async function setBookingParticipantFile(
  tripId: string,
  bookingId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const mine = await prisma.tripBookingParticipant.findFirst({
    where: { bookingId, userId: access.user.id, booking: { tripId } },
  });
  if (!mine) return { ok: false, error: (await getT()).t.trips.errors.bookingNotFound };
  const fileUrl = String(formData.get("fileUrl") ?? "").trim() || null;
  if (fileUrl && fileUrl !== mine.fileUrl && !(await canAttachPrivateFile(fileUrl, "hotels", access.user.id))) {
    return { ok: false, error: (await getT()).t.trips.errors.badFile };
  }
  await prisma.tripBookingParticipant.update({
    where: { bookingId_userId: { bookingId, userId: access.user.id } },
    data: { fileUrl },
  });
  if (mine.fileUrl && mine.fileUrl !== fileUrl) await unlinkPrivateFile(mine.fileUrl);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

export async function deleteTripBooking(tripId: string, bookingId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  // Файл брони — в private-uploads/, БД его не каскадит: путь берём до
  // удаления записи и чистим диск следом (по образцу ticketActions).
  const booking = await prisma.tripBooking.findFirst({
    where: { id: bookingId, tripId },
    select: {
      fileUrl: true,
      createdById: true,
      visibility: true,
      participants: { select: { fileUrl: true } },
    },
  });
  if (!booking) return { ok: false, error: (await getT()).t.trips.errors.bookingNotFound };
  // Те же права, что на правку: id приходит с клиента, и без проверки
  // участник удалял чужую бронь (аудит 2026-09, п.1.1).
  const guard = await guardBookingTouch(booking, access.user.id, access.trip, "delete");
  if (guard) return guard;
  await prisma.tripBooking.deleteMany({ where: { id: bookingId, tripId } });
  await unlinkPrivateFile(booking.fileUrl);
  // Билеты участников каскадом из базы уходят, а с диска — нет.
  for (const p of booking.participants) await unlinkPrivateFile(p.fileUrl);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

/** «YYYY-MM-DD» + «HH:mm» → дата со временем (вылет/прилёт). Без
 *  времени ведёт себя как parseTripDate. */
function parseTripDateTime(
  dateValue: FormDataEntryValue | null,
  timeValue: FormDataEntryValue | null,
): Date | null {
  const date = parseTripDate(dateValue);
  if (!date) return null;
  // Через общий разбор: половина введённого («12» без минут) — тоже
  // время, а «00:00» — это умолчание поля, то есть «время не назначено»
  // (см. normalizeTimeValue). Раньше сырой split(":") давал NaN и время
  // молча пропадало.
  const time = normalizeTimeValue(String(timeValue ?? ""));
  if (!time) return date;
  const [h, min] = time.split(":").map(Number);
  return new Date(date.getTime() + h * 3600_000 + min * 60_000);
}

/** «YYYY-MM-DD» из формы → дата в UTC-слоте, как остальные даты
 *  проекта (см. lib/dates.ts). */
function parseTripDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

// ---------- Деньги поездки (решение владельца 2026-09-16) ----------
//
// Траты ЛИЧНЫЕ: «персонально у каждого свои траты». Поэтому у них нет
// ни поля видимости, ни права правки другими участниками — обе эти
// механики у прочих записей поездки есть, а здесь были бы враньём.
// Каждый запрос ниже фильтрует по паре (поездка, я), и чужую трату не
// достать даже по прямому id.
//
// Делёжки «кто кому должен» нет тоже: владелец отменила её отдельно.

/**
 * Описание и ссылка у дела (правка владельца 2026-09-16). Общий разбор
 * на создание и правку: «записаться в визовый центр» без адреса и
 * ссылки на запись — половина дела.
 *
 * Ссылка сохраняется только http(s): чужая схема вроде `javascript:`
 * на странице, которую открывает участник поездки, — это уже атака на
 * него (то же правило, что у личных событий и ссылок сообщества).
 * Мусор молча отбрасываем: запись из-за него сохраняться не перестаёт.
 */
function noteAndUrlFromForm(formData: FormData): { note: string | null; url: string | null } {
  const rawUrl = String(formData.get("url") ?? "").trim();
  return {
    note: String(formData.get("note") ?? "").trim() || null,
    url: /^https?:\/\//i.test(rawUrl) ? rawUrl : null,
  };
}

/**
 * Цена прямо в записи (бронь, личное событие) — правка владельца
 * 2026-09-16. Пусто — цены нет: ноль значил бы «стоило ноль», а у
 * половины броней сумму просто не помнят, и врать в итогах нельзя.
 *
 * Непонятный ввод тоже снимает цену, а не роняет сохранение всей
 * записи: человек заполнял бронь, а не бухгалтерию, и терять из-за
 * опечатки в необязательном поле номер рейса было бы обидно.
 */
function priceFromForm(formData: FormData): {
  priceMinor: number | null;
  priceCurrency: "THB" | "RUB" | "BYN" | "USD" | null;
} {
  const raw = String(formData.get("priceAmount") ?? "").trim();
  if (!raw) return { priceMinor: null, priceCurrency: null };
  const priceMinor = parseAmount(raw);
  if (priceMinor === null) return { priceMinor: null, priceCurrency: null };
  return { priceMinor, priceCurrency: parseCurrency(String(formData.get("priceCurrency") ?? "")) };
}

/** Разбор полей формы траты. Общий для создания и правки — иначе
 *  правила «что считать суммой» разъехались бы между ними. */
async function parseExpenseForm(formData: FormData) {
  const { t } = await getT();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false as const, error: t.trips.errors.expenseTitle };
  const amountMinor = parseAmount(String(formData.get("amount") ?? ""));
  if (amountMinor === null) return { ok: false as const, error: t.trips.errors.expenseAmount };
  const spentRaw = String(formData.get("spentOn") ?? "").trim();
  // Один селект «к чему относится» на два вида источника: значение
  // приходит с префиксом, потому что id брони и id даты события живут в
  // разных таблицах и перепутать их нельзя.
  const linkRaw = String(formData.get("link") ?? "").trim();
  const bookingId = linkRaw.startsWith("booking:") ? linkRaw.slice(8) : "";
  const occurrenceId = linkRaw.startsWith("occurrence:") ? linkRaw.slice(11) : "";
  return {
    ok: true as const,
    data: {
      title,
      amountMinor,
      currency: parseCurrency(String(formData.get("currency") ?? "")),
      category: parseCategory(String(formData.get("category") ?? "")),
      spentOn: /^\d{4}-\d{2}-\d{2}$/.test(spentRaw) ? parseDateKey(spentRaw) : null,
      note: String(formData.get("note") ?? "").trim() || null,
      bookingId: bookingId || null,
      occurrenceId: occurrenceId || null,
    },
  };
}

/** Привязка к брони — только к брони ЭТОЙ поездки. Без проверки можно
 *  было бы прицепить трату к чужой брони по подсмотренному id. */
async function validBookingId(tripId: string, bookingId: string | null): Promise<string | null> {
  if (!bookingId) return null;
  const booking = await prisma.tripBooking.findFirst({
    where: { id: bookingId, tripId },
    select: { id: true },
  });
  return booking?.id ?? null;
}

/** Привязка к дате события афиши — только к той, что попадает в даты
 *  поездки. Иначе по подсмотренному id трату можно было бы прицепить к
 *  чему угодно из каталога, и в расходах появилось бы событие, к
 *  поездке отношения не имеющее. */
async function validOccurrenceId(
  trip: { id: string; startDate: Date; endDate: Date },
  occurrenceId: string | null,
): Promise<string | null> {
  if (!occurrenceId) return null;
  const row = await prisma.eventOccurrence.findFirst({
    where: {
      id: occurrenceId,
      startsAt: { gte: startOfDay(trip.startDate), lte: endOfDay(trip.endDate) },
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function addTripExpense(tripId: string, formData: FormData): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const parsed = await parseExpenseForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  await prisma.tripExpense.create({
    data: {
      ...parsed.data,
      bookingId: await validBookingId(access.trip.id, parsed.data.bookingId),
      occurrenceId: await validOccurrenceId(access.trip, parsed.data.occurrenceId),
      tripId: access.trip.id,
      userId: access.user.id,
    },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function updateTripExpense(
  tripId: string,
  expenseId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const parsed = await parseExpenseForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  // userId в условии — не для красоты: это единственное, что не даёт
  // править чужую трату по её id.
  const mine = await prisma.tripExpense.findFirst({
    where: { id: expenseId, tripId: access.trip.id, userId: access.user.id },
    select: { id: true },
  });
  if (!mine) return { ok: false, error: (await getT()).t.trips.errors.cannotEditOthers };
  await prisma.tripExpense.update({
    where: { id: expenseId },
    data: {
      ...parsed.data,
      bookingId: await validBookingId(access.trip.id, parsed.data.bookingId),
      occurrenceId: await validOccurrenceId(access.trip, parsed.data.occurrenceId),
    },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function deleteTripExpense(
  tripId: string,
  expenseId: string,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const { count } = await prisma.tripExpense.deleteMany({
    where: { id: expenseId, tripId: access.trip.id, userId: access.user.id },
  });
  if (count === 0) return { ok: false, error: (await getT()).t.trips.errors.cannotDeleteOthers };
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

