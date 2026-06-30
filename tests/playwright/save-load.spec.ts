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
    sim.colony.soldierAnts = 6;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.shieldHeadAnts = 1;
    sim.colony.acidShooterAnts = 1;
    sim.colony.scoutAnts = 1;
    sim.colony.medicAnts = 1;
    sim.colony.captainAnts = 1;
    sim.colony.builderAnts = 2;
    sim.colony.nestLevel = 2;
    sim.colony.upgrades = {
      foragerTrails: 1,
      storageChambers: 2,
      chamberExcavation: 1,
      broodNursery: 1,
      queenCare: 0,
      soldierTraining: 1,
      heavySoldierBrood: 1,
      shieldHeadBrood: 1,
      acidShooterBrood: 1,
      scoutBrood: 1,
      medicBrood: 1,
      captainBrood: 1,
      builderTraining: 1,
      nestGuard: 0,
    };
    sim.addEarthwork({
      id: sim.colony.nextEarthworkId++,
      kind: "earthWall",
      x: sim.nest.x + 12,
      z: sim.nest.z + 5,
      radius: 14,
      progress: 7.2,
      maxProgress: 7.2,
      rotation: 0.2,
      owner: "colony",
    });
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
      shieldHeadAnts: sim.colony.shieldHeadAnts,
      acidShooterAnts: sim.colony.acidShooterAnts,
      scoutAnts: sim.colony.scoutAnts,
      medicAnts: sim.colony.medicAnts,
      captainAnts: sim.colony.captainAnts,
      builderAnts: sim.colony.builderAnts,
      nestLevel: sim.colony.nestLevel,
      storageChambers: sim.colony.upgrades.storageChambers,
      chamberExcavation: sim.colony.upgrades.chamberExcavation,
      heavySoldierBrood: sim.colony.upgrades.heavySoldierBrood,
      shieldHeadBrood: sim.colony.upgrades.shieldHeadBrood,
      acidShooterBrood: sim.colony.upgrades.acidShooterBrood,
      scoutBrood: sim.colony.upgrades.scoutBrood,
      medicBrood: sim.colony.upgrades.medicBrood,
      captainBrood: sim.colony.upgrades.captainBrood,
      builderTraining: sim.colony.upgrades.builderTraining,
      trailPheromones: sim.colony.upgrades.trailPheromones,
      fallenAnts: sim.colony.fallenAnts,
      raidPhase: sim.colony.raidState.phase,
      raidTimer: sim.colony.raidState.timer,
      raidCasualties: sim.colony.raidState.casualties,
      raidEnemyCasualties: sim.colony.raidState.enemyCasualties,
      earthworks: sim.colony.earthworks.length,
      liveEarthworks: sim.earthworks.length,
      earthworkKind: sim.earthworks[0]?.kind,
      earthworkStrength: sim.earthworks[0]?.strength,
    };
  });

  expect(restored.food).toBeGreaterThan(320.9);
  expect(restored.lifetimeFood).toBeGreaterThanOrEqual(654);
  expect(restored.antPopulation).toBe(18);
  expect(restored.soldierAnts).toBe(6);
  expect(restored.heavySoldierAnts).toBe(1);
  expect(restored.shieldHeadAnts).toBe(1);
  expect(restored.acidShooterAnts).toBe(1);
  expect(restored.scoutAnts).toBe(1);
  expect(restored.medicAnts).toBe(1);
  expect(restored.captainAnts).toBe(1);
  expect(restored.builderAnts).toBe(2);
  expect(restored.nestLevel).toBe(2);
  expect(restored.storageChambers).toBe(2);
  expect(restored.chamberExcavation).toBe(1);
  expect(restored.heavySoldierBrood).toBe(1);
  expect(restored.shieldHeadBrood).toBe(1);
  expect(restored.acidShooterBrood).toBe(1);
  expect(restored.scoutBrood).toBe(1);
  expect(restored.medicBrood).toBe(1);
  expect(restored.captainBrood).toBe(1);
  expect(restored.builderTraining).toBe(1);
  expect(restored.trailPheromones).toBe(0);
  expect(restored.fallenAnts).toBe(0);
  expect(restored.raidPhase).toBe("calm");
  expect(restored.raidTimer).toBeGreaterThan(0);
  expect(restored.raidCasualties).toBe(0);
  expect(restored.raidEnemyCasualties).toBe(0);
  expect(restored.earthworks).toBe(1);
  expect(restored.liveEarthworks).toBe(1);
  expect(restored.earthworkKind).toBe("earthWall");
  expect(restored.earthworkStrength).toBeGreaterThan(0.95);
});

test("migrates old colony saves without variant fields", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ant3d.colonyState", JSON.stringify({
      version: 4,
      food: 90,
      lifetimeFood: 120,
      antPopulation: 14,
      soldierAnts: 2,
      woundedAnts: 0,
      nestLevel: 1,
      territory: 0,
      enemyThreat: 6,
      fallenAnts: 0,
      hatchProgress: 0,
      battleCooldownUntil: 0,
      upgrades: {
        foragerTrails: 1,
        storageChambers: 0,
        broodNursery: 0,
        queenCare: 0,
        soldierTraining: 0,
        nestGuard: 0,
      },
      battleLog: ["old save"],
      lastSavedAt: Date.now(),
    }));
  });
  await waitForSimulation(page);

  const migrated = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    return {
      version: sim.colony.version,
      heavySoldierAnts: sim.colony.heavySoldierAnts,
      shieldHeadAnts: sim.colony.shieldHeadAnts,
      acidShooterAnts: sim.colony.acidShooterAnts,
      scoutAnts: sim.colony.scoutAnts,
      medicAnts: sim.colony.medicAnts,
      captainAnts: sim.colony.captainAnts,
      builderAnts: sim.colony.builderAnts,
      nextEarthworkId: sim.colony.nextEarthworkId,
      heavySoldierBrood: sim.colony.upgrades.heavySoldierBrood,
      shieldHeadBrood: sim.colony.upgrades.shieldHeadBrood,
      acidShooterBrood: sim.colony.upgrades.acidShooterBrood,
      scoutBrood: sim.colony.upgrades.scoutBrood,
      medicBrood: sim.colony.upgrades.medicBrood,
      captainBrood: sim.colony.upgrades.captainBrood,
      builderTraining: sim.colony.upgrades.builderTraining,
      renderedAnts: sim.ants.length,
      variantCounts: sim.ants.reduce((counts: Record<string, number>, ant: any) => {
        counts[ant.variant] = (counts[ant.variant] ?? 0) + 1;
        return counts;
      }, {}),
    };
  });

  expect(migrated.version).toBe(11);
  expect(migrated.heavySoldierAnts).toBe(0);
  expect(migrated.shieldHeadAnts).toBe(0);
  expect(migrated.acidShooterAnts).toBe(0);
  expect(migrated.scoutAnts).toBe(0);
  expect(migrated.medicAnts).toBe(0);
  expect(migrated.captainAnts).toBe(0);
  expect(migrated.builderAnts).toBe(0);
  expect(migrated.nextEarthworkId).toBe(1);
  expect(migrated.heavySoldierBrood).toBe(0);
  expect(migrated.shieldHeadBrood).toBe(0);
  expect(migrated.acidShooterBrood).toBe(0);
  expect(migrated.scoutBrood).toBe(0);
  expect(migrated.medicBrood).toBe(0);
  expect(migrated.captainBrood).toBe(0);
  expect(migrated.builderTraining).toBe(0);
  expect(migrated.renderedAnts).toBe(12);
  expect(migrated.variantCounts.worker).toBe(12);
});
