import { test, expect, type BrowserContext } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";

/**
 * Совместная поездка целиком: кто что видит и что попадает в ленту.
 *
 * Спека самодостаточная — данные заводит своим tsx-процессом
 * (create-shared-trip-fixture.ts) и ходит по сессиям куками, минуя форму
 * входа: у неё лимит попыток, и три входа за спеку его быстро съедали.
 *
 * Проверяются три вещи, которые уже ломались (найдено проверкой
 * 2026-09-06):
 *   1. рамка поездки накрывает окна ВСЕХ участников — иначе событие в
 *      день, до которого доехала только подруга, не видно никому;
 *   2. приватная бронь принадлежит АВТОРУ, а не владельцу поездки;
 *   3. отметки «прилетает/улетает» видны только участникам.
 */

type Fixture = {
  tag: string;
  slug: string;
  ownerSession: string;
  memberSession: string;
  strangerSession: string;
};

let fx: Fixture;

test.beforeAll(() => {
  const out = execFileSync(
    "npx",
    ["tsx", path.join(__dirname, "create-shared-trip-fixture.ts")],
    { encoding: "utf8", cwd: path.join(__dirname, "../..") },
  );
  fx = JSON.parse(out.trim().split("\n").pop()!);
});

test.afterAll(() => {
  execFileSync(
    "npx",
    ["tsx", path.join(__dirname, "create-shared-trip-fixture.ts"), "--clean"],
    { encoding: "utf8", cwd: path.join(__dirname, "../..") },
  );
});

/** Контекст нужного зрителя: сессия куками, согласие на куки — тоже
 *  (баннер иначе перекрывает низ страницы). */
async function viewerText(
  context: BrowserContext,
  session: string | null,
  url: string,
): Promise<string> {
  await context.clearCookies();
  await context.addCookies([
    { name: "cookie_consent", value: "all", url: "http://localhost:3001" },
    ...(session
      ? [{ name: "user_session", value: session, url: "http://localhost:3001" }]
      : []),
  ]);
  const page = await context.newPage();
  await page.goto(url);
  // textContent, а не innerText: у длинных списков стоит
  // content-visibility, и innerText молча пропускает всё, что сейчас за
  // экраном, — проверка «этого нет на странице» начинала врать.
  const text = (await page.locator("body").textContent()) ?? "";
  await page.close();
  return text;
}

test("владелец видит свой план, но не чужое приватное", async ({ context, baseURL }) => {
  const text = await viewerText(context, fx.ownerSession, `${baseURL}/ru/trips/${fx.slug}`);
  expect(text).toContain(`${fx.tag} ужин участникам`);
  expect(text).toContain(`${fx.tag} массаж только мой`);
  expect(text).toContain(`${fx.tag} дело участникам`);
  // Приватная бронь подруги — её, а не владельца.
  expect(text).not.toContain(`${fx.tag} рейс подруги`);
});

test("рамка поездки накрывает окно участницы", async ({ context, baseURL }) => {
  const text = await viewerText(context, fx.ownerSession, `${baseURL}/ru/trips/${fx.slug}`);
  // Событие 4 ноября — за датами поездки, но внутри окна подруги.
  expect(text).toContain(`${fx.tag} поздний фанмит`);
});

test("участница видит свою бронь и свои отметки", async ({ context, baseURL }) => {
  const text = await viewerText(context, fx.memberSession, `${baseURL}/ru/trips/${fx.slug}`);
  expect(text).toContain(`${fx.tag} рейс подруги`);
  expect(text).toMatch(/вы прилетаете/);
  expect(text).not.toContain(`${fx.tag} массаж только мой`);
});

test("посторонним — ни записей, ни отметок, а события заглушками", async ({
  context,
  baseURL,
}) => {
  for (const session of [fx.strangerSession, null]) {
    const text = await viewerText(context, session, `${baseURL}/ru/trips/${fx.slug}`);
    // Поездка публичная — сама страница открыта.
    expect(text).toContain(`${fx.tag} поездка`);
    // Но чужие записи и планы — нет.
    expect(text).not.toContain(`${fx.tag} ужин участникам`);
    expect(text).not.toContain(`${fx.tag} дело участникам`);
    expect(text).not.toContain(`${fx.tag} общий концерт`);
    expect(text).not.toMatch(/прилетает|улетает/);
    expect(text).toMatch(/по подписке/i);
  }
});
