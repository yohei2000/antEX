import type { ArmySlime, Vector2Like } from "./types";
import { add, clamp01, normalize, perpendicular, scale, sub } from "./vector";

export type TacticalHintKind =
  | "breakthrough"
  | "envelop-left"
  | "envelop-right"
  | "pressure"
  | "stability";

export type TacticalHint = {
  id: string;
  kind: TacticalHintKind;
  label: string;
  detail: string;
  point: Vector2Like;
  strength: number;
};

function enemyApproachPoint(enemy: ArmySlime, player: ArmySlime): Vector2Like {
  const toPlayer = normalize(sub(player.center, enemy.center));
  return add(enemy.center, scale(toPlayer, enemy.currentDepth * 0.38));
}

function enemyFlankPoint(
  enemy: ArmySlime,
  player: ArmySlime,
  side: -1 | 1,
): Vector2Like {
  const toPlayer = normalize(sub(player.center, enemy.center));
  const lateral = perpendicular(enemy.facing);
  return add(
    enemy.center,
    add(
      scale(lateral, enemy.currentWidth * 0.48 * side),
      scale(toPlayer, enemy.currentDepth * 0.08),
    ),
  );
}

export function tacticalHints(
  player: ArmySlime,
  enemy: ArmySlime,
): TacticalHint[] {
  const hints: TacticalHint[] = [];
  const enemySpreadVulnerability = clamp01(
    enemy.gapRisk * 0.68 +
      (1.08 - enemy.currentDensity) * 0.72 +
      (enemy.posture === "spread" || enemy.posture === "envelop" ? 0.18 : 0),
  );
  const enemyCompactVulnerability = clamp01(
    (enemy.currentDensity - 1.04) * 0.72 +
      enemy.crowding * 0.86 +
      (enemy.posture === "contract" || enemy.posture === "breakthrough"
        ? 0.18
        : 0),
  );
  const pressureVulnerability = clamp01(
    enemy.pressure / 100 +
      (100 - enemy.cohesion) / 160 +
      enemy.encirclement * 0.42,
  );
  const playerCanWrap = clamp01(
    player.envelopPower * 0.52 +
      (player.currentWidth / Math.max(120, enemy.currentWidth) - 0.72) * 0.55,
  );
  const playerCanPierce = clamp01(
    player.breakthroughPower * 0.58 +
      player.currentDensity * 0.24 -
      player.crowding * 0.22,
  );

  hints.push({
    id: "central-gap",
    kind: "breakthrough",
    label: "中央の薄さ",
    detail: `密度${enemy.currentDensity.toFixed(2)} 隙${Math.round(enemy.gapRisk * 100)}%`,
    point: enemyApproachPoint(enemy, player),
    strength: clamp01(enemySpreadVulnerability * 0.72 + playerCanPierce * 0.34),
  });

  const flankStrength = clamp01(
    enemyCompactVulnerability * 0.58 +
      playerCanWrap * 0.48 +
      (enemy.encirclement > 0.16 ? 0.12 : 0),
  );
  hints.push({
    id: "left-flank",
    kind: "envelop-left",
    label: "左側面",
    detail: `包囲余地${Math.round(playerCanWrap * 100)}%`,
    point: enemyFlankPoint(enemy, player, 1),
    strength: flankStrength,
  });
  hints.push({
    id: "right-flank",
    kind: "envelop-right",
    label: "右側面",
    detail: `包囲余地${Math.round(playerCanWrap * 100)}%`,
    point: enemyFlankPoint(enemy, player, -1),
    strength: flankStrength * 0.96,
  });

  if (enemy.pressure > 22 || enemy.encirclement > 0.18 || enemy.cohesion < 68) {
    hints.push({
      id: "pressure-crack",
      kind: "pressure",
      label: "圧力集中",
      detail: `圧${Math.round(enemy.pressure)} 結${Math.round(enemy.cohesion)}`,
      point: enemy.contactPatches[0]?.center ?? enemy.center,
      strength: pressureVulnerability,
    });
  }

  if (enemy.encirclement > 0.24) {
    hints.push({
      id: "ring-stability",
      kind: "stability",
      label: "包囲継続",
      detail: `包囲${Math.round(enemy.encirclement * 100)}%`,
      point: enemy.center,
      strength: clamp01(enemy.encirclement),
    });
  }

  return hints
    .filter((hint) => hint.strength > 0.18)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4);
}
