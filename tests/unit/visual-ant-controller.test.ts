import { describe, expect, it } from "vitest";
import { createExpeditionScenario } from "../../src/expedition/scenario";
import { ExpeditionBattleSession } from "../../src/expedition/session";
import {
  VisualAntController,
  type VisualAntTarget,
  calculateVisualAntJitterMetrics,
  createVisualAntTargetsFromSlimes,
  jitterTraceSample,
  nearestVisualAntGap,
} from "../../src/expedition/visualAnt";

const BASE_TARGET: VisualAntTarget = {
  id: "a",
  anchorNodeId: "anchor",
  x: 0,
  z: 0,
  desiredHeading: 0,
  scale: 1,
  state: "marching",
  pressure: 0,
};

describe("visual ant controller", () => {
  it("converges to a stable anchor without visible vibration", () => {
    const samples = sampleController((time) => ({
      ...BASE_TARGET,
      x: time < 0.05 ? 7 : 0,
      state: time < 3.2 ? "regrouping" : "idle",
    }), 4);
    const tail = samples.slice(-90);
    const metrics = calculateVisualAntJitterMetrics(tail);
    const final = tail.at(-1);

    expect(Math.hypot(final?.x ?? 0, final?.z ?? 0)).toBeLessThan(1.25);
    expect(metrics.microMotionRatio).toBeLessThan(0.08);
    expect(metrics.idleDrift).toBeLessThan(0.015);
    expect(metrics.runningInPlaceRatio).toBe(0);
  });

  it("tracks a moving anchor without frame-by-frame heading flips", () => {
    const samples = sampleController((time) => ({
      ...BASE_TARGET,
      x: time * 3.2,
      desiredHeading: Math.PI / 2,
    }), 5);
    const metrics = calculateVisualAntJitterMetrics(samples.slice(30));

    expect(metrics.directionFlipRate).toBeLessThan(0.05);
    expect(metrics.headingVelocityMismatch).toBeLessThan(0.08);
    expect(samples.at(-1)?.x).toBeGreaterThan(8);
  });

  it("ignores tiny target noise instead of buzzing in place", () => {
    const samples = sampleController((time) => ({
      ...BASE_TARGET,
      x: Math.sin(time * 40) * 0.12,
      z: Math.cos(time * 37) * 0.12,
      state: "idle",
    }), 3);
    const metrics = calculateVisualAntJitterMetrics(samples);

    expect(metrics.targetSnapDistance).toBeLessThan(0.35);
    expect(metrics.microMotionRatio).toBeLessThan(0.05);
    expect(metrics.idleDrift).toBeLessThan(0.01);
  });

  it("blends a sudden anchor jump without unbounded vibration", () => {
    const samples = sampleController((time) => ({
      ...BASE_TARGET,
      x: time < 1 ? 0 : 16,
      anchorNodeId: time < 1 ? "anchor-a" : "anchor-b",
      state: time < 1 ? "idle" : "regrouping",
      desiredHeading: Math.PI / 2,
    }), 5);
    const metrics = calculateVisualAntJitterMetrics(samples);
    const final = samples.at(-1);

    expect(final?.x).toBeGreaterThan(11);
    expect(metrics.targetSnapDistance).toBeLessThan(2.8);
    expect(metrics.directionFlipRate).toBeLessThan(0.18);
    expect(metrics.accelerationSpikeRate).toBeLessThan(3.5);
  });

  it("routes by facing and moving toward the retreat direction", () => {
    const samples = sampleController((time) => ({
      ...BASE_TARGET,
      z: -22,
      desiredHeading: Math.PI,
      state: "routing",
      pressure: time < 0.4 ? 25 : 0,
    }), 2.2);
    const final = samples.at(-1);
    const metrics = calculateVisualAntJitterMetrics(samples.slice(15));

    expect(final?.z).toBeLessThan(-13);
    expect(Math.abs(angleDelta(final?.heading ?? 0, Math.PI))).toBeLessThan(0.28);
    expect(metrics.headingVelocityMismatch).toBeLessThan(0.08);
  });

  it("pushes slowly toward contact without buzz", () => {
    const samples = sampleController((time) => ({
      ...BASE_TARGET,
      x: 4,
      desiredHeading: Math.PI / 2,
      state: "pushing",
      pressure: time > 0.8 ? 58 : 44,
    }), 3);
    const metrics = calculateVisualAntJitterMetrics(samples.slice(20));
    const speedMax = Math.max(...samples.map((sample) => Math.hypot(sample.velocityX, sample.velocityZ)));

    expect(speedMax).toBeLessThan(5.2);
    expect(metrics.microMotionRatio).toBeLessThan(0.14);
    expect(metrics.directionFlipRate).toBeLessThan(0.2);
  });

  it("advances gait only while moving", () => {
    const moving = sampleController((time) => ({
      ...BASE_TARGET,
      x: Math.min(9, time * 5),
      desiredHeading: Math.PI / 2,
    }), 2);
    const movingGaitDelta = Math.abs(angleDelta(moving[0].gaitPhase, moving.at(-1)!.gaitPhase));

    const idleController = new VisualAntController("player");
    const idleA = idleController.update([{ ...BASE_TARGET, state: "idle" }], 0)[0];
    const idleB = idleController.update([{ ...BASE_TARGET, state: "idle" }], 1)[0];

    expect(movingGaitDelta).toBeGreaterThan(0.2);
    expect(idleB.gaitPhase).toBe(idleA.gaitPhase);
  });

  it("keeps a stationary marching group alive without collapsing spacing", () => {
    const controller = new VisualAntController("player");
    const targets = Array.from({ length: 18 }, (_, index) => ({
      ...BASE_TARGET,
      id: `a-${index}`,
      anchorNodeId: `anchor-${index}`,
      x: (index % 6) * 3.2,
      z: Math.floor(index / 6) * 3.4,
      desiredHeading: Math.PI / 2,
    }));
    let states = controller.update(targets, 0);
    for (let i = 1; i <= 180; i += 1) {
      states = controller.update(targets, i / 60);
    }
    const snapshot = controller.debugSnapshot();

    expect(snapshot.averageSpeed).toBeGreaterThan(0.12);
    expect(nearestVisualAntGap(states)).toBeGreaterThan(1.2);
  });

  it("visual updates do not change deterministic BattleSimulation results", () => {
    const scenario = createExpeditionScenario({
      activeAnts: 80,
      soldierAnts: 28,
      attackPower: 2.8,
      defensePower: 2.1,
      territory: 5,
      enemyThreat: 7,
      seed: 2468,
    });
    scenario.enemySeed.morale = 23;
    const plain = runSession(scenario, false);
    const withVisual = runSession(scenario, true);

    expect(withVisual.summary).toEqual(plain.summary);
    expect(withVisual.visualMetrics.microMotionRatio).toBeLessThan(0.18);
    expect(withVisual.visualMetrics.directionFlipRate).toBeLessThan(0.35);
    expect(withVisual.invalidStateCount).toBe(0);
  });
});

function sampleController(
  targetAt: (time: number) => VisualAntTarget,
  duration: number,
  dt = 1 / 60,
) {
  const controller = new VisualAntController("player");
  const samples = [];
  for (let time = 0; time <= duration + 0.0001; time += dt) {
    const state = controller.update([targetAt(time)], time)[0];
    samples.push(jitterTraceSample(time, state));
  }
  return samples;
}

function runSession(
  scenario: ReturnType<typeof createExpeditionScenario>,
  updateVisual: boolean,
) {
  const session = new ExpeditionBattleSession(scenario);
  const playerVisual = new VisualAntController("player");
  const enemyVisual = new VisualAntController("enemy");
  const visualSamples = [];
  let invalidStateCount = 0;
  let result = session.getResult();

  for (let i = 0; i < 420 && !result; i += 1) {
    result = session.update(i % 2 === 0 ? 1 / 30 : 1 / 120);
    if (updateVisual) {
      const playerStates = playerVisual.update(
        createVisualAntTargetsFromSlimes(session.state.playerSlimes, 384),
        session.state.elapsed,
      );
      enemyVisual.update(
        createVisualAntTargetsFromSlimes(session.state.enemySlimes, 384),
        session.state.elapsed,
      );
      const lead = playerStates[0];
      if (lead) {
        if (![lead.x, lead.z, lead.angle, lead.velocityX, lead.velocityZ].every(Number.isFinite)) {
          invalidStateCount += 1;
        }
        visualSamples.push(jitterTraceSample(session.state.elapsed, lead));
      }
    }
  }
  if (!result) throw new Error("battle did not resolve");
  return {
    summary: {
      winner: result.winner,
      reason: result.reason,
      elapsed: Number(result.elapsed.toFixed(4)),
      minCohesion: Number(result.metrics.minPlayerCohesion.toFixed(4)),
    },
    visualMetrics: calculateVisualAntJitterMetrics(visualSamples),
    invalidStateCount,
  };
}

function angleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
