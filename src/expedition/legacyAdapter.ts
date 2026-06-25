import { createExpeditionScenario } from "./legacy/scenario";
import { ExpeditionBattleSession } from "./legacy/session";
import type { ExpeditionAgentInput, ExpeditionAgentOutcome } from "./agent";
import type { BattleReason } from "./agent";

function mapReason(reason: string): BattleReason {
  if (reason === "enemy_routed") return "enemy_all_retreat";
  if (reason === "player_routed") return "player_all_retreat";
  return "timeout_draw";
}

export function runLegacyExpeditionBattle(input: ExpeditionAgentInput & { activeAnts?: number; soldierAnts?: number }): ExpeditionAgentOutcome {
  const scenario = createExpeditionScenario({
    activeAnts: input.activeAnts ?? Math.max(2, input.assignedSoldiers + 1),
    soldierAnts: input.soldierAnts ?? Math.max(1, Math.ceil(input.assignedSoldiers / 0.65)),
    attackPower: input.attackPower,
    defensePower: input.defensePower,
    territory: input.territory,
    enemyThreat: input.enemyThreat,
    seed: input.seed,
  });
  const session = new ExpeditionBattleSession(scenario);
  let result = session.getResult();
  for (let i = 0; i < 60 && !result; i += 1) result = session.update(1 / 60);
  const telemetry = session.telemetry();

  const reason = result ? mapReason(result.reason) : "timeout_draw";
  const winner = result?.winner ?? "draw";
  const playerMorale = result?.playerMorale ?? telemetry.player.morale;
  const enemyMorale = result?.enemyMorale ?? telemetry.enemy.morale;
  const enemyArmyCount = result?.enemyArmyCount ?? telemetry.enemy.armyCount;
  const elapsedSeconds = result?.elapsedSeconds ?? telemetry.elapsed;
  const success = winner === "player";
  const woundedRatio = success ? 0.08 + Math.max(0, 42 - playerMorale) / 220 : 0.22 + Math.max(0, 48 - playerMorale) / 160;
  const wounded = Math.max(success ? 0 : 1, Math.floor(scenario.assignedSoldiers * woundedRatio));
  const rewardFood = success ? scenario.reward : 0;
  const foodLoss = success ? 0 : Math.floor(scenario.reward * 0.28);
  const threatDelta = success ? -2.4 : 2.4;
  const diagnosis = [
    `legacy reason:${reason}`,
    `legacy morale ${playerMorale.toFixed(0)} / enemy ${enemyMorale.toFixed(0)}`,
    ...(result?.diagnosis ?? []).map((item) => `${item.cause}: ${item.hint}`),
  ];

  return {
    battle: {
      reason,
      winner: success ? "player" : winner === "enemy" ? "enemy" : "draw",
      steps: Math.floor(elapsedSeconds * 60),
      seed: input.seed,
      agents: [],
      frameLogs: [],
      summary: {
        player: {
          side: "player",
          initial: scenario.assignedSoldiers,
          active: success ? scenario.assignedSoldiers - wounded : 0,
          retreated: success ? 0 : Math.max(1, scenario.assignedSoldiers - wounded),
          wounded,
          defeated: 0,
        },
        enemy: {
          side: "enemy",
          initial: Math.max(1, Math.round(enemyArmyCount)),
          active: success ? 0 : Math.max(1, Math.round(enemyArmyCount)),
          retreated: success ? Math.max(1, Math.round(enemyArmyCount)) : 0,
          wounded: 0,
          defeated: 0,
        },
      },
      metrics: {
        forwardMotionRatio: 0,
        headingVelocityAlignment: 0,
        idleJitter: 0,
        turnRateSpike: 0,
        collisionPenetration: 0,
        stopGoRhythm: 0,
        trailCoherence: 0,
        contactFacingRatio: 0,
        retreatCoherence: 0,
      },
      diagnosis,
    },
    success,
    reason,
    rewardFood,
    territoryDelta: success ? 1 : 0,
    wounded,
    foodLoss,
    threatDelta,
    diagnosis,
  };
}
