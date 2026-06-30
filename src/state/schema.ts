import type { ConstructionKind } from "../config/construction";
import type { BarracksTrainingVariant } from "../config/barracks";

export type RaidPhase = "calm" | "warning" | "active" | "retreating" | "recovering";

export interface RaidState {
  phase: RaidPhase;
  timer: number;
  wave: number;
  activeCount: number;
  approachAngle: number;
  signalTimer: number;
  breachTimer: number;
  casualties: number;
  enemyCasualties: number;
  startFallenAnts: number | null;
  lastOutcome: string;
}

export type EarthworkKind = ConstructionKind;

export interface EarthworkState {
  id: number;
  kind: EarthworkKind;
  x: number;
  z: number;
  radius: number;
  progress: number;
  maxProgress: number;
  rotation: number;
  owner: "colony";
}

export interface BarracksTrainingItem {
  id: number;
  variant: BarracksTrainingVariant;
  foodCost: number;
  totalSeconds: number;
  remainingSeconds: number;
}

export interface ColonyState {
  version: number;
  food: number;
  lifetimeFood: number;
  antPopulation: number;
  soldierAnts: number;
  heavySoldierAnts: number;
  shieldHeadAnts: number;
  acidShooterAnts: number;
  scoutAnts: number;
  medicAnts: number;
  captainAnts: number;
  builderAnts: number;
  woundedAnts: number;
  attackPower: number;
  defensePower: number;
  nestLevel: number;
  territory: number;
  enemyThreat: number;
  fallenAnts: number;
  hatchProgress: number;
  battleCooldownUntil: number;
  raidState: RaidState;
  nextEarthworkId: number;
  earthworks: EarthworkState[];
  nextBarracksOrderId: number;
  barracksQueue: BarracksTrainingItem[];
  unlockedEnemyColonies: string[];
  upgrades: Record<string, number>;
  battleLog: string[];
  lastSavedAt: number;
}

export interface DerivedColonyState {
  capacity: number;
  activeAnts: number;
  soldierTarget: number;
  heavyTarget: number;
  shieldHeadTarget: number;
  acidShooterTarget: number;
  scoutTarget: number;
  medicTarget: number;
  captainTarget: number;
  builderTarget: number;
  soldierAnts: number;
  normalSoldiers: number;
  heavySoldiers: number;
  shieldHeads: number;
  acidShooters: number;
  scouts: number;
  medics: number;
  captains: number;
  builders: number;
  workers: number;
  foodRate: number;
  antCost: number;
  growthPerSecond: number;
  recoveryPerSecond: number;
  attackPower: number;
  defensePower: number;
  threatGrowthMultiplier: number;
  foragedFoodMultiplier: number;
  upkeepPerSecond: number;
}
