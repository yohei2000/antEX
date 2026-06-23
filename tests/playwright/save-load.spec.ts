import { expect, test } from "@playwright/test";

async function waitForSimulation(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__ANT_SIM_READY === true);
}

test("persists colony state through localStorage", async ({ page }) => {
  await waitForSimulation(page);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 321;
    sim.colony.lifetimeFood = 654;
    sim.colony.antPopulation = 18;
    sim.colony.nestLevel = 2;
    sim.saveColony();
  });

  await page.reload();
  await page.waitForFunction(() => window.__ANT_SIM_READY === true);

  const restored = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    return {
      food: sim.colony.food,
      lifetimeFood: sim.colony.lifetimeFood,
      antPopulation: sim.colony.antPopulation,
      nestLevel: sim.colony.nestLevel,
    };
  });

  expect(restored.food).toBeGreaterThanOrEqual(321);
  expect(restored.lifetimeFood).toBeGreaterThanOrEqual(654);
  expect(restored.antPopulation).toBe(18);
  expect(restored.nestLevel).toBe(2);
});

test("does not persist an unresolved expedition reward on reload", async ({ page }) => {
  await waitForSimulation(page);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 700;
    sim.colony.lifetimeFood = 700;
    sim.colony.antPopulation = 42;
    sim.colony.soldierAnts = 20;
    sim.colony.woundedAnts = 0;
    sim.colony.nestLevel = 5;
    sim.colony.hatchProgress = 0;
    sim.colony.territory = 2;
    sim.colony.enemyThreat = 4;
    sim.colony.battleCooldownUntil = 0;
    sim.paused = true;
    sim.saveColony();
    sim.startExpedition();
  });

  const active = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    return {
      active: Boolean(sim.expeditionSession),
      food: sim.colony.food,
      territory: sim.colony.territory,
    };
  });
  expect(active.active).toBe(true);
  expect(active.food).toBe(700);
  expect(active.territory).toBe(2);

  await page.reload();
  await page.waitForFunction(() => window.__ANT_SIM_READY === true);

  const restored = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    return {
      active: Boolean(sim.expeditionSession),
      food: sim.colony.food,
      territory: sim.colony.territory,
    };
  });

  expect(restored.active).toBe(false);
  expect(restored.food).toBe(700);
  expect(restored.territory).toBe(2);
});
