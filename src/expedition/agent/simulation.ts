import { SeededRng } from "./rng";
import { SpatialHash } from "./spatialHash";
import type {
  AgentBattleConfig,
  AgentBattleResult,
  AgentFrameLog,
  AgentPhysicalParams,
  AgentSide,
  AgentState,
  AntAgent,
  AntLikenessMetrics,
  BattleReason,
  Vec2,
} from "./types";

export const AGENT_FIXED_DT = 1 / 60;

const WORLD_LIMIT = 42;
const OBJECTIVE_RADIUS = 6.4;
const HOLD_SECONDS = 2.4;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const length = (v: Vec2) => Math.hypot(v.x, v.y);
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
const headingVector = (heading: number): Vec2 => ({ x: Math.cos(heading), y: Math.sin(heading) });
const normAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function normalize(v: Vec2): Vec2 {
  const d = length(v);
  return d > 0.000001 ? { x: v.x / d, y: v.y / d } : { x: 0, y: 0 };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function isActive(agent: AntAgent) {
  return agent.hp > 0 && agent.state !== "retreat";
}

function isAlive(agent: AntAgent) {
  return agent.hp > 0;
}

function defaultParams(params: AgentPhysicalParams): AgentPhysicalParams {
  return {
    mandiblePower: clamp(params.mandiblePower, 0.35, 3),
    carapace: clamp(params.carapace, 0.35, 3),
    mobility: clamp(params.mobility, 0.35, 3),
    stamina: clamp(params.stamina, 0.35, 3),
    discipline: clamp(params.discipline, 0.35, 3),
    pheromoneCommand: clamp(params.pheromoneCommand, 0.35, 3),
  };
}

export function createAgentForTest(partial: Partial<AntAgent> = {}): AntAgent {
  const params = defaultParams(partial.params ?? {
    mandiblePower: 1,
    carapace: 1,
    mobility: 1,
    stamina: 1,
    discipline: 1,
    pheromoneCommand: 1,
  });
  const position = partial.position ?? { x: 0, y: 0 };
  return {
    id: partial.id ?? 1,
    side: partial.side ?? "player",
    position: { ...position },
    previousPosition: { ...position },
    velocity: partial.velocity ? { ...partial.velocity } : { x: 0, y: 0 },
    heading: partial.heading ?? 0,
    angularVelocity: partial.angularVelocity ?? 0,
    bodyLength: partial.bodyLength ?? 1.55,
    radius: partial.radius ?? 0.58,
    state: partial.state ?? "march",
    stamina: partial.stamina ?? 1,
    morale: partial.morale ?? 1,
    hp: partial.hp ?? 1,
    wounded: partial.wounded ?? false,
    target: partial.target ? { ...partial.target } : null,
    gaitPhase: partial.gaitPhase ?? 0,
    lastContactId: partial.lastContactId ?? null,
    stateTime: partial.stateTime ?? 0,
    biteCooldown: partial.biteCooldown ?? 0,
    contactTime: partial.contactTime ?? 0,
    retreatDirection: partial.retreatDirection ? { ...partial.retreatDirection } : { x: -1, y: 0 },
    variation: partial.variation ?? 0,
    params,
  };
}

function makeAgent(id: number, side: AgentSide, index: number, count: number, params: AgentPhysicalParams, rng: SeededRng): AntAgent {
  const row = index - (count - 1) * 0.5;
  const lane = row * 1.25;
  const sideSign = side === "player" ? -1 : 1;
  const x = sideSign * (24 + Math.floor(index / 6) * 1.8);
  const y = lane + rng.range(-0.18, 0.18);
  const heading = side === "player" ? 0 : Math.PI;
  return createAgentForTest({
    id,
    side,
    position: { x, y },
    heading,
    bodyLength: rng.range(1.45, 1.72),
    radius: rng.range(0.52, 0.62),
    retreatDirection: side === "player" ? { x: -1, y: 0 } : { x: 1, y: 0 },
    variation: rng.range(-1, 1),
    params,
  });
}

function setState(agent: AntAgent, next: AgentState) {
  if (agent.state === next) return;
  agent.state = next;
  agent.stateTime = 0;
}

export function integrateAgentPhysics(agent: AntAgent, desiredDirection: Vec2, desiredSpeed: number, dt = AGENT_FIXED_DT) {
  agent.previousPosition.x = agent.position.x;
  agent.previousPosition.y = agent.position.y;

  const desiredLength = length(desiredDirection);
  if (desiredLength > 0.0001 && desiredSpeed > 0.0001) {
    const desiredHeading = Math.atan2(desiredDirection.y, desiredDirection.x);
    const maxTurn = (2.2 + agent.params.mobility * 1.35) * dt;
    const delta = clamp(normAngle(desiredHeading - agent.heading), -maxTurn, maxTurn);
    agent.heading = normAngle(agent.heading + delta);
    agent.angularVelocity = delta / dt;

    const forward = headingVector(agent.heading);
    const accel = 7.5 + agent.params.mobility * 3.2;
    const currentForwardSpeed = dot(agent.velocity, forward);
    const speedError = desiredSpeed - currentForwardSpeed;
    agent.velocity.x += forward.x * clamp(speedError * accel, -accel, accel) * dt;
    agent.velocity.y += forward.y * clamp(speedError * accel, -accel, accel) * dt;

    const lateral = {
      x: agent.velocity.x - forward.x * currentForwardSpeed,
      y: agent.velocity.y - forward.y * currentForwardSpeed,
    };
    agent.velocity.x -= lateral.x * clamp(7.5 * dt, 0, 1);
    agent.velocity.y -= lateral.y * clamp(7.5 * dt, 0, 1);
  } else {
    agent.angularVelocity = 0;
    agent.velocity.x *= Math.max(0, 1 - 12 * dt);
    agent.velocity.y *= Math.max(0, 1 - 12 * dt);
  }

  const maxSpeed = 3.1 + agent.params.mobility * 1.45;
  const speed = length(agent.velocity);
  if (speed > maxSpeed) {
    const k = maxSpeed / speed;
    agent.velocity.x *= k;
    agent.velocity.y *= k;
  }

  const damping = agent.state === "brace" ? 0.9 : 0.985;
  agent.velocity.x *= damping;
  agent.velocity.y *= damping;
  agent.position.x += agent.velocity.x * dt;
  agent.position.y += agent.velocity.y * dt;
  agent.position.x = clamp(agent.position.x, -WORLD_LIMIT, WORLD_LIMIT);
  agent.position.y = clamp(agent.position.y, -WORLD_LIMIT, WORLD_LIMIT);

  const traveled = distance(agent.position, agent.previousPosition);
  if (traveled > 0.0001) agent.gaitPhase = (agent.gaitPhase + traveled * 6.2) % (Math.PI * 2);
}

class MetricsAccumulator {
  movingSamples = 0;
  forwardSamples = 0;
  alignmentSum = 0;
  idleSamples = 0;
  idleDrift = 0;
  turnSamples = 0;
  turnSpikes = 0;
  maxPenetration = 0;
  trailSamples = 0;
  trailSum = 0;
  contactSamples = 0;
  contactFacing = 0;
  retreatSamples = 0;
  retreatSum = 0;
  stopGoSamples = 0;
  stopGoChanges = 0;
  lastMoving = new Map<number, boolean>();

  sampleAgent(agent: AntAgent, objective: Vec2) {
    const speed = length(agent.velocity);
    const moving = speed > 0.08;
    const forward = headingVector(agent.heading);
    if (moving) {
      const velocityDirection = normalize(agent.velocity);
      const alignment = dot(forward, velocityDirection);
      this.movingSamples += 1;
      this.alignmentSum += alignment;
      if (alignment > 0.62) this.forwardSamples += 1;
    } else {
      this.idleSamples += 1;
      this.idleDrift += distance(agent.position, agent.previousPosition);
    }

    this.turnSamples += 1;
    if (Math.abs(agent.angularVelocity) > 5.8) this.turnSpikes += 1;

    const previousMoving = this.lastMoving.get(agent.id);
    if (previousMoving != null) {
      this.stopGoSamples += 1;
      if (previousMoving !== moving) this.stopGoChanges += 1;
    }
    this.lastMoving.set(agent.id, moving);

    if (moving && agent.state !== "retreat" && agent.lastContactId == null) {
      const objectiveDirection = normalize(sub(objective, agent.position));
      this.trailSamples += 1;
      this.trailSum += Math.max(-1, dot(normalize(agent.velocity), objectiveDirection));
    }
    if (moving && agent.state === "retreat") {
      this.retreatSamples += 1;
      this.retreatSum += Math.max(-1, dot(normalize(agent.velocity), agent.retreatDirection));
    }
  }

  sampleContact(agent: AntAgent, enemy: AntAgent, penetration: number) {
    this.maxPenetration = Math.max(this.maxPenetration, penetration);
    const facing = dot(headingVector(agent.heading), normalize(sub(enemy.position, agent.position)));
    this.contactSamples += 1;
    if (facing > 0.34) this.contactFacing += 1;
  }

  metrics(): AntLikenessMetrics {
    return {
      forwardMotionRatio: this.movingSamples ? this.forwardSamples / this.movingSamples : 1,
      headingVelocityAlignment: this.movingSamples ? this.alignmentSum / this.movingSamples : 1,
      idleJitter: this.idleSamples ? this.idleDrift / this.idleSamples : 0,
      turnRateSpike: this.turnSamples ? this.turnSpikes / this.turnSamples : 0,
      collisionPenetration: this.maxPenetration,
      stopGoRhythm: this.stopGoSamples ? 1 - this.stopGoChanges / this.stopGoSamples : 1,
      trailCoherence: this.trailSamples ? this.trailSum / this.trailSamples : 1,
      contactFacingRatio: this.contactSamples ? this.contactFacing / this.contactSamples : 1,
      retreatCoherence: this.retreatSamples ? this.retreatSum / this.retreatSamples : 1,
    };
  }
}

export class AgentBattleSimulation {
  readonly agents: AntAgent[];
  readonly frameLogs: AgentFrameLog[] = [];
  readonly config: Required<AgentBattleConfig>;
  private readonly spatial = new SpatialHash(2.2);
  private readonly metrics = new MetricsAccumulator();
  private holdTimer = 0;
  private stepIndex = 0;

  constructor(config: AgentBattleConfig) {
    const rng = new SeededRng(config.seed);
    this.config = {
      seed: config.seed >>> 0,
      playerCount: Math.max(1, Math.floor(config.playerCount)),
      enemyCount: Math.max(1, Math.floor(config.enemyCount)),
      maxSeconds: config.maxSeconds ?? 24,
      objective: config.objective ?? { x: 0, y: 0 },
      player: defaultParams(config.player),
      enemy: defaultParams(config.enemy),
    };
    this.agents = [];
    for (let i = 0; i < this.config.playerCount; i += 1) {
      this.agents.push(makeAgent(i + 1, "player", i, this.config.playerCount, this.config.player, rng));
    }
    for (let i = 0; i < this.config.enemyCount; i += 1) {
      this.agents.push(makeAgent(1001 + i, "enemy", i, this.config.enemyCount, this.config.enemy, rng));
    }
  }

  run(): AgentBattleResult {
    const maxSteps = Math.max(1, Math.floor(this.config.maxSeconds / AGENT_FIXED_DT));
    let reason: BattleReason = "timeout_draw";
    for (let i = 0; i < maxSteps; i += 1) {
      this.step();
      const resolved = this.resolveReason();
      if (resolved) {
        reason = resolved;
        break;
      }
    }
    const winner = reason === "enemy_all_retreat" || reason === "objective_held" ? "player" : reason === "player_all_retreat" ? "enemy" : "draw";
    const summary = {
      player: this.summaryFor("player"),
      enemy: this.summaryFor("enemy"),
    };
    const metrics = this.metrics.metrics();
    return {
      reason,
      winner,
      steps: this.stepIndex,
      seed: this.config.seed,
      agents: this.agents.map((agent) => ({ ...agent, position: { ...agent.position }, velocity: { ...agent.velocity } })),
      frameLogs: this.frameLogs,
      summary,
      metrics,
      diagnosis: buildDiagnosis(reason, summary, metrics),
    };
  }

  step(dt = AGENT_FIXED_DT) {
    this.spatial.clear();
    for (const agent of this.agents) {
      if (isAlive(agent)) this.spatial.insert(agent);
      agent.lastContactId = null;
    }

    for (const agent of this.agents) {
      if (!isAlive(agent)) continue;
      agent.stateTime += dt;
      agent.biteCooldown = Math.max(0, agent.biteCooldown - dt);
      this.updateAgentIntent(agent, dt);
    }

    this.resolveContacts(dt);

    for (const agent of this.agents) {
      if (!isAlive(agent)) continue;
      this.metrics.sampleAgent(agent, this.config.objective);
      if (this.stepIndex % 3 === 0) this.logFrame(agent);
    }

    this.stepIndex += 1;
  }

  private updateAgentIntent(agent: AntAgent, dt: number) {
    if (agent.hp <= 0.05) {
      agent.hp = 0;
      agent.wounded = true;
      agent.velocity.x = 0;
      agent.velocity.y = 0;
      return;
    }
    if (agent.morale < 0.12 || agent.stamina < 0.08 || agent.hp < 0.18) {
      setState(agent, "retreat");
    }

    const enemy = this.findNearestEnemy(agent, 8.5);
    let desired = { x: 0, y: 0 };
    let desiredSpeed = 0;

    if (agent.state === "retreat") {
      desired = agent.retreatDirection;
      desiredSpeed = (2.25 + agent.params.mobility * 0.9) * clamp(agent.morale + 0.5, 0.5, 1);
      agent.morale = Math.max(0, agent.morale - dt * 0.015);
    } else if (agent.state === "recoil") {
      const away = enemy ? normalize(sub(agent.position, enemy.position)) : agent.retreatDirection;
      desired = away;
      desiredSpeed = 1.25 + agent.params.mobility * 0.35;
      if (agent.stateTime > 0.2) setState(agent, "disengage");
    } else if (agent.state === "disengage") {
      const away = enemy ? normalize(sub(agent.position, enemy.position)) : this.trailDirection(agent);
      const trail = this.trailDirection(agent);
      desired = normalize(add(scale(away, 0.62), scale(trail, 0.38)));
      desiredSpeed = 1.1 + agent.params.mobility * 0.28;
      if (agent.stateTime > 0.35) setState(agent, agent.morale < 0.28 ? "retreat" : "seekEnemy");
    } else if (enemy) {
      const toEnemy = sub(enemy.position, agent.position);
      const enemyDistance = length(toEnemy);
      const enemyDirection = normalize(toEnemy);
      const facing = dot(headingVector(agent.heading), enemyDirection);
      desired = enemyDirection;
      desiredSpeed = enemyDistance > agent.radius + enemy.radius + 0.35 ? 2.2 + agent.params.mobility * 0.55 : 0.8;
      setState(agent, enemyDistance < 3.6 ? "engage" : "seekEnemy");
      if (enemyDistance < agent.bodyLength * 1.05 + enemy.radius && facing > 0.42) {
        if (agent.biteCooldown <= 0 && agent.stamina > 0.16) {
          setState(agent, "bite");
          const damage = (0.13 + agent.params.mandiblePower * 0.045) / enemy.params.carapace;
          enemy.hp = Math.max(0, enemy.hp - damage);
          enemy.morale = Math.max(0, enemy.morale - damage * (0.55 + agent.params.discipline * 0.12));
          enemy.wounded = enemy.wounded || enemy.hp < 0.68;
          if (enemy.hp > 0 && enemy.state !== "retreat") setState(enemy, "recoil");
          enemy.velocity.x -= enemyDirection.x * (0.22 + agent.params.mandiblePower * 0.04);
          enemy.velocity.y -= enemyDirection.y * (0.22 + agent.params.mandiblePower * 0.04);
          agent.stamina = Math.max(0, agent.stamina - 0.055);
          agent.biteCooldown = 0.42 + agent.variation * 0.025;
        } else if (agent.stamina > enemy.stamina * 0.9) {
          setState(agent, "push");
          desiredSpeed = 1.2;
        } else {
          setState(agent, "brace");
          desiredSpeed = 0.15;
        }
      } else if (enemyDistance < agent.bodyLength * 1.4) {
        setState(agent, "probe");
      }
    } else {
      const trail = this.trailDirection(agent);
      desired = trail;
      desiredSpeed = 1.65 + agent.params.mobility * 0.55;
      if (distance(agent.position, this.config.objective) < OBJECTIVE_RADIUS * 1.4) setState(agent, "regroup");
      else setState(agent, agent.params.pheromoneCommand > 1.05 ? "followTrail" : "march");
    }

    if (agent.state === "bite" || agent.state === "brace") {
      agent.stamina = Math.max(0, agent.stamina - dt * 0.045);
    } else {
      agent.stamina = clamp(agent.stamina + dt * 0.035 * agent.params.stamina, 0, 1);
    }
    if (agent.state !== "retreat") agent.morale = clamp(agent.morale + dt * 0.012 * agent.params.discipline, 0, 1);
    integrateAgentPhysics(agent, desired, desiredSpeed, dt);
  }

  private trailDirection(agent: AntAgent) {
    const objectiveDirection = normalize(sub(this.config.objective, agent.position));
    const sideDirection = agent.side === "player" ? { x: 1, y: 0 } : { x: -1, y: 0 };
    const command = clamp(agent.params.pheromoneCommand / 2.4, 0.2, 0.92);
    const lane = Math.sin(agent.id * 1.37 + agent.variation) * 0.18;
    const laneVector = { x: 0, y: lane };
    return normalize(add(add(scale(objectiveDirection, command), scale(sideDirection, 1 - command)), laneVector));
  }

  private findNearestEnemy(agent: AntAgent, radius: number) {
    let best: AntAgent | null = null;
    let bestDistance = radius;
    for (const candidate of this.spatial.query(agent.position.x, agent.position.y, radius)) {
      if (candidate.side === agent.side || !isAlive(candidate) || candidate.state === "retreat") continue;
      const d = distance(agent.position, candidate.position);
      if (d < bestDistance) {
        best = candidate;
        bestDistance = d;
      }
    }
    return best;
  }

  private resolveContacts(dt: number) {
    for (let i = 0; i < this.agents.length; i += 1) {
      const a = this.agents[i];
      if (!isAlive(a)) continue;
      for (const b of this.spatial.query(a.position.x, a.position.y, a.radius + 1.3)) {
        if (a.id >= b.id || !isAlive(b)) continue;
        const delta = sub(a.position, b.position);
        const d = length(delta) || 0.0001;
        const minDistance = a.radius + b.radius;
        if (d >= minDistance) continue;
        const normal = scale(delta, 1 / d);
        const penetration = minDistance - d;
        const sameSide = a.side === b.side;
        const correction = sameSide ? penetration * 0.32 : penetration * 0.58;
        a.position.x += normal.x * correction;
        a.position.y += normal.y * correction;
        b.position.x -= normal.x * correction;
        b.position.y -= normal.y * correction;
        const impulse = sameSide ? 0.18 : 0.46;
        a.velocity.x += normal.x * impulse;
        a.velocity.y += normal.y * impulse;
        b.velocity.x -= normal.x * impulse;
        b.velocity.y -= normal.y * impulse;

        if (!sameSide) {
          a.lastContactId = b.id;
          b.lastContactId = a.id;
          a.contactTime += dt;
          b.contactTime += dt;
          this.metrics.sampleContact(a, b, penetration);
          this.metrics.sampleContact(b, a, penetration);
          if (a.state === "push") b.morale = Math.max(0, b.morale - 0.012 * a.params.mandiblePower);
          if (b.state === "push") a.morale = Math.max(0, a.morale - 0.012 * b.params.mandiblePower);
        }
      }
    }
  }

  private resolveReason(): BattleReason | null {
    const playerActive = this.agents.some((agent) => agent.side === "player" && isActive(agent));
    const enemyActive = this.agents.some((agent) => agent.side === "enemy" && isActive(agent));
    if (!enemyActive) return "enemy_all_retreat";
    if (!playerActive) return "player_all_retreat";

    const playerHeld = this.agents.filter((agent) => agent.side === "player" && isActive(agent) && distance(agent.position, this.config.objective) < OBJECTIVE_RADIUS).length;
    const enemyHeld = this.agents.filter((agent) => agent.side === "enemy" && isActive(agent) && distance(agent.position, this.config.objective) < OBJECTIVE_RADIUS).length;
    if (playerHeld >= Math.max(2, enemyHeld + 2)) this.holdTimer += AGENT_FIXED_DT;
    else this.holdTimer = 0;
    return this.holdTimer >= HOLD_SECONDS ? "objective_held" : null;
  }

  private summaryFor(side: AgentSide) {
    const agents = this.agents.filter((agent) => agent.side === side);
    return {
      side,
      initial: agents.length,
      active: agents.filter(isActive).length,
      retreated: agents.filter((agent) => agent.state === "retreat" && agent.hp > 0).length,
      wounded: agents.filter((agent) => agent.wounded && agent.hp > 0).length,
      defeated: agents.filter((agent) => agent.hp <= 0).length,
    };
  }

  private logFrame(agent: AntAgent) {
    this.frameLogs.push({
      step: this.stepIndex,
      id: agent.id,
      side: agent.side,
      state: agent.state,
      x: round(agent.position.x),
      y: round(agent.position.y),
      vx: round(agent.velocity.x),
      vy: round(agent.velocity.y),
      heading: round(agent.heading),
      gaitPhase: round(agent.gaitPhase),
      bodyLength: round(agent.bodyLength),
      radius: round(agent.radius),
      stamina: round(agent.stamina),
      morale: round(agent.morale),
      hp: round(agent.hp),
      contactId: agent.lastContactId,
    });
  }
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function buildDiagnosis(reason: BattleReason, summary: AgentBattleResult["summary"], metrics: AntLikenessMetrics) {
  const lines = [
    `reason:${reason}`,
    `player active ${summary.player.active}/${summary.player.initial}, wounded ${summary.player.wounded}, retreated ${summary.player.retreated}`,
    `enemy active ${summary.enemy.active}/${summary.enemy.initial}, wounded ${summary.enemy.wounded}, retreated ${summary.enemy.retreated}`,
    `forward ${(metrics.forwardMotionRatio * 100).toFixed(0)}%, contactFacing ${(metrics.contactFacingRatio * 100).toFixed(0)}%`,
  ];
  if (metrics.collisionPenetration > 0.4) lines.push("deep contact pressure observed");
  if (metrics.retreatCoherence < 0.6) lines.push("retreat flow was fragmented");
  return lines;
}

export function runAgentBattle(config: AgentBattleConfig): AgentBattleResult {
  return new AgentBattleSimulation(config).run();
}
