import type { ArmySlime, SlimeNode, Vector2Like } from "./types";
import { add, average, clamp, clamp01, distance, dot, normalize, scale, sub } from "./vector";

export type ZocBoundarySample = {
  closestPoint: Vector2Like;
  zocClosestPoint: Vector2Like;
  outwardNormal: Vector2Like;
  distance: number;
  insideBody: boolean;
  insideZoc: boolean;
  clearance: number;
  penetration: number;
};

export type ZocFieldSegment = {
  start: Vector2Like;
  end: Vector2Like;
};

type BoundaryCacheEntry = {
  bodyPoints: Vector2Like[];
  zocSegments: ZocFieldSegment[];
};

const boundaryCache = new WeakMap<ArmySlime, BoundaryCacheEntry>();
const ZOC_CURVE_SAMPLES_PER_EDGE = 3;
const ZOC_CURVE_TENSION = 0.42;

function boundaryNodes(slime: ArmySlime): SlimeNode[] {
  return slime.nodes.filter((node) => node.role !== "interior");
}

function sortedBoundary(slime: ArmySlime, nodes: SlimeNode[]): SlimeNode[] {
  if (nodes.length < 3) return nodes;
  const center = average(nodes.map((node) => node.position));
  return [...nodes].sort(
    (a, b) =>
      Math.atan2(a.position.y - center.y, a.position.x - center.x) -
      Math.atan2(b.position.y - center.y, b.position.x - center.x),
  );
}

function cardinalClosedPoint(
  p0: Vector2Like,
  p1: Vector2Like,
  p2: Vector2Like,
  p3: Vector2Like,
  t: number,
): Vector2Like {
  const t2 = t * t;
  const t3 = t2 * t;
  const m1 = scale(sub(p2, p0), ZOC_CURVE_TENSION);
  const m2 = scale(sub(p3, p1), ZOC_CURVE_TENSION);
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return add(
    add(scale(p1, h00), scale(m1, h10)),
    add(scale(p2, h01), scale(m2, h11)),
  );
}

function curvedClosedBoundaryPoints(nodes: SlimeNode[]): Vector2Like[] {
  if (nodes.length < 3) return nodes.map((node) => ({ ...node.position }));
  const points = nodes.map((node) => node.position);
  const curved: Vector2Like[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];
    for (let step = 0; step < ZOC_CURVE_SAMPLES_PER_EDGE; step += 1) {
      curved.push(
        cardinalClosedPoint(p0, p1, p2, p3, step / ZOC_CURVE_SAMPLES_PER_EDGE),
      );
    }
  }
  return curved;
}

function ringSegments(points: Vector2Like[]): ZocFieldSegment[] {
  if (points.length < 2) return [];
  const segments: ZocFieldSegment[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    segments.push({
      start: { ...a },
      end: { ...b },
    });
  }
  return segments;
}

function cachedBoundary(slime: ArmySlime): BoundaryCacheEntry {
  const cached = boundaryCache.get(slime);
  if (cached) return cached;

  const nodes = boundaryNodes(slime);
  const sortedNodes = sortedBoundary(slime, nodes);
  const bodyPoints = curvedClosedBoundaryPoints(sortedNodes);
  const entry: BoundaryCacheEntry = {
    bodyPoints,
    zocSegments: ringSegments(bodyPoints),
  };
  boundaryCache.set(slime, entry);
  return entry;
}

export function invalidateZocBoundaryCache(slime: ArmySlime): void {
  boundaryCache.delete(slime);
}

function closestPointOnSegment(
  point: Vector2Like,
  start: Vector2Like,
  end: Vector2Like,
): Vector2Like {
  const segment = sub(end, start);
  const lengthSquared = dot(segment, segment);
  if (lengthSquared < 0.0001) return { ...start };
  const t = clamp(dot(sub(point, start), segment) / lengthSquared, 0, 1);
  return add(start, scale(segment, t));
}

function segmentOutwardNormal(
  start: Vector2Like,
  end: Vector2Like,
  center: Vector2Like,
): Vector2Like {
  const tangent = normalize(sub(end, start));
  const candidate = { x: -tangent.y, y: tangent.x };
  const midpoint = scale(add(start, end), 0.5);
  return dot(candidate, sub(midpoint, center)) >= 0
    ? candidate
    : scale(candidate, -1);
}

export function getBodyBoundaryPoints(slime: ArmySlime): Vector2Like[] {
  return cachedBoundary(slime).bodyPoints.map((point) => ({ ...point }));
}

export function getZocFieldSegments(slime: ArmySlime): ZocFieldSegment[] {
  return cachedBoundary(slime).zocSegments.map((segment) => ({
    start: { ...segment.start },
    end: { ...segment.end },
  }));
}

export function getZocBoundaryThickness(slime: ArmySlime): number {
  return clamp(
    8 +
      slime.currentDensity * 4.5 +
      slime.zocStrength * 2.5 +
      (slime.posture === "envelop" ? 1.5 : 0) -
      slime.gapRisk * 4,
    8,
    18,
  );
}

export function getMutualZocClearanceScale(
  enemy: ArmySlime,
  intruder: ArmySlime,
  cushion = 1.25,
): number {
  const enemyThickness = Math.max(1, getZocBoundaryThickness(enemy));
  const intruderThickness = getZocBoundaryThickness(intruder);
  return (enemyThickness + intruderThickness + cushion) / enemyThickness;
}

function closestSegmentFieldSample(
  segments: ZocFieldSegment[],
  center: Vector2Like,
  point: Vector2Like,
): {
  closestPoint: Vector2Like;
  distance: number;
  outwardNormal: Vector2Like;
} {
  let closestPoint = segments[0]?.start ?? center;
  let closestDistance = Number.POSITIVE_INFINITY;
  let outwardNormal = normalize(sub(closestPoint, center));
  for (const segment of segments) {
    const candidate = closestPointOnSegment(point, segment.start, segment.end);
    const candidateDistance = distance(point, candidate);
    if (candidateDistance < closestDistance) {
      closestPoint = candidate;
      closestDistance = candidateDistance;
      outwardNormal = segmentOutwardNormal(segment.start, segment.end, center);
    }
  }
  return { closestPoint, distance: closestDistance, outwardNormal };
}

export function sampleEnemyZoc(
  enemy: ArmySlime,
  point: Vector2Like,
  clearanceScale = 1,
): ZocBoundarySample {
  const cache = cachedBoundary(enemy);
  const zocSegments =
    cache.zocSegments.length > 0 ? cache.zocSegments : [];
  const zocSample = closestSegmentFieldSample(zocSegments, enemy.center, point);
  const clearance = getZocBoundaryThickness(enemy) * clearanceScale;
  const bodyTubeRadius = clearance * 0.9;
  const insideBody = zocSample.distance <= bodyTubeRadius;
  const insideZoc = insideBody || zocSample.distance <= clearance;
  const penetration = insideBody
    ? Math.max(clearance, bodyTubeRadius - zocSample.distance)
    : clearance - zocSample.distance;

  return {
    closestPoint: zocSample.closestPoint,
    zocClosestPoint: zocSample.closestPoint,
    outwardNormal: zocSample.outwardNormal,
    distance: zocSample.distance,
    insideBody,
    insideZoc,
    clearance,
    penetration,
  };
}

export function isZocCenterlineOpen(
  owner: ArmySlime,
  blockers: ArmySlime[],
  point: Vector2Like,
): boolean {
  return blockers.every((blocker) => {
    const clearanceScale = getMutualZocClearanceScale(blocker, owner);
    return !sampleEnemyZoc(blocker, point, clearanceScale).insideZoc;
  });
}

export function getExclusiveZocFieldSegments(
  owner: ArmySlime,
  blockers: ArmySlime[],
): ZocFieldSegment[] {
  const segments = getZocFieldSegments(owner);
  if (blockers.length === 0) return segments;

  const exclusiveSegments: ZocFieldSegment[] = [];
  const subdivisionCount = 3;
  for (const segment of segments) {
    let previous = { ...segment.start };
    for (let i = 1; i <= subdivisionCount; i += 1) {
      const next = {
        x:
          segment.start.x +
          (segment.end.x - segment.start.x) * (i / subdivisionCount),
        y:
          segment.start.y +
          (segment.end.y - segment.start.y) * (i / subdivisionCount),
      };
      const midpoint = scale(add(previous, next), 0.5);
      if (
        isZocCenterlineOpen(owner, blockers, previous) &&
        isZocCenterlineOpen(owner, blockers, midpoint) &&
        isZocCenterlineOpen(owner, blockers, next)
      ) {
        exclusiveSegments.push({ start: { ...previous }, end: { ...next } });
      }
      previous = next;
    }
  }
  return exclusiveSegments;
}

export function projectOutsideEnemyZoc(
  enemy: ArmySlime,
  point: Vector2Like,
  clearanceScale = 1,
  maxCorrection = Number.POSITIVE_INFINITY,
): Vector2Like {
  const sample = sampleEnemyZoc(enemy, point, clearanceScale);
  if (!sample.insideZoc) return point;
  const target = add(
    sample.zocClosestPoint,
    scale(sample.outwardNormal, sample.clearance + 0.75),
  );
  const correction = sub(target, point);
  const correctionLength = Math.hypot(correction.x, correction.y);
  if (correctionLength <= maxCorrection) return target;
  return add(point, scale(correction, maxCorrection / Math.max(0.0001, correctionLength)));
}

export function calculateLocalZoc(slime: ArmySlime, node: SlimeNode, target: SlimeNode): number {
  const moraleFactor = 0.45 + slime.morale / 180;
  const cohesionFactor = 0.35 + slime.cohesion / 150;
  const densityFactor = 0.55 + node.localDensity * 0.45;
  const postureFactor =
    slime.isRouting
      ? 0.38
      : slime.posture === "breakthrough"
      ? 1.28
      : slime.posture === "contract"
        ? 1.18
        : slime.posture === "envelop"
          ? 0.92
          : slime.posture === "spread"
            ? 0.74
          : 1;
  const towardTarget = normalize(sub(target.position, node.position));
  const facingFactor = 0.65 + Math.max(0, dot(slime.facing, towardTarget)) * 0.45;
  return slime.zocStrength * moraleFactor * cohesionFactor * densityFactor * postureFactor * facingFactor;
}

export function updateZocStats(slime: ArmySlime): void {
  const moraleFactor = 0.45 + slime.morale / 180;
  const cohesionFactor = 0.4 + slime.cohesion / 165;
  const densityFactor = 0.6 + Math.min(1.6, slime.currentDensity) * 0.38;
  const spreadFactor =
    slime.isRouting
      ? 0.42
      : slime.posture === "envelop"
        ? 0.95
        : slime.posture === "spread"
          ? 0.78
        : 1.08;
  slime.zocStrength = moraleFactor * cohesionFactor * densityFactor * spreadFactor;
  slime.zocRadius = Math.min(
    88,
    34 +
      slime.currentWidth * 0.05 +
      (slime.posture === "envelop"
        ? 34
        : slime.posture === "spread"
          ? 24
          : 4),
  );
}

export function zocContinuity(slime: ArmySlime): number {
  return clamp01(1 - slime.gapRisk * 0.72 - Math.max(0, slime.tension - 0.5) * 0.35);
}
