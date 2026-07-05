import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const hasEvalServer = existsSync(resolve(".eval-server.json"));
const port = Number(process.env.PORT || 4173);
const baseURL = `http://127.0.0.1:${port}/`;
const reuseExistingServer = hasEvalServer || process.env.ANTEX_REUSE_WEBSERVER === "1";

const webServer =
  process.env.ANTEX_SKIP_WEBSERVER === "1"
    ? undefined
    : {
        command: "node ./scripts/playwright-webserver.mjs",
        url: baseURL,
        reuseExistingServer,
        timeout: 120_000,
      };

export default defineConfig({
  testDir: "tests/playwright",
  fullyParallel: true,
  workers: process.env.CI ? undefined : 2,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  ...(webServer ? { webServer } : {}),
  projects: [
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        channel: "chrome",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
});
