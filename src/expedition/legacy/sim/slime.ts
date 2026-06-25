import type {
  ArmySlime,
  Side,
  SlimeLink,
  SlimeNode,
  SlimeNodeRole,
  SlimeParticle,
  Vector2Like,
  RandomSource,
} from "./types";
import {
  add,
  average,
  distance,
  normalize,
  perpendicular,
  rotate,
  scale,
} from "./vector";

const PARTICLE_COUNT = 96;
const MESH_LAYERS = [
  { name: "outer", count: 20, radius: 1, angleOffset: 0, mass: 1 },
  { name: "mid", count: 14, radius: 0.68, angleOffset: 0.5, mass: 1.15 },
  { name: "inner", count: 8, radius: 0.36, angleOffset: 0, mass: 1.35 },
] as const;

export type ArmySlimeOptions = {
  width?: number;
  depth?: number;
  mass?: number;
  morale?: number;
  cohesion?: number;
  fatigue?: number;
  toughness?: number;
  elasticity?: number;
  viscosity?: number;
  particleCount?: number;
  splitGeneration?: number;
  manualControl?: boolean;
  rng?: RandomSource;
};

function roleForAngle(angle: number): SlimeNodeRole {
  const forward = Math.cos(angle);
  const side = Math.sin(angle);
  if (forward > 0.55) return "front";
  if (forward < -0.55) return "rear";
  return side > 0 ? "left" : "right";
}

function angleDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(delta, Math.PI * 2 - delta);
}

export function createArmySlime(
  id: string,
  side: Side,
  center: Vector2Like,
  facing: Vector2Like,
  options: ArmySlimeOptions = {},
): ArmySlime {
  const direction = normalize(facing);
  const lateral = perpendicular(direction);
  const width = options.width ?? 250;
  const depth = options.depth ?? 180;
  const mass = options.mass ?? (side === "player" ? 98 : 106);
  const particleCount = options.particleCount ?? PARTICLE_COUNT;
  const rng = options.rng ?? Math.random;
  const nodes: SlimeNode[] = [];
  const links: SlimeLink[] = [];
  const layerNodes: SlimeNode[][] = [];
  const layerAngles: number[][] = [];

  const createNode = (
    nodeId: string,
    role: SlimeNodeRole,
    shapeU: number,
    shapeV: number,
    nodeMass: number,
  ): SlimeNode => {
    const offset = add(
      scale(direction, shapeU * depth * 0.5),
      scale(lateral, shapeV * width * 0.5),
    );
    const position = add(center, offset);
    const node: SlimeNode = {
      id: nodeId,
      role,
      position,
      velocity: { x: 0, y: 0 },
      targetPosition: { ...position },
      shapeU,
      shapeV,
      mass: nodeMass,
      localDensity: 1,
      localPressure: 0,
      localMorale: 82,
      localCohesion: 82,
      links: [],
    };
    nodes.push(node);
    return node;
  };

  MESH_LAYERS.forEach((layer, layerIndex) => {
    const ring: SlimeNode[] = [];
    const angles: number[] = [];
    for (let i = 0; i < layer.count; i += 1) {
      const angle =
        ((i + layer.angleOffset) / layer.count) * Math.PI * 2;
      const shapeU = Math.cos(angle) * layer.radius;
      const shapeV = Math.sin(angle) * layer.radius;
      ring.push(
        createNode(
          `${id}-${layer.name}-${i}`,
          layerIndex === 0 ? roleForAngle(angle) : "interior",
          shapeU,
          shapeV,
          layer.mass,
        ),
      );
      angles.push(angle);
    }
    layerNodes.push(ring);
    layerAngles.push(angles);
  });

  const core = createNode(`${id}-core`, "interior", 0, 0, 2.5);
  core.localMorale = 84;
  core.localCohesion = 88;

  const connected = new Set<string>();
  const connect = (a: SlimeNode, b: SlimeNode, stiffness: number): void => {
    const key = [a.id, b.id].sort().join("|");
    if (connected.has(key)) return;
    connected.add(key);
    const link: SlimeLink = {
      nodeAId: a.id,
      nodeBId: b.id,
      restLength: distance(a.position, b.position),
      stiffness,
      damping: 1.08,
      integrity: 1,
      stress: 0,
      localPressure: 0,
      recoveryDelay: 0,
      broken: false,
    };
    links.push(link);
    a.links.push(link);
    b.links.push(link);
  };

  layerNodes.forEach((ring, layerIndex) => {
    const stiffness = layerIndex === 0 ? 0.82 : layerIndex === 1 ? 0.66 : 0.54;
    for (let i = 0; i < ring.length; i += 1) {
      connect(ring[i], ring[(i + 1) % ring.length], stiffness);
    }
  });

  for (let layerIndex = 0; layerIndex < layerNodes.length - 1; layerIndex += 1) {
    const outer = layerNodes[layerIndex];
    const inner = layerNodes[layerIndex + 1];
    const outerAngles = layerAngles[layerIndex];
    const innerAngles = layerAngles[layerIndex + 1];
    outer.forEach((node, index) => {
      const nearest = innerAngles
        .map((angle, innerIndex) => ({
          innerIndex,
          distance: angleDistance(outerAngles[index], angle),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2);
      nearest.forEach(({ innerIndex }) =>
        connect(node, inner[innerIndex], layerIndex === 0 ? 0.58 : 0.48),
      );
    });
  }

  layerNodes[2].forEach((node) => connect(node, core, 0.38));

  const particleAnchors = nodes.filter((node) => node !== core);
  const particles: SlimeParticle[] = Array.from(
    { length: particleCount },
    (_, i) => {
      const angle = (i * 2.399963229728653) % (Math.PI * 2);
      const radius = Math.sqrt((i + 0.5) / particleCount) * 0.88;
      const local = add(
        scale(direction, Math.cos(angle) * depth * 0.5 * radius),
        scale(lateral, Math.sin(angle) * width * 0.5 * radius),
      );
      const position = add(center, local);
      const anchor = particleAnchors.reduce((nearest, candidate) =>
        distance(candidate.position, position) <
        distance(nearest.position, position)
          ? candidate
          : nearest,
      );
      return {
        id: `${id}-particle-${i}`,
        position,
        velocity: { x: 0, y: 0 },
        localNodeId: anchor.id,
        alive: true,
        phase: rng() * Math.PI * 2,
      };
    },
  );

  return {
    id,
    side,
    manualControl: options.manualControl ?? side === "player",
    center: { ...center },
    velocity: { x: 0, y: 0 },
    facing: direction,
    posture: "neutral",
    nodes,
    particles,
    desiredCenter: { ...center },
    desiredDirection: direction,
    desiredWidth: width,
    desiredDepth: depth,
    desiredDensity: 1,
    desiredLeftWingAdvance: 0,
    desiredRightWingAdvance: 0,
    desiredFocusPoint: undefined,
    baseWidth: width,
    baseDepth: depth,
    currentWidth: width,
    currentDepth: depth,
    currentDensity: 1,
    mass,
    morale: options.morale ?? (side === "player" ? 80 : 88),
    cohesion: options.cohesion ?? (side === "player" ? 82 : 88),
    fatigue: options.fatigue ?? (side === "player" ? 8 : 6),
    pressure: 0,
    elasticity: options.elasticity ?? 0.58,
    viscosity: options.viscosity ?? 0.62,
    tension: 0,
    crowding: 0,
    gapRisk: 0.08,
    zocStrength: 1,
    zocRadius: 42,
    isSelected: side === "player",
    isEngaged: false,
    isEncircling: false,
    isEncircled: false,
    isRouting: false,
    routedAt: -1,
    contactPatches: [],
    activeOrder: undefined,
    encirclement: 0,
    breakthroughPower: 0.5,
    envelopPower: 0.5,
    commandDelay: 0,
    shockTimer: 0,
    aiThinkAt: 0,
    linkIntegrity: 1,
    brokenLinkRatio: 0,
    toughness: options.toughness ?? (side === "player" ? 0.64 : 0.72),
    effectiveToughness: options.toughness ?? (side === "player" ? 0.64 : 0.72),
    peakLocalStress: 0,
    fractureConcentration: 0,
    fractureLinkCount: 0,
    fractureCenter: { ...center },
    fractureNormal: direction,
    splitStress: 0,
    splitGeneration: options.splitGeneration ?? 0,
    splitCooldown: 0,
  };
}

export function getBoundaryNodes(slime: ArmySlime): SlimeNode[] {
  const boundary = slime.nodes.filter((node) => node.role !== "interior");
  if (boundary.length < 3) return boundary;
  const center = average(boundary.map((node) => node.position));
  return [...boundary].sort(
    (a, b) =>
      Math.atan2(a.position.y - center.y, a.position.x - center.x) -
      Math.atan2(b.position.y - center.y, b.position.x - center.x),
  );
}

export function pointInsideSlime(
  slime: ArmySlime,
  point: Vector2Like,
  padding = 0,
): boolean {
  const direction = normalize(slime.facing);
  const lateral = perpendicular(direction);
  const delta = { x: point.x - slime.center.x, y: point.y - slime.center.y };
  const forward = delta.x * direction.x + delta.y * direction.y;
  const sideways = delta.x * lateral.x + delta.y * lateral.y;
  const rx = slime.currentDepth * 0.55 + padding;
  const ry = slime.currentWidth * 0.55 + padding;
  return (
    (forward * forward) / (rx * rx) +
      (sideways * sideways) / (ry * ry) <=
    1
  );
}

export function postureLabel(posture: ArmySlime["posture"]): string {
  return {
    neutral: "中立",
    spread: "展開",
    envelop: "包囲",
    contract: "密集",
    breakthrough: "突破",
    hold: "保持",
    retreat: "後退",
  }[posture];
}

export function setDesiredFacing(
  slime: ArmySlime,
  facing: Vector2Like,
): void {
  slime.desiredDirection = normalize(facing);
}

export function jitterFacing(
  slime: ArmySlime,
  amount: number,
): Vector2Like {
  return rotate(
    slime.facing,
    Math.sin(slime.tension * 13 + slime.center.x) * amount,
  );
}
