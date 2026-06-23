import type { BattleArmySeed } from "./sim/simulation";
import { clamp } from "./sim/vector";
import type { ExpeditionBattleResult, ExpeditionOutcome } from "./result";

export type { ExpeditionOutcome } from "./result";

export type ExpeditionScenarioInput = {
  activeAnts: number;
  soldierAnts: number;
  attackPower: number;
  defensePower: number;
  territory: number;
  enemyThreat: number;
  seed?: number;
};

export type EnemyProfileId =
  | "heavy"
  | "envelop"
  | "breakthrough"
  | "endurance"
  | "fragile";

export type ExpeditionEnemyIntel = {
  profile: EnemyProfileId;
  label: string;
  soldierScale: string;
  formationBias: string;
  attackBias: string;
  envelopBias: string;
  pressure: number;
};

export type ExpeditionPlayerFormation = {
  morale: number;
  cohesion: number;
  fatigue: number;
  density: number;
  frontWidth: number;
};

export type ExpeditionArmySeed = BattleArmySeed;

export type ExpeditionScenario = {
  assignedSoldiers: number;
  availableSoldiers: number;
  reward: number;
  cooldownMs: number;
  seed: number;
  enemyIntel: ExpeditionEnemyIntel;
  playerFormation: ExpeditionPlayerFormation;
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

type EnemyProfileConfig = {
  label: string;
  formationBias: string;
  attackBias: string;
  envelopBias: string;
  mass: number;
  morale: number;
  cohesion: number;
  fatigue: number;
  toughness: number;
  width: number;
  depth: number;
};

const ENEMY_PROFILES: Record<EnemyProfileId, EnemyProfileConfig> = {
  heavy: {
    label: "重装型",
    formationBias: "密集",
    attackBias: "正面圧力",
    envelopBias: "低",
    mass: 1.18,
    morale: 1.04,
    cohesion: 1.05,
    fatigue: 1.08,
    toughness: 1.16,
    width: 0.92,
    depth: 1.12,
  },
  envelop: {
    label: "包囲型",
    formationBias: "横展開",
    attackBias: "側面圧力",
    envelopBias: "高",
    mass: 1.02,
    morale: 1.02,
    cohesion: 1.08,
    fatigue: 1.02,
    toughness: 1,
    width: 1.22,
    depth: 0.92,
  },
  breakthrough: {
    label: "突破型",
    formationBias: "縦深",
    attackBias: "突破",
    envelopBias: "中",
    mass: 1.08,
    morale: 1.06,
    cohesion: 0.98,
    fatigue: 1.06,
    toughness: 1.04,
    width: 0.94,
    depth: 1.18,
  },
  endurance: {
    label: "持久型",
    formationBias: "保持",
    attackBias: "消耗戦",
    envelopBias: "中",
    mass: 1,
    morale: 1.08,
    cohesion: 1.08,
    fatigue: 0.72,
    toughness: 1.08,
    width: 1,
    depth: 1,
  },
  fragile: {
    label: "不安定型",
    formationBias: "乱れやすい",
    attackBias: "散発",
    envelopBias: "低",
    mass: 0.9,
    morale: 0.82,
    cohesion: 0.84,
    fatigue: 1.12,
    toughness: 0.9,
    width: 1.04,
    depth: 0.96,
  },
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
  const enemyPressure = 5 + input.territory * 1.8 + input.enemyThreat * 0.42;
  const reward = Math.floor(
    34 + input.territory * 9 + assignedSoldiers * 4,
  );
  const readiness = clamp(input.defensePower / 1.8, 0.72, 1.28);
  const threatPressure = clamp(input.enemyThreat / 18, 0, 1.2);
  const territoryPressure = clamp(input.territory / 12, 0, 1.1);
  const profileId = chooseEnemyProfile(input, enemyPressure);
  const profile = ENEMY_PROFILES[profileId];
  const seed = input.seed ?? expeditionSeed(input);

  const playerMorale = clamp(70 + readiness * 9 - threatPressure * 5, 46, 92);
  const playerCohesion = clamp(66 + readiness * 12 - territoryPressure * 4, 44, 92);
  const playerFatigue = clamp(9 + threatPressure * 9 + territoryPressure * 4, 4, 42);
  const playerWidth = clamp(210 + assignedSoldiers * 4, 185, 345);

  const enemyMass = clamp((74 + enemyPressure * 4.6) * profile.mass, 64, 250);
  const enemyWidth = clamp((222 + input.territory * 7) * profile.width, 175, 430);
  const enemyDepth = clamp(176 * profile.depth, 136, 230);

  return {
    assignedSoldiers,
    availableSoldiers,
    reward,
    cooldownMs: 45000,
    seed,
    enemyIntel: {
      profile: profileId,
      label: profile.label,
      soldierScale: enemyMass > 170 ? "大" : enemyMass > 110 ? "中" : "小",
      formationBias: profile.formationBias,
      attackBias: profile.attackBias,
      envelopBias: profile.envelopBias,
      pressure: enemyPressure,
    },
    playerFormation: {
      morale: playerMorale,
      cohesion: playerCohesion,
      fatigue: playerFatigue,
      density: clamp((assignedSoldiers + input.defensePower * 4) / 32, 0.72, 1.35),
      frontWidth: playerWidth,
    },
    playerSeed: {
      id: "colony-expedition",
      mass: clamp(72 + assignedSoldiers * 9 + input.attackPower * 12, 64, 210),
      morale: playerMorale,
      cohesion: playerCohesion,
      fatigue: playerFatigue,
      toughness: clamp(0.58 + input.defensePower * 0.045, 0.56, 0.78),
      width: playerWidth,
      depth: 168,
      particleCount: Math.floor(clamp(42 + assignedSoldiers * 3.2, 46, 92)),
      manualControl: false,
    },
    enemySeed: {
      id: "rival-expedition",
      mass: enemyMass,
      morale: clamp((68 + threatPressure * 10 + territoryPressure * 4) * profile.morale, 42, 96),
      cohesion: clamp((66 + threatPressure * 9) * profile.cohesion, 42, 96),
      fatigue: clamp((7 - territoryPressure * 2) * profile.fatigue, 3, 34),
      toughness: clamp((0.58 + threatPressure * 0.12) * profile.toughness, 0.5, 0.9),
      width: enemyWidth,
      depth: enemyDepth,
      particleCount: Math.floor(clamp(40 + enemyPressure * 0.75, 42, 76)),
      manualControl: false,
      profile: profileId,
    },
  };
}

export function expeditionResultImpact(
  scenario: ExpeditionScenario,
  result: ExpeditionBattleResult,
): ExpeditionResultImpact {
  const metrics = result.metrics;
  const pressureLoad = clamp(metrics.pressureSeconds / Math.max(1, metrics.elapsed), 0, 1);
  const cohesionDamage = clamp((72 - metrics.minPlayerCohesion) / 72, 0, 1);
  const fatigueDamage = clamp(metrics.maxPlayerFatigue / 100, 0, 1);
  const encirclementDamage = clamp(metrics.maxPlayerEncirclement, 0, 1);
  const damageScore = clamp(
    pressureLoad * 0.28 +
      cohesionDamage * 0.25 +
      fatigueDamage * 0.24 +
      encirclementDamage * 0.23,
    0,
    1,
  );
  const assigned = Math.max(0, scenario.assignedSoldiers);
  const diagnosis = result.diagnosis[0]?.cause;

  if (result.winner === "player") {
    const rewardScale = clamp(0.78 + metrics.objectiveControlRatio * 0.28 - damageScore * 0.22, 0.48, 1.08);
    const foodDelta = Math.floor(scenario.reward * rewardScale);
    const woundedDelta = Math.min(
      assigned,
      Math.floor(assigned * clamp(0.04 + damageScore * 0.2, 0, 0.36)),
    );
    return {
      foodDelta,
      lifetimeFoodDelta: foodDelta,
      territoryDelta: 1,
      enemyThreatDelta: -clamp(1.2 + metrics.objectiveControlRatio * 1.8, 1.2, 3.2),
      woundedDelta,
      logMessage: `遠征成功: 食料+${foodDelta} / 領土+1${diagnosis ? ` / ${diagnosis}` : ""}`,
    };
  }

  if (result.winner === "enemy") {
    const foodLoss = Math.floor(scenario.reward * clamp(0.12 + damageScore * 0.28, 0.12, 0.42));
    const woundedDelta = Math.min(
      assigned,
      Math.max(1, Math.floor(assigned * clamp(0.18 + damageScore * 0.42, 0.18, 0.72))),
    );
    return {
      foodDelta: -foodLoss,
      lifetimeFoodDelta: 0,
      territoryDelta: 0,
      enemyThreatDelta: clamp(1.6 + damageScore * 3.1, 1.6, 4.8),
      woundedDelta,
      logMessage: `遠征失敗: 負傷${woundedDelta}${diagnosis ? ` / ${diagnosis}` : ""}`,
    };
  }

  const partialReward = Math.floor(scenario.reward * clamp(metrics.objectiveControlRatio * 0.34, 0, 0.28));
  const woundedDelta = Math.min(
    assigned,
    Math.max(0, Math.floor(assigned * clamp(0.08 + damageScore * 0.28, 0.08, 0.46))),
  );
  return {
    foodDelta: partialReward,
    lifetimeFoodDelta: Math.max(0, partialReward),
    territoryDelta: 0,
    enemyThreatDelta: clamp(0.4 + damageScore * 1.6, 0.4, 2.4),
    woundedDelta,
    logMessage: `遠征膠着: 食料+${partialReward} / 負傷${woundedDelta}${diagnosis ? ` / ${diagnosis}` : ""}`,
  };
}

function chooseEnemyProfile(
  input: ExpeditionScenarioInput,
  enemyPressure: number,
): EnemyProfileId {
  if (input.enemyThreat > 15 && input.territory > 6) return "heavy";
  if (input.territory >= 7) return "envelop";
  if (enemyPressure > 18 && input.soldierAnts < input.activeAnts * 0.18) return "breakthrough";
  if (input.enemyThreat < 5 && input.territory < 3) return "fragile";
  return input.enemyThreat > 10 ? "endurance" : "breakthrough";
}

function expeditionSeed(input: ExpeditionScenarioInput): number {
  const values = [
    input.activeAnts,
    input.soldierAnts,
    input.attackPower,
    input.defensePower,
    input.territory,
    input.enemyThreat,
  ];
  let hash = 2166136261;
  for (const value of values) {
    const intValue = Math.floor(value * 1000);
    hash ^= intValue;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}
