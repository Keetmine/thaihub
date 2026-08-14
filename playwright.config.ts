import { defineConfig } from "@playwright/test";

// Smoke tests run against an already-running dev server (this project's
// Postgres data lives on the developer's machine — we don't want Playwright
// spinning up a second instance against the same DB). Start `npm run dev`
// yourself first; override the port with BASE_URL if it's not 3001.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
});
