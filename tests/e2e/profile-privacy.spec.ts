import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";
import {
  PROFILE_OWNER_EMAIL,
  PROFILE_TEST_PASSWORD,
  PROFILE_VIEWER_EMAIL,
  PRIVATE_REVIEW_TEXT,
  PRIVATE_TRIP_TITLE,
  PUBLIC_REVIEW_TEXT,
  PUBLIC_TRIP_TITLE,
} from "./testProfileFixtures";

// Единая страница профиля /users/[id] (редизайн: кабинет объединён с
// публичным профилем). Приватность проверяется по-настоящему — вторым
// фикстурным пользователем и содержимым HTML: чужой приватный отзыв,
// приватная поездка и email владельца не должны попадать даже в
// page.content() (панели вкладок смонтированы с display:none, так что
// content() видит и «скрытые» вкладки — это и есть проверка серверных
// выборок).

const root = path.join(__dirname, "../..");
let ownerId = "";

test.beforeAll(() => {
  const out = execFileSync(
    "npx",
    ["tsx", path.join(__dirname, "create-profile-fixtures.ts")],
    { cwd: root },
  ).toString();
  ownerId = JSON.parse(out.trim().split("\n").pop()!).ownerId;
});

test.afterAll(() => {
  execFileSync("npx", ["tsx", path.join(__dirname, "delete-profile-fixtures.ts")], { cwd: root });
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PROFILE_TEST_PASSWORD);
  await page.click('button[type="submit"]');
  // /account — permanent redirect на страницу профиля.
  await page.waitForURL(/\/users\//);
}

test("чужой профиль не отдаёт зрителю приватного даже в HTML", async ({ page }) => {
  await login(page, PROFILE_VIEWER_EMAIL);
  await page.goto(`/users/${ownerId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".profile-side-name")).toBeVisible();

  const html = await page.content();
  // Приватный отзыв и приватная поездка — не просто спрятаны, их нет в
  // разметке вовсе (фильтр в серверной выборке).
  expect(html).not.toContain(PRIVATE_REVIEW_TEXT);
  expect(html).not.toContain(PRIVATE_TRIP_TITLE);
  // Email владельца зрителю не показывается нигде.
  expect(html).not.toContain(PROFILE_OWNER_EMAIL);
  // Билеты — вкладка только для себя.
  expect(html).not.toMatch(/Tickets \(/);
  // Публичное при этом на месте: отзыв и публичная поездка.
  expect(html).toContain(PUBLIC_REVIEW_TEXT);
  expect(html).toContain(PUBLIC_TRIP_TITLE);

  // На чужом профиле нет «Настроек»/«Выйти», зато есть «В друзья».
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add friend" })).toBeVisible();
});

test("свой профиль открывается по прямой ссылке и через /account", async ({ page }) => {
  await login(page, PROFILE_OWNER_EMAIL);

  // Свой профиль по id больше НЕ редиректит в кабинет (жалоба
  // владельца) — открывается как страница с «Настройками» и «Выйти».
  await page.goto(`/users/${ownerId}`, { waitUntil: "domcontentloaded" });
  expect(new URL(page.url()).pathname).toBe(`/users/${ownerId}`);
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  // Своё приватное владелец видит: отзыв с бейджем и приватная поездка.
  const html = await page.content();
  expect(html).toContain(PRIVATE_REVIEW_TEXT);
  expect(html).toContain(PRIVATE_TRIP_TITLE);

  // Сохранённые ссылки кабинета живы: /account?tab=reviews приводит на
  // вкладку отзывов профиля.
  await page.goto("/account?tab=reviews", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/users\/.*tab=reviews/);
  // Текст отзыва есть и в скрытой панели «Обзора» (блок «Свежие
  // отзывы») — проверяем именно видимый экземпляр.
  await expect(page.locator("p:visible", { hasText: PRIVATE_REVIEW_TEXT })).toBeVisible();
  // Бейдж приватности есть и в ленте «Обзора» (панель смонтирована, но
  // скрыта display:none), поэтому ищем именно видимый. Текст бейджа —
  // «Private» (переименование этой же волны в reviews-словаре).
  await expect(
    page.locator("span.badge:visible", { hasText: "Private" }).first(),
  ).toBeVisible();
});
