import { expect, test } from "@playwright/test";

test("boots the game with a live canvas and simulation state", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));

  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(
    () => window.__ANT_SIM_READY === true && Boolean(document.querySelector("#world3d canvas")),
    null,
    { timeout: 20_000 },
  );

  const canvas = page.locator("#world3d canvas");
  await expect(canvas).toBeVisible();

  const state = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const canvasElement = document.querySelector("#world3d canvas") as HTMLCanvasElement;
    const bounds = canvasElement.getBoundingClientRect();
    return {
      antCount: sim.ants?.length ?? 0,
      gameStatus: sim.colony?.gameStatus,
      nestLevel: sim.colony?.nestLevel,
      hasRenderer: Boolean(sim.renderer && sim.scene && sim.camera),
      canvasWidth: canvasElement.width,
      canvasHeight: canvasElement.height,
      visibleWidth: bounds.width,
      visibleHeight: bounds.height,
    };
  });

  expect(state.antCount).toBeGreaterThan(0);
  expect(state.gameStatus).toBe("playing");
  expect(state.nestLevel).toBeGreaterThanOrEqual(1);
  expect(state.hasRenderer).toBe(true);
  expect(state.canvasWidth).toBeGreaterThan(0);
  expect(state.canvasHeight).toBeGreaterThan(0);
  expect(state.visibleWidth).toBeGreaterThan(100);
  expect(state.visibleHeight).toBeGreaterThan(100);
  expect(browserErrors).toEqual([]);
});
