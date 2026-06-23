import type { ArmySlime, SlimeLink, SlimeNode, Vector2Like } from "./types";
import { clamp, distance, dot, sub } from "./vector";

export type LinkSegment = {
  link: SlimeLink;
  nodeA: SlimeNode;
  nodeB: SlimeNode;
};

function cross(a: Vector2Like, b: Vector2Like): number {
  return a.x * b.y - a.y * b.x;
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
  return {
    x: start.x + segment.x * t,
    y: start.y + segment.y * t,
  };
}

function pointSegmentDistance(
  point: Vector2Like,
  start: Vector2Like,
  end: Vector2Like,
): number {
  return distance(point, closestPointOnSegment(point, start, end));
}

function boundsOverlap(
  a: Vector2Like,
  b: Vector2Like,
  c: Vector2Like,
  d: Vector2Like,
  padding: number,
): boolean {
  const minAx = Math.min(a.x, b.x) - padding;
  const maxAx = Math.max(a.x, b.x) + padding;
  const minAy = Math.min(a.y, b.y) - padding;
  const maxAy = Math.max(a.y, b.y) + padding;
  const minBx = Math.min(c.x, d.x);
  const maxBx = Math.max(c.x, d.x);
  const minBy = Math.min(c.y, d.y);
  const maxBy = Math.max(c.y, d.y);
  return maxAx >= minBx && maxBx >= minAx && maxAy >= minBy && maxBy >= minAy;
}

export function uniqueLinkSegments(
  slime: ArmySlime,
  includeBroken = false,
): LinkSegment[] {
  const byId = new Map(slime.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const segments: LinkSegment[] = [];
  for (const node of slime.nodes) {
    for (const link of node.links) {
      if (!includeBroken && link.broken) continue;
      const key = [link.nodeAId, link.nodeBId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const nodeA = byId.get(link.nodeAId);
      const nodeB = byId.get(link.nodeBId);
      if (!nodeA || !nodeB) continue;
      segments.push({ link, nodeA, nodeB });
    }
  }
  return segments;
}

export function segmentsIntersect(
  a: Vector2Like,
  b: Vector2Like,
  c: Vector2Like,
  d: Vector2Like,
): boolean {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ad = sub(d, a);
  const cd = sub(d, c);
  const ca = sub(a, c);
  const cb = sub(b, c);
  const cross1 = cross(ab, ac);
  const cross2 = cross(ab, ad);
  const cross3 = cross(cd, ca);
  const cross4 = cross(cd, cb);
  return cross1 * cross2 < 0 && cross3 * cross4 < 0;
}

export function segmentDistance(
  a: Vector2Like,
  b: Vector2Like,
  c: Vector2Like,
  d: Vector2Like,
): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

export function linkSegmentBlockedByEnemies(
  segment: LinkSegment,
  enemies: ArmySlime[],
  clearance = 7,
): boolean {
  return linkSegmentBlockedBySegments(
    segment,
    enemies.flatMap((enemy) => uniqueLinkSegments(enemy)),
    clearance,
  );
}

export function linkSegmentBlockedBySegments(
  segment: LinkSegment,
  blockerSegments: LinkSegment[],
  clearance = 7,
): boolean {
  const a = segment.nodeA.position;
  const b = segment.nodeB.position;
  for (const blocker of blockerSegments) {
    const c = blocker.nodeA.position;
    const d = blocker.nodeB.position;
    if (!boundsOverlap(a, b, c, d, clearance)) continue;
    if (segmentDistance(a, b, c, d) <= clearance) return true;
  }
  return false;
}
