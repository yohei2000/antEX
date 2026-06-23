import type {
  ArmySlime,
  SlimeLink,
  SlimeNode,
  SlimeNodeRole,
  SlimeParticle,
  Vector2Like,
} from "./types";
import {
  add,
  average,
  clamp,
  clamp01,
  distance,
  dot,
  lerp,
  normalize,
  perpendicular,
  scale,
  sub,
} from "./vector";

const MAX_SPLIT_GENERATION = 2;
const MIN_SPLIT_MASS = 58;
const REQUIRED_LOCAL_BREAKS = 7;
const MIN_CHILD_NODES = 8;
const MIN_CHILD_BOUNDARY_NODES = 3;

type FractureSample = {
  link: SlimeLink;
  midpoint: Vector2Like;
  severity: number;
};

function uniqueLinks(slime: ArmySlime): SlimeLink[] {
  const links: SlimeLink[] = [];
  const seen = new Set<string>();
  for (const node of slime.nodes) {
    for (const link of node.links) {
      const key = [link.nodeAId, link.nodeBId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(link);
    }
  }
  return links;
}

function fractureSamples(slime: ArmySlime): FractureSample[] {
  const byId = new Map(slime.nodes.map((node) => [node.id, node]));
  return uniqueLinks(slime)
    .filter((link) => link.broken || link.integrity < 0.62)
    .flatMap((link) => {
      const a = byId.get(link.nodeAId);
      const b = byId.get(link.nodeBId);
      if (!a || !b) return [];
      return [
        {
          link,
          midpoint: scale(add(a.position, b.position), 0.5),
          severity: link.broken ? 1 : 1 - link.integrity,
        },
      ];
    });
}

export function updateSplitStress(slime: ArmySlime, dt: number): void {
  slime.splitCooldown = Math.max(0, slime.splitCooldown - dt);
  const samples = fractureSamples(slime);

  if (samples.length === 0) {
    slime.fractureConcentration = 0;
    slime.fractureLinkCount = 0;
    slime.fractureCenter = { ...slime.center };
    slime.fractureNormal = { ...slime.facing };
    slime.splitStress = Math.max(0, slime.splitStress - 0.32 * dt);
    return;
  }

  const clusterRadius = Math.max(
    54,
    Math.min(slime.currentWidth, slime.currentDepth) * 0.42,
  );
  let strongestCluster: FractureSample[] = [];
  let strongestWeight = 0;
  for (const origin of samples) {
    const cluster = samples.filter(
      (candidate) => distance(origin.midpoint, candidate.midpoint) <= clusterRadius,
    );
    const weight = cluster.reduce((sum, sample) => sum + sample.severity, 0);
    if (weight > strongestWeight) {
      strongestWeight = weight;
      strongestCluster = cluster;
    }
  }

  const totalWeight = Math.max(
    0.001,
    strongestCluster.reduce((sum, sample) => sum + sample.severity, 0),
  );
  slime.fractureCenter = scale(
    strongestCluster.reduce(
      (sum, sample) => add(sum, scale(sample.midpoint, sample.severity)),
      { x: 0, y: 0 },
    ),
    1 / totalWeight,
  );
  const outward = sub(slime.fractureCenter, slime.center);
  slime.fractureNormal =
    Math.hypot(outward.x, outward.y) > 12
      ? normalize(outward)
      : normalize(slime.facing);
  slime.fractureLinkCount = strongestCluster.filter(
    (sample) => sample.link.broken,
  ).length;
  slime.fractureConcentration = clamp01(strongestWeight / 4.8);

  const targetProgress = clamp01(
    slime.fractureConcentration * 0.78 +
      clamp01(slime.fractureLinkCount / REQUIRED_LOCAL_BREAKS) * 0.24,
  );
  slime.splitStress = clamp01(
    lerp(
      { x: slime.splitStress, y: 0 },
      { x: targetProgress, y: 0 },
      clamp01(dt * 1.25),
    ).x,
  );
}

export function shouldSplitSlime(slime: ArmySlime): boolean {
  return (
    slime.splitCooldown <= 0 &&
    slime.splitGeneration < MAX_SPLIT_GENERATION &&
    slime.mass >= MIN_SPLIT_MASS &&
    slime.splitStress >= 0.985 &&
    slime.fractureConcentration >= 0.94 &&
    slime.fractureLinkCount >= REQUIRED_LOCAL_BREAKS
  );
}

function cloneLink(link: SlimeLink): SlimeLink {
  return {
    nodeAId: link.nodeAId,
    nodeBId: link.nodeBId,
    restLength: link.restLength,
    stiffness: link.stiffness,
    damping: link.damping,
    integrity: link.integrity,
    stress: link.stress,
    localPressure: link.localPressure,
    recoveryDelay: link.recoveryDelay,
    broken: link.broken,
  };
}

function cloneParticle(particle: SlimeParticle): SlimeParticle {
  return {
    id: particle.id,
    position: { ...particle.position },
    velocity: { ...particle.velocity },
    localNodeId: particle.localNodeId,
    alive: particle.alive,
    phase: particle.phase,
  };
}

function roleFromPosition(
  node: SlimeNode,
  center: Vector2Like,
  facing: Vector2Like,
): SlimeNodeRole {
  const lateral = perpendicular(facing);
  const offset = sub(node.position, center);
  const forward = dot(offset, facing);
  const side = dot(offset, lateral);
  if (forward > Math.abs(side) * 0.72) return "front";
  if (forward < -Math.abs(side) * 0.72) return "rear";
  return side > 0 ? "left" : "right";
}

function splitProjectionSets(
  slime: ArmySlime,
  axis: Vector2Like,
): { positiveIds: Set<string>; negativeIds: Set<string>; cut: number } {
  const projectionAtFracture = dot(slime.fractureCenter, axis);
  const buildSets = (cut: number): [Set<string>, Set<string>] => {
    const positive = new Set<string>();
    const negative = new Set<string>();
    for (const node of slime.nodes) {
      const projection = dot(node.position, axis);
      (projection >= cut ? positive : negative).add(node.id);
    }
    return [positive, negative];
  };

  const isUsable = (sets: [Set<string>, Set<string>]): boolean =>
    sets.every((set) => {
      const nodes = slime.nodes.filter((node) => set.has(node.id));
      return (
        nodes.length >= MIN_CHILD_NODES &&
        nodes.filter((node) => node.role !== "interior").length >=
          MIN_CHILD_BOUNDARY_NODES
      );
    });

  const fractureCut = projectionAtFracture;
  const fractureSets = buildSets(fractureCut);
  if (isUsable(fractureSets)) {
    return {
      positiveIds: fractureSets[0],
      negativeIds: fractureSets[1],
      cut: fractureCut,
    };
  }

  const projections = slime.nodes
    .map((node) => dot(node.position, axis))
    .sort((a, b) => a - b);
  const medianCut = projections[Math.floor(projections.length * 0.5)];
  const medianSets = buildSets(medianCut);
  if (isUsable(medianSets)) {
    return {
      positiveIds: medianSets[0],
      negativeIds: medianSets[1],
      cut: medianCut,
    };
  }

  const centerCut = dot(slime.center, axis);
  const centerSets = buildSets(centerCut);
  return {
    positiveIds: centerSets[0],
    negativeIds: centerSets[1],
    cut: centerCut,
  };
}

function crossCutBoundaryIds(
  slime: ArmySlime,
  ownIds: Set<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const link of uniqueLinks(slime)) {
    const aInside = ownIds.has(link.nodeAId);
    const bInside = ownIds.has(link.nodeBId);
    if (aInside === bInside) continue;
    if (aInside) ids.add(link.nodeAId);
    if (bInside) ids.add(link.nodeBId);
  }
  return ids;
}

function nearestNodeId(nodes: SlimeNode[], point: Vector2Like): string {
  return nodes.reduce((nearest, node) =>
    distance(node.position, point) < distance(nearest.position, point)
      ? node
      : nearest,
  ).id;
}

function extentsFor(
  nodes: SlimeNode[],
  center: Vector2Like,
  facing: Vector2Like,
): { width: number; depth: number } {
  const lateral = perpendicular(facing);
  const forwardValues = nodes.map((node) => dot(sub(node.position, center), facing));
  const sideValues = nodes.map((node) => dot(sub(node.position, center), lateral));
  return {
    depth: Math.max(72, Math.max(...forwardValues) - Math.min(...forwardValues)),
    width: Math.max(72, Math.max(...sideValues) - Math.min(...sideValues)),
  };
}

function buildFragment(
  slime: ArmySlime,
  id: string,
  nodeIds: Set<string>,
  particleSide: (particle: SlimeParticle) => boolean,
  splitGeneration: number,
): ArmySlime {
  const sourceNodes = slime.nodes.filter((node) => nodeIds.has(node.id));
  const center = average(sourceNodes.map((node) => node.position));
  const facing = { ...slime.facing };
  const extents = extentsFor(sourceNodes, center, facing);
  const lateral = perpendicular(facing);
  const cutBoundaryIds = crossCutBoundaryIds(slime, nodeIds);
  const nodeMap = new Map<string, SlimeNode>();

  for (const source of sourceNodes) {
    const offset = sub(source.position, center);
    const boundaryRole =
      source.role !== "interior" || cutBoundaryIds.has(source.id)
        ? roleFromPosition(source, center, facing)
        : "interior";
    const node: SlimeNode = {
      id: source.id,
      role: boundaryRole,
      position: { ...source.position },
      velocity: { ...source.velocity },
      targetPosition: { ...source.position },
      shapeU: clamp(dot(offset, facing) / (extents.depth * 0.5), -1.35, 1.35),
      shapeV: clamp(dot(offset, lateral) / (extents.width * 0.5), -1.35, 1.35),
      mass: source.mass,
      localDensity: source.localDensity,
      localPressure: source.localPressure,
      localMorale: source.localMorale,
      localCohesion: source.localCohesion,
      links: [],
    };
    nodeMap.set(node.id, node);
  }

  const links = uniqueLinks(slime)
    .filter((link) => nodeIds.has(link.nodeAId) && nodeIds.has(link.nodeBId))
    .map(cloneLink);
  for (const link of links) {
    nodeMap.get(link.nodeAId)?.links.push(link);
    nodeMap.get(link.nodeBId)?.links.push(link);
  }

  const nodes = [...nodeMap.values()];
  const particles = slime.particles
    .filter((particle) => particle.alive && particleSide(particle))
    .map((particle) => {
      const cloned = cloneParticle(particle);
      if (!nodeIds.has(cloned.localNodeId)) {
        cloned.localNodeId = nearestNodeId(nodes, cloned.position);
      }
      return cloned;
    });
  if (particles.length === 0 && slime.particles.length > 0) {
    const fallback = cloneParticle(slime.particles[0]);
    fallback.localNodeId = nearestNodeId(nodes, fallback.position);
    particles.push(fallback);
  }

  const nodeMass = nodes.reduce((sum, node) => sum + node.mass, 0);
  const totalNodeMass = Math.max(
    0.001,
    slime.nodes.reduce((sum, node) => sum + node.mass, 0),
  );
  const mass = Math.max(12, slime.mass * (nodeMass / totalNodeMass));
  const velocity = average(nodes.map((node) => node.velocity));
  return {
    ...slime,
    id,
    center,
    velocity,
    facing,
    posture: "neutral",
    nodes,
    particles,
    desiredCenter: { ...center },
    desiredDirection: { ...slime.desiredDirection },
    desiredWidth: extents.width,
    desiredDepth: extents.depth,
    desiredDensity: slime.currentDensity,
    desiredLeftWingAdvance: 0,
    desiredRightWingAdvance: 0,
    desiredFocusPoint: slime.desiredFocusPoint
      ? { ...slime.desiredFocusPoint }
      : undefined,
    baseWidth: extents.width,
    baseDepth: extents.depth,
    currentWidth: extents.width,
    currentDepth: extents.depth,
    currentDensity: slime.currentDensity,
    mass,
    morale: clamp(slime.morale - 7, 0, 100),
    cohesion: clamp(slime.cohesion - 20, 0, 100),
    fatigue: clamp(slime.fatigue + 11, 0, 100),
    pressure: clamp(slime.pressure + 12, 0, 100),
    tension: 0,
    crowding: 0,
    gapRisk: Math.min(0.55, slime.gapRisk + 0.08),
    isSelected: false,
    isEngaged: false,
    isEncircling: false,
    isEncircled: slime.isEncircled,
    contactPatches: [],
    activeOrder: undefined,
    encirclement: slime.encirclement * 0.65,
    commandDelay: 0,
    shockTimer: 0,
    linkIntegrity: 1,
    brokenLinkRatio: 0,
    toughness: clamp(slime.toughness - 0.04, 0.42, 0.9),
    effectiveToughness: slime.effectiveToughness,
    peakLocalStress: 0,
    fractureConcentration: 0,
    fractureLinkCount: 0,
    fractureCenter: { ...center },
    fractureNormal: { ...slime.fractureNormal },
    splitStress: 0,
    splitGeneration,
    splitCooldown: 3.5,
  };
}

export function splitArmySlime(slime: ArmySlime): [ArmySlime, ArmySlime] {
  const nextGeneration = slime.splitGeneration + 1;
  const separationAxis = normalize(slime.fractureNormal);
  const { positiveIds, negativeIds, cut } = splitProjectionSets(
    slime,
    separationAxis,
  );
  const particleSide = (particle: SlimeParticle): boolean =>
    dot(particle.position, separationAxis) >= cut;
  const fragment = buildFragment(
    slime,
    `${slime.id}-F${nextGeneration}`,
    positiveIds,
    particleSide,
    nextGeneration,
  );
  const main = buildFragment(
    slime,
    `${slime.id}-M${nextGeneration}`,
    negativeIds,
    (particle) => !particleSide(particle),
    nextGeneration,
  );

  if (slime.isSelected) {
    const selectedChild = main.mass >= fragment.mass ? main : fragment;
    selectedChild.isSelected = true;
  }
  return [fragment, main];
}
