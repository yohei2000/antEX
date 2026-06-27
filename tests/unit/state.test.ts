import { describe, expect, it } from "vitest";
import { UPGRADE_DEFS, upgradeCost, upgradeName } from "../../src/config/upgrades";
import { createDefaultColony } from "../../src/state/colony";
import { computeDerivedColony } from "../../src/state/derived";
import { migrateColony } from "../../src/state/migrations";

describe("colony state modules", () => {
  it("creates the same default colony shape used by the browser game", () => {
    const colony = createDefaultColony();

    expect(colony.version).toBe(6);
    expect(colony.food).toBe(36);
    expect(colony.lifetimeFood).toBe(36);
    expect(colony.antPopulation).toBe(12);
    expect(colony.soldierAnts).toBe(1);
    expect(colony.heavySoldierAnts).toBe(0);
    expect(colony.builderAnts).toBe(0);
    expect(colony.raidState.phase).toBe("calm");
    expect(colony.raidState.timer).toBe(78);
    expect(colony.nextEarthworkId).toBe(1);
    expect(colony.earthworks).toEqual([]);
    expect(Object.keys(colony.upgrades).sort()).toEqual(UPGRADE_DEFS.map((upgrade) => upgrade.id).sort());
  });

  it("normalizes old save fragments without changing the save version", () => {
    const colony = migrateColony({
      version: 1,
      food: 321,
      lifetimeFood: 654,
      antPopulation: 18,
      soldierAnts: 40,
      heavySoldierAnts: 99,
      builderAnts: 99,
      nestLevel: 2,
      nextEarthworkId: -4,
      earthworks: [
        {
          id: 3,
          kind: "earthWall",
          x: 999,
          z: -999,
          radius: 100,
          progress: 40,
          maxProgress: 12,
          rotation: 0.5,
        },
      ],
      upgrades: {
        storageChambers: 2,
      },
      raidState: {
        phase: "active",
        timer: 2,
        activeCount: 99,
        casualties: 7,
      },
      battleLog: ["a", "b", "c", "d", "e", "f"],
    });

    expect(colony.version).toBe(6);
    expect(colony.food).toBe(321);
    expect(colony.lifetimeFood).toBe(654);
    expect(colony.antPopulation).toBe(18);
    expect(colony.soldierAnts).toBe(18);
    expect(colony.heavySoldierAnts).toBe(18);
    expect(colony.builderAnts).toBe(0);
    expect(colony.upgrades.storageChambers).toBe(2);
    expect(colony.upgrades.chamberExcavation).toBe(0);
    expect(colony.raidState.phase).toBe("warning");
    expect(colony.raidState.timer).toBe(6);
    expect(colony.raidState.activeCount).toBe(40);
    expect(colony.raidState.casualties).toBe(7);
    expect(colony.nextEarthworkId).toBe(4);
    expect(colony.earthworks).toEqual([
      {
        id: 3,
        kind: "earthWall",
        x: 180,
        z: -180,
        radius: 24,
        progress: 12,
        maxProgress: 12,
        rotation: 0.5,
        owner: "colony",
      },
    ]);
    expect(colony.battleLog).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps derived growth and upgrade calculations stable", () => {
    const base = createDefaultColony();
    const baseDerived = computeDerivedColony(base);
    expect(baseDerived.capacity).toBe(28);
    expect(baseDerived.activeAnts).toBe(12);
    expect(baseDerived.soldierTarget).toBe(0);
    expect(baseDerived.soldierAnts).toBe(1);
    expect(baseDerived.normalSoldiers).toBe(1);
    expect(baseDerived.heavySoldiers).toBe(0);
    expect(baseDerived.builders).toBe(0);
    expect(baseDerived.workers).toBe(11);
    expect(baseDerived.foodRate).toBeCloseTo(1.197, 6);
    expect(baseDerived.foragedFoodMultiplier).toBe(3);
    expect(baseDerived.attackPower).toBe(1.002);
    expect(baseDerived.defensePower).toBe(1);

    const scenario = createDefaultColony();
    scenario.food = 1000000;
    scenario.lifetimeFood = 1000000;
    scenario.antPopulation = 60;
    scenario.soldierAnts = 5;
    scenario.nestLevel = 4;
    scenario.territory = 5;
    for (const upgrade of UPGRADE_DEFS) scenario.upgrades[upgrade.id] = 0;
    const scenarioBase = computeDerivedColony(scenario);

    const maxed = createDefaultColony();
    maxed.food = 1000000;
    maxed.lifetimeFood = 1000000;
    maxed.antPopulation = 60;
    maxed.soldierAnts = 5;
    maxed.nestLevel = 4;
    maxed.territory = 5;
    for (const upgrade of UPGRADE_DEFS) maxed.upgrades[upgrade.id] = upgrade.max;
    const maxedDerived = computeDerivedColony(maxed);

    expect(maxedDerived.foodRate / scenarioBase.foodRate).toBeGreaterThan(3);
    expect(maxedDerived.foodRate / scenarioBase.foodRate).toBeLessThan(4.6);
    expect(maxedDerived.growthPerSecond / scenarioBase.growthPerSecond).toBeGreaterThan(5);
    expect(maxedDerived.growthPerSecond / scenarioBase.growthPerSecond).toBeLessThan(7.6);
    expect(maxedDerived.attackPower).toBeLessThan(2.2);
    expect(maxedDerived.defensePower).toBeLessThan(2.8);
    expect(maxedDerived.threatGrowthMultiplier).toBeGreaterThanOrEqual(0.55);
  });

  it("keeps upgrade helper outputs stable", () => {
    const storage = UPGRADE_DEFS.find((upgrade) => upgrade.id === "storageChambers");
    if (!storage) throw new Error("storageChambers upgrade missing");

    expect(upgradeCost(storage, 0)).toBe(85);
    expect(upgradeCost(storage, 2)).toBe(306);
    expect(upgradeName("sentinelPosts")).toBe("見張り口");
    expect(upgradeName("unknownUpgrade")).toBe("unknownUpgrade");
  });
});
