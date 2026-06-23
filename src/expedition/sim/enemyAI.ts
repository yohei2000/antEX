import type { ArmySlime, RandomSource, SlimePosture, Vector2Like } from "./types";
import { flankAccess } from "./encirclement";
import { issueOrder } from "./slimeOrders";
import { add, clamp, normalize, perpendicular, scale, sub } from "./vector";

const ENEMY_AI_MISTAKE_RATE = 0.24;
const ENEMY_AI_BLUNDER_RATE = 0.06;
const ENEMY_AI_AIM_ERROR_RATIO = 0.24;

type EnemyDecision = {
  posture: SlimePosture;
  target: Vector2Like;
  moveScale: number;
  wingScale: number;
};

function targetShape(enemy: ArmySlime, posture: SlimePosture) {
  if (posture === "breakthrough" || posture === "contract") {
    return { width: 188, depth: 220, density: 1.2 };
  }
  if (posture === "spread" || posture === "envelop") {
    return { width: 390, depth: 145, density: 0.78 };
  }
  return { width: 250, depth: 180, density: 1 };
}

function weakPoint(player: ArmySlime, enemy: ArmySlime): Vector2Like {
  const lateral = perpendicular(player.facing);
  const side = Math.sin(enemy.center.y * 0.017) > 0 ? 1 : -1;
  return add(player.center, scale(lateral, player.currentWidth * 0.09 * side));
}

function mistakenPosture(posture: SlimePosture, rng: RandomSource): SlimePosture {
  if (posture === "breakthrough") return rng() < 0.55 ? "spread" : "hold";
  if (posture === "envelop") return rng() < 0.55 ? "contract" : "neutral";
  if (posture === "spread") return "contract";
  if (posture === "contract") return "spread";
  return posture;
}

function offsetAim(
  target: Vector2Like,
  player: ArmySlime,
  enemy: ArmySlime,
  severity: number,
  rng: RandomSource,
): Vector2Like {
  const lateral = perpendicular(player.facing);
  const direction = normalize(sub(player.center, enemy.center));
  const side = rng() < 0.5 ? -1 : 1;
  const lateralError =
    player.currentWidth * ENEMY_AI_AIM_ERROR_RATIO * severity * side;
  const depthError =
    player.currentDepth * 0.14 * severity * (rng() - 0.5);
  return add(target, add(scale(lateral, lateralError), scale(direction, depthError)));
}

function applyMistake(
  enemy: ArmySlime,
  player: ArmySlime,
  posture: SlimePosture,
  target: Vector2Like,
  rng: RandomSource,
): EnemyDecision {
  if (posture === "retreat") {
    return { posture, target, moveScale: 1, wingScale: 1 };
  }

  const roll = rng();
  if (roll < ENEMY_AI_BLUNDER_RATE) {
    enemy.aiThinkAt += 1.1 + rng() * 1.4;
    return {
      posture: rng() < 0.55 ? "hold" : "neutral",
      target: { ...enemy.center },
      moveScale: 0.28,
      wingScale: 0.18,
    };
  }

  if (roll < ENEMY_AI_MISTAKE_RATE) {
    enemy.aiThinkAt += 0.45 + rng() * 0.8;
    const nextPosture = mistakenPosture(posture, rng);
    return {
      posture: nextPosture,
      target:
        nextPosture === "hold" || nextPosture === "neutral"
          ? { ...enemy.center }
          : offsetAim(target, player, enemy, 1, rng),
      moveScale: 0.62,
      wingScale: 0.52,
    };
  }

  return {
    posture,
    target: rng() < 0.18 ? offsetAim(target, player, enemy, 0.55, rng) : target,
    moveScale: 1,
    wingScale: 1,
  };
}

export function updateEnemyAI(
  enemy: ArmySlime,
  player: ArmySlime,
  now: number,
  rng: RandomSource = Math.random,
): void {
  if (enemy.isRouting) return;
  if (now < enemy.aiThinkAt || enemy.activeOrder?.status === "transmitting") return;
  enemy.aiThinkAt = now + 2.1 + rng() * 1.25;

  const access = flankAccess(enemy, player);
  let posture: SlimePosture = "neutral";
  let target = player.center;

  if (enemy.isEncircled || enemy.encirclement > 0.36) {
    posture = "breakthrough";
    target = weakPoint(player, enemy);
  } else if (enemy.gapRisk > 0.68 || enemy.splitStress > 0.32) {
    posture = "contract";
    target = add(enemy.center, scale(normalize(sub(player.center, enemy.center)), 38));
  } else if (enemy.cohesion < 35 || enemy.morale < 30) {
    posture = "retreat";
    target = add(enemy.center, scale(normalize(sub(enemy.center, player.center)), 180));
  } else if (
    player.gapRisk > 0.66 ||
    (player.currentWidth > player.baseWidth * 1.34 && player.currentDensity < 0.96)
  ) {
    posture = "breakthrough";
    target = weakPoint(player, enemy);
  } else if (player.currentDensity > 1.28 && access > 0.22) {
    posture = "envelop";
  } else if (enemy.morale > player.morale + 14 && player.morale < 44) {
    posture = "envelop";
  } else if (enemy.fatigue > 58) {
    posture = "hold";
    target = enemy.center;
  } else {
    posture =
      access > 0.2 || player.currentDensity > 1.22 || rng() > 0.72
        ? "envelop"
        : "breakthrough";
    if (posture === "breakthrough") target = weakPoint(player, enemy);
  }
  if (posture === "envelop") {
    target = weakPoint(player, enemy);
  }

  const decision = applyMistake(enemy, player, posture, target, rng);
  posture = decision.posture;
  target = decision.target;

  const shape = targetShape(enemy, posture);
  const direction = normalize(sub(target, enemy.center));
  const moveDistance =
    posture === "retreat"
      ? 150
      : posture === "hold" || posture === "neutral"
        ? 0
        : posture === "envelop"
          ? 64
          : 92;
  const wingAdvance =
    posture === "envelop"
      ? clamp(
          (player.currentWidth * 0.2 + enemy.currentWidth * 0.08) *
            decision.wingScale,
          22,
          118,
        )
      : 0;
  issueOrder(enemy, {
    posture,
    targetCenter: add(enemy.center, scale(direction, moveDistance * decision.moveScale)),
    targetDirection: direction,
    targetWidth: clamp(shape.width, 145, 505),
    targetDepth: clamp(shape.depth, 112, 275),
    targetDensity: shape.density,
    targetLeftWingAdvance: wingAdvance,
    targetRightWingAdvance: wingAdvance,
    targetFocusPoint:
      posture === "breakthrough" || posture === "envelop"
        ? target
        : undefined,
    issuedAt: now,
  });
}
