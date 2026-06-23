import type { ArmySlime, SlimeNode, Vector2Like } from "./sim/types";

export const EXPEDITION_WORLD_SCALE = 0.18;
export const EXPEDITION_BOARD_WIDTH = 1000 * EXPEDITION_WORLD_SCALE;
export const EXPEDITION_BOARD_HEIGHT = 650 * EXPEDITION_WORLD_SCALE;

export type VisualAntStateName =
  | "marching"
  | "probing"
  | "engaged"
  | "pushing"
  | "recoiling"
  | "routing"
  | "regrouping"
  | "idle";

export type VisualAntTarget = {
  id: string;
  anchorNodeId: string;
  x: number;
  z: number;
  desiredHeading: number;
  scale: number;
  state: VisualAntStateName;
  pressure: number;
};

export type VisualAntRenderState = {
  id: string;
  x: number;
  z: number;
  y: number;
  angle: number;
  scale: number;
  state: VisualAntStateName;
  speed: number;
  velocityX: number;
  velocityZ: number;
  targetX: number;
  targetZ: number;
  gaitPhase: number;
};

export type VisualAntTraceSample = {
  time: number;
  x: number;
  z: number;
  heading: number;
  velocityX: number;
  velocityZ: number;
  targetX: number;
  targetZ: number;
  state: VisualAntStateName;
  gaitPhase: number;
};

export type VisualAntJitterMetrics = {
  directionFlipRate: number;
  microMotionRatio: number;
  accelerationSpikeRate: number;
  idleDrift: number;
  headingVelocityMismatch: number;
  targetSnapDistance: number;
  runningInPlaceRatio: number;
};

type VisualAntAgent = {
  id: string;
  anchorNodeId: string;
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
  heading: number;
  targetX: number;
  targetZ: number;
  smoothedTargetX: number;
  smoothedTargetZ: number;
  blendStartX: number;
  blendStartZ: number;
  blendUntil: number;
  blendDuration: number;
  nextDecisionAt: number;
  decisionInterval: number;
  scale: number;
  state: VisualAntStateName;
  renderedState: VisualAntStateName;
  gaitPhase: number;
  walkOffsetX: number;
  walkOffsetZ: number;
  walkSequence: number;
  nextWalkAt: number;
  lastPressure: number;
  recoilUntil: number;
  recoilCooldownUntil: number;
  seed: number;
};

export type VisualAntDebugSnapshot = {
  antCount: number;
  stateCounts: Record<VisualAntStateName, number>;
  averageSpeed: number;
  maxTargetDistance: number;
};

const TARGET_EPSILON = 0.38;
const TARGET_DEAD_ZONE = 0.8;
const ANCHOR_JUMP_DISTANCE = 9.5;
const SMALL_SPEED = 0.035;

export class VisualAntController {
  private readonly agents = new Map<string, VisualAntAgent>();
  private readonly side: "player" | "enemy";
  private lastElapsed: number | undefined;
  private lastSnapshot: VisualAntDebugSnapshot = emptyDebugSnapshot();

  constructor(side: "player" | "enemy") {
    this.side = side;
  }

  reset(): void {
    this.agents.clear();
    this.lastElapsed = undefined;
    this.lastSnapshot = emptyDebugSnapshot();
  }

  update(
    targets: VisualAntTarget[],
    elapsed: number,
  ): VisualAntRenderState[] {
    const dt = this.resolveDt(elapsed);
    const targetIds = new Set(targets.map((target) => target.id));
    for (const id of this.agents.keys()) {
      if (!targetIds.has(id)) this.agents.delete(id);
    }

    const states: VisualAntRenderState[] = [];
    for (const target of targets) {
      const agent = this.agents.get(target.id) ?? this.createAgent(target, elapsed);
      this.agents.set(target.id, agent);
      this.updateAgentDecision(agent, target, elapsed);
      this.integrateAgent(agent, target, elapsed, dt);
      states.push(renderState(agent));
    }
    this.lastSnapshot = summarizeAgents([...this.agents.values()]);
    return states;
  }

  debugSnapshot(): VisualAntDebugSnapshot {
    return this.lastSnapshot;
  }

  private resolveDt(elapsed: number): number {
    if (this.lastElapsed === undefined || elapsed < this.lastElapsed) {
      this.lastElapsed = elapsed;
      return 1 / 60;
    }
    const dt = clamp(elapsed - this.lastElapsed, 0, 0.12);
    this.lastElapsed = elapsed;
    return dt;
  }

  private createAgent(target: VisualAntTarget, elapsed: number): VisualAntAgent {
    const seed = hashString(`${this.side}:${target.id}`);
    const initial = initialPositionForTarget(target, seed);
    return {
      id: target.id,
      anchorNodeId: target.anchorNodeId,
      x: initial.x,
      z: initial.z,
      velocityX: 0,
      velocityZ: 0,
      heading: target.desiredHeading,
      targetX: target.x,
      targetZ: target.z,
      smoothedTargetX: target.x,
      smoothedTargetZ: target.z,
      blendStartX: target.x,
      blendStartZ: target.z,
      blendUntil: 0,
      blendDuration: 0,
      nextDecisionAt: elapsed,
      decisionInterval: 0.1 + (seed % 80) / 1000,
      scale: target.scale,
      state: target.state,
      renderedState: target.state,
      gaitPhase: (seed % 6283) / 1000,
      walkOffsetX: 0,
      walkOffsetZ: 0,
      walkSequence: 0,
      nextWalkAt: elapsed + 0.24 + ((seed >>> 10) % 42) / 100,
      lastPressure: target.pressure,
      recoilUntil: 0,
      recoilCooldownUntil: 0,
      seed,
    };
  }

  private updateAgentDecision(
    agent: VisualAntAgent,
    target: VisualAntTarget,
    elapsed: number,
  ): void {
    const stateChanged = agent.state !== target.state;
    const anchorChanged = agent.anchorNodeId !== target.anchorNodeId;
    const shouldDecide =
      elapsed >= agent.nextDecisionAt || stateChanged || anchorChanged;
    if (!shouldDecide) return;

    if (stateChanged || elapsed >= agent.nextWalkAt) {
      refreshWalkOffset(agent, target, elapsed);
    }

    const desiredTargetX = target.x + agent.walkOffsetX;
    const desiredTargetZ = target.z + agent.walkOffsetZ;
    const dx = desiredTargetX - agent.targetX;
    const dz = desiredTargetZ - agent.targetZ;
    const targetDelta = Math.hypot(dx, dz);
    if (targetDelta > TARGET_EPSILON || stateChanged || anchorChanged) {
      if (targetDelta > ANCHOR_JUMP_DISTANCE || anchorChanged) {
        agent.blendStartX = agent.smoothedTargetX;
        agent.blendStartZ = agent.smoothedTargetZ;
        agent.blendDuration = target.state === "routing" ? 0.18 : 0.36;
        agent.blendUntil = elapsed + agent.blendDuration;
      }
      agent.targetX = desiredTargetX;
      agent.targetZ = desiredTargetZ;
    }

    if (
      target.pressure - agent.lastPressure > 14 &&
      elapsed >= agent.recoilCooldownUntil &&
      (agent.state === "engaged" || agent.state === "pushing")
    ) {
      agent.recoilUntil = elapsed + 0.18;
      agent.recoilCooldownUntil = elapsed + 0.72;
    }
    agent.lastPressure = target.pressure;
    agent.anchorNodeId = target.anchorNodeId;
    agent.state = target.state;
    agent.scale = target.scale;
    agent.nextDecisionAt = elapsed + agent.decisionInterval;
  }

  private integrateAgent(
    agent: VisualAntAgent,
    target: VisualAntTarget,
    elapsed: number,
    dt: number,
  ): void {
    if (dt <= 0) return;
    const currentTarget = blendedTarget(agent, elapsed);
    const smoothing = target.state === "routing" ? 20 : target.state === "engaged" || target.state === "pushing" ? 13 : 10;
    const alpha = 1 - Math.exp(-smoothing * dt);
    if (distance2(agent.smoothedTargetX, agent.smoothedTargetZ, currentTarget.x, currentTarget.z) > TARGET_EPSILON) {
      agent.smoothedTargetX += (currentTarget.x - agent.smoothedTargetX) * alpha;
      agent.smoothedTargetZ += (currentTarget.z - agent.smoothedTargetZ) * alpha;
    }

    const visualState: VisualAntStateName = elapsed < agent.recoilUntil ? "recoiling" : target.state;
    agent.renderedState = visualState;
    const dx = agent.smoothedTargetX - agent.x;
    const dz = agent.smoothedTargetZ - agent.z;
    const distanceToTarget = Math.hypot(dx, dz);
    const deadZone = targetDeadZoneForState(visualState);
    const limits = movementLimits(visualState);

    let desiredVelocityX = 0;
    let desiredVelocityZ = 0;
    if (distanceToTarget > deadZone) {
      const speed = Math.min(limits.speed, (distanceToTarget - deadZone) * limits.arrival);
      desiredVelocityX = (dx / distanceToTarget) * speed;
      desiredVelocityZ = (dz / distanceToTarget) * speed;
    }
    if (visualState === "recoiling") {
      desiredVelocityX = -Math.sin(target.desiredHeading) * limits.speed;
      desiredVelocityZ = -Math.cos(target.desiredHeading) * limits.speed;
    }

    const nextVelocity = approachVector(
      { x: agent.velocityX, z: agent.velocityZ },
      { x: desiredVelocityX, z: desiredVelocityZ },
      limits.acceleration * dt,
    );
    agent.velocityX = Math.abs(nextVelocity.x) < SMALL_SPEED ? 0 : nextVelocity.x;
    agent.velocityZ = Math.abs(nextVelocity.z) < SMALL_SPEED ? 0 : nextVelocity.z;

    const previousX = agent.x;
    const previousZ = agent.z;
    agent.x += agent.velocityX * dt;
    agent.z += agent.velocityZ * dt;
    agent.x = clamp(agent.x, -EXPEDITION_BOARD_WIDTH * 0.5 + 4, EXPEDITION_BOARD_WIDTH * 0.5 - 4);
    agent.z = clamp(agent.z, -EXPEDITION_BOARD_HEIGHT * 0.5 + 4, EXPEDITION_BOARD_HEIGHT * 0.5 - 4);

    const speed = Math.hypot(agent.velocityX, agent.velocityZ);
    let desiredHeading = target.desiredHeading;
    if (speed > 0.12) desiredHeading = Math.atan2(agent.velocityX, agent.velocityZ);
    const diff = angleDelta(agent.heading, desiredHeading);
    if (Math.abs(diff) > 0.035 && (speed > 0.12 || visualState === "engaged" || visualState === "pushing" || visualState === "recoiling")) {
      agent.heading = normalizeAngle(
        agent.heading + clamp(diff, -limits.turnRate * dt, limits.turnRate * dt),
      );
    }

    const moved = Math.hypot(agent.x - previousX, agent.z - previousZ);
    if (speed > 0.08 && moved > 0.001) {
      agent.gaitPhase = normalizeAngle(agent.gaitPhase + moved * 6.4);
    }
  }
}

export function createVisualAntTargetsFromSlimes(
  slimes: ArmySlime[],
  maxCount: number,
  sideScale = 1,
): VisualAntTarget[] {
  const targets: VisualAntTarget[] = [];
  for (const slime of slimes) {
    const count = Math.min(
      slime.particles.filter((particle) => particle.alive).length,
      maxCount - targets.length,
    );
    const nodes = targetNodes(slime);
    for (let i = 0; i < count; i += 1) {
      const slot = formationSlot(slime, i, count);
      const anchor = nodes[i % nodes.length] ?? slime.nodes[0];
      targets.push({
        id: `${slime.id}:${i}`,
        anchorNodeId: anchor?.id ?? `${slime.id}:slot`,
        x: slot.x,
        z: slot.z,
        desiredHeading: desiredHeadingForSlime(slime),
        scale: sideScale * (slime.isRouting ? 0.86 : 1) * (0.98 + Math.min(0.08, slime.currentDensity * 0.025)),
        state: visualStateForSlot(slime, i, count),
        pressure: slime.pressure,
      });
    }
  }
  return targets;
}

export function battlePointToWorld(point: Vector2Like): { x: number; z: number } {
  return {
    x: (point.x - 500) * EXPEDITION_WORLD_SCALE,
    z: (point.y - 325) * EXPEDITION_WORLD_SCALE,
  };
}

export function nearestVisualAntGap(states: VisualAntRenderState[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < states.length; i += 1) {
    for (let j = i + 1; j < states.length; j += 1) {
      nearest = Math.min(nearest, Math.hypot(states[i].x - states[j].x, states[i].z - states[j].z));
    }
  }
  return nearest;
}

export function jitterTraceSample(time: number, state: VisualAntRenderState): VisualAntTraceSample {
  return {
    time,
    x: state.x,
    z: state.z,
    heading: state.angle,
    velocityX: state.velocityX,
    velocityZ: state.velocityZ,
    targetX: state.targetX,
    targetZ: state.targetZ,
    state: state.state,
    gaitPhase: state.gaitPhase,
  };
}

export function calculateVisualAntJitterMetrics(
  samples: VisualAntTraceSample[],
): VisualAntJitterMetrics {
  if (samples.length < 2) {
    return {
      directionFlipRate: 0,
      microMotionRatio: 0,
      accelerationSpikeRate: 0,
      idleDrift: 0,
      headingVelocityMismatch: 0,
      targetSnapDistance: 0,
      runningInPlaceRatio: 0,
    };
  }

  let flips = 0;
  let movingPairs = 0;
  let microMotion = 0;
  let accelSpikes = 0;
  let idleDrift = 0;
  let mismatch = 0;
  let mismatchSamples = 0;
  let targetSnapDistance = 0;
  let runningInPlace = 0;
  let idleSamples = 0;
  let previousAx = 0;
  let previousAz = 0;

  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const current = samples[i];
    const dt = Math.max(0.0001, current.time - prev.time);
    const speed = Math.hypot(current.velocityX, current.velocityZ);
    const prevSpeed = Math.hypot(prev.velocityX, prev.velocityZ);
    const movement = Math.hypot(current.x - prev.x, current.z - prev.z);
    const targetJump = Math.hypot(current.targetX - prev.targetX, current.targetZ - prev.targetZ);
    targetSnapDistance = Math.max(targetSnapDistance, targetJump);

    if (speed > 0.08 && prevSpeed > 0.08) {
      movingPairs += 1;
      const dot =
        (current.velocityX * prev.velocityX + current.velocityZ * prev.velocityZ) /
        Math.max(0.0001, speed * prevSpeed);
      if (dot < -0.25) flips += 1;
    }

    if (speed > 0.025 && speed < 0.34 && targetDistance(current) < 1.15) microMotion += 1;
    if (isIdleLike(current)) {
      idleSamples += 1;
      idleDrift += movement;
      if (Math.abs(angleDelta(prev.gaitPhase, current.gaitPhase)) > 0.002) runningInPlace += 1;
    }

    const ax = (current.velocityX - prev.velocityX) / dt;
    const az = (current.velocityZ - prev.velocityZ) / dt;
    if (i > 1 && Math.hypot(ax - previousAx, az - previousAz) > 95) accelSpikes += 1;
    previousAx = ax;
    previousAz = az;

    if (speed > 0.18) {
      mismatchSamples += 1;
      const velocityHeading = Math.atan2(current.velocityX, current.velocityZ);
      if (Math.abs(angleDelta(current.heading, velocityHeading)) > Math.PI * 0.42) mismatch += 1;
    }
  }

  const duration = Math.max(0.0001, samples[samples.length - 1].time - samples[0].time);
  return {
    directionFlipRate: flips / duration,
    microMotionRatio: microMotion / Math.max(1, samples.length - 1),
    accelerationSpikeRate: accelSpikes / duration,
    idleDrift: idleSamples > 0 ? idleDrift / idleSamples : 0,
    headingVelocityMismatch: mismatch / Math.max(1, mismatchSamples),
    targetSnapDistance,
    runningInPlaceRatio: runningInPlace / Math.max(1, idleSamples),
  };
}

function targetNodes(slime: ArmySlime): SlimeNode[] {
  const boundary = slime.nodes.filter((node) => node.role !== "interior");
  return boundary.length > 0 ? boundary : slime.nodes;
}

function formationSlot(slime: ArmySlime, index: number, count: number): { x: number; z: number } {
  const direction = normalize2(slime.facing);
  const lateral = { x: -direction.y, y: direction.x };
  const aspect = Math.max(0.65, Math.min(1.8, slime.currentWidth / Math.max(1, slime.currentDepth)));
  const columns = Math.max(3, Math.ceil(Math.sqrt(count * aspect * 1.08)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const row = Math.floor(index / columns);
  const col = index % columns;
  const u = rows <= 1 ? 0 : row / (rows - 1) * 2 - 1;
  const staggeredCol = col + (row % 2 === 0 ? 0 : 0.48);
  const v = columns <= 1 ? 0 : staggeredCol / Math.max(1, columns - 0.52) * 2 - 1;
  const cellU = rows <= 1 ? 0 : 2 / (rows - 1);
  const cellV = columns <= 1 ? 0 : 2 / (columns - 1);
  const seed = hashString(`${slime.id}:${index}`);
  const jitterForward = (((seed >>> 8) % 100) / 100 - 0.5) * cellU * 0.2;
  const jitterSide = (((seed >>> 17) % 100) / 100 - 0.5) * cellV * 0.18;
  const rowTaper = 1 - Math.abs(u) * 0.1;
  const forward = (u + jitterForward) * slime.currentDepth * 0.34;
  const sideways = (v + jitterSide) * slime.currentWidth * 0.42 * rowTaper;
  return battlePointToWorld({
    x: slime.center.x + direction.x * forward + lateral.x * sideways,
    y: slime.center.y + direction.y * forward + lateral.y * sideways,
  });
}

function desiredHeadingForSlime(slime: ArmySlime): number {
  const patch = slime.contactPatches[0];
  if (patch && (slime.isEngaged || slime.pressure > 18)) {
    return Math.atan2(patch.normal.x, patch.normal.y);
  }
  const speed = Math.hypot(slime.velocity.x, slime.velocity.y);
  if (speed > 4) return Math.atan2(slime.velocity.x, slime.velocity.y);
  return Math.atan2(slime.facing.x, slime.facing.y);
}

function visualStateForSlot(slime: ArmySlime, index: number, count: number): VisualAntStateName {
  if (slime.isRouting || slime.posture === "retreat") return "routing";
  if (slime.pressure > 44 && slime.isEngaged) return "pushing";
  if (slime.isEngaged) return "engaged";
  if (slime.gapRisk > 0.66 || slime.splitStress > 0.3) return "regrouping";
  const frontRank = index / Math.max(1, count);
  if (frontRank > 0.62 && (slime.posture === "envelop" || slime.posture === "breakthrough" || slime.posture === "spread")) {
    return "probing";
  }
  if (slime.posture === "hold" && Math.hypot(slime.velocity.x, slime.velocity.y) < 4) return "idle";
  return "marching";
}

function renderState(agent: VisualAntAgent): VisualAntRenderState {
  const speed = Math.hypot(agent.velocityX, agent.velocityZ);
  return {
    id: agent.id,
    x: agent.x,
    z: agent.z,
    y: 0.76,
    angle: agent.heading,
    scale: agent.scale,
    state: agent.renderedState,
    speed,
    velocityX: agent.velocityX,
    velocityZ: agent.velocityZ,
    targetX: agent.smoothedTargetX,
    targetZ: agent.smoothedTargetZ,
    gaitPhase: agent.gaitPhase,
  };
}

function blendedTarget(agent: VisualAntAgent, elapsed: number): { x: number; z: number } {
  if (elapsed >= agent.blendUntil || agent.blendDuration <= 0) {
    return { x: agent.targetX, z: agent.targetZ };
  }
  const t = 1 - (agent.blendUntil - elapsed) / agent.blendDuration;
  const smoothT = t * t * (3 - 2 * t);
  return {
    x: agent.blendStartX + (agent.targetX - agent.blendStartX) * smoothT,
    z: agent.blendStartZ + (agent.targetZ - agent.blendStartZ) * smoothT,
  };
}

function movementLimits(state: VisualAntStateName): {
  speed: number;
  acceleration: number;
  turnRate: number;
  arrival: number;
} {
  if (state === "routing") return { speed: 23, acceleration: 68, turnRate: 8.2, arrival: 7.5 };
  if (state === "recoiling") return { speed: 7.5, acceleration: 54, turnRate: 7, arrival: 8 };
  if (state === "pushing") return { speed: 4.6, acceleration: 22, turnRate: 4.6, arrival: 5.6 };
  if (state === "engaged") return { speed: 3.4, acceleration: 18, turnRate: 4.2, arrival: 4.8 };
  if (state === "probing") return { speed: 7.2, acceleration: 30, turnRate: 5.6, arrival: 6.2 };
  if (state === "regrouping") return { speed: 6.2, acceleration: 32, turnRate: 5.2, arrival: 5.4 };
  if (state === "idle") return { speed: 0, acceleration: 28, turnRate: 3.5, arrival: 4 };
  return { speed: 11.5, acceleration: 38, turnRate: 6.2, arrival: 6.8 };
}

function targetDeadZoneForState(state: VisualAntStateName): number {
  if (state === "idle") return TARGET_DEAD_ZONE;
  if (state === "engaged" || state === "pushing") return 0.48;
  if (state === "marching" || state === "probing") return 0.38;
  if (state === "regrouping") return 0.44;
  return 0.55;
}

function initialPositionForTarget(target: VisualAntTarget, seed: number): { x: number; z: number } {
  if (target.state !== "marching" && target.state !== "probing") {
    return { x: target.x, z: target.z };
  }
  const forwardX = Math.sin(target.desiredHeading);
  const forwardZ = Math.cos(target.desiredHeading);
  const lateralX = Math.cos(target.desiredHeading);
  const lateralZ = -Math.sin(target.desiredHeading);
  const deployDistance = 4.8 + (seed % 9) * 0.36;
  const lateralOffset = (((seed >>> 9) % 100) / 100 - 0.5) * 1.8;
  return {
    x: clamp(
      target.x - forwardX * deployDistance + lateralX * lateralOffset,
      -EXPEDITION_BOARD_WIDTH * 0.5 + 4,
      EXPEDITION_BOARD_WIDTH * 0.5 - 4,
    ),
    z: clamp(
      target.z - forwardZ * deployDistance + lateralZ * lateralOffset,
      -EXPEDITION_BOARD_HEIGHT * 0.5 + 4,
      EXPEDITION_BOARD_HEIGHT * 0.5 - 4,
    ),
  };
}

function refreshWalkOffset(agent: VisualAntAgent, target: VisualAntTarget, elapsed: number): void {
  const radius = walkRadiusForState(target.state);
  if (radius <= 0) {
    agent.walkOffsetX = 0;
    agent.walkOffsetZ = 0;
    agent.nextWalkAt = elapsed + 0.5;
    return;
  }

  const seed = hashString(`${agent.id}:${agent.seed}:${agent.walkSequence}`);
  agent.walkSequence += 1;
  const forwardX = Math.sin(target.desiredHeading);
  const forwardZ = Math.cos(target.desiredHeading);
  const lateralX = Math.cos(target.desiredHeading);
  const lateralZ = -Math.sin(target.desiredHeading);
  let forward = (((seed >>> 6) % 100) / 100 - 0.5) * radius * 1.45;
  let side = (((seed >>> 15) % 100) / 100 - 0.5) * radius * 0.95;

  if (target.state === "pushing") {
    forward = Math.abs(forward) * 0.72;
    side *= 0.62;
  } else if (target.state === "engaged") {
    forward *= 0.52;
    side *= 0.7;
  }

  agent.walkOffsetX = forwardX * forward + lateralX * side;
  agent.walkOffsetZ = forwardZ * forward + lateralZ * side;
  agent.nextWalkAt = elapsed + walkIntervalForState(target.state, seed);
}

function walkRadiusForState(state: VisualAntStateName): number {
  if (state === "marching") return 1.55;
  if (state === "probing") return 1.72;
  if (state === "regrouping") return 0.7;
  if (state === "engaged") return 0.42;
  if (state === "pushing") return 0.58;
  return 0;
}

function walkIntervalForState(state: VisualAntStateName, seed: number): number {
  const variance = ((seed >>> 22) % 100) / 100;
  if (state === "probing") return 0.52 + variance * 0.34;
  if (state === "engaged" || state === "pushing") return 0.58 + variance * 0.32;
  if (state === "regrouping") return 0.9 + variance * 0.48;
  return 0.48 + variance * 0.36;
}

function approachVector(
  current: { x: number; z: number },
  target: { x: number; z: number },
  maxDelta: number,
): { x: number; z: number } {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const length = Math.hypot(dx, dz);
  if (length <= maxDelta || length <= 0.0001) return target;
  return {
    x: current.x + (dx / length) * maxDelta,
    z: current.z + (dz / length) * maxDelta,
  };
}

function summarizeAgents(agents: VisualAntAgent[]): VisualAntDebugSnapshot {
  const stateCounts = emptyStateCounts();
  let speedTotal = 0;
  let maxTargetDistance = 0;
  for (const agent of agents) {
    stateCounts[agent.state] += 1;
    speedTotal += Math.hypot(agent.velocityX, agent.velocityZ);
    maxTargetDistance = Math.max(
      maxTargetDistance,
      distance2(agent.x, agent.z, agent.smoothedTargetX, agent.smoothedTargetZ),
    );
  }
  return {
    antCount: agents.length,
    stateCounts,
    averageSpeed: agents.length ? speedTotal / agents.length : 0,
    maxTargetDistance,
  };
}

function emptyDebugSnapshot(): VisualAntDebugSnapshot {
  return {
    antCount: 0,
    stateCounts: emptyStateCounts(),
    averageSpeed: 0,
    maxTargetDistance: 0,
  };
}

function emptyStateCounts(): Record<VisualAntStateName, number> {
  return {
    marching: 0,
    probing: 0,
    engaged: 0,
    pushing: 0,
    recoiling: 0,
    routing: 0,
    regrouping: 0,
    idle: 0,
  };
}

function normalize2(vector: Vector2Like): Vector2Like {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0.0001) return { x: 1, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

function targetDistance(sample: VisualAntTraceSample): number {
  return Math.hypot(sample.targetX - sample.x, sample.targetZ - sample.z);
}

function isIdleLike(sample: VisualAntTraceSample): boolean {
  return sample.state === "idle" || targetDistance(sample) < 1.05;
}

function distance2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle: number): number {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
