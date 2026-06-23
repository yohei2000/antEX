import {
  type ExpeditionOutcome,
  type ExpeditionScenario,
} from "./scenario";
import { BattleSimulation } from "./sim/simulation";
import type { ArmySlime, BattleState, RandomSource, Side } from "./sim/types";

export type ExpeditionSideTelemetry = {
  morale: number;
  cohesion: number;
  fatigue: number;
  pressure: number;
  encirclement: number;
  splitStress: number;
  armyCount: number;
  posture: string;
  routingCount: number;
};

export type ExpeditionTelemetry = {
  elapsed: number;
  outcome?: ExpeditionOutcome;
  player: ExpeditionSideTelemetry;
  enemy: ExpeditionSideTelemetry;
};

export type ExpeditionBattleResult = {
  outcome: ExpeditionOutcome;
  elapsedSeconds: number;
  playerMorale: number;
  enemyMorale: number;
  playerArmyCount: number;
  enemyArmyCount: number;
  finishedAt: number;
};

export class ExpeditionBattleSession {
  readonly scenario: ExpeditionScenario;
  readonly simulation: BattleSimulation;
  private result?: ExpeditionBattleResult;

  constructor(scenario: ExpeditionScenario, rng?: RandomSource) {
    this.scenario = scenario;
    this.simulation = new BattleSimulation({
      player: scenario.playerSeed,
      enemy: scenario.enemySeed,
      rng,
    });
    this.simulation.state.speed = 1.5;
  }

  get state(): BattleState {
    return this.simulation.state;
  }

  update(dt: number): ExpeditionBattleResult | undefined {
    if (this.result) return this.result;
    this.simulation.update(dt);
    const { winner } = this.simulation.state;
    if (winner) {
      this.result = this.createResult(winner);
    }
    return this.result;
  }

  getResult(): ExpeditionBattleResult | undefined {
    return this.result;
  }

  telemetry(): ExpeditionTelemetry {
    return {
      elapsed: this.simulation.state.elapsed,
      outcome: this.result?.outcome,
      player: sideTelemetry(this.simulation.state.playerSlimes),
      enemy: sideTelemetry(this.simulation.state.enemySlimes),
    };
  }

  private createResult(outcome: Side | "draw"): ExpeditionBattleResult {
    const { playerSlimes, enemySlimes, elapsed } = this.simulation.state;
    return {
      outcome,
      elapsedSeconds: elapsed,
      playerMorale: average(playerSlimes, "morale"),
      enemyMorale: average(enemySlimes, "morale"),
      playerArmyCount: playerSlimes.length,
      enemyArmyCount: enemySlimes.length,
      finishedAt: Date.now(),
    };
  }
}

function sideTelemetry(slimes: ArmySlime[]): ExpeditionSideTelemetry {
  const lead = slimes.find((slime) => !slime.isRouting) ?? slimes[0];
  return {
    morale: average(slimes, "morale"),
    cohesion: average(slimes, "cohesion"),
    fatigue: average(slimes, "fatigue"),
    pressure: average(slimes, "pressure"),
    encirclement: average(slimes, "encirclement"),
    splitStress: average(slimes, "splitStress"),
    armyCount: slimes.length,
    posture: lead?.posture ?? "retreat",
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
