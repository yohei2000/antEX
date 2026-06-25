export type AgentSide = "player" | "enemy";

export type AgentState =
  | "march"
  | "followTrail"
  | "seekEnemy"
  | "probe"
  | "engage"
  | "brace"
  | "bite"
  | "push"
  | "recoil"
  | "disengage"
  | "retreat"
  | "regroup";

export type BattleReason = "enemy_all_retreat" | "player_all_retreat" | "objective_held" | "timeout_draw";

export interface Vec2 {
  x: number;
  y: number;
}

export interface AgentPhysicalParams {
  mandiblePower: number;
  carapace: number;
  mobility: number;
  stamina: number;
  discipline: number;
  pheromoneCommand: number;
}

export interface AgentSeed {
  id: number;
  side: AgentSide;
  position: Vec2;
  velocity?: Vec2;
  heading: number;
  gaitPhase?: number;
  bodyLength?: number;
  radius?: number;
  stamina?: number;
  morale?: number;
  hp?: number;
  wounded?: boolean;
  target?: Vec2 | null;
  animationSeed?: number;
  bodyScale?: number;
  currentTask?: string | null;
  renderIndex?: number | null;
  spawnReason?: string;
  worldLimit?: number;
}

export interface AntAgent {
  id: number;
  side: AgentSide;
  position: Vec2;
  previousPosition: Vec2;
  velocity: Vec2;
  heading: number;
  angularVelocity: number;
  bodyLength: number;
  radius: number;
  state: AgentState;
  stamina: number;
  morale: number;
  hp: number;
  wounded: boolean;
  target: Vec2 | null;
  gaitPhase: number;
  lastContactId: number | null;
  stateTime: number;
  biteCooldown: number;
  contactTime: number;
  retreatDirection: Vec2;
  variation: number;
  params: AgentPhysicalParams;
  animationSeed: number;
  bodyScale: number;
  currentTask: string | null;
  renderIndex: number | null;
  spawnReason: string;
  worldLimit: number;
}

export interface AgentBattleConfig {
  seed: number;
  playerCount: number;
  enemyCount: number;
  maxSeconds?: number;
  objective?: Vec2;
  player: AgentPhysicalParams;
  enemy: AgentPhysicalParams;
  playerSeeds?: AgentSeed[];
  enemySeeds?: AgentSeed[];
  worldLimit?: number;
}

export interface AgentFrameLog {
  step: number;
  id: number;
  side: AgentSide;
  state: AgentState;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  gaitPhase: number;
  bodyLength: number;
  radius: number;
  stamina: number;
  morale: number;
  hp: number;
  contactId: number | null;
  renderIndex: number | null;
  bodyScale: number;
  spawnReason: string;
}

export interface AgentSummary {
  side: AgentSide;
  initial: number;
  active: number;
  retreated: number;
  wounded: number;
  defeated: number;
}

export interface AntLikenessMetrics {
  forwardMotionRatio: number;
  headingVelocityAlignment: number;
  idleJitter: number;
  turnRateSpike: number;
  collisionPenetration: number;
  stopGoRhythm: number;
  trailCoherence: number;
  contactFacingRatio: number;
  retreatCoherence: number;
}

export interface AgentBattleResult {
  reason: BattleReason;
  winner: AgentSide | "draw";
  steps: number;
  seed: number;
  agents: AntAgent[];
  frameLogs: AgentFrameLog[];
  summary: Record<AgentSide, AgentSummary>;
  metrics: AntLikenessMetrics;
  diagnosis: string[];
}
