import { prisma } from "@/lib/prisma";
import { catalogEventsWhere, catalogOccurrencesWhere } from "@/lib/catalogEvents";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatHumanDate, formatTime } from "@/lib/dates";
import { eventHref } from "@/lib/eventSlug";
import { communityHref } from "@/lib/slugHelpers";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { getDict, isLocale, localeHref, DEFAULT_LOCALE } from "@/lib/i18n";
import { isPremiumActive, premiumAccessWhere, type PremiumFields } from "@/lib/premium";
import { getFriendIds } from "@/lib/friends";
import { notifyUser } from "@/lib/notifications";
import { buildDigestMessage } from "@/lib/botDigest";
import { tripHref } from "@/lib/slugHelpers";
import { dateKey, addDays } from "@/lib/dates";
import { COUNTDOWN_START_DAYS, countdownToday, daysUntilTrip, tripCountdownCaption } from "@/lib/tripCountdown";
import { renderTemplate } from "@/lib/notificationTemplates";

const LOOKAHEAD_HOURS = 24;

// Абсолютный адрес для ссылок в сообщениях бота — как в notifications.ts
// и botDigest.ts. Старые рассылки этого файла берут process.env.APP_URL
// сами и без него просто не ставят ссылку; у дайджеста ссылка вшита в
// текст строки, и относительный адрес Telegram ссылкой не сделает.
const APP_URL = process.env.APP_URL ?? "https://myblhub.com";

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
 * 24 часа, всем, кто отметил «я иду» или «возможно пойду» и
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
    // Напоминания — про афишу (см. src/lib/catalogEvents.ts). У встречи
    // сообщества своё место: она видна на странице сообщества, и слать
    // её название в Telegram тому, кто когда-то положил её в избранное,
    // а потом вышел из сообщества, — уже утечка.
    where: { ...catalogOccurrencesWhere(), startsAt: { gt: now, lte: until } },
    include: {
      // Обе отметки — по конкретной дате (на occurrence): напоминаем
      // ровно про тот день, который человек выбрал.
      attendances: { select: recipientSelect },
      maybes: { select: recipientSelect },
      event: true,
      telegramNotifications: { select: { userId: true } },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const occ of occurrences) {
    const alreadyNotified = new Set(occ.telegramNotifications.map((n) => n.userId));
    // «Иду» и «возможно» складываем в одну карту — человек может быть в
    // обоих списках, напоминание всё равно одно.
    const recipients = new Map<string, { id: string; telegramId: string | null }>();
    for (const a of occ.attendances) recipients.set(a.user.id, a.user);
    for (const m of occ.maybes) {
      if (!recipients.has(m.user.id)) recipients.set(m.user.id, m.user);
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
 * Telegram и активной подпиской, кто отметил «иду» или «возможно
 * пойду». Дедуп — TelegramPresaleNotification (одна препродажа на
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
    // Препродажа бывает только у афишных событий, но условие ставим и
    // здесь: одна общая калитка вместо «а тут не может протечь».
    where: { ...catalogEventsWhere(), presaleAt: { gt: now, lte: until } },
    include: {
      attendees: { select: recipientSelect },
      maybes: { select: recipientSelect },
      presaleNotifications: { select: { userId: true } },
    },
  });

  let sent = 0;
  for (const event of events) {
    const alreadyNotified = new Set(event.presaleNotifications.map((n) => n.userId));
    // Идущие и «возможно» — в одну карту: человек может быть в обоих
    // списках, напоминание всё равно одно.
    const recipients = new Map<
      string,
      { id: string; telegramId: string | null } & PremiumFields
    >();
    for (const a of event.attendees) recipients.set(a.user.id, a.user);
    for (const m of event.maybes) {
      if (!recipients.has(m.user.id)) recipients.set(m.user.id, m.user);
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
 * Уведомление друзьям «X идёт на событие» (Г2; для прошедшей даты —
 * «X побывал(а) на событии») — вызывается из
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
  // «X идёт на …» уходит ДРУЗЬЯМ, а они не обязаны быть в том же
  // сообществе: название встречи (и её адрес в карточке по ссылке) им
  // знать неоткуда. Про встречи друзьям не рассказываем вовсе.
  if (event.communityId) return;
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
      // Прошедшая дата — «побывал(а)», а не «идёт» (правка владельца
      // 2026-09-17): отметку ставят и задним числом, и друзьям
      // приходило будущее время о том, что давно прошло.
      kind: occurrence.startsAt < new Date() ? "FRIEND_ATTENDED" : "FRIEND_GOING",
      actorName: name,
      subject: event.title,
      body: (_t, locale) => formatHumanDate(occurrence.startsAt, locale),
      href: eventHref(event),
    });
  }
}

/**
 * «У избранного артиста новое событие» (аудит 2026-09, приоритет №1).
 *
 * Вызывается из админских экшенов после привязки состава: создание
 * события (форма и импорт, включая одобрение черновиков) — со всем
 * составом, правка — только с ВПЕРВЫЕ привязанными артистами (старый
 * состав уже отработан при создании, пересборка связей формой — не
 * новость). Встречи сообществ — НЕ триггер: их админка не заводит, но
 * калитка communityId стоит и здесь — одна общая, как в рассылках.
 *
 * В состав идут и АРТИСТЫ ЛАЙНАПОВ ПО ДНЯМ, и участники привязанных
 * ГРУПП (правка владельца 2026-09-15: «добавляем группы в лайнап по
 * дням — не приходит уведомление»). Про лайнапы вызывающие заботятся
 * сами (их id приходят сюда вместе с общим составом), а группы
 * раскрываются здесь: избравший участника LYKN ждёт весточки о
 * концерте LYKN, а не строки в базе.
 *
 * Уведомление одно на пару (получатель, событие), сколько бы избранных
 * артистов ни оказалось в составе: дедуп — PerformerEventNotification,
 * отметка ставится ДО отправки, гонку параллельных сохранений судит
 * уникальный ключ (как у серий и дней рождения).
 *
 * Идёт через notifyUser: колокольчик + Telegram по tgNotifyEvents, на
 * языке получателя. Ошибка рассылки не роняет админский экшен.
 */
export async function notifyFavoritersAboutEventPerformers(
  eventId: string,
  performerIds: string[],
): Promise<void> {
  try {
    if (performerIds.length === 0) return;

    const now = new Date();
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        slug: true,
        title: true,
        communityId: true,
        // Ближайшая будущая дата — во фразу «когда». Событию целиком в
        // прошлом уведомление не положено: привязка артиста к архивной
        // карточке — уборка данных, а не «новое событие».
        occurrences: {
          where: { startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          select: { startsAt: true },
          take: 1,
        },
      },
    });
    if (!event || event.communityId) return;
    const firstUpcoming = event.occurrences[0];
    if (!firstUpcoming) return;

    // Группы раскрываем до участников: событие группы — событие каждого
    // из них, и избравший участника должен узнать о концерте.
    const members = await prisma.bandMember.findMany({
      where: { bandId: { in: performerIds } },
      select: { bandId: true, performerId: true },
    });
    const notifyAbout = [...new Set([...performerIds, ...members.map((m) => m.performerId)])];
    // Кто чей участник — чтобы ниже не называть и группу, и её людей.
    const membersByBand = new Map<string, Set<string>>();
    for (const m of members) {
      const set = membersByBand.get(m.bandId) ?? new Set<string>();
      set.add(m.performerId);
      membersByBand.set(m.bandId, set);
    }

    // Получатели — избравшие любого артиста из привязанных; данные для
    // notifyUser забираем тем же findMany, чтобы не перечитывать User на
    // каждое уведомление (N+1).
    const favorites = await prisma.favoritePerformer.findMany({
      where: { performerId: { in: notifyAbout } },
      select: {
        userId: true,
        performerId: true,
        performer: { select: { name: true } },
        user: { select: NOTIFY_RECIPIENT_SELECT },
      },
    });

    // Несколько избранных в составе — в фразу идут ВСЕ (правка
    // владельца 2026-09-22: «создала событие для двух актёров, а в
    // уведомлении только один, хотя оба в избранном»), кроме тех, кого
    // покрывает названная рядом группа (см. ниже). Порядок — как в
    // составе события: сначала привязанные к нему, потом участники
    // групп; хвост длинного списка свернёт namesList.
    const order = new Map(notifyAbout.map((id, i) => [id, i]));
    const byUser = new Map<
      string,
      {
        user: (typeof favorites)[number]["user"];
        names: { id: string; name: string; at: number }[];
      }
    >();
    for (const f of favorites) {
      const entry = byUser.get(f.userId) ?? { user: f.user, names: [] };
      if (!entry.names.some((n) => n.name === f.performer.name)) {
        entry.names.push({
          id: f.performerId,
          name: f.performer.name,
          at: order.get(f.performerId) ?? 0,
        });
      }
      byUser.set(f.userId, entry);
    }

    for (const [userId, fav] of byUser) {
      // Группа поглощает своих: если в избранном у человека и LYKN, и
      // трое её участников, «у LYKN новое событие» говорит ровно то же,
      // а «LYKN, Lego и ещё 2» выглядит так, будто выступают четверо
      // разных артистов (правка владельца 2026-09-24). Схлопываем
      // ТОЛЬКО под своей группой: участника, чьей группы в списке нет,
      // по-прежнему называем по имени.
      const listedIds = new Set(fav.names.map((n) => n.id));
      const coveredByBand = new Set<string>();
      for (const bandId of listedIds) {
        for (const memberId of membersByBand.get(bandId) ?? []) coveredByBand.add(memberId);
      }
      const names = [...fav.names]
        .filter((n) => !coveredByBand.has(n.id))
        .sort((a, b) => a.at - b.at)
        .map((n) => n.name);
      try {
        await prisma.performerEventNotification.create({
          data: { userId, eventId: event.id },
        });
      } catch {
        continue; // уже уведомляли об этом событии (или выиграла гонка)
      }

      await notifyUser({
        userId,
        user: fav.user,
        kind: "PERFORMER_EVENT",
        actorName: (t) => t.notifications.namesList(names),
        subject: event.title,
        body: (_t, locale) => formatHumanDate(firstUpcoming.startsAt, locale),
        href: eventHref(event),
      });
    }
  } catch (error) {
    // Создание/правка события важнее уведомления — экшен не роняем.
    console.error("notifyFavoritersAboutEventPerformers failed", error);
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
        // Тексты правятся из админки — через реестр шаблонов; язык
        // получателя известен только внутри notifyUser, поэтому правки
        // читаются там же (см. lib/notificationTemplates.ts).
        body: (t, _locale, overrides) =>
          renderTemplate(
            episode.drama.episodes ? "body.episode" : "body.episodeNoTotal",
            { n: episode.number, total: episode.drama.episodes ?? "" },
            t,
            overrides,
          ),
        href: dramaHref(episode.drama),
      });
      sent += 1;
    }
  }

  // «Стартовал сериал из ваших планов» (аудит 2026-09, раздел 5 п. 5):
  // серия №1 будит и тех, кто отложил сериал «В планы», — колокольчик
  // серий у них обычно погашен, и основная рассылка их не видит.
  // notifyEpisodes: false в условии — не отписка, а анти-дубль по
  // смыслу: подписанные колокольчиком уже получили «Вышла серия 1»
  // выше, и премьерная фраза стала бы вторым письмом про ту же серию.
  // Технически второй барьер — та же EpisodeNotification (userId +
  // episodeId): что бы ни разъехалось, дважды про серию не шлём.
  // Общие отписки уважаются как всегда: notifyUser сам смотрит
  // tgNotifyEpisodes перед дублированием в Telegram.
  const premieres = episodes.filter((e) => e.number === 1);
  if (premieres.length === 0) return sent;

  const planWatchers = await prisma.dramaWatchStatus.findMany({
    where: {
      dramaId: { in: [...new Set(premieres.map((e) => e.dramaId))] },
      status: "PLAN_TO_WATCH",
      notifyEpisodes: false,
    },
    select: {
      userId: true,
      dramaId: true,
      episodesWatched: true,
      user: { select: NOTIFY_RECIPIENT_SELECT },
    },
  });
  const planByDrama = new Map<string, typeof planWatchers>();
  for (const w of planWatchers) {
    planByDrama.set(w.dramaId, [...(planByDrama.get(w.dramaId) ?? []), w]);
  }

  for (const episode of premieres) {
    for (const watcher of planByDrama.get(episode.dramaId) ?? []) {
      // Первую серию уже отметил просмотренной — старт он не пропустил.
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
        kind: "DRAMA_STARTED",
        subject: dramaTitleForLocale(episode.drama, locale),
        // Тексты правятся из админки — через реестр шаблонов; язык
        // получателя известен только внутри notifyUser, поэтому правки
        // читаются там же (см. lib/notificationTemplates.ts).
        body: (t, _locale, overrides) =>
          renderTemplate(
            episode.drama.episodes ? "body.episode" : "body.episodeNoTotal",
            { n: episode.number, total: episode.drama.episodes ?? "" },
            t,
            overrides,
          ),
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
      body:
        turns > 0 && turns < 120
          ? (t, _locale, overrides) => renderTemplate("body.birthday", { turns }, t, overrides)
          : null,
      href: performer.slug ? `/artists/${performer.slug}` : null,
    });
    sent += 1;
  }
  return sent;
}

/**
 * Обратный отсчёт до поездки (АА9, правка владельца 2026-09-23): в
 * последний месяц перед поездкой — по сообщению каждое утро, от «ровно
 * месяц» до «сегодня!», с шуткой на каждый день (подписи — в словаре,
 * t.notifications.tripCountdown). Запускается задачей планировщика
 * `trip-countdown` утром (defaultHour 10), не получасовым прогоном:
 * сообщение «доброе утро, осталось N дней» должно приходить утром, а не
 * в полночь, когда сменилась дата.
 *
 * Получатели — владелец и принявшие приглашение участники; у кого свои
 * даты (TripStay), тому считается до его прилёта, а не до начала
 * поездки. Через notifyUser: и колокольчик, и Telegram по переключателю
 * tgNotifyTrips — свой, месяц ежедневных сообщений человек должен уметь
 * выключить, не теряя приглашений в поездки.
 *
 * Дедуп — TripCountdownNotification по календарному дню: одно сообщение
 * человеку на поездку в день, повторный запуск задачи ничего не
 * дублирует. Отметка ставится ДО отправки, гонку двух тиков судит
 * первичный ключ.
 */
export async function sendTripCountdowns(now = new Date()): Promise<number> {
  const today = countdownToday(now);
  const day = dateKey(today);
  // Свои даты участника лежат внутри поездки, поэтому фильтра по началу
  // поездки хватает и для них; «минус день» у нижней границы — старые
  // записи лежат 21:00 UTC предыдущего дня. Идущие поездки тоже нужны:
  // у участника со своими датами прилёт может быть ещё впереди.
  const trips = await prisma.trip.findMany({
    where: {
      startDate: { lte: addDays(today, COUNTDOWN_START_DAYS) },
      endDate: { gte: addDays(today, -1) },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      userId: true,
      startDate: true,
      members: { where: { status: "ACCEPTED" }, select: { userId: true } },
      stays: { select: { userId: true, startDate: true } },
    },
  });
  if (trips.length === 0) return 0;

  // Кому и сколько осталось — заранее, чтобы получателей прочитать одним
  // findMany (см. NOTIFY_RECIPIENT_SELECT).
  const pending: { userId: string; trip: (typeof trips)[number]; daysLeft: number }[] = [];
  for (const trip of trips) {
    const stayOf = new Map(trip.stays.map((s) => [s.userId, s.startDate]));
    const userIds = [trip.userId, ...trip.members.map((m) => m.userId)];
    for (const userId of new Set(userIds)) {
      const daysLeft = daysUntilTrip(stayOf.get(userId) ?? trip.startDate, today);
      if (daysLeft < 0 || daysLeft > COUNTDOWN_START_DAYS) continue;
      pending.push({ userId, trip, daysLeft });
    }
  }
  if (pending.length === 0) return 0;

  const recipients = await prisma.user.findMany({
    where: { id: { in: [...new Set(pending.map((p) => p.userId))] }, deletedAt: null },
    select: { id: true, ...NOTIFY_RECIPIENT_SELECT, tgNotifyTrips: true },
  });
  const recipientById = new Map(recipients.map((u) => [u.id, u]));

  let sent = 0;
  for (const { userId, trip, daysLeft } of pending) {
    const recipient = recipientById.get(userId);
    if (!recipient) continue;
    try {
      await prisma.tripCountdownNotification.create({ data: { userId, tripId: trip.id, day } });
    } catch {
      continue; // уже уходило сегодня — или отправил параллельный тик
    }
    await notifyUser({
      userId,
      user: recipient,
      kind: "TRIP_COUNTDOWN",
      subject: trip.title,
      // Подпись дня — с правками админки: их читает notifyUser, он же
      // знает язык получателя.
      body: (t, _locale, overrides) => tripCountdownCaption(daysLeft, t, overrides) ?? "",
      href: tripHref(trip),
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
      body: (t, _locale, overrides) =>
        renderTemplate("body.onlineBooking", { time: timeStr }, t, overrides) + (url ? `\n${url}` : ""),
      href: eventHref(ticket.event),
    });
    sent += 1;
  }
  return sent;
}

// --- Дайджесты (аудит 2026-09, раздел 8) -----------------------------
//
// Обе рассылки ниже разделены на «собрать» и «отправить». Это не
// украшательство: у рассылки в живого бота нет способа посмотреть, что
// именно она напишет людям, — а посмотреть надо ДО того, как она
// написала. Сборка возвращает готовые сообщения, отправка их разносит;
// сухой прогон зовёт только первую половину.

/** Одно готовое сообщение рассылки: кому (chat id) и что. */
type PreparedMessage = {
  chatId: string;
  text: string;
  subject: string;
  /** Строка для колокольчика, если у рассылки она есть. Дайджест «Ваша
   *  неделя» её не имеет намеренно: это письмо на воскресенье, а не
   *  событие, о котором стоит помнить в ленте уведомлений. */
  bell?: { userId: string; title: string; body: string; href: string };
};

/**
 * Кому и что уйдёт в недельном дайджесте «Ваша неделя» — подписчикам с
 * привязанным Telegram и включённым `tgNotifyDigest`.
 *
 * Текст собирает ОБЩИЙ сборщик подборок (`buildDigestMessage`, days: 7),
 * тот же, что отвечает боту на /week: два списка «что у меня на неделе»
 * разъехались бы молча — рассылка обещала бы одно, бот показывал другое.
 * Оттуда же берутся и старты продаж, и дни рождения избранных.
 *
 * Пустую подборку НЕ шлём (`skipEmpty`): человек рассылку не спрашивал,
 * и «у вас на неделе ничего нет» воскресным утром — спам, а не забота.
 */
export async function collectWeeklyDigests(): Promise<PreparedMessage[]> {
  const recipients = await prisma.user.findMany({
    where: {
      telegramId: { not: null },
      tgNotifyDigest: true,
      deletedAt: null,
      // Дайджест — платная функция, и условие то же самое, что у всех
      // остальных гейтов (см. lib/premium.ts): в промо-период оно пустое,
      // и рассылка уходит всем, кто включил тумблер. Иначе настройки
      // обещали бы дайджест бесплатному аккаунту, а он бы не приходил.
      ...premiumAccessWhere(),
    },
    // Сборщику подборки нужны id и язык, отправке — telegramId; полные
    // строки User ради трёх полей не тянем.
    select: { id: true, locale: true, telegramId: true },
  });

  const prepared: PreparedMessage[] = [];
  for (const user of recipients) {
    try {
      const text = await buildDigestMessage(user, 7, { skipEmpty: true });
      if (!text) continue;
      const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
      const footer = getDict(locale).notifications.digest.weeklyFooter;
      prepared.push({
        chatId: user.telegramId!,
        text: `${text}\n\n<i>${escapeHtml(footer)}</i>`,
        subject: user.id,
      });
    } catch (err) {
      // Падение на одном человеке не должно ронять рассылку остальным.
      console.warn(
        `weekly digest build failed (user ${user.id}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return prepared;
}

/**
 * Недельный дайджест — сама рассылка. Запускается задачей
 * `weekly-digest` планировщика по воскресеньям.
 *
 * Дедуп отдельной таблицей не нужен: задачу захватывает планировщик
 * атомарно и повторно за неделю не стартует. Идём по одному человеку за
 * раз — подписчиков десятки, складывать их запросы к Bot API в
 * параллель незачем.
 */
export async function sendWeeklyDigests(): Promise<number> {
  const prepared = await collectWeeklyDigests();
  let sent = 0;
  for (const message of prepared) {
    try {
      await sendTelegramMessage(message.chatId, message.text);
      sent += 1;
    } catch (err) {
      console.warn(
        `weekly digest failed (user ${message.subject}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return sent;
}

/** За какой срок считается месячная сводка сообщества. Календарный
 *  месяц тут не нужен: прогон привязан к интервалу задачи
 *  (`community-digest`, раз в 30 дней), и «с 1-го по 30-е» всё равно не
 *  совпало бы с датами прогонов. */
const COMMUNITY_DIGEST_DAYS = 30;

/**
 * Месячные сводки владельцам сообществ: сколько за месяц пришло
 * участников, сколько завели тем и написали комментариев и какая
 * встреча ближайшая.
 *
 * Считается по уже существующим моделям, без новых таблиц:
 * `CommunityMember.createdAt` (только ACTIVE — неодобренная заявка и
 * забаненный не «новые участники»), `CommunityPost`, `Comment` по темам
 * сообщества и ближайшая будущая дата встречи.
 *
 * **Пустую сводку не собираем.** «За месяц ничего не произошло» — это
 * ежемесячное напоминание о том, что сообщество мертво, то есть спам.
 * Ближайшая встреча поводом сама по себе тоже не считается: о ней
 * владелец знает, он её и завёл.
 */
export async function collectCommunityMonthlySummaries(): Promise<PreparedMessage[]> {
  const now = new Date();
  const since = new Date(now.getTime() - COMMUNITY_DIGEST_DAYS * 24 * 60 * 60 * 1000);

  // Сообщества без «достижимого» владельца отсекаем ещё в базе: считать
  // месяц ради сообщения, которое некуда отправить, незачем.
  const communities = await prisma.community.findMany({
    where: {
      owner: { telegramId: { not: null }, tgNotifyCommunities: true, deletedAt: null },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      owner: { select: { id: true, locale: true, telegramId: true } },
      _count: {
        select: {
          members: { where: { status: "ACTIVE", createdAt: { gte: since } } },
          posts: { where: { createdAt: { gte: since } } },
        },
      },
    },
  });
  if (communities.length === 0) return [];

  const ids = communities.map((c) => c.id);
  const [commentRows, meetups] = await Promise.all([
    // Комментарии месяца — одним группированным запросом на все
    // сообщества сразу, а не по запросу на сообщество (N+1).
    prisma.comment.groupBy({
      by: ["postId"],
      where: { createdAt: { gte: since }, post: { communityId: { in: ids } } },
      _count: { _all: true },
    }),
    // Ближайшая встреча каждого сообщества: все будущие даты одним
    // запросом, первая по каждому — в памяти. Сообществ и встреч тут
    // единицы, отдельный запрос на каждое был бы N+1 на ровном месте.
    prisma.eventOccurrence.findMany({
      where: { startsAt: { gte: now }, event: { communityId: { in: ids } } },
      select: {
        startsAt: true,
        event: { select: { id: true, slug: true, title: true, communityId: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  // groupBy умеет группировать только по своим колонкам, поэтому
  // комментарии раскладываем по сообществам через темы.
  const postIds = commentRows.map((r) => r.postId).filter((id): id is string => id !== null);
  const posts = postIds.length
    ? await prisma.communityPost.findMany({
        where: { id: { in: postIds } },
        select: { id: true, communityId: true },
      })
    : [];
  const communityByPost = new Map(posts.map((p) => [p.id, p.communityId]));
  const commentsByCommunity = new Map<string, number>();
  for (const row of commentRows) {
    const communityId = row.postId ? communityByPost.get(row.postId) : undefined;
    if (!communityId) continue;
    commentsByCommunity.set(
      communityId,
      (commentsByCommunity.get(communityId) ?? 0) + row._count._all,
    );
  }

  const nextMeetupByCommunity = new Map<string, (typeof meetups)[number]>();
  for (const occ of meetups) {
    const communityId = occ.event.communityId;
    if (!communityId || nextMeetupByCommunity.has(communityId)) continue;
    nextMeetupByCommunity.set(communityId, occ);
  }

  const prepared: PreparedMessage[] = [];
  for (const community of communities) {
    const newMembers = community._count.members;
    const newPosts = community._count.posts;
    const newComments = commentsByCommunity.get(community.id) ?? 0;
    // Тишина — не повод писать владельцу.
    if (newMembers === 0 && newPosts === 0 && newComments === 0) continue;

    const locale = isLocale(community.owner.locale) ? community.owner.locale : DEFAULT_LOCALE;
    const d = getDict(locale).communities.monthlyDigest;
    // Ссылки — на версию сайта на языке владельца, как у notifyUser.
    const link = (href: string, label: string) =>
      `<a href="${APP_URL}${localeHref(href, locale)}">${escapeHtml(label)}</a>`;

    // Строки складываются из словарных фраз и чисел, поэтому экранируется
    // только то, что написали люди: название сообщества и встречи
    // (последнее — внутри link).
    const lines: string[] = [];
    if (newMembers > 0) lines.push(`• ${d.newMembers(newMembers)}`);
    // Темы и комментарии — одной строкой: это одна и та же жизнь в
    // обсуждениях, двумя буллетами она читалась бы как отчёт.
    if (newPosts > 0 || newComments > 0) {
      const parts = [
        newPosts > 0 ? d.posts(newPosts) : null,
        newComments > 0 ? d.comments(newComments) : null,
      ]
        .filter((p): p is string => p !== null)
        .join(", ");
      lines.push(`• ${parts}`);
    }
    const next = nextMeetupByCommunity.get(community.id);
    if (next) {
      lines.push(
        `• ${d.nextMeetup(
          link(eventHref(next.event), next.event.title),
          formatHumanDate(next.startsAt, locale),
        )}`,
      );
    }

    prepared.push({
      chatId: community.owner.telegramId!,
      text:
        `📊 <b>${escapeHtml(d.title(community.title))}</b>\n` +
        `${lines.join("\n")}\n` +
        `${link(communityHref(community), community.title)}\n\n` +
        `<i>${escapeHtml(d.footer)}</i>`,
      subject: community.id,
      // Для колокольчика: тот же счёт словами, но без ссылок и разметки
      // Telegram. Заголовок сложится из вида уведомления при чтении, на
      // языке читающего (см. lib/notificationText.ts).
      bell: {
        userId: community.owner.id,
        title: community.title,
        body: lines.map((l) => l.replace(/^• /, "")).join(" · ").replace(/<[^>]+>/g, ""),
        href: communityHref(community),
      },
    });
  }
  return prepared;
}

/**
 * Месячная сводка владельцу сообщества — сама рассылка. Запускается
 * задачей `community-digest` планировщика.
 *
 * Доставка — через `notifyUser` с видом `COMMUNITY_DIGEST`: строка
 * ложится в колокольчик и уходит в Telegram по тумблеру «Сообщества»
 * (`tgNotifyCommunities`) одним движением. Своего sendTelegramMessage
 * тут нет намеренно — иначе владелец с привязанным ботом получал бы
 * сводку дважды.
 */
export async function sendCommunityMonthlySummaries(): Promise<number> {
  const prepared = await collectCommunityMonthlySummaries();
  let sent = 0;
  for (const message of prepared) {
    try {
      if (message.bell) {
        // Через notifyUser: он сам положит строку в колокольчик и сам же
        // отправит её в Telegram по тумблеру «Сообщества» — своего
        // sendTelegramMessage тут больше нет, иначе владелец с
        // привязанным ботом получал бы сводку дважды.
        await notifyUser({
          userId: message.bell.userId,
          kind: "COMMUNITY_DIGEST",
          subject: message.bell.title,
          body: message.bell.body,
          href: message.bell.href,
        });
      } else {
        await sendTelegramMessage(message.chatId, message.text);
      }
      sent += 1;
    } catch (err) {
      console.warn(
        `community monthly digest failed (community ${message.subject}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return sent;
}
