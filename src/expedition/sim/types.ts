export type Side = "player" | "enemy";

export type Vector2Like = {
  x: number;
  y: number;
};

export type RandomSource = () => number;

export type SlimePosture =
  | "neutral"
  | "spread"
  | "envelop"
  | "contract"
  | "breakthrough"
  | "hold"
  | "retreat";

export type SlimeNodeRole = "front" | "left" | "right" | "rear" | "interior";

export type SlimeLink = {
  nodeAId: string;
  nodeBId: string;
  restLength: number;
  stiffness: number;
  damping: number;
  integrity: number;
  stress: number;
  localPressure: number;
  recoveryDelay: number;
  broken: boolean;
};

export type SlimeNode = {
  id: string;
  role: SlimeNodeRole;
  position: Vector2Like;
  velocity: Vector2Like;
  targetPosition: Vector2Like;
  shapeU: number;
  shapeV: number;
  mass: number;
  localDensity: number;
  localPressure: number;
  localMorale: number;
  localCohesion: number;
  links: SlimeLink[];
};

export type SlimeParticle = {
  id: string;
  position: Vector2Like;
  velocity: Vector2Like;
  localNodeId: string;
  alive: boolean;
  phase: number;
};

export type ContactPatch = {
  id: string;
  ownNodeIds: string[];
  enemyNodeIds: string[];
  center: Vector2Like;
  normal: Vector2Like;
  length: number;
  pressure: number;
  ownDensity: number;
  enemyDensity: number;
  ownFrontage: number;
  enemyFrontage: number;
};

export type SlimeOrder = {
  posture: SlimePosture;
  targetCenter?: Vector2Like;
  targetDirection?: Vector2Like;
  targetWidth?: number;
  targetDepth?: number;
  targetDensity?: number;
  targetLeftWingAdvance?: number;
  targetRightWingAdvance?: number;
  targetFocusPoint?: Vector2Like;
  issuedAt: number;
  executeAt: number;
  status: "queued" | "transmitting" | "executing" | "blocked" | "completed";
};

export type ArmySlime = {
  id: string;
  side: Side;
  manualControl: boolean;
  center: Vector2Like;
  velocity: Vector2Like;
  facing: Vector2Like;
  posture: SlimePosture;
  nodes: SlimeNode[];
  particles: SlimeParticle[];
  desiredCenter: Vector2Like;
  desiredDirection: Vector2Like;
  desiredWidth: number;
  desiredDepth: number;
  desiredDensity: number;
  desiredLeftWingAdvance: number;
  desiredRightWingAdvance: number;
  desiredFocusPoint?: Vector2Like;
  baseWidth: number;
  baseDepth: number;
  currentWidth: number;
  currentDepth: number;
  currentDensity: number;
  mass: number;
  morale: number;
  cohesion: number;
  fatigue: number;
  pressure: number;
  elasticity: number;
  viscosity: number;
  tension: number;
  crowding: number;
  gapRisk: number;
  zocStrength: number;
  zocRadius: number;
  isSelected: boolean;
  isEngaged: boolean;
  isEncircling: boolean;
  isEncircled: boolean;
  isRouting: boolean;
  routedAt: number;
  contactPatches: ContactPatch[];
  activeOrder?: SlimeOrder;
  encirclement: number;
  breakthroughPower: number;
  envelopPower: number;
  commandDelay: number;
  shockTimer: number;
  aiThinkAt: number;
  linkIntegrity: number;
  brokenLinkRatio: number;
  toughness: number;
  effectiveToughness: number;
  peakLocalStress: number;
  fractureConcentration: number;
  fractureLinkCount: number;
  fractureCenter: Vector2Like;
  fractureNormal: Vector2Like;
  splitStress: number;
  splitGeneration: number;
  splitCooldown: number;
};

export type GesturePreviewState = {
  active: boolean;
  mode:
    | "none"
    | "drag"
    | "spread"
    | "contract"
    | "breakthrough"
    | "envelop"
    | "envelop-advance"
    | "rotate"
    | "left-wing"
    | "right-wing";
  start?: Vector2Like;
  end?: Vector2Like;
  center?: Vector2Like;
  width?: number;
  depth?: number;
  direction?: Vector2Like;
  rotation?: number;
  leftWingAdvance?: number;
  rightWingAdvance?: number;
  targetPoint?: Vector2Like;
  focusMode?: "breakthrough" | "envelop";
  confidence?: "高" | "中" | "低";
};

export type BattleState = {
  player: ArmySlime;
  enemy: ArmySlime;
  playerSlimes: ArmySlime[];
  enemySlimes: ArmySlime[];
  elapsed: number;
  speed: number;
  paused: boolean;
  winner?: Side | "draw";
  winnerAt?: number;
};
