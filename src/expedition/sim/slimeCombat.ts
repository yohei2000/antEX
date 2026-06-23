import type { ArmySlime, ContactPatch, SlimeNode } from "./types";
import { average, clamp, clamp01, distance, normalize, scale, sub } from "./vector";
import { calculateLocalZoc, getZocBoundaryThickness, sampleEnemyZoc } from "./zoc";
import { ringIntegrity } from "./encirclement";

function boundary(slime: ArmySlime): SlimeNode[] {
  return slime.nodes.filter((node) => node.role !== "interior");
}

export function buildContactPatches(own: ArmySlime, enemy: ArmySlime): ContactPatch[] {
  const threshold = getZocBoundaryThickness(enemy) + 30;
  const pairs: Array<{ own: SlimeNode; enemy: SlimeNode; distance: number }> = [];

  for (const ownNode of boundary(own)) {
    let nearest: SlimeNode | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const enemyNode of boundary(enemy)) {
      const gap = distance(ownNode.position, enemyNode.position);
      if (gap < nearestDistance) {
        nearest = enemyNode;
        nearestDistance = gap;
      }
    }
    const zocSample = sampleEnemyZoc(enemy, ownNode.position);
    if (nearest && (zocSample.insideBody || zocSample.distance < threshold)) {
      pairs.push({ own: ownNode, enemy: nearest, distance: zocSample.distance });
    }
  }

  if (pairs.length === 0) return [];
  const center = average(
    pairs.flatMap((pair) => [pair.own.position, pair.enemy.position]),
  );
  const normal = normalize(sub(enemy.center, own.center));
  const ownDensity = pairs.reduce((sum, pair) => sum + pair.own.localDensity, 0) / pairs.length;
  const enemyDensity =
    pairs.reduce((sum, pair) => sum + pair.enemy.localDensity, 0) / pairs.length;
  const pressure =
    pairs.reduce(
      (sum, pair) =>
        sum +
        clamp01(1 - pair.distance / threshold) *
          calculateLocalZoc(own, pair.own, pair.enemy),
      0,
    ) / pairs.length;

  return [
    {
      id: `${own.id}-${enemy.id}-front`,
      ownNodeIds: pairs.map((pair) => pair.own.id),
      enemyNodeIds: [...new Set(pairs.map((pair) => pair.enemy.id))],
      center,
      normal,
      length: pairs.length * 18,
      pressure: pressure * 42,
      ownDensity,
      enemyDensity,
      ownFrontage: pairs.length / boundary(own).length,
      enemyFrontage: new Set(pairs.map((pair) => pair.enemy.id)).size / boundary(enemy).length,
    },
  ];
}

function combatPower(slime: ArmySlime, patch: ContactPatch, own: boolean): number {
  const frontage = own ? patch.ownFrontage : patch.enemyFrontage;
  const density = own ? patch.ownDensity : patch.enemyDensity;
  const frontlineMass = slime.mass * clamp(frontage, 0.06, 0.72);
  const rearMass = Math.max(0, slime.mass - frontlineMass);
  const activePower = frontlineMass + rearMass * 0.15;
  const postureFactor =
    slime.isRouting
      ? 0.42
      : slime.posture === "breakthrough"
      ? 1.14
      : slime.posture === "envelop"
        ? 1.18
        : slime.posture === "contract"
          ? 1.04
          : slime.posture === "spread"
            ? 0.94
            : 1;
  const shock = slime.shockTimer > 0 ? 1.16 : 1;
  const crowdingEfficiency =
    slime.currentDensity > 1.24 ? 1 - clamp01((slime.currentDensity - 1.24) / 0.58) * 0.22 : 1;
  const encirclementPenalty =
    slime.encirclement > 0
      ? 1 - clamp01(slime.encirclement) * (slime.isEncircled ? 0.34 : 0.22)
      : 1;
  const sideBalance = slime.side === "player" ? 0.98 : 1.03;
  return (
    activePower *
    density *
    (0.35 + slime.morale / 145) *
    (0.3 + slime.cohesion / 135) *
    postureFactor *
    shock *
    crowdingEfficiency *
    encirclementPenalty *
    (1 - slime.fatigue / 155) *
    sideBalance
  );
}

export function resolveCombat(own: ArmySlime, enemy: ArmySlime, dt: number): void {
  own.contactPatches = buildContactPatches(own, enemy);
  own.isEngaged = own.contactPatches.length > 0;
  if (!own.isEngaged) return;

  for (const patch of own.contactPatches) {
    const ownPower = combatPower(own, patch, true);
    const enemyPower = combatPower(enemy, patch, false);
    const ratio = (ownPower + 1) / (enemyPower + 1);
    const intensity = Math.min(1.5, patch.pressure / 50);

    own.pressure = clamp(own.pressure + (enemyPower / (ownPower + enemyPower)) * 42 * dt, 0, 100);
    own.fatigue = clamp(own.fatigue + (1.1 + intensity * 1.8) * dt, 0, 100);
    own.cohesion = clamp(own.cohesion - Math.max(0, 1 / ratio - 0.7) * 1.45 * dt, 0, 100);
    own.morale = clamp(own.morale - Math.max(0, 0.88 / ratio - 0.62) * 1.05 * dt, 0, 100);

    if (own.posture === "breakthrough" && enemy.encirclement > 0.3) {
      const breakoutPower =
        own.currentDensity *
        (own.shockTimer > 0 ? 1.3 : 1.02) *
        (own.morale / 100) *
        (own.cohesion / 100) *
        1.06 *
        1.18;
      const containmentPower =
        enemy.currentDensity *
        enemy.zocStrength *
        (enemy.cohesion / 100) *
        ringIntegrity(enemy) *
        (1 + enemy.envelopPower * 0.22) *
        (enemy.side === "enemy" ? 1.03 : 0.98);
      if (breakoutPower > containmentPower) {
        own.encirclement = clamp01(own.encirclement - 0.2 * dt);
      } else {
        own.fatigue = clamp(own.fatigue + 4.2 * dt, 0, 100);
        own.cohesion = clamp(own.cohesion - 3.2 * dt, 0, 100);
        own.morale = clamp(own.morale - 2.25 * dt, 0, 100);
      }
    }
  }
}

export function contactPushForce(own: ArmySlime, enemy: ArmySlime, node: SlimeNode) {
  const patch = own.contactPatches[0];
  if (!patch || !patch.ownNodeIds.includes(node.id)) return { x: 0, y: 0 };
  const ownPower = own.breakthroughPower * (own.posture === "breakthrough" ? 1.24 : 1);
  const enemyContainment =
    enemy.zocStrength *
    (0.65 + enemy.currentDensity * 0.35) *
    (1 + enemy.envelopPower * (enemy.posture === "envelop" ? 0.22 : 0.08)) *
    (enemy.side === "enemy" ? 1.03 : 0.98);
  return scale(
    normalize(sub(own.center, enemy.center)),
    Math.max(0, enemyContainment - ownPower * 0.75) * patch.pressure * 0.0065,
  );
}
