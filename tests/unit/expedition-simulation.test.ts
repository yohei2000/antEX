import { describe, expect, it } from "vitest";
import {
  assignedExpeditionSoldiers,
  createExpeditionScenario,
} from "../../src/expedition/scenario";
import { ExpeditionBattleSession } from "../../src/expedition/session";
import { createArmySlime } from "../../src/expedition/sim/slime";
import { BattleSimulation } from "../../src/expedition/sim/simulation";
import { updateSlime } from "../../src/expedition/sim/slimePhysics";
import { splitArmySlime } from "../../src/expedition/sim/slimeSplit";
import { sampleEnemyZoc } from "../../src/expedition/sim/zoc";
import {
  EXPEDITION_ANT_MIN_WORLD_GAP,
  createExpeditionAntRenderStates,
  nearestAntRenderGap,
} from "../../src/expedition/threeView";

const fixedRng = () => 0.42;

describe("expedition battle simulation", () => {
  it("uses the existing expedition formulas for scenario preview", () => {
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
    expect(scenario.playerPower).toBe(12);
    expect(scenario.enemyPower).toBeCloseTo(13.76, 5);
    expect(scenario.reward).toBe(85);
    expect(scenario.winChance).toBeCloseTo(12 / (12 + 13.76), 5);
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
    expect(result?.playerArmyCount).toBeGreaterThanOrEqual(1);
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

    const playerAnts = createExpeditionAntRenderStates(battle.state.playerSlimes);
    const enemyAnts = createExpeditionAntRenderStates(battle.state.enemySlimes);

    expect(playerAnts.length).toBeGreaterThanOrEqual(46);
    expect(enemyAnts.length).toBeGreaterThanOrEqual(52);
    expect(nearestAntRenderGap(playerAnts)).toBeGreaterThanOrEqual(
      EXPEDITION_ANT_MIN_WORLD_GAP * 0.72,
    );
    expect(nearestAntRenderGap(enemyAnts)).toBeGreaterThanOrEqual(
      EXPEDITION_ANT_MIN_WORLD_GAP * 0.72,
    );
  });
});
