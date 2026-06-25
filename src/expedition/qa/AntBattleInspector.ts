export type InspectorSeverity = "info" | "warning" | "critical";

export type AntBattleDiagnosticCode =
  | "duplicate_identity"
  | "identity_swap"
  | "teleport"
  | "vanish_spawn"
  | "duplicate_visual"
  | "heading_snap"
  | "idle_jitter"
  | "foot_sliding"
  | "running_in_place"
  | "invalid_state"
  | "context_leak"
  | "frame_budget_exceeded"
  | "sim_budget_exceeded"
  | "render_budget_exceeded"
  | "fixed_step_backlog"
  | "spiral_of_death_risk"
  | "collision_explosion"
  | "instance_churn"
  | "allocation_spike"
  | "inspector_overhead"
  | "perf_regression";

export interface InspectorAntSnapshot {
  id: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  heading: number;
  state: string;
  renderIndex: number | null;
  health: number;
  gaitPhase?: number;
}

export interface InspectorPerfSnapshot {
  frameTimeMs?: number;
  simUpdateMs?: number;
  renderMs?: number;
  inspectorMs?: number;
  fixedStepCount?: number;
  fixedStepBacklogMs?: number;
  antCountTotal?: number;
  battleAntCount?: number;
  visibleAntCount?: number;
  collisionPairCount?: number;
  spatialHashBucketCount?: number;
  maxBucketSize?: number;
  stateTransitionCount?: number;
  drawCallCount?: number;
  instanceUpdateCount?: number;
  heapUsedMB?: number;
  longTaskCount?: number;
}

export interface InspectorEventSnapshot {
  type: string;
  antId?: number;
  reason?: string;
}

export interface AntBattleInspectorSnapshot {
  time: number;
  ants: readonly InspectorAntSnapshot[];
  events?: readonly InspectorEventSnapshot[];
  battlePhase?: string;
  perf?: InspectorPerfSnapshot;
  contextGuard?: {
    before: string | number;
    after: string | number;
  };
}

export interface AntBattleDiagnostic {
  severity: InspectorSeverity;
  code: AntBattleDiagnosticCode;
  message: string;
  evidence: Record<string, unknown>;
  antIds: number[];
  timeRange: [number, number];
}

export const ANT_BATTLE_PERF_THRESHOLDS = {
  frameP95WarningMs: 20,
  frameP95CriticalMs: 33,
  simP95WarningMs: 6,
  simP95CriticalMs: 10,
  renderP95WarningMs: 8,
  renderP95CriticalMs: 14,
  inspectorP95WarningMs: 1,
  inspectorP95CriticalMs: 2,
  fixedStepWarningCount: 3,
  fixedStepCriticalCount: 5,
  backlogWarningMs: 100,
  backlogCriticalMs: 250,
  collisionPairPerAntWarning: 5,
  instanceUpdatePerVisibleWarning: 24,
  heapSpikeWarningMB: 24,
} as const;

const VALID_STATES = new Set([
  "march",
  "followTrail",
  "seekEnemy",
  "probe",
  "engage",
  "brace",
  "bite",
  "push",
  "recoil",
  "disengage",
  "retreat",
  "regroup",
  "explore",
  "return",
  "panic",
  "wet",
  "stunned",
  "rescue",
  "flee",
  "clash",
  "rival",
  "expedition",
  "expedition_wounded",
]);

const finite = (value: number) => Number.isFinite(value);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const speedOf = (ant: InspectorAntSnapshot) => Math.hypot(ant.velocity.x, ant.velocity.y);
const normAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

export class AntBattleInspector {
  private readonly capacity: number;
  private readonly snapshots: AntBattleInspectorSnapshot[] = [];
  private readonly previousById = new Map<number, InspectorAntSnapshot>();
  private readonly previousRenderOwner = new Map<number, number>();
  private readonly previousHeap: number | null = null;

  constructor(capacity = 180) {
    this.capacity = Math.max(8, Math.floor(capacity));
  }

  inspect(snapshot: AntBattleInspectorSnapshot): AntBattleDiagnostic[] {
    const diagnostics: AntBattleDiagnostic[] = [];
    const previousTime = this.snapshots[this.snapshots.length - 1]?.time ?? snapshot.time;
    const dt = Math.max(1 / 240, snapshot.time - previousTime);
    const allowedSpawnIds = new Set((snapshot.events ?? []).filter((event) => event.type === "spawn").map((event) => event.antId));
    const allowedVanishIds = new Set((snapshot.events ?? []).filter((event) => event.type === "despawn" || event.type === "retreat").map((event) => event.antId));
    const ids = new Set<number>();
    const renderOwners = new Map<number, number>();

    if (snapshot.contextGuard && snapshot.contextGuard.before !== snapshot.contextGuard.after) {
      diagnostics.push(this.diag("critical", "context_leak", "observer context changed while inspector was sampling", { contextGuard: snapshot.contextGuard }, [], snapshot.time));
    }

    for (const ant of snapshot.ants) {
      if (ids.has(ant.id)) {
        diagnostics.push(this.diag("critical", "duplicate_identity", "same ant id appears multiple times", { id: ant.id }, [ant.id], snapshot.time));
      }
      ids.add(ant.id);

      if (
        !finite(ant.position.x) ||
        !finite(ant.position.y) ||
        !finite(ant.velocity.x) ||
        !finite(ant.velocity.y) ||
        !finite(ant.heading) ||
        !finite(ant.health) ||
        ant.health < 0 ||
        !VALID_STATES.has(ant.state)
      ) {
        diagnostics.push(this.diag("critical", "invalid_state", "ant snapshot contains invalid numeric or state data", { ant }, [ant.id], snapshot.time));
      }

      if (ant.renderIndex != null) {
        const owner = renderOwners.get(ant.renderIndex);
        if (owner != null && owner !== ant.id) {
          diagnostics.push(this.diag("critical", "duplicate_visual", "multiple ids share one render index", { renderIndex: ant.renderIndex, owner, id: ant.id }, [owner, ant.id], snapshot.time));
        }
        renderOwners.set(ant.renderIndex, ant.id);
        const previousOwner = this.previousRenderOwner.get(ant.renderIndex);
        if (previousOwner != null && previousOwner !== ant.id && !allowedSpawnIds.has(ant.id)) {
          diagnostics.push(this.diag("warning", "identity_swap", "render index ownership changed without a spawn event", { renderIndex: ant.renderIndex, previousOwner, id: ant.id }, [previousOwner, ant.id], snapshot.time));
        }
      }

      const previous = this.previousById.get(ant.id);
      if (!previous) {
        if (this.snapshots.length > 0 && snapshot.battlePhase !== "summon" && !allowedSpawnIds.has(ant.id)) {
          diagnostics.push(this.diag("warning", "vanish_spawn", "ant appeared without a spawn reason", { id: ant.id, phase: snapshot.battlePhase }, [ant.id], snapshot.time));
        }
      } else {
        const jump = distance(ant.position, previous.position);
        if (jump > Math.max(6, dt * 34) && !allowedSpawnIds.has(ant.id)) {
          diagnostics.push(this.diag("critical", "teleport", "ant moved farther than physical transition budget", { jump, dt }, [ant.id], snapshot.time));
        }
        const headingDelta = Math.abs(normAngle(ant.heading - previous.heading));
        if (headingDelta > 2.35 && dt < 0.25) {
          diagnostics.push(this.diag("warning", "heading_snap", "heading changed too sharply", { headingDelta, dt }, [ant.id], snapshot.time));
        }
        const gaitDelta = Math.abs((ant.gaitPhase ?? 0) - (previous.gaitPhase ?? 0));
        const speed = speedOf(ant);
        if (speed < 0.04 && gaitDelta > 0.45) {
          diagnostics.push(this.diag("warning", "running_in_place", "gait advanced while the ant was nearly stationary", { speed, gaitDelta }, [ant.id], snapshot.time));
        }
        if (speed < 0.04 && jump > 0.025 && jump < 0.28) {
          diagnostics.push(this.diag("info", "idle_jitter", "stationary ant has small repeated drift", { speed, jump }, [ant.id], snapshot.time));
        }
        if (speed > 0.25) {
          const alignment = (Math.cos(ant.heading) * ant.velocity.x + Math.sin(ant.heading) * ant.velocity.y) / speed;
          if (alignment < 0.15) {
            diagnostics.push(this.diag("warning", "foot_sliding", "velocity and heading are persistently misaligned", { speed, alignment }, [ant.id], snapshot.time));
          }
        }
      }
    }

    for (const [id] of this.previousById) {
      if (!ids.has(id) && snapshot.battlePhase !== "ended" && !allowedVanishIds.has(id)) {
        diagnostics.push(this.diag("warning", "vanish_spawn", "ant vanished without a despawn or retreat reason", { id, phase: snapshot.battlePhase }, [id], snapshot.time));
      }
    }

    diagnostics.push(...this.inspectPerf(snapshot));
    this.pushSnapshot(snapshot);
    this.previousById.clear();
    this.previousRenderOwner.clear();
    for (const ant of snapshot.ants) {
      this.previousById.set(ant.id, {
        id: ant.id,
        position: { x: ant.position.x, y: ant.position.y },
        velocity: { x: ant.velocity.x, y: ant.velocity.y },
        heading: ant.heading,
        state: ant.state,
        renderIndex: ant.renderIndex,
        health: ant.health,
        gaitPhase: ant.gaitPhase,
      });
      if (ant.renderIndex != null) this.previousRenderOwner.set(ant.renderIndex, ant.id);
    }
    return diagnostics;
  }

  private inspectPerf(snapshot: AntBattleInspectorSnapshot) {
    const diagnostics: AntBattleDiagnostic[] = [];
    const perf = snapshot.perf;
    if (!perf) return diagnostics;
    const recent = [...this.snapshots, snapshot].map((item) => item.perf).filter(Boolean) as InspectorPerfSnapshot[];
    const p95 = (key: keyof InspectorPerfSnapshot) => percentile(recent.map((item) => Number(item[key] ?? 0)).filter((value) => value > 0), 0.95);
    this.perfBudget(diagnostics, snapshot.time, "frame_budget_exceeded", p95("frameTimeMs"), ANT_BATTLE_PERF_THRESHOLDS.frameP95WarningMs, ANT_BATTLE_PERF_THRESHOLDS.frameP95CriticalMs, "frame p95 exceeded budget");
    this.perfBudget(diagnostics, snapshot.time, "sim_budget_exceeded", p95("simUpdateMs"), ANT_BATTLE_PERF_THRESHOLDS.simP95WarningMs, ANT_BATTLE_PERF_THRESHOLDS.simP95CriticalMs, "simulation p95 exceeded budget");
    this.perfBudget(diagnostics, snapshot.time, "render_budget_exceeded", p95("renderMs"), ANT_BATTLE_PERF_THRESHOLDS.renderP95WarningMs, ANT_BATTLE_PERF_THRESHOLDS.renderP95CriticalMs, "render p95 exceeded budget");
    this.perfBudget(diagnostics, snapshot.time, "inspector_overhead", p95("inspectorMs"), ANT_BATTLE_PERF_THRESHOLDS.inspectorP95WarningMs, ANT_BATTLE_PERF_THRESHOLDS.inspectorP95CriticalMs, "inspector p95 exceeded budget");

    if ((perf.fixedStepCount ?? 0) >= ANT_BATTLE_PERF_THRESHOLDS.fixedStepCriticalCount) diagnostics.push(this.diag("critical", "spiral_of_death_risk", "fixed step count reached critical catch-up level", { fixedStepCount: perf.fixedStepCount }, [], snapshot.time));
    else if ((perf.fixedStepCount ?? 0) >= ANT_BATTLE_PERF_THRESHOLDS.fixedStepWarningCount) diagnostics.push(this.diag("warning", "fixed_step_backlog", "fixed step count is repeatedly high", { fixedStepCount: perf.fixedStepCount }, [], snapshot.time));
    if ((perf.fixedStepBacklogMs ?? 0) >= ANT_BATTLE_PERF_THRESHOLDS.backlogCriticalMs) diagnostics.push(this.diag("critical", "spiral_of_death_risk", "fixed step backlog is critical", { fixedStepBacklogMs: perf.fixedStepBacklogMs }, [], snapshot.time));
    else if ((perf.fixedStepBacklogMs ?? 0) >= ANT_BATTLE_PERF_THRESHOLDS.backlogWarningMs) diagnostics.push(this.diag("warning", "fixed_step_backlog", "fixed step backlog exceeded warning threshold", { fixedStepBacklogMs: perf.fixedStepBacklogMs }, [], snapshot.time));

    const battleAntCount = Math.max(1, perf.battleAntCount ?? snapshot.ants.length);
    if ((perf.collisionPairCount ?? 0) > battleAntCount * ANT_BATTLE_PERF_THRESHOLDS.collisionPairPerAntWarning || (perf.maxBucketSize ?? 0) > battleAntCount * 0.45) {
      diagnostics.push(this.diag("warning", "collision_explosion", "collision broadphase is producing too many pairs or dense buckets", { collisionPairCount: perf.collisionPairCount, maxBucketSize: perf.maxBucketSize, battleAntCount }, [], snapshot.time));
    }
    const visible = Math.max(1, perf.visibleAntCount ?? snapshot.ants.length);
    if ((perf.instanceUpdateCount ?? 0) > visible * ANT_BATTLE_PERF_THRESHOLDS.instanceUpdatePerVisibleWarning) {
      diagnostics.push(this.diag("warning", "instance_churn", "instance matrix updates are high relative to visible ants", { instanceUpdateCount: perf.instanceUpdateCount, visible }, [], snapshot.time));
    }
    const previousPerf = this.snapshots[this.snapshots.length - 1]?.perf;
    if (previousPerf?.heapUsedMB != null && perf.heapUsedMB != null && perf.heapUsedMB - previousPerf.heapUsedMB > ANT_BATTLE_PERF_THRESHOLDS.heapSpikeWarningMB) {
      diagnostics.push(this.diag("warning", "allocation_spike", "heap usage jumped between snapshots", { before: previousPerf.heapUsedMB, after: perf.heapUsedMB }, [], snapshot.time));
    }
    if ((perf.longTaskCount ?? 0) > 0) diagnostics.push(this.diag("warning", "perf_regression", "long tasks were observed during battle", { longTaskCount: perf.longTaskCount }, [], snapshot.time));
    return diagnostics;
  }

  private perfBudget(diagnostics: AntBattleDiagnostic[], time: number, code: AntBattleDiagnosticCode, value: number, warning: number, critical: number, message: string) {
    if (value >= critical) diagnostics.push(this.diag("critical", code, message, { p95: value, critical }, [], time));
    else if (value >= warning) diagnostics.push(this.diag("warning", code, message, { p95: value, warning }, [], time));
  }

  private pushSnapshot(snapshot: AntBattleInspectorSnapshot) {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.capacity) this.snapshots.shift();
  }

  private diag(severity: InspectorSeverity, code: AntBattleDiagnosticCode, message: string, evidence: Record<string, unknown>, antIds: number[], time: number): AntBattleDiagnostic {
    return { severity, code, message, evidence, antIds, timeRange: [time, time] };
  }
}
