import { RAID_INITIAL_DELAY_SECONDS } from "../config/balance";
import { UPGRADE_DEFS } from "../config/upgrades";
import type { ColonyState, RaidState } from "./schema";

export const COLONY_SAVE_VERSION = 10;

export function createDefaultRaidState(): RaidState {
  return {
    phase: "calm",
    timer: RAID_INITIAL_DELAY_SECONDS,
    wave: 0,
    activeCount: 0,
    approachAngle: -0.25,
    signalTimer: 0,
    breachTimer: 0,
    casualties: 0,
    enemyCasualties: 0,
    startFallenAnts: null,
    lastOutcome: "none",
  };
}

export function createDefaultColony(): ColonyState {
  return {
    version: COLONY_SAVE_VERSION,
    food: 36,
    lifetimeFood: 36,
    antPopulation: 12,
    soldierAnts: 1,
    heavySoldierAnts: 0,
    shieldHeadAnts: 0,
    acidShooterAnts: 0,
    scoutAnts: 0,
    captainAnts: 0,
    builderAnts: 0,
    woundedAnts: 0,
    attackPower: 1,
    defensePower: 1,
    nestLevel: 1,
    territory: 0,
    enemyThreat: 6,
    fallenAnts: 0,
    hatchProgress: 0,
    battleCooldownUntil: 0,
    raidState: createDefaultRaidState(),
    nextEarthworkId: 1,
    earthworks: [],
    unlockedEnemyColonies: ["near-food"],
    upgrades: Object.fromEntries(UPGRADE_DEFS.map((upgrade) => [upgrade.id, 0])),
    battleLog: ["小さな巣が地中で動き始めた"],
    lastSavedAt: Date.now(),
  };
}
