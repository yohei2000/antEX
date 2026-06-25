import { describe, expect, it } from "vitest";
import { runAgentBattle } from "../../src/expedition/agent";
import { AntBattleInspector } from "../../src/expedition/qa/AntBattleInspector";
import type { AntBattleInspectorSnapshot } from "../../src/expedition/qa/AntBattleInspector";

function ant(id: number, x: number, y: number, overrides: Partial<AntBattleInspectorSnapshot["ants"][number]> = {}) {
  return {
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    heading: 0,
    state: "expedition",
    renderIndex: id,
    health: 1,
    gaitPhase: 0,
    ...overrides,
  };
}

describe("AntBattleInspector", () => {
  it("detects duplicate identity, teleport, running in place, and invalid state", () => {
    const inspector = new AntBattleInspector();
    inspector.inspect({ time: 0, battlePhase: "summon", ants: [ant(1, 0, 0)] });
    const diagnostics = inspector.inspect({
      time: 1 / 60,
      battlePhase: "engage",
      ants: [
        ant(1, 30, 0, { gaitPhase: 2.2, health: 1 }),
        ant(1, 30, 0, { renderIndex: 2 }),
        ant(3, 1, 1, { health: -0.1, state: "bad_state" }),
      ],
    });
    const codes = diagnostics.map((item) => item.code);
    expect(codes).toContain("duplicate_identity");
    expect(codes).toContain("teleport");
    expect(codes).toContain("running_in_place");
    expect(codes).toContain("invalid_state");
  });

  it("detects performance budget and churn problems", () => {
    const inspector = new AntBattleInspector();
    const diagnostics = inspector.inspect({
      time: 0,
      battlePhase: "engage",
      ants: [ant(1, 0, 0), ant(2, 1, 0)],
      perf: {
        frameTimeMs: 36,
        simUpdateMs: 12,
        renderMs: 16,
        inspectorMs: 2.5,
        fixedStepCount: 5,
        fixedStepBacklogMs: 280,
        battleAntCount: 2,
        visibleAntCount: 2,
        collisionPairCount: 20,
        maxBucketSize: 2,
        instanceUpdateCount: 80,
      },
    });
    const codes = diagnostics.map((item) => item.code);
    expect(codes).toContain("frame_budget_exceeded");
    expect(codes).toContain("sim_budget_exceeded");
    expect(codes).toContain("render_budget_exceeded");
    expect(codes).toContain("inspector_overhead");
    expect(codes).toContain("spiral_of_death_risk");
    expect(codes).toContain("collision_explosion");
    expect(codes).toContain("instance_churn");
  });

  it("detects context leak guard mismatches", () => {
    const inspector = new AntBattleInspector();
    const diagnostics = inspector.inspect({
      time: 0,
      battlePhase: "engage",
      ants: [ant(1, 0, 0)],
      contextGuard: { before: "stable", after: "mutated" },
    });
    expect(diagnostics.map((item) => item.code)).toContain("context_leak");
  });

  it("is pure relative to battle results and snapshot inputs", () => {
    const config = {
      seed: 123,
      playerCount: 5,
      enemyCount: 4,
      maxSeconds: 5,
      player: { mandiblePower: 1, carapace: 1, mobility: 1, stamina: 1, discipline: 1, pheromoneCommand: 1 },
      enemy: { mandiblePower: 1, carapace: 1, mobility: 1, stamina: 1, discipline: 1, pheromoneCommand: 1 },
    };
    const baseline = runAgentBattle(config);
    const inspected = runAgentBattle(config);
    const inspector = new AntBattleInspector();
    const snapshot: AntBattleInspectorSnapshot = {
      time: 0,
      battlePhase: "engage",
      ants: inspected.frameLogs.slice(0, 6).map((frame) => ant(frame.id, frame.x, frame.y, {
        velocity: { x: frame.vx, y: frame.vy },
        heading: frame.heading,
        state: frame.state,
        renderIndex: frame.renderIndex,
        health: frame.hp,
        gaitPhase: frame.gaitPhase,
      })),
    };
    const before = JSON.stringify(snapshot);
    inspector.inspect(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(inspected.reason).toBe(baseline.reason);
    expect(inspected.summary).toEqual(baseline.summary);
    expect(inspected.frameLogs.slice(0, 24)).toEqual(baseline.frameLogs.slice(0, 24));
  });

  it("keeps overhead bounded for large linear snapshot streams", () => {
    const inspector = new AntBattleInspector(64);
    const ants = Array.from({ length: 160 }, (_, index) => ant(index + 1, index * 0.2, 0, { renderIndex: index }));
    const start = performance.now();
    for (let i = 0; i < 80; i += 1) {
      inspector.inspect({
        time: i / 60,
        battlePhase: "engage",
        ants: ants.map((item) => ({
          ...item,
          position: { x: item.position.x + i * 0.01, y: item.position.y },
        })),
      });
    }
    expect(performance.now() - start).toBeLessThan(250);
  });
});
