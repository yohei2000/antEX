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
    sim.colony.upgrades = {
      foragerTrails: 1,
      storageChambers: 2,
      broodNursery: 1,
      queenCare: 0,
      soldierTraining: 0,
      nestGuard: 0,
    };
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
      storageChambers: sim.colony.upgrades.storageChambers,
      chamberExcavation: sim.colony.upgrades.chamberExcavation,
      trailPheromones: sim.colony.upgrades.trailPheromones,
    };
  });

  expect(restored.food).toBeGreaterThanOrEqual(321);
  expect(restored.lifetimeFood).toBeGreaterThanOrEqual(654);
  expect(restored.antPopulation).toBe(18);
  expect(restored.nestLevel).toBe(2);
  expect(restored.storageChambers).toBe(2);
  expect(restored.chamberExcavation).toBe(0);
  expect(restored.trailPheromones).toBe(0);
});
