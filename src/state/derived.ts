import { BUILDERS_PER_TRAINING, FOOD_INCOME_MULTIPLIER } from "../config/balance";
import { upgradeLevel } from "../config/upgrades";
import { getAntVariantConfig } from "../config/variants";
import { clamp } from "../shared/math";
import type { ColonyState, DerivedColonyState } from "./schema";

export interface ComputeDerivedOptions {
  earthworkProductionBonus?: number;
}

export function computeDerivedColony(colony: ColonyState, options: ComputeDerivedOptions = {}): DerivedColonyState {
  const upgrades = colony.upgrades;
  const foragerTrails = upgradeLevel(upgrades, "foragerTrails");
  const trailPheromones = upgradeLevel(upgrades, "trailPheromones");
  const storageChambers = upgradeLevel(upgrades, "storageChambers");
  const chamberExcavation = upgradeLevel(upgrades, "chamberExcavation");
  const ventilationShafts = upgradeLevel(upgrades, "ventilationShafts");
  const wasteGallery = upgradeLevel(upgrades, "wasteGallery");
  const broodNursery = upgradeLevel(upgrades, "broodNursery");
  const broodClimate = upgradeLevel(upgrades, "broodClimate");
  const foodDistribution = upgradeLevel(upgrades, "foodDistribution");
  const queenCare = upgradeLevel(upgrades, "queenCare");
  const soldierTraining = upgradeLevel(upgrades, "soldierTraining");
  const heavySoldierBrood = upgradeLevel(upgrades, "heavySoldierBrood");
  const shieldHeadBrood = upgradeLevel(upgrades, "shieldHeadBrood");
  const acidShooterBrood = upgradeLevel(upgrades, "acidShooterBrood");
  const scoutBrood = upgradeLevel(upgrades, "scoutBrood");
  const medicBrood = upgradeLevel(upgrades, "medicBrood");
  const captainBrood = upgradeLevel(upgrades, "captainBrood");
  const builderTraining = upgradeLevel(upgrades, "builderTraining");
  const nestGuard = upgradeLevel(upgrades, "nestGuard");
  const sentinelPosts = upgradeLevel(upgrades, "sentinelPosts");

  const capacity = Math.floor(
    18 +
    colony.nestLevel * 10 +
    storageChambers * 12 +
    chamberExcavation * 10 +
    ventilationShafts * 4 +
    colony.territory * 3,
  );
  const activeAnts = Math.max(0, colony.antPopulation - colony.woundedAnts);
  const soldierTarget = Math.floor(colony.antPopulation * (0.08 + soldierTraining * 0.023 + sentinelPosts * 0.004));
  const soldierAnts = Math.floor(clamp(colony.soldierAnts, 0, activeAnts));
  const heavyTarget = Math.min(soldierAnts, heavySoldierBrood);
  const heavySoldiers = Math.floor(clamp(colony.heavySoldierAnts, 0, heavyTarget));
  const shieldHeadTarget = Math.min(Math.max(0, soldierAnts - heavySoldiers), shieldHeadBrood);
  const shieldHeads = Math.floor(clamp(colony.shieldHeadAnts, 0, shieldHeadTarget));
  const acidShooterTarget = Math.min(Math.max(0, soldierAnts - heavySoldiers - shieldHeads), acidShooterBrood);
  const acidShooters = Math.floor(clamp(colony.acidShooterAnts, 0, acidShooterTarget));
  const scoutTarget = Math.min(Math.max(0, soldierAnts - heavySoldiers - shieldHeads - acidShooters), scoutBrood);
  const scouts = Math.floor(clamp(colony.scoutAnts, 0, scoutTarget));
  const medicTarget = Math.min(Math.max(0, soldierAnts - heavySoldiers - shieldHeads - acidShooters - scouts), medicBrood);
  const medics = Math.floor(clamp(colony.medicAnts, 0, medicTarget));
  const captainTarget = Math.min(Math.max(0, soldierAnts - heavySoldiers - shieldHeads - acidShooters - scouts - medics), captainBrood);
  const captains = Math.floor(clamp(colony.captainAnts, 0, captainTarget));
  const availableWorkers = Math.max(0, activeAnts - soldierAnts);
  const builderTarget = Math.min(availableWorkers, builderTraining * BUILDERS_PER_TRAINING);
  const builders = Math.floor(clamp(colony.builderAnts, 0, builderTarget));
  const normalSoldiers = Math.max(0, soldierAnts - heavySoldiers - shieldHeads - acidShooters - scouts - medics - captains);
  const workers = Math.max(0, availableWorkers - builders);
  const foragingBonus = 1 + foragerTrails * 0.24 + trailPheromones * 0.07 + foodDistribution * 0.025;
  const trafficBonus = 1 + chamberExcavation * 0.035 + ventilationShafts * 0.018;
  const baseFoodRate =
    (workers * getAntVariantConfig("worker").forageEfficiency + builders * getAntVariantConfig("builder").forageEfficiency) *
      0.034 *
      foragingBonus *
      trafficBonus *
      (1 + (options.earthworkProductionBonus ?? 0)) +
    colony.territory * 0.075 +
    colony.nestLevel * 0.025 +
    storageChambers * 0.012;
  const foodRate = baseFoodRate * FOOD_INCOME_MULTIPLIER;
  const distributionDiscount = clamp(1 - foodDistribution * 0.025 - storageChambers * 0.008, 0.78, 1);
  const antCost = (5.5 + colony.nestLevel * 1.3 + colony.antPopulation * 0.035) * distributionDiscount;
  const growthPerSecond =
    (0.017 + queenCare * 0.0058 + broodNursery * 0.0038 + broodClimate * 0.003 + foodDistribution * 0.0012) *
    clamp(colony.food / Math.max(antCost * 2, 1), 0.18, 1) *
    (1 + ventilationShafts * 0.008);
  const recoveryPerSecond = 0.006 + broodNursery * 0.0025 + nestGuard * 0.0032 + wasteGallery * 0.0026 + broodClimate * 0.0008 + medics * 0.0009;
  const attackPower = 1 + soldierTraining * 0.15 + sentinelPosts * 0.03 + normalSoldiers * 0.002 + heavySoldiers * 0.01 + shieldHeads * 0.004 + acidShooters * 0.006 + scouts * 0.003 + medics * 0.001 + captains * 0.005;
  const defensePower =
    1 + nestGuard * 0.18 + sentinelPosts * 0.1 + ventilationShafts * 0.02 + wasteGallery * 0.03 + heavySoldiers * 0.035 + shieldHeads * 0.045 + medics * 0.008;
  const threatGrowthMultiplier = clamp(1 - wasteGallery * 0.055 - sentinelPosts * 0.03 - ventilationShafts * 0.015, 0.55, 1);
  const foragedFoodMultiplier = (1 + foodDistribution * 0.025 + storageChambers * 0.01) * FOOD_INCOME_MULTIPLIER;
  const upkeepPerSecond =
    normalSoldiers * getAntVariantConfig("soldier").upkeep +
    heavySoldiers * getAntVariantConfig("heavySoldier").upkeep +
    shieldHeads * getAntVariantConfig("shieldHead").upkeep +
    acidShooters * getAntVariantConfig("acidShooter").upkeep +
    scouts * getAntVariantConfig("scout").upkeep +
    medics * getAntVariantConfig("medic").upkeep +
    captains * getAntVariantConfig("captain").upkeep +
    builders * getAntVariantConfig("builder").upkeep;
  return {
    capacity,
    activeAnts,
    soldierTarget,
    heavyTarget,
    shieldHeadTarget,
    acidShooterTarget,
    scoutTarget,
    medicTarget,
    captainTarget,
    builderTarget,
    soldierAnts,
    normalSoldiers,
    heavySoldiers,
    shieldHeads,
    acidShooters,
    scouts,
    medics,
    captains,
    builders,
    workers,
    foodRate,
    antCost,
    growthPerSecond,
    recoveryPerSecond,
    attackPower,
    defensePower,
    threatGrowthMultiplier,
    foragedFoodMultiplier,
    upkeepPerSecond,
  };
}
