import type { BattleArmySeed } from "./sim/simulation";
import type { Side } from "./sim/types";
import { clamp } from "./sim/vector";

export type ExpeditionOutcome = Side | "draw";

export type ExpeditionScenarioInput = {
  activeAnts: number;
  soldierAnts: number;
  attackPower: number;
  defensePower: number;
  territory: number;
  enemyThreat: number;
};

export type ExpeditionArmySeed = BattleArmySeed;

export type ExpeditionScenario = {
  assignedSoldiers: number;
  availableSoldiers: number;
  playerPower: number;
  enemyPower: number;
  winChance: number;
  reward: number;
  cooldownMs: number;
  playerSeed: ExpeditionArmySeed;
  enemySeed: ExpeditionArmySeed;
};

export type ExpeditionResultImpact = {
  foodDelta: number;
  lifetimeFoodDelta: number;
  territoryDelta: number;
  enemyThreatDelta: number;
  woundedDelta: number;
  logMessage: string;
};

export function assignedExpeditionSoldiers(
  soldierAnts: number,
  activeAnts: number,
): number {
  const availableSoldiers = Math.max(
    0,
    Math.floor(Math.min(soldierAnts, activeAnts - 1)),
  );
  return availableSoldiers > 0
    ? Math.max(1, Math.floor(availableSoldiers * 0.65))
    : 0;
}

export function createExpeditionScenario(
  input: ExpeditionScenarioInput,
): ExpeditionScenario {
  const availableSoldiers = Math.max(
    0,
    Math.floor(Math.min(input.soldierAnts, input.activeAnts - 1)),
  );
  const assignedSoldiers = assignedExpeditionSoldiers(
    input.soldierAnts,
    input.activeAnts,
  );
  const playerPower = assignedSoldiers * input.attackPower;
  const enemyPower = 5 + input.territory * 1.8 + input.enemyThreat * 0.42;
  const winChance =
    assignedSoldiers > 0
      ? clamp(playerPower / (playerPower + enemyPower), 0.08, 0.92)
      : 0;
  const reward = Math.floor(
    34 + input.territory * 9 + assignedSoldiers * 4,
  );
  const readiness = clamp(input.defensePower / 1.8, 0.72, 1.28);
  const threatPressure = clamp(input.enemyThreat / 18, 0, 1.2);
  const territoryPressure = clamp(input.territory / 12, 0, 1.1);

  return {
    assignedSoldiers,
    availableSoldiers,
    playerPower,
    enemyPower,
    winChance,
    reward,
    cooldownMs: 45000,
    playerSeed: {
      id: "colony-expedition",
      mass: clamp(72 + assignedSoldiers * 9 + input.attackPower * 12, 64, 210),
      morale: clamp(70 + readiness * 9 - threatPressure * 5, 46, 92),
      cohesion: clamp(66 + readiness * 12 - territoryPressure * 4, 44, 92),
      fatigue: clamp(9 + threatPressure * 9 + territoryPressure * 4, 4, 42),
      toughness: clamp(0.58 + input.defensePower * 0.045, 0.56, 0.78),
      width: clamp(210 + assignedSoldiers * 4, 185, 345),
      depth: 168,
      particleCount: Math.floor(clamp(42 + assignedSoldiers * 3.2, 46, 92)),
      manualControl: false,
    },
    enemySeed: {
      id: "rival-expedition",
      mass: clamp(74 + enemyPower * 4.6, 72, 230),
      morale: clamp(68 + threatPressure * 10 + territoryPressure * 4, 54, 94),
      cohesion: clamp(66 + threatPressure * 9, 52, 94),
      fatigue: clamp(7 - territoryPressure * 2, 4, 18),
      toughness: clamp(0.58 + threatPressure * 0.12, 0.56, 0.82),
      width: clamp(222 + input.territory * 7, 200, 390),
      depth: 176,
      particleCount: Math.floor(clamp(40 + enemyPower * 0.75, 42, 76)),
      manualControl: false,
    },
  };
}

export function expeditionResultImpact(
  scenario: ExpeditionScenario,
  outcome: ExpeditionOutcome,
): ExpeditionResultImpact {
  if (outcome === "player") {
    const woundedDelta = Math.max(0, Math.floor(scenario.assignedSoldiers * 0.08));
    return {
      foodDelta: scenario.reward,
      lifetimeFoodDelta: scenario.reward,
      territoryDelta: 1,
      enemyThreatDelta: -2.5,
      woundedDelta,
      logMessage: `遠征成功: 食料+${scenario.reward} / 領土+1`,
    };
  }
  if (outcome === "enemy") {
    const woundedDelta = Math.max(1, Math.floor(scenario.assignedSoldiers * 0.28));
    return {
      foodDelta: -Math.floor(scenario.reward * 0.35),
      lifetimeFoodDelta: 0,
      territoryDelta: 0,
      enemyThreatDelta: 3.5,
      woundedDelta,
      logMessage: `遠征失敗: 負傷${woundedDelta} / 脅威上昇`,
    };
  }
  const woundedDelta = Math.max(1, Math.floor(scenario.assignedSoldiers * 0.16));
  return {
    foodDelta: -Math.floor(scenario.reward * 0.15),
    lifetimeFoodDelta: 0,
    territoryDelta: 0,
    enemyThreatDelta: 1.2,
    woundedDelta,
    logMessage: `遠征膠着: 負傷${woundedDelta} / 脅威小幅上昇`,
  };
}
