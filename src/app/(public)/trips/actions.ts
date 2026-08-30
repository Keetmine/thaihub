"use server";

import { redirect } from "next/navigation";
import { canUseLocation, createOwnLocation } from "@/lib/ownLocation";
import { canAttachPrivateFile, unlinkPrivateFile } from "@/lib/privateFiles";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import { formatShortDate } from "@/lib/dates";
import { combineDateTime } from "@/lib/dates";
import type { TripItemVisibility, TripVisibility } from "@/generated/prisma/client";
import { clampItemVisibility, isItemVisibility } from "./itemVisibility";
import { isPremiumActive } from "@/lib/premium";
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

export async function createTrip(formData: FormData): Promise<ActionError | void> {
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
  revalidatePath("/trips");
}

export async function removeTripMember(tripId: string, userId: string): Promise<ActionResult> {
  const own = await requireOwnTrip(tripId);
  if (!own.ok) return { ok: false, error: own.error };
  await prisma.tripMember.deleteMany({ where: { tripId, userId } });
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

export async function leaveTrip(tripId: string): Promise<void> {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  await prisma.tripMember.deleteMany({ where: { tripId, userId: user.id } });
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
  startsAt: Date;
  locationId: string | null;
  editableByOthers: boolean;
  visibility: TripItemVisibility;
  isPrivate: boolean;
  showOnHome: boolean;
  imageUrl: string | null;
  performerIds: string[];
  attending: boolean;
} | null {
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  if (!title || !date) return null;
  const performerIds = formData
    .getAll("performerIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
  // Без времени событие встаёт на начало дня — в списке поездки такие
  // сортируются раньше всех событий этого дня.
  return {
    title,
    note: note || null,
    startsAt: combineDateTime(date, time || "00:00"),
    locationId: locationId || null,
    editableByOthers: formData.get("editableByOthers") === "on",
    ...itemVisibilityData(
      parseItemVisibility(formData.get("visibility"), tripVisibility, currentVisibility),
    ),
    showOnHome: formData.get("showOnHome") === "on",
    imageUrl: String(formData.get("imageUrl") ?? "").trim() || null,
    performerIds,
    // «Я там буду» — СВОЯ отметка редактирующего (в форме включена по
    // умолчанию): планов создают больше, чем посещают, и артисты
    // события идут в «видел(а) вживую» только отметившимся.
    attending: formData.get("attending") === "on",
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
  const { performerIds, attending, ...fields } = data;
  await prisma.tripPersonalEvent.create({
    data: {
      tripId: access.trip.id,
      createdById: access.user.id,
      ...fields,
      performers: { create: performerIds.map((performerId) => ({ performerId })) },
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
  const { performerIds, attending, ...fields } = data;
  await prisma.tripPersonalEvent.update({
    where: { id: personalEventId },
    data: {
      ...fields,
      // Список артистов приходит целиком — старые связи заменяются
      // новыми, а не дополняются.
      performers: {
        deleteMany: {},
        create: performerIds.map((performerId) => ({ performerId })),
      },
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
  // Прикрепить можно только свой список.
  const list = await prisma.placeList.findUnique({ where: { id: listId } });
  if (!list || list.userId !== access.user.id) {
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
  const date = new Date(`${dateRaw}T${timeRaw || "00:00"}`);
  if (Number.isNaN(date.getTime())) return { date: null, hasTime: false };
  return { date, hasTime: Boolean(timeRaw) };
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
      date,
      hasTime,
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
  };

  if (id) {
    // Проверяем принадлежность: id приходит из формы, и без этого можно
    // было бы отредактировать бронь чужой поездки.
    const existing = await prisma.tripBooking.findFirst({ where: { id, tripId } });
    if (!existing) return { ok: false, error: (await getT()).t.trips.errors.bookingNotFound };
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
  } else {
    if (data.fileUrl && !(await canAttachPrivateFile(data.fileUrl, "hotels", access.user.id))) {
      return { ok: false, error: (await getT()).t.trips.errors.badFile };
    }
    await prisma.tripBooking.create({
      data: {
        tripId,
        ...data,
        // По умолчанию бронь видят участники: адрес проживания и номер
        // брони — не то, что показывают всем подряд.
        visibility: parseItemVisibility(formData.get("visibility"), access.trip.visibility),
      },
    });
  }
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
    select: { fileUrl: true },
  });
  await prisma.tripBooking.deleteMany({ where: { id: bookingId, tripId } });
  await unlinkPrivateFile(booking?.fileUrl);
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
  const raw = String(timeValue ?? "").trim();
  const [h, min] = raw.split(":").map(Number);
  if (!raw || Number.isNaN(h) || Number.isNaN(min)) return date;
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
