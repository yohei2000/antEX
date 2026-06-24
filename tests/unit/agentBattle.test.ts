import { describe, expect, it } from "vitest";
import {
  AgentBattleSimulation,
  createAgentForTest,
  integrateAgentPhysics,
  runAgentBattle,
  runExpeditionAgentBattle,
} from "../../src/expedition/agent";
import type { AgentPhysicalParams } from "../../src/expedition/agent";
import { runLegacyExpeditionBattle } from "../../src/expedition/legacyAdapter";

const baseParams: AgentPhysicalParams = {
  mandiblePower: 1,
  carapace: 1,
  mobility: 1,
  stamina: 1,
  discipline: 1,
  pheromoneCommand: 1,
};

function battleConfig(seed = 1234) {
  return {
    seed,
    playerCount: 8,
    enemyCount: 6,
    maxSeconds: 12,
    player: { ...baseParams, mandiblePower: 1.25, discipline: 1.2, pheromoneCommand: 1.3 },
    enemy: { ...baseParams },
  };
}

describe("agent expedition battle", () => {
  it("is deterministic for the same seed", () => {
    const first = runAgentBattle(battleConfig(991));
    const second = runAgentBattle(battleConfig(991));
    expect(first.reason).toBe(second.reason);
    expect(first.summary).toEqual(second.summary);
    expect(first.metrics).toEqual(second.metrics);
    expect(first.frameLogs.slice(0, 24)).toEqual(second.frameLogs.slice(0, 24));
  });

  it("does not jitter when an ant has no force and no target", () => {
    const ant = createAgentForTest({ state: "brace", velocity: { x: 0, y: 0 }, target: null });
    const start = { ...ant.position };
    for (let i = 0; i < 180; i += 1) integrateAgentPhysics(ant, { x: 0, y: 0 }, 0);
    expect(Math.hypot(ant.position.x - start.x, ant.position.y - start.y)).toBeLessThan(0.000001);
    expect(ant.gaitPhase).toBe(0);
  });

  it("keeps heading aligned with forward motion", () => {
    const ant = createAgentForTest({ heading: 0 });
    for (let i = 0; i < 120; i += 1) integrateAgentPhysics(ant, { x: 1, y: 0.15 }, 2.4);
    const speed = Math.hypot(ant.velocity.x, ant.velocity.y);
    const alignment = (Math.cos(ant.heading) * ant.velocity.x + Math.sin(ant.heading) * ant.velocity.y) / speed;
    expect(alignment).toBeGreaterThan(0.9);
  });

  it("limits instant turn reversal", () => {
    const ant = createAgentForTest({ heading: 0 });
    integrateAgentPhysics(ant, { x: -1, y: 0 }, 2.4);
    expect(Math.abs(ant.heading)).toBeLessThan(0.08);
    expect(Math.abs(ant.angularVelocity)).toBeLessThan(5);
  });

  it("enters contact states only after close facing contact", () => {
    const sim = new AgentBattleSimulation({
      seed: 7,
      playerCount: 1,
      enemyCount: 1,
      maxSeconds: 2,
      player: baseParams,
      enemy: baseParams,
    });
    const player = sim.agents.find((agent) => agent.side === "player")!;
    const enemy = sim.agents.find((agent) => agent.side === "enemy")!;
    player.position = { x: -0.7, y: 0 };
    enemy.position = { x: 0.7, y: 0 };
    player.heading = 0;
    enemy.heading = Math.PI;
    for (let i = 0; i < 30; i += 1) sim.step();
    expect(["engage", "brace", "bite", "push", "probe"]).toContain(player.state);
    expect(player.lastContactId === enemy.id || enemy.lastContactId === player.id || enemy.hp < 1).toBe(true);
  });

  it("uses recoil and disengage after physical bite contact", () => {
    const sim = new AgentBattleSimulation({
      seed: 71,
      playerCount: 1,
      enemyCount: 1,
      maxSeconds: 3,
      player: { ...baseParams, mandiblePower: 1.5 },
      enemy: baseParams,
    });
    const player = sim.agents.find((agent) => agent.side === "player")!;
    const enemy = sim.agents.find((agent) => agent.side === "enemy")!;
    player.position = { x: -0.55, y: 0 };
    enemy.position = { x: 0.55, y: 0 };
    player.heading = 0;
    enemy.heading = Math.PI;
    const states = new Set<string>();
    for (let i = 0; i < 120; i += 1) {
      sim.step();
      states.add(player.state);
      states.add(enemy.state);
    }
    expect(states.has("recoil")).toBe(true);
    expect(states.has("disengage")).toBe(true);
    expect(enemy.hp).toBeLessThan(1);
  });

  it("retreats coherently when morale is low", () => {
    const sim = new AgentBattleSimulation({
      seed: 8,
      playerCount: 1,
      enemyCount: 1,
      maxSeconds: 2,
      player: baseParams,
      enemy: baseParams,
    });
    const player = sim.agents.find((agent) => agent.side === "player")!;
    player.position = { x: 0, y: 0 };
    player.morale = 0.05;
    const startX = player.position.x;
    for (let i = 0; i < 80; i += 1) sim.step();
    expect(player.state).toBe("retreat");
    expect(player.position.x).toBeLessThan(startX - 0.5);
  });

  it("follows objective vectors when no live enemy is near", () => {
    const sim = new AgentBattleSimulation({
      seed: 9,
      playerCount: 1,
      enemyCount: 1,
      maxSeconds: 2,
      player: { ...baseParams, pheromoneCommand: 1.4 },
      enemy: baseParams,
    });
    const player = sim.agents.find((agent) => agent.side === "player")!;
    const enemy = sim.agents.find((agent) => agent.side === "enemy")!;
    enemy.hp = 0;
    const startDistance = Math.hypot(player.position.x, player.position.y);
    for (let i = 0; i < 90; i += 1) sim.step();
    expect(Math.hypot(player.position.x, player.position.y)).toBeLessThan(startDistance);
    expect(["march", "followTrail", "regroup"]).toContain(player.state);
  });

  it("resolves deep overlaps without NaN or Infinity", () => {
    const sim = new AgentBattleSimulation({
      seed: 10,
      playerCount: 1,
      enemyCount: 1,
      maxSeconds: 2,
      player: baseParams,
      enemy: baseParams,
    });
    const [a, b] = sim.agents;
    a.position = { x: 0, y: 0 };
    b.position = { x: 0.05, y: 0 };
    for (let i = 0; i < 20; i += 1) sim.step();
    for (const agent of sim.agents) {
      expect(Number.isFinite(agent.position.x)).toBe(true);
      expect(Number.isFinite(agent.position.y)).toBe(true);
      expect(Number.isFinite(agent.velocity.x)).toBe(true);
      expect(Number.isFinite(agent.velocity.y)).toBe(true);
    }
    expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeGreaterThan(0.5);
  });

  it("generates expedition result, reward, wounded count, and diagnosis from agent logs", () => {
    const outcome = runExpeditionAgentBattle({
      seed: 44,
      assignedSoldiers: 10,
      territory: 1,
      enemyThreat: 4,
      attackPower: 1.35,
      defensePower: 1.22,
      recoveryPerSecond: 0.02,
      threatGrowthMultiplier: 0.9,
    });
    expect(["enemy_all_retreat", "player_all_retreat", "objective_held", "timeout_draw"]).toContain(outcome.reason);
    expect(outcome.battle.frameLogs.length).toBeGreaterThan(0);
    expect(outcome.diagnosis.length).toBeGreaterThan(0);
    expect(outcome.wounded).toBeGreaterThanOrEqual(0);
    expect(outcome.success ? outcome.rewardFood : outcome.foodLoss).toBeGreaterThanOrEqual(0);
  });

  it("can start from existing ant identities without changing initial transforms", () => {
    const result = runAgentBattle({
      seed: 808,
      playerCount: 2,
      enemyCount: 2,
      maxSeconds: 4,
      objective: { x: 12, y: -3 },
      worldLimit: 80,
      player: baseParams,
      enemy: baseParams,
      playerSeeds: [
        {
          id: 31,
          side: "player",
          position: { x: -10.5, y: 2.25 },
          velocity: { x: 0.4, y: 0.1 },
          heading: 0.72,
          gaitPhase: 1.4,
          bodyScale: 1.05,
          animationSeed: 3100,
          currentTask: "explore",
          renderIndex: 30,
          spawnReason: "existing_colony_ant",
        },
        {
          id: 12,
          side: "player",
          position: { x: -12, y: 1.5 },
          heading: 0.7,
          gaitPhase: 0.8,
          renderIndex: 11,
          spawnReason: "existing_colony_ant",
        },
      ],
    });

    const first = result.frameLogs.filter((frame) => frame.side === "player" && frame.step === 0);
    expect(first.map((frame) => frame.id)).toEqual([31, 12]);
    expect(first[0].x).toBeCloseTo(-10.5, 4);
    expect(first[0].y).toBeCloseTo(2.25, 4);
    expect(first[0].heading).toBeCloseTo(0.72, 4);
    expect(first[0].gaitPhase).toBeCloseTo(1.4, 4);
    expect(first[0].renderIndex).toBe(30);
    expect(first[0].spawnReason).toBe("existing_colony_ant");
  });

  it("is deterministic for existing-ant seeds too", () => {
    const config = {
      seed: 909,
      playerCount: 2,
      enemyCount: 3,
      maxSeconds: 5,
      objective: { x: 8, y: 0 },
      worldLimit: 80,
      player: baseParams,
      enemy: baseParams,
      playerSeeds: [
        { id: 5, side: "player" as const, position: { x: -4, y: 0 }, heading: 0.1, gaitPhase: 0.4, renderIndex: 4 },
        { id: 8, side: "player" as const, position: { x: -6, y: 1 }, heading: 0.2, gaitPhase: 0.7, renderIndex: 7 },
      ],
    };
    const first = runAgentBattle(config);
    const second = runAgentBattle(config);
    expect(first.reason).toBe(second.reason);
    expect(first.summary).toEqual(second.summary);
    expect(first.frameLogs.slice(0, 36)).toEqual(second.frameLogs.slice(0, 36));
    expect(first.diagnosis).toEqual(second.diagnosis);
  });

  it("keeps legacy slime battle selectable behind the engine setting", () => {
    const outcome = runLegacyExpeditionBattle({
      seed: 45,
      assignedSoldiers: 10,
      activeAnts: 48,
      soldierAnts: 14,
      territory: 1,
      enemyThreat: 4,
      attackPower: 1.35,
      defensePower: 1.22,
      recoveryPerSecond: 0.02,
      threatGrowthMultiplier: 0.9,
    });
    expect(["enemy_all_retreat", "player_all_retreat", "timeout_draw"]).toContain(outcome.reason);
    expect(outcome.battle.frameLogs.length).toBe(0);
    expect(outcome.diagnosis.join("\n")).toContain("legacy reason:");
    expect(outcome.wounded).toBeGreaterThanOrEqual(0);
  });

  it("meets baseline ant-likeness thresholds", () => {
    const result = runAgentBattle(battleConfig(2026));
    expect(result.metrics.forwardMotionRatio).toBeGreaterThan(0.82);
    expect(result.metrics.headingVelocityAlignment).toBeGreaterThan(0.76);
    expect(result.metrics.idleJitter).toBeLessThan(0.012);
    expect(result.metrics.turnRateSpike).toBeLessThan(0.02);
    expect(result.metrics.trailCoherence).toBeGreaterThan(0.35);
    expect(result.metrics.contactFacingRatio).toBeGreaterThan(0.45);
    expect(result.metrics.collisionPenetration).toBeLessThan(0.9);
  });
});
