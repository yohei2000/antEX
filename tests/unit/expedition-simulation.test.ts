import { describe, expect, it } from "vitest";
import {
  assignedExpeditionSoldiers,
  createExpeditionScenario,
  expeditionResultImpact,
} from "../../src/expedition/scenario";
import {
  type ExpeditionBattleMetrics,
  type ExpeditionBattleResult,
  diagnoseBattle,
} from "../../src/expedition/result";
import { ExpeditionBattleSession } from "../../src/expedition/session";
import { createArmySlime } from "../../src/expedition/sim/slime";
import { BattleSimulation } from "../../src/expedition/sim/simulation";
import { updateSlime } from "../../src/expedition/sim/slimePhysics";
import { splitArmySlime } from "../../src/expedition/sim/slimeSplit";
import { sampleEnemyZoc } from "../../src/expedition/sim/zoc";
import {
  VisualAntController,
  createVisualAntTargetsFromSlimes,
  nearestVisualAntGap,
} from "../../src/expedition/visualAnt";

const fixedRng = () => 0.42;

describe("expedition battle simulation", () => {
  it("creates observable battle intel without win probability", () => {
    const scenario = createExpeditionScenario({
      activeAnts: 30,
      soldierAnts: 10,
      attackPower: 2,
      defensePower: 1.5,
      territory: 3,
      enemyThreat: 8,
    });

    expect(assignedExpeditionSoldiers(10, 30)).toBe(6);
    expect(scenario.assignedSoldiers).toBe(6);
    expect(scenario.reward).toBe(85);
    expect("winChance" in scenario).toBe(false);
    expect("playerPower" in scenario).toBe(false);
    expect(scenario.enemyIntel.label).toBeTruthy();
    expect(scenario.enemyIntel.attackBias).toBeTruthy();
    expect(scenario.playerFormation.morale).toBeGreaterThan(0);
    expect(scenario.playerFormation.frontWidth).toBeGreaterThan(0);
  });

  it("routes a side when morale breaks and resolves the battle", () => {
    const battle = new BattleSimulation({
      rng: fixedRng,
      player: { morale: 20, manualControl: false },
      enemy: { morale: 88, manualControl: false },
    });

    battle.update(1 / 60);

    expect(battle.state.player.isRouting).toBe(true);
    expect(battle.state.winner).toBe("enemy");
  });

  it("keeps mass conserved when an army splits", () => {
    const slime = createArmySlime(
      "split-test",
      "player",
      { x: 300, y: 325 },
      { x: 1, y: 0 },
      { mass: 120, manualControl: false, rng: fixedRng },
    );

    const [fragment, main] = splitArmySlime(slime);

    expect(fragment.mass + main.mass).toBeCloseTo(slime.mass, 5);
    expect(fragment.splitGeneration).toBe(1);
    expect(main.splitGeneration).toBe(1);
  });

  it("projects contour nodes out of enemy ZOC instead of letting them pass through", () => {
    const player = createArmySlime(
      "zoc-player",
      "player",
      { x: 390, y: 325 },
      { x: 1, y: 0 },
      { manualControl: false, rng: fixedRng },
    );
    const enemy = createArmySlime(
      "zoc-enemy",
      "enemy",
      { x: 560, y: 325 },
      { x: -1, y: 0 },
      { manualControl: false, rng: fixedRng },
    );
    player.desiredCenter = { x: 760, y: 325 };

    for (let i = 0; i < 240; i += 1) {
      updateSlime(player, enemy, 1 / 60, { width: 1000, height: 650 });
    }

    const intrudingBoundaryNodes = player.nodes.filter((node) => {
      if (node.role === "interior") return false;
      return sampleEnemyZoc(enemy, node.position).insideBody;
    });
    expect(intrudingBoundaryNodes).toHaveLength(0);
    expect(player.center.x).toBeLessThan(enemy.center.x + 80);
  });

  it("can produce a deterministic autonomous battle result", () => {
    const scenario = createExpeditionScenario({
      activeAnts: 80,
      soldierAnts: 50,
      attackPower: 3.2,
      defensePower: 2.4,
      territory: 2,
      enemyThreat: 4,
    });
    scenario.enemySeed.morale = 23;
    const session = new ExpeditionBattleSession(scenario, fixedRng);

    let result = session.getResult();
    for (let i = 0; i < 120 && !result; i += 1) {
      result = session.update(1 / 30);
    }

    expect(result?.outcome).toBe("player");
    expect(result?.reason).toBe("enemy_routed");
    expect(result?.metrics.elapsed).toBeGreaterThan(0);
    expect(result?.diagnosis.length).toBeGreaterThanOrEqual(0);
    expect(result?.playerArmyCount).toBeGreaterThanOrEqual(1);
  });

  it("produces the same physical result for the same seed across dt sequences", () => {
    const scenario = createExpeditionScenario({
      activeAnts: 80,
      soldierAnts: 50,
      attackPower: 3.2,
      defensePower: 2.4,
      territory: 2,
      enemyThreat: 4,
      seed: 12345,
    });
    scenario.enemySeed.morale = 23;

    const a = runSession(scenario, Array.from({ length: 240 }, () => 1 / 60));
    const b = runSession(scenario, Array.from({ length: 120 }, () => 1 / 30));

    expect(stableResultSummary(a)).toEqual(stableResultSummary(b));
  });

  it("keeps metrics-based expedition impact bounded", () => {
    const scenario = createExpeditionScenario({
      activeAnts: 40,
      soldierAnts: 12,
      attackPower: 2,
      defensePower: 1.5,
      territory: 3,
      enemyThreat: 8,
    });
    const result = syntheticResult("enemy", {
      maxPressure: 82,
      pressureSeconds: 12,
      minPlayerCohesion: 24,
      maxPlayerFatigue: 76,
    });

    const impact = expeditionResultImpact(scenario, result);

    expect(impact.woundedDelta).toBeGreaterThanOrEqual(0);
    expect(impact.woundedDelta).toBeLessThanOrEqual(scenario.assignedSoldiers);
    expect(impact.foodDelta).toBeGreaterThanOrEqual(-scenario.reward);
    expect(Number.isFinite(impact.enemyThreatDelta)).toBe(true);
  });

  it("diagnoses the dominant observed collapse mode", () => {
    expect(diagnoseBattle(metrics({ minPlayerCohesion: 18 }))[0].cause).toContain("結束");
    expect(diagnoseBattle(metrics({ maxPlayerFatigue: 86 }))[0].cause).toContain("疲労");
    expect(diagnoseBattle(metrics({ maxPlayerEncirclement: 0.62 }))[0].cause).toContain("包囲");
  });

  it("keeps expedition ants visually separated as individuals", () => {
    const scenario = createExpeditionScenario({
      activeAnts: 80,
      soldierAnts: 6,
      attackPower: 3,
      defensePower: 2,
      territory: 6,
      enemyThreat: 6,
    });
    const battle = new BattleSimulation({
      rng: fixedRng,
      player: scenario.playerSeed,
      enemy: scenario.enemySeed,
    });

    for (let i = 0; i < 90; i += 1) battle.update(1 / 60);

    const playerController = new VisualAntController("player");
    const enemyController = new VisualAntController("enemy");
    const playerAnts = playerController.update(
      createVisualAntTargetsFromSlimes(battle.state.playerSlimes, 384),
      battle.state.elapsed,
    );
    const enemyAnts = enemyController.update(
      createVisualAntTargetsFromSlimes(battle.state.enemySlimes, 384),
      battle.state.elapsed,
    );

    expect(playerAnts.length).toBeGreaterThanOrEqual(46);
    expect(enemyAnts.length).toBeGreaterThanOrEqual(52);
    expect(nearestVisualAntGap(playerAnts)).toBeGreaterThanOrEqual(1.3);
    expect(nearestVisualAntGap(enemyAnts)).toBeGreaterThanOrEqual(1.3);
  });
});

function runSession(
  scenario: ReturnType<typeof createExpeditionScenario>,
  steps: number[],
): ExpeditionBattleResult {
  const session = new ExpeditionBattleSession(scenario);
  let result = session.getResult();
  for (const dt of steps) {
    if (result) break;
    result = session.update(dt);
  }
  if (!result) {
    for (let i = 0; i < 1200 && !result; i += 1) result = session.update(1 / 60);
  }
  if (!result) throw new Error("session did not resolve");
  return result;
}

function stableResultSummary(result: ExpeditionBattleResult) {
  return {
    winner: result.winner,
    reason: result.reason,
    elapsed: Number(result.elapsed.toFixed(4)),
    minMorale: Number(result.metrics.minPlayerMorale.toFixed(4)),
    minCohesion: Number(result.metrics.minPlayerCohesion.toFixed(4)),
    maxFatigue: Number(result.metrics.maxPlayerFatigue.toFixed(4)),
    objective: Number(result.metrics.objectiveControlRatio.toFixed(4)),
  };
}

function metrics(overrides: Partial<ExpeditionBattleMetrics> = {}): ExpeditionBattleMetrics {
  return {
    elapsed: 24,
    minPlayerMorale: 70,
    minPlayerCohesion: 70,
    maxPlayerFatigue: 16,
    maxPlayerEncirclement: 0.05,
    pressureSeconds: 0,
    maxPressure: 12,
    averageFrontVelocity: 4,
    objectiveControlSeconds: 10,
    objectiveControlRatio: 0.42,
    mainPostureTimeline: [{ posture: "neutral", seconds: 24 }],
    finalPosture: "neutral",
    ...overrides,
  };
}

function syntheticResult(
  winner: ExpeditionBattleResult["winner"],
  metricOverrides: Partial<ExpeditionBattleMetrics>,
): ExpeditionBattleResult {
  const resultMetrics = metrics(metricOverrides);
  return {
    winner,
    outcome: winner,
    reason: winner === "player" ? "enemy_routed" : winner === "enemy" ? "player_routed" : "timeout_draw",
    elapsed: resultMetrics.elapsed,
    elapsedSeconds: resultMetrics.elapsed,
    metrics: resultMetrics,
    diagnosis: diagnoseBattle(resultMetrics),
    playerMorale: resultMetrics.minPlayerMorale,
    enemyMorale: 50,
    playerArmyCount: 1,
    enemyArmyCount: 1,
    finishedAt: resultMetrics.elapsed,
  };
}
