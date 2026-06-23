import { runAgentBattle } from "./simulation";
import type { AgentBattleResult, AgentPhysicalParams, BattleReason } from "./types";

export interface ExpeditionAgentInput {
  seed: number;
  assignedSoldiers: number;
  territory: number;
  enemyThreat: number;
  attackPower: number;
  defensePower: number;
  recoveryPerSecond: number;
  threatGrowthMultiplier: number;
}

export interface ExpeditionAgentOutcome {
  battle: AgentBattleResult;
  success: boolean;
  reason: BattleReason;
  rewardFood: number;
  territoryDelta: number;
  wounded: number;
  foodLoss: number;
  threatDelta: number;
  diagnosis: string[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function playerParams(input: ExpeditionAgentInput): AgentPhysicalParams {
  return {
    mandiblePower: clamp(input.attackPower, 0.7, 2.4),
    carapace: clamp(input.defensePower, 0.7, 2.4),
    mobility: 1 + clamp(input.recoveryPerSecond * 15, 0, 0.45),
    stamina: 1 + clamp(input.recoveryPerSecond * 18, 0, 0.55),
    discipline: 1 + clamp((input.attackPower + input.defensePower - 2) * 0.22, 0, 0.7),
    pheromoneCommand: 1 + clamp(input.assignedSoldiers / 28, 0, 0.75),
  };
}

function enemyParams(input: ExpeditionAgentInput): AgentPhysicalParams {
  const pressure = clamp(input.enemyThreat / 18 + input.territory * 0.035, 0, 1.2);
  return {
    mandiblePower: 0.92 + pressure * 0.42,
    carapace: 0.92 + pressure * 0.28,
    mobility: 0.95 + pressure * 0.12,
    stamina: 0.95 + pressure * 0.2,
    discipline: 0.82 + pressure * 0.18,
    pheromoneCommand: 0.9 + pressure * 0.15,
  };
}

export function runExpeditionAgentBattle(input: ExpeditionAgentInput): ExpeditionAgentOutcome {
  const assigned = Math.max(1, Math.floor(input.assignedSoldiers));
  const enemyCount = Math.floor(clamp(4 + input.territory * 0.45 + input.enemyThreat * 0.28, 3, 34));
  const battle = runAgentBattle({
    seed: input.seed,
    playerCount: assigned,
    enemyCount,
    maxSeconds: 26,
    player: playerParams(input),
    enemy: enemyParams(input),
    objective: { x: 0, y: 0 },
  });

  const baseReward = Math.floor(34 + input.territory * 9 + assigned * 4);
  const playerLosses = battle.summary.player.wounded + battle.summary.player.defeated;
  const success = battle.winner === "player";
  const wounded = success ? Math.max(0, playerLosses) : Math.max(1, playerLosses || Math.floor(assigned * 0.18));
  const rewardFood = success ? baseReward : 0;
  const foodLoss = success ? 0 : Math.floor(baseReward * 0.28);
  const threatDelta = success ? -2.4 : 2.4 + battle.summary.enemy.active * 0.08;
  const territoryDelta = success ? 1 : 0;

  return {
    battle,
    success,
    reason: battle.reason,
    rewardFood,
    territoryDelta,
    wounded,
    foodLoss,
    threatDelta,
    diagnosis: battle.diagnosis,
  };
}

