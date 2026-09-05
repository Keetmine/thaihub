import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatHumanDate, formatTime } from "@/lib/dates";
import { eventHref } from "@/lib/eventSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import { isPremiumActive, type PremiumFields } from "@/lib/premium";
import { getFriendIds } from "@/lib/friends";
import { notifyUser } from "@/lib/notifications";

const LOOKAHEAD_HOURS = 24;

// Поля получателя для notifyUser (см. NotifyUserRecipient): массовые
// рассылки выбирают их одним findMany и передают готового юзера, чтобы
// notifyUser не перечитывал User на каждое уведомление (N+1).
const NOTIFY_RECIPIENT_SELECT = {
  locale: true,
  telegramId: true,
  tgNotifyInvites: true,
  tgNotifyFriends: true,
  tgNotifyReplies: true,
  tgNotifyEvents: true,
  tgNotifyBirthdays: true,
  tgNotifyEpisodes: true,
} as const;

/**
 * Шлёт телеграм-напоминания о датах событий, начинающихся в ближайшие
 * 24 часа, всем, кто отметил «я иду» или добавил событие в избранное и
 * привязал Telegram. Каждая пара (пользователь, дата события)
 * напоминается ровно один раз — дедуп через TelegramNotification.
 * Вызывается планировщиком из instrumentation.ts; безопасна к
 * параллельным/повторным запускам (upsert-семантика через create +
 * уникальный ключ).
 */
export async function sendUpcomingEventReminders(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

  // От получателя ниже нужны только id и telegramId — полные строки User
  // (все флаги, premium, даты) каждые полчаса тянуть незачем.
  const recipientSelect = { user: { select: { id: true, telegramId: true } } } as const;
  const occurrences = await prisma.eventOccurrence.findMany({
    where: { startsAt: { gt: now, lte: until } },
    include: {
      // «Иду» — по конкретной дате (attendances на occurrence);
      // избранное остаётся событийным.
      attendances: { select: recipientSelect },
      event: { include: { favoritedBy: { select: recipientSelect } } },
      telegramNotifications: { select: { userId: true } },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const occ of occurrences) {
    const alreadyNotified = new Set(occ.telegramNotifications.map((n) => n.userId));
    // «Иду» и избранное складываем в одну карту — человек может быть в
    // обоих списках, напоминание всё равно одно.
    const recipients = new Map<string, { id: string; telegramId: string | null }>();
    for (const a of occ.attendances) recipients.set(a.user.id, a.user);
    for (const f of occ.event.favoritedBy) {
      if (!recipients.has(f.user.id)) recipients.set(f.user.id, f.user);
    }

    for (const user of recipients.values()) {
      if (!user.telegramId || alreadyNotified.has(user.id)) continue;

      const when = `${formatHumanDate(occ.startsAt)}, ${formatTime(occ.startsAt)}`;
      const appUrl = process.env.APP_URL || "";
      const link = appUrl ? `\n${appUrl}${eventHref(occ.event)}` : "";
      const text =
        `🎤 <b>${escapeHtml(occ.event.title)}</b>\n` +
        `Уже скоро: ${when} (тайское время)\n` +
        `📍 ${escapeHtml(occ.event.venue)}${link}`;

      try {
        const delivered = await sendTelegramMessage(user.telegramId, text);
        // Записываем факт и при 403 (человек не нажал Start) — иначе
        // каждый прогон будет впустую дёргать API ради того же отказа.
        await prisma.telegramNotification.create({
          data: { userId: user.id, occurrenceId: occ.id },
        });
        if (delivered) sent += 1;
        else skipped += 1;
      } catch (err) {
        // Не роняем весь прогон из-за одного получателя; без записи в
        // дедуп — попробуем этого человека в следующий раз.
        console.warn(
          `telegram reminder failed (user ${user.id}, occurrence ${occ.id}): ${err instanceof Error ? err.message : err}`,
        );
        skipped += 1;
      }
    }
  }

  return { sent, skipped };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const EXPIRY_WARN_DAYS = 3;

/**
 * Напоминание «подписка заканчивается через N дней» в Telegram. Дедуп —
 * premiumExpiryNotifiedFor: помним, для какого premiumUntil уже слали
 * (после продления дата меняется, и напоминание сработает снова).
 */
export async function sendPremiumExpiryReminders(): Promise<number> {
  const now = new Date();
  const warnBefore = new Date(now.getTime() + EXPIRY_WARN_DAYS * 24 * 60 * 60 * 1000);

  const expiring = await prisma.user.findMany({
    where: {
      telegramId: { not: null },
      // Бессрочным напоминать нечего — их подписка не истекает.
      premiumLifetime: false,
      premiumUntil: { gt: now, lte: warnBefore },
    },
  });

  let sent = 0;
  for (const user of expiring) {
    if (user.premiumExpiryNotifiedFor?.getTime() === user.premiumUntil!.getTime()) continue;
    try {
      const dateStr = user.premiumUntil!.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      });
      const appUrl = process.env.APP_URL || "";
      await sendTelegramMessage(
        user.telegramId!,
        `⏳ Подписка MyBLHub заканчивается ${dateStr}. Продлите, чтобы не потерять афишу, календарь и поездки.${appUrl ? `\n${appUrl}` : ""}`,
      );
      await prisma.user.update({
        where: { id: user.id },
        data: { premiumExpiryNotifiedFor: user.premiumUntil },
      });
      sent += 1;
    } catch (err) {
      console.warn(`premium expiry reminder failed (user ${user.id}): ${err instanceof Error ? err.message : err}`);
    }
  }
  return sent;
}

const PRESALE_LOOKAHEAD_MINUTES = 60;

/**
 * Пресейл-напоминания (Г1): «через час открываются продажи» — всем с
 * Telegram и активной подпиской, кто отметил «иду» или добавил событие
 * в избранное. Дедуп — TelegramPresaleNotification (одна препродажа на
 * событие, потому ключ (userId, eventId)).
 */
export async function sendPresaleReminders(): Promise<number> {
  const now = new Date();
  const until = new Date(now.getTime() + PRESALE_LOOKAHEAD_MINUTES * 60 * 1000);

  // От получателя нужны только id, telegramId и поля подписки (по ним
  // isPremiumActive решает, положен ли пресейл-пинг) — полные строки
  // User каждые полчаса на каждого идущего/избравшего тянуть незачем.
  const recipientSelect = {
    user: { select: { id: true, telegramId: true, premiumUntil: true, premiumLifetime: true } },
  } as const;
  const events = await prisma.event.findMany({
    where: { presaleAt: { gt: now, lte: until } },
    include: {
      attendees: { select: recipientSelect },
      favoritedBy: { select: recipientSelect },
      presaleNotifications: { select: { userId: true } },
    },
  });

  let sent = 0;
  for (const event of events) {
    const alreadyNotified = new Set(event.presaleNotifications.map((n) => n.userId));
    // Идущие и избравшие — в одну карту: человек может быть в обоих
    // списках, напоминание всё равно одно.
    const recipients = new Map<
      string,
      { id: string; telegramId: string | null } & PremiumFields
    >();
    for (const a of event.attendees) recipients.set(a.user.id, a.user);
    for (const f of event.favoritedBy) {
      if (!recipients.has(f.user.id)) recipients.set(f.user.id, f.user);
    }

    for (const user of recipients.values()) {
      if (!user.telegramId || alreadyNotified.has(user.id) || !isPremiumActive(user)) continue;
      const timeStr = formatTime(event.presaleAt!);
      const appUrl = process.env.APP_URL || "";
      const link = appUrl ? `\n${appUrl}${eventHref(event)}` : "";
      try {
        await sendTelegramMessage(
          user.telegramId,
          `🎟 <b>${escapeHtml(event.title)}</b>\nПродажа билетов открывается сегодня в ${timeStr} (тайское время)!${link}`,
        );
        await prisma.telegramPresaleNotification.create({
          data: { userId: user.id, eventId: event.id },
        });
        sent += 1;
      } catch (err) {
        console.warn(`presale reminder failed (user ${user.id}, event ${event.id}): ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return sent;
}

/**
 * Уведомление друзьям «X идёт на событие» (Г2) — вызывается из
 * toggleGoing сразу после отметки (fire-and-forget). Получают друзья с
 * Telegram и подпиской, не отключившие уведомления об этом человеке
 * (FriendNotificationMute).
 */
export async function notifyFriendsAboutGoing(userId: string, occurrenceId: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const [actor, occurrence, friendIds] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.eventOccurrence.findUnique({ where: { id: occurrenceId }, include: { event: true } }),
    getFriendIds(userId),
  ]);
  if (!actor || !occurrence) return;
  const event = occurrence.event;
  if (friendIds.length === 0) return;

  // Кому это интересно: друзья, не заглушившие автора. Telegram есть не
  // у всех — уведомление на сайте получают все, в Telegram только
  // привязанные (этим занимается notifyUser).
  const friends = await prisma.user.findMany({
    where: {
      id: { in: friendIds },
      friendMutes: { none: { mutedFriendId: userId } },
    },
  });

  const name = actor.name || null;

  for (const friend of friends) {
    if (!isPremiumActive(friend)) continue;
    await notifyUser({
      userId: friend.id,
      // Строка User уже прочитана целиком — notifyUser незачем
      // перечитывать её ради своих полей.
      user: friend,
      actorId: userId,
      kind: "FRIEND_GOING",
      actorName: name,
      subject: event.title,
      body: (_t, locale) => formatHumanDate(occurrence.startsAt, locale),
      href: eventHref(event),
    });
  }
}

// Час по Бангкоку, после которого серию считаем вышедшей: точного
// времени эфира в расписании нет (DramaEpisode.airDate — только дата),
// а тайские сериалы выходят вечером. Уведомление в утро дня эфира было
// бы враньём — серии ещё нет.
const EPISODE_OUT_HOUR_BKK = 22;
// Сколько прошедших дней добираем: простой поезда/деплой в вечер эфира
// не должен съесть уведомление, дальше трёх дней оно уже не новость.
const EPISODE_CATCHUP_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Уведомления о новых сериях (З1): отметил «Смотрю сейчас» — получаешь
 * «Вышла серия 5 из 10» в колокольчик и, по переключателю
 * `tgNotifyEpisodes`, в Telegram.
 *
 * Идёт через `notifyUser` — по тем же причинам, что и дни рождения
 * (язык получателя, его настройки, запись на сайте). Название сериала
 * замораживается в subject на языке получателя ЗДЕСЬ: notifyUser
 * локализует фразу, но не данные.
 *
 * Дедуп — EpisodeNotification (userId+episodeId): планировщик
 * просыпается каждые полчаса, а серия одна. Отметка ставится ПЕРЕД
 * отправкой, гонку тиков судит уникальный ключ.
 */
export async function sendEpisodeNotifications(): Promise<number> {
  const now = new Date();
  // Бангкокское настенное «сейчас», разложенное в UTC-компоненты — как
  // хранятся все даты (см. lib/dates.ts).
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const todayMs = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate());
  // До вечернего часа сегодняшние серии не трогаем — только добор
  // прошлых дней.
  const lastAiredMs = bkk.getUTCHours() >= EPISODE_OUT_HOUR_BKK ? todayMs : todayMs - DAY_MS;

  const episodes = await prisma.dramaEpisode.findMany({
    where: {
      airDate: {
        gte: new Date(lastAiredMs - EPISODE_CATCHUP_DAYS * DAY_MS),
        lte: new Date(lastAiredMs),
      },
    },
    include: {
      drama: { select: { id: true, title: true, titleRu: true, slug: true, episodes: true } },
    },
  });
  if (episodes.length === 0) return 0;

  // Кому: по колокольчику per-сериал (notifyEpisodes), а не по статусу.
  // «Смотрю сейчас» включает его сам, но руками подписку можно держать
  // и на отложенном сериале — или выключить у смотримого.
  // Получателя выбираем сразу со всем, что нужно notifyUser: иначе он
  // перечитывал бы User из БД на каждое уведомление (N+1).
  const watchers = await prisma.dramaWatchStatus.findMany({
    where: { dramaId: { in: [...new Set(episodes.map((e) => e.dramaId))] }, notifyEpisodes: true },
    select: {
      userId: true,
      dramaId: true,
      episodesWatched: true,
      user: { select: NOTIFY_RECIPIENT_SELECT },
    },
  });
  if (watchers.length === 0) return 0;
  const watchersByDrama = new Map<string, typeof watchers>();
  for (const w of watchers) {
    watchersByDrama.set(w.dramaId, [...(watchersByDrama.get(w.dramaId) ?? []), w]);
  }

  let sent = 0;
  for (const episode of episodes) {
    for (const watcher of watchersByDrama.get(episode.dramaId) ?? []) {
      // Уже отметил эту серию (или дальше) просмотренной — новость
      // опоздала, человек и так в курсе.
      if (watcher.episodesWatched != null && watcher.episodesWatched >= episode.number) continue;

      try {
        await prisma.episodeNotification.create({
          data: { userId: watcher.userId, episodeId: episode.id },
        });
      } catch {
        continue; // уже уведомляли (или выиграл параллельный тик)
      }

      const locale = isLocale(watcher.user.locale) ? watcher.user.locale : DEFAULT_LOCALE;
      await notifyUser({
        userId: watcher.userId,
        user: watcher.user,
        kind: "EPISODE_AIRED",
        subject: dramaTitleForLocale(episode.drama, locale),
        body: (t) => t.notifications.episodeBody(episode.number, episode.drama.episodes),
        href: dramaHref(episode.drama),
      });
      sent += 1;
    }
  }
  return sent;
}

/**
 * Поздравления с днями рождения избранных артистов (З3).
 *
 * Блок на главной показывает именинников всем, а это — личное: приходит
 * только тому, кто добавил артиста в избранное, и только про него.
 *
 * Идёт через `notifyUser`, а не прямым сообщением в бота: тогда повод
 * попадает и в колокольчик на сайте, и в Telegram, на языке получателя
 * и по его переключателю (`tgNotifyBirthdays`) — писать своё сообщение
 * значило бы обойти и то, и другое.
 *
 * Дату сравниваем по месяцу и дню в UTC: даты-без-времени лежат как
 * полночь UTC (см. lib/dates.ts), и приведение к поясу сервера сдвигало
 * бы поздравление на день — ровно та беда, из-за которой блок на
 * главной когда-то молчал.
 *
 * Дедуп — BirthdayNotification с годом в ключе: планировщик просыпается
 * каждые полчаса, иначе за сутки ушло бы двадцать поздравлений.
 */
export async function sendBirthdayNotifications(): Promise<number> {
  const now = new Date();
  const year = now.getUTCFullYear();

  const birthdayPerformers = await prisma.$queryRaw<
    { id: string; name: string; slug: string | null; birthDate: Date }[]
  >`
    SELECT p.id, p.name, p.slug, p."birthDate"
      FROM "Performer" p
     WHERE p."birthDate" IS NOT NULL
       AND EXTRACT(MONTH FROM p."birthDate") = ${now.getUTCMonth() + 1}
       AND EXTRACT(DAY FROM p."birthDate") = ${now.getUTCDate()}
  `;
  if (birthdayPerformers.length === 0) return 0;

  const performerIds = birthdayPerformers.map((p) => p.id);
  const [favorites, alreadySent] = await Promise.all([
    prisma.favoritePerformer.findMany({
      where: { performerId: { in: performerIds } },
      select: { userId: true, performerId: true },
    }),
    prisma.birthdayNotification.findMany({
      where: { performerId: { in: performerIds }, year },
      select: { userId: true, performerId: true },
    }),
  ]);

  const sentKeys = new Set(alreadySent.map((n) => `${n.userId}:${n.performerId}`));
  const byId = new Map(birthdayPerformers.map((p) => [p.id, p]));

  // Получателей забираем одним findMany и передаём в notifyUser готовыми
  // — иначе он перечитывал бы User на каждое поздравление (N+1).
  const recipients = await prisma.user.findMany({
    where: { id: { in: [...new Set(favorites.map((f) => f.userId))] } },
    select: { id: true, ...NOTIFY_RECIPIENT_SELECT },
  });
  const recipientById = new Map(recipients.map((u) => [u.id, u]));

  let sent = 0;
  for (const fav of favorites) {
    if (sentKeys.has(`${fav.userId}:${fav.performerId}`)) continue;
    const performer = byId.get(fav.performerId);
    const recipient = recipientById.get(fav.userId);
    if (!performer || !recipient) continue;

    // Отметку ставим ПЕРЕД отправкой, и по ней же ловим гонку: два
    // тика планировщика могут пересечься, и уникальный ключ — тот, кто
    // рассудит. Проигравший просто ничего не шлёт.
    try {
      await prisma.birthdayNotification.create({
        data: { userId: fav.userId, performerId: fav.performerId, year },
      });
    } catch {
      continue;
    }

    const turns = year - performer.birthDate.getUTCFullYear();
    await notifyUser({
      userId: fav.userId,
      user: recipient,
      kind: "PERFORMER_BIRTHDAY",
      subject: performer.name,
      // Возраст осмыслен, только если год рождения настоящий: у части
      // карточек в дате стоит условный год, и «исполняется 2026» было
      // бы дичью.
      body: turns > 0 && turns < 120 ? (t) => t.notifications.birthdayBody(turns) : null,
      href: performer.slug ? `/artists/${performer.slug}` : null,
    });
    sent += 1;
  }
  return sent;
}

const ONLINE_BOOKING_LOOKAHEAD_MINUTES = 60;
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * «Через час откроется онлайн-бронирование» — по времени, которое
 * владелец записал у своего билета (EventTicket.onlineBookingAt). Это
 * личный билет, поэтому подписка не проверяется, а получатель один —
 * владелец. Идёт через notifyUser: колокольчик + Telegram по
 * переключателю tgNotifyEvents, на языке получателя.
 *
 * Время бронирования лежит тайским настенным в UTC-слоте (как
 * presaleAt, см. lib/dates.ts), поэтому окно строится от бангкокского
 * «сейчас», разложенного в те же UTC-компоненты, — иначе напоминание
 * ушло бы на 7 часов позже, уже после открытия.
 *
 * Дедуп — onlineBookingNotifiedAt на самом билете: отметка ставится
 * атомарным updateMany ДО отправки, и его условие WHERE разнимает гонку
 * двух тиков; смена времени бронирования сбрасывает отметку (см.
 * ticketActions.ts), так что новое время напоминается заново. Прошедшее
 * время не напоминаем: окно начинается строго после «сейчас».
 */
export async function sendOnlineBookingReminders(): Promise<number> {
  const now = new Date();
  const bkkNow = new Date(now.getTime() + ICT_OFFSET_MS);
  const until = new Date(bkkNow.getTime() + ONLINE_BOOKING_LOOKAHEAD_MINUTES * 60 * 1000);

  const tickets = await prisma.eventTicket.findMany({
    where: { onlineBookingAt: { gt: bkkNow, lte: until }, onlineBookingNotifiedAt: null },
    select: {
      id: true,
      userId: true,
      onlineBookingAt: true,
      onlineBookingUrl: true,
      event: { select: { id: true, slug: true, title: true } },
      user: { select: NOTIFY_RECIPIENT_SELECT },
    },
  });

  let sent = 0;
  for (const ticket of tickets) {
    if (!ticket.onlineBookingAt) continue;
    const claimed = await prisma.eventTicket.updateMany({
      where: { id: ticket.id, onlineBookingNotifiedAt: null },
      data: { onlineBookingNotifiedAt: now },
    });
    if (claimed.count === 0) continue; // выиграл параллельный тик

    const timeStr = formatTime(ticket.onlineBookingAt);
    const url = ticket.onlineBookingUrl;
    await notifyUser({
      userId: ticket.userId,
      user: ticket.user,
      kind: "ONLINE_BOOKING",
      subject: ticket.event.title,
      // Ссылка на бронирование — в теле: href уведомления должен быть
      // внутренним (go-маршрут колокольчика во внешний редирект не
      // ходит), а в Telegram адрес в тексте и так кликабелен.
      body: (t) => t.notifications.onlineBookingBody(timeStr) + (url ? `\n${url}` : ""),
      href: eventHref(ticket.event),
    });
    sent += 1;
  }
  return sent;
}
