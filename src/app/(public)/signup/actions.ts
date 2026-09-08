"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createUserSession, hashPassword } from "@/lib/userAuth";
import { assertRateLimit } from "@/lib/rateLimit";
import { notifyAdminsAboutSignup } from "@/lib/adminNotify";
import { notifyUser } from "@/lib/notifications";
import { sanitizeNextPath } from "@/lib/loginNext";
import { getLocale, localeHref } from "@/lib/i18n";

/**
 * Кто стоит за реферальной ссылкой /signup?ref=<ник или id> (аудит
 * 2026-09 п.7). Битый, чужой или пустой ref НЕ ломает регистрацию —
 * человек уже заполнил форму, и терять его из-за опечатки в чужой
 * ссылке нельзя: просто регистрируем без реферера. Удалённые и
 * забаненные не подходят: дружба с таким аккаунтом мертворождённая.
 */
async function resolveReferrer(raw: FormDataEntryValue | null) {
  const ref = String(raw ?? "").trim().slice(0, 64);
  if (!ref) return null;
  return prisma.user.findFirst({
    where: {
      deletedAt: null,
      bannedAt: null,
      // Ник — без регистра (в ссылке его набирают руками), id — точный.
      OR: [{ username: { equals: ref, mode: "insensitive" } }, { id: ref }],
    },
    select: { id: true },
  });
}

export async function signup(formData: FormData) {
  await assertRateLimit("signup");
  // Язык страницы, с которой пришла форма: онбординг после регистрации
  // должен продолжиться на том же языке.
  const locale = await getLocale();
  // Возврат после регистрации (?next= со страницы входа): человек шёл
  // на конкретную страницу и упёрся в гейт — после signup возвращаем
  // туда, а онбординг пропускаем (возврат важнее: ник и профиль можно
  // заполнить позже в настройках). Валидация — sanitizeNextPath.
  const next = sanitizeNextPath(formData.get("next"));
  const nextQs = next ? `&next=${encodeURIComponent(next)}` : "";
  const successHref = localeHref(next ?? "/welcome/profile", locale);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  // Ханипот (см. signup/page.tsx): заполнен — значит бот. Отвечаем как
  // при успехе, чтобы не подсказывать, что регистрация не прошла.
  if (String(formData.get("website") ?? "").trim()) {
    redirect(successHref);
  }

  if (!email || password.length < 6) {
    redirect(localeHref(`/signup?error=1${nextQs}`, locale));
  }

  // Чекбокс согласия с условиями и политикой обязателен (браузер
  // проверяет required, здесь — на случай запроса мимо формы).
  if (formData.get("acceptTerms") !== "on") {
    redirect(localeHref(`/signup?error=1${nextQs}`, locale));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect(localeHref(`/signup?error=exists${nextQs}`, locale));
  }

  const referrer = await resolveReferrer(formData.get("ref"));

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      name: name || null,
      // Кто привёл. Сослаться на себя нельзя по построению: нового
      // аккаунта в момент разрешения ref ещё не существует, а guard
      // ниже страхует от совпадения id на всякий случай.
      referredById: referrer?.id ?? null,
    },
  });

  if (referrer && referrer.id !== user.id) {
    // Приглашённый и пригласивший — сразу друзья, без заявки: ссылкой
    // делятся лично, и «прими мою заявку» после этого — лишний шаг.
    // Строка ACCEPTED — ровно то, во что превращается принятая заявка
    // (см. friends/actions.ts): requester — та, кто позвала.
    await prisma.friendship
      .create({
        data: { requesterId: referrer.id, addresseeId: user.id, status: "ACCEPTED" },
      })
      .catch(console.error);
    // Пригласившей — строка в колокольчик. Вид FRIEND_ACCEPTED, а не
    // свой: NotificationKind — enum в БД, новый вид = миграция, а
    // «стал(а) вашим другом» по смыслу и есть принятая дружба.
    // await, как в friends/actions.ts: после redirect экшен обрывается,
    // и повисший промис уведомление бы потерял.
    await notifyUser({
      userId: referrer.id,
      actorId: user.id,
      kind: "FRIEND_ACCEPTED",
      actorName: user.name,
      href: "/friends",
    }).catch(console.error);
  }

  notifyAdminsAboutSignup(
    { id: user.id, name: user.name, email: user.email, telegramUsername: null },
    "email",
  );

  await createUserSession(user.id);
  redirect(successHref);
}
