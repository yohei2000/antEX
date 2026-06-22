import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const hasEvalServer = existsSync(resolve(".eval-server.json"));

const webServer =
  process.env.ANTEX_SKIP_WEBSERVER === "1"
    ? undefined
    : {
        command: "node ./scripts/playwright-webserver.mjs",
        url: "http://127.0.0.1:4173/",
        reuseExistingServer: hasEvalServer || !process.env.CI,
        timeout: 120_000,
      };

export default defineConfig({
  testDir: "tests/playwright",
  fullyParallel: true,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173/",
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
