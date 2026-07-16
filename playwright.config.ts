import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const port = Number(process.env.PORT || 4173);
const baseURL = `http://127.0.0.1:${port}/`;
const requestedWorkers = Number(process.env.PLAYWRIGHT_WORKERS);
const workers = Number.isFinite(requestedWorkers) && requestedWorkers > 0
  ? Math.floor(requestedWorkers)
  : isCI ? 2 : 1;

export default defineConfig({
  testDir: "tests/playwright",
  globalSetup: "./tests/playwright/global-setup.ts",
  outputDir: "test-results",
  fullyParallel: false,
  workers,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
});
