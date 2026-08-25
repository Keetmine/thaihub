import { execFileSync } from "child_process";
import path from "path";
import { test, expect } from "@playwright/test";
import { signupTestUser } from "./helpers";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// ЗАЧЕМ ЭТОТ ТЕСТ СУЩЕСТВУЕТ.
//
// Бронь жилья и перелётов — закрытые данные: адрес проживания, номер
// брони, иногда загруженный скан билета. Видеть их должны только
// владелец поездки и принятые участники. НЕ должны: гость публичной
// поездки (visibility PUBLIC), друг при видимости FRIENDS и
// приглашённый со статусом PENDING, пока не принял.
//
// Гейт один и стоит на данных — в src/app/(public)/trips/[id]/page.tsx:
// `const visibleBookings = isParticipant ? trip.bookings : []`. Из
// пустого списка не рождается ни строк брони в ленте, ни блока броней
// без дат, ни классов подложки in-stay / stay-open / stay-close.
//
// Ломается это молча. Брони недавно переехали из отдельного блока прямо
// в ленту дней, а подложка-полоса рисуется по датам броней — то есть
// данные брони теперь размазаны по разметке ленты, и любой рефакторинг
// ленты может протащить их мимо гейта. Страница при этом продолжит
// выглядеть правильно.
//
// Поэтому проверяем ИСХОДНИК страницы, а не видимость элементов:
// спрятанное стилями всё равно уезжает в HTML — и это ровно та утечка,
// которую надо ловить. Первый шаг (владелец видит свою бронь) не менее
// важен второго: без него тест был бы зелёным и на странице, где броней
// не видно вообще ни у кого.

test.use({ storageState: ADMIN_STORAGE_STATE });

// Prisma ESM-only — DB-шаги отдельными tsx-процессами (см. docs/testing.md).
function runDbScript(script: string, ...args: string[]): string {
  return execFileSync("npx", ["tsx", path.join(__dirname, script), ...args], {
    cwd: path.join(__dirname, "../.."),
    encoding: "utf8",
  });
}

const PASSWORD = "smoketest123";

test("бронь поездки не утекает в разметку постороннему", async ({ page, browser }) => {
  const stamp = Date.now();
  // Названия заведомо разные и узнаваемые: если назвать поездку словом
  // из строки брони («заезд», «stay», «hotel»), оно найдётся в заголовке
  // страницы и тест позеленеет зря.
  const tripTitle = `Voyage Marker ${stamp}`;
  const hotelName = `Qwertz Riverside Lodge ${stamp}`;
  const address = `88 Nonesuch Road, Kanchanaburi ${stamp}`;
  const bookingNote = `Confirmation XKQ-${stamp}`;
  const strangerEmail = `smoke-booking-outsider-${stamp}@example.com`;

  const tripId = runDbScript(
    "create-test-trip-booking.ts",
    JSON.stringify({
      ownerEmail: "admin-e2e@test.local",
      title: tripTitle,
      // Самая открытая видимость: посторонний обязан попасть на
      // страницу, иначе проверка «брони нет» ничего не значит.
      visibility: "PUBLIC",
      hotelName,
      address,
      note: bookingNote,
    }),
  )
    .trim()
    .split("\n")
    .pop()!
    .trim();
  const tripUrl = `/trips/${tripId}`;

  // Разметка строки брони: сама карточка ноги и классы подложки-полосы,
  // которую лента рисует между заездом и выездом.
  const bookingMarkup = ["booking-leg", "in-stay", "stay-open", "stay-close"];

  const strangerContext = await browser.newContext();
  try {
    // 1. Владелец свою бронь видит — и в ленте, и в исходнике.
    await page.goto(tripUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: tripTitle })).toBeVisible();
    // Именно строка брони в ленте, а не любое совпадение по тексту:
    // название отеля мелькает ещё и в подписях форм правки/удаления.
    await expect(page.locator(".booking-leg", { hasText: hotelName }).first()).toBeVisible();

    const ownerHtml = await page.content();
    for (const secret of [hotelName, address, bookingNote, ...bookingMarkup]) {
      expect(ownerHtml, `владелец должен видеть «${secret}»`).toContain(secret);
    }

    // 2. Посторонний залогиненный открывает ту же публичную поездку.
    // Контекст свой: чужая сессия из storageState сюда не наследуется,
    // но на всякий случай начинаем с чистых кук.
    await strangerContext.clearCookies();
    const strangerPage = await strangerContext.newPage();
    await signupTestUser(strangerPage, strangerEmail, PASSWORD);
    await strangerPage.goto(tripUrl, { waitUntil: "domcontentloaded" });

    // Страница действительно открылась (не 404 и не редирект на вход) —
    // иначе «брони нет» было бы правдой по неинтересной причине.
    await expect(strangerPage.getByRole("heading", { name: tripTitle })).toBeVisible();

    const strangerHtml = await strangerPage.content();
    for (const secret of [hotelName, address, bookingNote, ...bookingMarkup]) {
      expect(strangerHtml, `посторонний не должен получать «${secret}»`).not.toContain(secret);
    }
  } finally {
    runDbScript("delete-test-trip.ts", tripId);
    runDbScript("cleanup-test-user.ts", strangerEmail);
    await strangerContext.close();
  }
});
