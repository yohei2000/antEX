import type { BattleState, RandomSource, SlimePosture } from "./types";
import { createArmySlime } from "./slime";
import { updateOrder } from "./slimeOrders";
import { enforceZocExclusion, updateSlime } from "./slimePhysics";
import { resolveCombat } from "./slimeCombat";
import { updateEncirclement } from "./encirclement";
import { updateEnemyAI } from "./enemyAI";
import { splitArmySlime, shouldSplitSlime, updateSplitStress } from "./slimeSplit";
import { updateRoutingState } from "./routing";
import { average, distance, scale, sub } from "./vector";
import type { ArmySlime } from "./types";

export type BattleArmySeed = {
  id?: string;
  mass?: number;
  morale?: number;
  cohesion?: number;
  fatigue?: number;
  toughness?: number;
  elasticity?: number;
  viscosity?: number;
  width?: number;
  depth?: number;
  particleCount?: number;
  profile?: string;
  posture?: SlimePosture;
  manualControl?: boolean;
};

export type BattleSimulationOptions = {
  player?: BattleArmySeed;
  enemy?: BattleArmySeed;
  rng?: RandomSource;
};

export class BattleSimulation {
  readonly state: BattleState;
  readonly bounds = { width: 1000, height: 650 };
  private readonly rng: RandomSource;

  constructor(options: BattleSimulationOptions = {}) {
    this.rng = options.rng ?? Math.random;
    const playerSeed = options.player ?? {};
    const enemySeed = options.enemy ?? {};
    const player = createArmySlime(
      playerSeed.id ?? "colony-column",
      "player",
      { x: 300, y: 325 },
      { x: 1, y: 0 },
      {
        ...playerSeed,
        manualControl: playerSeed.manualControl ?? false,
        rng: this.rng,
      },
    );
    const enemy = createArmySlime(
      enemySeed.id ?? "rival-column",
      "enemy",
      { x: 700, y: 325 },
      { x: -1, y: 0 },
      {
        ...enemySeed,
        manualControl: enemySeed.manualControl ?? false,
        rng: this.rng,
      },
    );
    if (playerSeed.posture) player.posture = playerSeed.posture;
    if (enemySeed.posture) enemy.posture = enemySeed.posture;
    this.state = {
      player,
      enemy,
      playerSlimes: [player],
      enemySlimes: [enemy],
      elapsed: 0,
      speed: 1,
      paused: false,
    };
  }

  update(rawDt: number): void {
    if (this.state.paused) return;
    const isResolved = Boolean(this.state.winner);
    if (
      isResolved &&
      this.state.winnerAt !== undefined &&
      this.state.elapsed - this.state.winnerAt > 6
    ) {
      return;
    }
    const dt =
      Math.min(rawDt, 0.033) *
      this.state.speed *
      (isResolved ? 0.32 : 1);
    this.state.elapsed += dt;
    const players = this.state.playerSlimes;
    const enemies = this.state.enemySlimes;

    if (!isResolved) {
      for (const player of players) {
        const enemy = this.nearest(player, enemies);
        if (enemy) updateRoutingState(player, enemy, this.state.elapsed);
      }
      for (const enemy of enemies) {
        const player = this.nearest(enemy, players);
        if (player) updateRoutingState(enemy, player, this.state.elapsed);
      }

      for (const slime of [...players, ...enemies]) {
        updateOrder(slime, this.state.elapsed);
      }
      for (const enemy of enemies) {
        const target = this.nearest(enemy, players);
        if (target) updateEnemyAI(enemy, target, this.state.elapsed, this.rng);
      }
      for (const player of players) {
        if (player.manualControl) continue;
        const target = this.nearest(player, enemies);
        if (target) updateEnemyAI(player, target, this.state.elapsed, this.rng);
      }

      for (const player of players) {
        const enemy = this.nearest(player, enemies);
        if (enemy) resolveCombat(player, enemy, dt);
      }
      for (const enemy of enemies) {
        const player = this.nearest(enemy, players);
        if (player) resolveCombat(enemy, player, dt);
      }
    }

    for (const player of players) {
      const enemy = this.nearest(player, enemies);
      if (enemy) updateSlime(player, enemy, dt, this.bounds);
    }
    for (const enemy of enemies) {
      const player = this.nearest(enemy, players);
      if (player) updateSlime(enemy, player, dt, this.bounds);
    }
    this.enforceZocOwnership(players, enemies, dt);

    if (!isResolved) {
      for (const player of players) {
        const enemy = this.nearest(player, enemies);
        if (enemy) updateEncirclement(player, enemy, dt);
      }
      for (const enemy of enemies) {
        const player = this.nearest(enemy, players);
        if (player) updateEncirclement(enemy, player, dt);
      }

      this.state.playerSlimes = this.processSplits(players, dt);
      this.state.enemySlimes = this.processSplits(enemies, dt);
    }
    this.state.player =
      this.state.playerSlimes.find((slime) => slime.isSelected) ??
      this.state.playerSlimes[0];
    this.state.enemy = this.nearest(this.state.player, this.state.enemySlimes) ?? this.state.enemySlimes[0];

    if (!isResolved) {
      const playerAlive = this.sideCanStillFight(this.state.playerSlimes);
      const enemyAlive = this.sideCanStillFight(this.state.enemySlimes);
      if (!playerAlive && !enemyAlive) this.finishBattle("draw");
      else if (!playerAlive) this.finishBattle("enemy");
      else if (!enemyAlive) this.finishBattle("player");
    }
  }

  cycleSpeed(): void {
    this.state.speed = this.state.speed === 1 ? 1.5 : this.state.speed === 1.5 ? 0.5 : 1;
  }

  private nearest(origin: ArmySlime, candidates: ArmySlime[]): ArmySlime | undefined {
    return candidates.reduce<ArmySlime | undefined>((nearest, candidate) => {
      if (!nearest) return candidate;
      return distance(origin.center, candidate.center) <
        distance(origin.center, nearest.center)
        ? candidate
        : nearest;
    }, undefined);
  }

  private processSplits(slimes: ArmySlime[], dt: number): ArmySlime[] {
    const result: ArmySlime[] = [];
    for (const slime of slimes) {
      updateSplitStress(slime, dt);
      if (shouldSplitSlime(slime)) {
        result.push(...splitArmySlime(slime));
      } else {
        result.push(slime);
      }
    }
    return result;
  }

  private enforceZocOwnership(
    players: ArmySlime[],
    enemies: ArmySlime[],
    dt: number,
  ): void {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const player of players) {
        for (const enemy of enemies) {
          enforceZocExclusion(player, enemy, true);
          enforceZocExclusion(enemy, player, true);
        }
      }
    }
    for (const slime of [...players, ...enemies]) {
      const nextCenter = average(slime.nodes.map((node) => node.position));
      slime.velocity = scale(sub(nextCenter, slime.center), 1 / Math.max(dt, 0.001));
      slime.center = nextCenter;
    }
  }

  private sideCanStillFight(slimes: ArmySlime[]): boolean {
    return slimes.some((slime) => slime.morale > 3 && !slime.isRouting);
  }

  private finishBattle(winner: BattleState["winner"]): void {
    if (this.state.winner) return;
    this.state.winner = winner;
    this.state.winnerAt = this.state.elapsed;
  }
}
