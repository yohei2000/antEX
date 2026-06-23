import type { SlimePosture } from "./sim/types";

export type ExpeditionOutcome = "player" | "enemy" | "draw";

export type BattleEndReason =
  | "enemy_routed"
  | "player_routed"
  | "both_routed"
  | "timeout_draw";

export type BattleDiagnosisItem = {
  cause: string;
  hint: string;
  severity: number;
};

export type PostureTimelineItem = {
  posture: SlimePosture | "retreat";
  seconds: number;
};

export type ExpeditionBattleMetrics = {
  elapsed: number;
  minPlayerMorale: number;
  minPlayerCohesion: number;
  maxPlayerFatigue: number;
  maxPlayerEncirclement: number;
  pressureSeconds: number;
  maxPressure: number;
  averageFrontVelocity: number;
  objectiveControlSeconds: number;
  objectiveControlRatio: number;
  routedAt?: number;
  mainPostureTimeline: PostureTimelineItem[];
  finalPosture: SlimePosture | "retreat";
};

export type ExpeditionBattleResult = {
  winner: ExpeditionOutcome;
  outcome: ExpeditionOutcome;
  reason: BattleEndReason;
  elapsed: number;
  elapsedSeconds: number;
  metrics: ExpeditionBattleMetrics;
  diagnosis: BattleDiagnosisItem[];
  playerMorale: number;
  enemyMorale: number;
  playerArmyCount: number;
  enemyArmyCount: number;
  finishedAt: number;
};

export function diagnoseBattle(metrics: ExpeditionBattleMetrics): BattleDiagnosisItem[] {
  const items: BattleDiagnosisItem[] = [];
  const pressureRetreat = metrics.maxPressure / 100 + Math.max(0, -metrics.averageFrontVelocity) / 34;
  if (pressureRetreat > 0.48) {
    items.push({
      cause: "正面圧力で押し戻された",
      hint: "攻撃力 / 兵隊数 / 防御力",
      severity: pressureRetreat,
    });
  }

  const cohesionLoss = (72 - metrics.minPlayerCohesion) / 72;
  if (cohesionLoss > 0.28) {
    items.push({
      cause: "隊列の結束が崩れた",
      hint: "結束 / 指揮 / 隊列訓練",
      severity: cohesionLoss,
    });
  }

  const fatigueLoad = metrics.maxPlayerFatigue / 100;
  if (fatigueLoad > 0.34) {
    items.push({
      cause: "疲労で後半に失速した",
      hint: "持久力 / 補給 / 疲労回復",
      severity: fatigueLoad,
    });
  }

  if (metrics.maxPlayerEncirclement > 0.22) {
    items.push({
      cause: "包囲されて退路が狭くなった",
      hint: "機動力 / 側面防御 / 隊列幅",
      severity: metrics.maxPlayerEncirclement,
    });
  }

  if (metrics.minPlayerMorale < 34) {
    items.push({
      cause: "士気が折れて敗走しかけた",
      hint: "士気 / 兵隊訓練 / 巣の防御",
      severity: (34 - metrics.minPlayerMorale) / 34,
    });
  }

  return items
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3);
}
