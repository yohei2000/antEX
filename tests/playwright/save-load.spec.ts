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
    sim.colony.soldierAnts = 4;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.builderAnts = 2;
    sim.colony.nestLevel = 2;
    sim.colony.upgrades = {
      foragerTrails: 1,
      storageChambers: 2,
      broodNursery: 1,
      queenCare: 0,
      soldierTraining: 0,
      heavySoldierBrood: 1,
      nestGuard: 0,
      builderTraining: 2,
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
      soldierAnts: sim.colony.soldierAnts,
      heavySoldierAnts: sim.colony.heavySoldierAnts,
      builderAnts: sim.colony.builderAnts,
      nestLevel: sim.colony.nestLevel,
      storageChambers: sim.colony.upgrades.storageChambers,
      chamberExcavation: sim.colony.upgrades.chamberExcavation,
      trailPheromones: sim.colony.upgrades.trailPheromones,
    };
  });

  expect(restored.food).toBeGreaterThan(320.9);
  expect(restored.lifetimeFood).toBeGreaterThanOrEqual(654);
  expect(restored.antPopulation).toBe(18);
  expect(restored.soldierAnts).toBe(4);
  expect(restored.heavySoldierAnts).toBe(1);
  expect(restored.builderAnts).toBe(2);
  expect(restored.nestLevel).toBe(2);
  expect(restored.storageChambers).toBe(2);
  expect(restored.chamberExcavation).toBe(0);
  expect(restored.trailPheromones).toBe(0);
});

test("migrates old colony saves without variant fields", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ant3d.colonyState", JSON.stringify({
      version: 2,
      food: 50,
      lifetimeFood: 50,
      antPopulation: 16,
      soldierAnts: 2,
      woundedAnts: 0,
      nestLevel: 1,
      territory: 0,
      enemyThreat: 6,
      hatchProgress: 0,
      battleCooldownUntil: 0,
      upgrades: { foragerTrails: 1 },
      battleLog: [],
      lastSavedAt: Date.now(),
    }));
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__ANT_SIM_READY === true);

  const migrated = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    return {
      version: sim.colony.version,
      antPopulation: sim.colony.antPopulation,
      soldierAnts: sim.colony.soldierAnts,
      heavySoldierAnts: sim.colony.heavySoldierAnts,
      builderAnts: sim.colony.builderAnts,
      heavyUpgrade: sim.colony.upgrades.heavySoldierBrood,
      builderUpgrade: sim.colony.upgrades.builderTraining,
      variants: sim.ants.map((ant: any) => ant.variant),
    };
  });

  expect(migrated.version).toBe(3);
  expect(migrated.antPopulation).toBe(16);
  expect(migrated.soldierAnts).toBe(2);
  expect(migrated.heavySoldierAnts).toBe(0);
  expect(migrated.builderAnts).toBe(0);
  expect(migrated.heavyUpgrade).toBe(0);
  expect(migrated.builderUpgrade).toBe(0);
  expect(migrated.variants.filter((variant: string) => variant === "soldier")).toHaveLength(2);
});
