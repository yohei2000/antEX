import type { ArmySlime } from "./types";
import { clamp, clamp01, distance, dot, normalize, sub } from "./vector";
import { zocContinuity } from "./zoc";

export function ringIntegrity(slime: ArmySlime): number {
  const averageDensity = Math.min(1.5, slime.currentDensity) / 1.5;
  const cohesionFactor = slime.cohesion / 100;
  const reserveSupport = clamp01(1 - slime.fatigue / 145);
  const commandCoverage = clamp01(1 - slime.commandDelay / 4);
  return clamp01(
    averageDensity *
      zocContinuity(slime) *
      cohesionFactor *
      reserveSupport *
      commandCoverage *
      1.8,
  );
}

export function flankAccess(attacker: ArmySlime, defender: ArmySlime): number {
  const toAttacker = normalize(sub(attacker.center, defender.center));
  const frontal = Math.abs(dot(defender.facing, toAttacker));
  const widthAdvantage = attacker.currentWidth / Math.max(100, defender.currentWidth);
  return clamp01((1 - frontal) * 0.45 + (widthAdvantage - 0.75) * 0.65);
}

export function updateEncirclement(attacker: ArmySlime, defender: ArmySlime, dt: number): void {
  const range = distance(attacker.center, defender.center);
  const reach = attacker.currentWidth * 0.68 + defender.currentWidth * 0.32;
  const postureBonus = attacker.posture === "envelop" ? 0.84 : attacker.posture === "spread" ? 0.26 : 0;
  const access = flankAccess(attacker, defender);
  const integrity = ringIntegrity(attacker);
  const widthCoverage = clamp01(
    (attacker.currentWidth - defender.currentWidth * 0.72) /
      Math.max(95, defender.currentWidth * 0.8),
  );
  const wingAdvance = clamp01(
    (attacker.desiredLeftWingAdvance + attacker.desiredRightWingAdvance) /
      Math.max(130, attacker.currentDepth * 1.1),
  );
  const contactGrip = clamp01(
    Math.max(...attacker.contactPatches.map((patch) => patch.ownFrontage), 0) *
      1.35,
  );
  const wrapAccess = Math.max(access, widthCoverage * 0.62);
  const wrapMotion = 0.72 + wingAdvance * 0.42 + contactGrip * 0.22;
  const attackerBalance = attacker.side === "player" ? 0.98 : 0.92;
  const gain =
    range < reach + 165
      ? postureBonus * wrapAccess * integrity * wrapMotion * 0.11 * attackerBalance
      : 0;
  defender.encirclement = clamp01(
    defender.encirclement + gain * dt - (gain === 0 ? 0.045 * dt : 0),
  );
  defender.isEncircled = defender.encirclement > 0.56;
  attacker.isEncircling = defender.encirclement > 0.16;

  if (defender.encirclement > 0.22) {
    const pressure = defender.encirclement;
    const defenderVulnerability = defender.side === "enemy" ? 1.0 : 0.9;
    defender.morale = clamp(
      defender.morale -
        pressure *
          (defender.isEncircled ? 1.0 : 0.5) *
          defenderVulnerability *
          dt,
      0,
      100,
    );
    defender.fatigue = clamp(
      defender.fatigue +
        pressure *
          (defender.isEncircled ? 1.05 : 0.58) *
          defenderVulnerability *
          dt,
      0,
      100,
    );
    defender.pressure = clamp(
      defender.pressure +
        pressure *
          (defender.isEncircled ? 3.2 : 1.6) *
          defenderVulnerability *
          dt,
      0,
      100,
    );
    defender.commandDelay = clamp(
      defender.commandDelay + pressure * 0.13 * dt,
      0,
      5,
    );
    if (defender.encirclement > 0.48) {
      defender.cohesion = clamp(
        defender.cohesion -
          (defender.encirclement - 0.38) * 0.86 * defenderVulnerability * dt,
        0,
        100,
      );
    }
  }
}

export function encirclementStage(value: number): string {
  if (value >= 0.86) return "圧縮包囲";
  if (value >= 0.62) return "包囲";
  if (value >= 0.36) return "半包囲";
  if (value >= 0.14) return "側面圧力";
  return "未包囲";
}
