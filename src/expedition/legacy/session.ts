import {
  type ExpeditionOutcome,
  type ExpeditionScenario,
} from "./scenario";
import {
  type BattleEndReason,
  type ExpeditionBattleMetrics,
  type ExpeditionBattleResult,
  diagnoseBattle,
} from "./result";
import { BattleSimulation } from "./sim/simulation";
import { postureLabel } from "./sim/slime";
import type { ArmySlime, BattleState, RandomSource, SlimePosture } from "./sim/types";
import { distance } from "./sim/vector";

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_ACCUMULATED_SECONDS = 0.45;
const MAX_BATTLE_ELAPSED_SECONDS = 58;
const OBJECTIVE_POINT = { x: 500, y: 325 };

export type ExpeditionSideTelemetry = {
  morale: number;
  cohesion: number;
  fatigue: number;
  pressure: number;
  encirclement: number;
  splitStress: number;
  armyCount: number;
  posture: string;
  density: number;
  frontWidth: number;
  routingCount: number;
};

export type ExpeditionTelemetry = {
  elapsed: number;
  outcome?: ExpeditionOutcome;
  frontState: "押している" | "拮抗" | "押されている";
  danger: string;
  result?: ExpeditionBattleResult;
  player: ExpeditionSideTelemetry;
  enemy: ExpeditionSideTelemetry;
};

export class ExpeditionBattleSession {
  readonly scenario: ExpeditionScenario;
  readonly simulation: BattleSimulation;
  private readonly metricsRecorder = new BattleMetricsRecorder();
  private result?: ExpeditionBattleResult;
  private accumulator = 0;

  constructor(scenario: ExpeditionScenario, rng?: RandomSource) {
    this.scenario = scenario;
    this.simulation = new BattleSimulation({
      player: scenario.playerSeed,
      enemy: scenario.enemySeed,
      rng: rng ?? seededRandom(scenario.seed),
    });
    this.simulation.state.speed = 1.5;
    this.metricsRecorder.record(this.simulation.state);
  }

  get state(): BattleState {
    return this.simulation.state;
  }

  update(dt: number): ExpeditionBattleResult | undefined {
    if (this.result) return this.result;
    this.accumulator += Math.min(Math.max(0, dt), MAX_ACCUMULATED_SECONDS);

    let guard = 0;
    while (this.accumulator >= FIXED_STEP_SECONDS && !this.result && guard < 90) {
      this.simulation.update(FIXED_STEP_SECONDS);
      this.metricsRecorder.record(this.simulation.state);
      this.accumulator -= FIXED_STEP_SECONDS;
      guard += 1;

      const { winner } = this.simulation.state;
      if (winner) this.result = this.createResult(winner, reasonForWinner(winner));
      else if (this.simulation.state.elapsed >= MAX_BATTLE_ELAPSED_SECONDS) {
        this.result = this.createResult("draw", "timeout_draw");
      }
    }

    return this.result;
  }

  getResult(): ExpeditionBattleResult | undefined {
    return this.result;
  }

  telemetry(): ExpeditionTelemetry {
    const metrics = this.metricsRecorder.snapshot(this.simulation.state);
    const player = sideTelemetry(this.simulation.state.playerSlimes);
    const enemy = sideTelemetry(this.simulation.state.enemySlimes);
    return {
      elapsed: this.simulation.state.elapsed,
      outcome: this.result?.winner,
      frontState: frontState(metrics.averageFrontVelocity),
      danger: dangerLabel(player),
      result: this.result,
      player,
      enemy,
    };
  }

  private createResult(
    outcome: ExpeditionOutcome,
    reason: BattleEndReason,
  ): ExpeditionBattleResult {
    const { playerSlimes, enemySlimes } = this.simulation.state;
    const metrics = this.metricsRecorder.snapshot(this.simulation.state);
    const diagnosis = diagnoseBattle(metrics);
    return {
      winner: outcome,
      outcome,
      reason,
      elapsed: metrics.elapsed,
      elapsedSeconds: metrics.elapsed,
      metrics,
      diagnosis,
      playerMorale: average(playerSlimes, "morale"),
      enemyMorale: average(enemySlimes, "morale"),
      playerArmyCount: playerSlimes.length,
      enemyArmyCount: enemySlimes.length,
      finishedAt: metrics.elapsed,
    };
  }
}

class BattleMetricsRecorder {
  private minPlayerMorale = Number.POSITIVE_INFINITY;
  private minPlayerCohesion = Number.POSITIVE_INFINITY;
  private maxPlayerFatigue = 0;
  private maxPlayerEncirclement = 0;
  private pressureSeconds = 0;
  private maxPressure = 0;
  private objectiveControlSeconds = 0;
  private routedAt: number | undefined;
  private previousElapsed = 0;
  private previousPlayerCenterX: number | undefined;
  private frontVelocityTotal = 0;
  private frontVelocitySamples = 0;
  private postureSeconds = new Map<SlimePosture | "retreat", number>();

  record(state: BattleState): void {
    const elapsed = state.elapsed;
    const dt = Math.max(0, elapsed - this.previousElapsed);
    const player = leadSlime(state.playerSlimes);
    const enemy = leadSlime(state.enemySlimes);
    if (!player || !enemy) return;

    const playerStats = sideTelemetry(state.playerSlimes);
    this.minPlayerMorale = Math.min(this.minPlayerMorale, playerStats.morale);
    this.minPlayerCohesion = Math.min(this.minPlayerCohesion, playerStats.cohesion);
    this.maxPlayerFatigue = Math.max(this.maxPlayerFatigue, playerStats.fatigue);
    this.maxPlayerEncirclement = Math.max(this.maxPlayerEncirclement, playerStats.encirclement);
    this.maxPressure = Math.max(this.maxPressure, playerStats.pressure);
    if (playerStats.pressure > 18) this.pressureSeconds += dt;
    if (this.routedAt === undefined && playerStats.routingCount > 0) this.routedAt = elapsed;

    if (this.previousPlayerCenterX !== undefined && dt > 0) {
      this.frontVelocityTotal += (player.center.x - this.previousPlayerCenterX) / dt;
      this.frontVelocitySamples += 1;
    }
    this.previousPlayerCenterX = player.center.x;

    if (dt > 0 && controlsObjective(player, enemy)) this.objectiveControlSeconds += dt;
    const posture = player.isRouting ? "retreat" : player.posture;
    this.postureSeconds.set(posture, (this.postureSeconds.get(posture) ?? 0) + dt);
    this.previousElapsed = elapsed;
  }

  snapshot(state: BattleState): ExpeditionBattleMetrics {
    const elapsed = Math.max(state.elapsed, this.previousElapsed);
    const timeline = [...this.postureSeconds.entries()]
      .map(([posture, seconds]) => ({ posture, seconds }))
      .sort((a, b) => b.seconds - a.seconds);
    const finalPosture = leadSlime(state.playerSlimes)?.posture ?? "retreat";
    return {
      elapsed,
      minPlayerMorale: finiteOr(this.minPlayerMorale, average(state.playerSlimes, "morale")),
      minPlayerCohesion: finiteOr(this.minPlayerCohesion, average(state.playerSlimes, "cohesion")),
      maxPlayerFatigue: this.maxPlayerFatigue,
      maxPlayerEncirclement: this.maxPlayerEncirclement,
      pressureSeconds: this.pressureSeconds,
      maxPressure: this.maxPressure,
      averageFrontVelocity:
        this.frontVelocitySamples > 0
          ? this.frontVelocityTotal / this.frontVelocitySamples
          : 0,
      objectiveControlSeconds: this.objectiveControlSeconds,
      objectiveControlRatio:
        elapsed > 0 ? this.objectiveControlSeconds / elapsed : 0,
      routedAt: this.routedAt,
      mainPostureTimeline: timeline,
      finalPosture: finalPosture === undefined ? "retreat" : finalPosture,
    };
  }
}

function sideTelemetry(slimes: ArmySlime[]): ExpeditionSideTelemetry {
  const lead = leadSlime(slimes);
  return {
    morale: average(slimes, "morale"),
    cohesion: average(slimes, "cohesion"),
    fatigue: average(slimes, "fatigue"),
    pressure: average(slimes, "pressure"),
    encirclement: average(slimes, "encirclement"),
    splitStress: average(slimes, "splitStress"),
    armyCount: slimes.length,
    posture: lead ? postureLabel(lead.isRouting ? "retreat" : lead.posture) : "後退",
    density: average(slimes, "currentDensity"),
    frontWidth: average(slimes, "currentWidth"),
    routingCount: slimes.filter((slime) => slime.isRouting).length,
  };
}

function average(slimes: ArmySlime[], key: keyof ArmySlime): number {
  if (!slimes.length) return 0;
  return (
    slimes.reduce((sum, slime) => {
      const value = slime[key];
      return sum + (typeof value === "number" ? value : 0);
    }, 0) / slimes.length
  );
}

function leadSlime(slimes: ArmySlime[]): ArmySlime | undefined {
  return slimes.find((slime) => !slime.isRouting) ?? slimes[0];
}

function controlsObjective(player: ArmySlime, enemy: ArmySlime): boolean {
  return distance(player.center, OBJECTIVE_POINT) <= distance(enemy.center, OBJECTIVE_POINT);
}

function reasonForWinner(winner: ExpeditionOutcome): BattleEndReason {
  if (winner === "player") return "enemy_routed";
  if (winner === "enemy") return "player_routed";
  return "both_routed";
}

function frontState(velocity: number): ExpeditionTelemetry["frontState"] {
  if (velocity > 7) return "押している";
  if (velocity < -7) return "押されている";
  return "拮抗";
}

function dangerLabel(player: ExpeditionSideTelemetry): string {
  if (player.encirclement > 0.34) return "包囲";
  if (player.cohesion < 44) return "結束低下";
  if (player.fatigue > 62) return "疲労";
  if (player.pressure > 54) return "前線圧";
  if (player.morale < 38) return "士気低下";
  return "安定";
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
