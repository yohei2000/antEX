import { PLAYER_NEST_MAX_DURABILITY, RAID_INITIAL_DELAY_SECONDS, RAID_RIVAL_CAP, RAID_WARNING_SECONDS } from "../config/balance";
import { BARRACKS_QUEUE_CAP, getBarracksTrainingDef, normalizeBarracksTrainingVariant } from "../config/barracks";
import { normalizeConstructionKind } from "../config/construction";
import { UPGRADE_DEFS } from "../config/upgrades";
import { clamp } from "../shared/math";
import { COLONY_SAVE_VERSION, createDefaultColony, createDefaultRaidState } from "./colony";
import type { BarracksTrainingItem, ColonyGameStatus, ColonyState, RaidPhase, RaidState } from "./schema";

const RAID_PHASES: RaidPhase[] = ["calm", "warning", "active", "retreating", "recovering"];
const GAME_STATUSES: ColonyGameStatus[] = ["playing", "victory", "defeat"];

export function normalizeRaidState(raw: unknown, options: { resetActiveOnLoad?: boolean } = {}): RaidState {
  const base = createDefaultRaidState();
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Partial<RaidState>;
  const phase = RAID_PHASES.includes(source.phase as RaidPhase) ? source.phase as RaidPhase : base.phase;
  const next: RaidState = {
    ...base,
    ...source,
    phase,
    timer: clamp(Number(source.timer) || 0, 0, 3600),
    wave: Math.floor(clamp(Number(source.wave) || 0, 0, 999999)),
    activeCount: Math.floor(clamp(Number(source.activeCount) || 0, 0, RAID_RIVAL_CAP)),
    approachAngle: Number.isFinite(Number(source.approachAngle)) ? Number(source.approachAngle) : base.approachAngle,
    signalTimer: clamp(Number(source.signalTimer) || 0, 0, 30),
    breachTimer: clamp(Number(source.breachTimer) || 0, 0, 30),
    casualties: Math.floor(clamp(Number(source.casualties) || 0, 0, 999999)),
    enemyCasualties: Math.floor(clamp(Number(source.enemyCasualties) || 0, 0, 999999)),
    startFallenAnts: Number.isFinite(Number(source.startFallenAnts))
      ? Math.floor(clamp(Number(source.startFallenAnts), 0, 999999))
      : null,
    lastOutcome: typeof source.lastOutcome === "string" ? source.lastOutcome : base.lastOutcome,
  };
  if (options.resetActiveOnLoad && (next.phase === "active" || next.phase === "retreating")) {
    next.phase = "warning";
    next.timer = Math.max(6, Math.min(RAID_WARNING_SECONDS, next.timer || 10));
    next.signalTimer = 0;
  }
  if (next.phase === "calm" && next.timer <= 0) next.timer = RAID_INITIAL_DELAY_SECONDS;
  return next;
}

export function migrateColony(raw: unknown): ColonyState {
  const base = createDefaultColony();
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Partial<ColonyState>;
  const next: ColonyState = {
    ...base,
    ...source,
    version: COLONY_SAVE_VERSION,
    upgrades: { ...base.upgrades, ...(source.upgrades ?? {}) },
    raidState: normalizeRaidState(source.raidState, { resetActiveOnLoad: true }),
    battleLog: Array.isArray(source.battleLog) ? source.battleLog.slice(0, 5) : base.battleLog,
  };

  if (!Number.isFinite(next.antPopulation) || next.antPopulation > 80) {
    next.antPopulation = clamp(Number(next.antPopulation) || 12, 12, 32);
  }
  next.food = clamp(Number(next.food) || base.food, 0, 100000000);
  next.lifetimeFood = Math.max(next.food, Number(next.lifetimeFood) || next.food);
  next.antPopulation = Math.floor(clamp(Number(next.antPopulation) || 12, 12, 1000000));
  next.soldierAnts = Math.floor(clamp(Number(next.soldierAnts) || 1, 0, next.antPopulation));
  next.heavySoldierAnts = Math.floor(clamp(Number(next.heavySoldierAnts) || 0, 0, next.soldierAnts));
  next.shieldHeadAnts = Math.floor(clamp(Number(next.shieldHeadAnts) || 0, 0, Math.max(0, next.soldierAnts - next.heavySoldierAnts)));
  next.acidShooterAnts = Math.floor(clamp(Number(next.acidShooterAnts) || 0, 0, Math.max(0, next.soldierAnts - next.heavySoldierAnts - next.shieldHeadAnts)));
  next.scoutAnts = Math.floor(clamp(Number(next.scoutAnts) || 0, 0, Math.max(0, next.soldierAnts - next.heavySoldierAnts - next.shieldHeadAnts - next.acidShooterAnts)));
  next.medicAnts = Math.floor(clamp(Number(next.medicAnts) || 0, 0, Math.max(0, next.soldierAnts - next.heavySoldierAnts - next.shieldHeadAnts - next.acidShooterAnts - next.scoutAnts)));
  next.captainAnts = Math.floor(clamp(Number(next.captainAnts) || 0, 0, Math.max(0, next.soldierAnts - next.heavySoldierAnts - next.shieldHeadAnts - next.acidShooterAnts - next.scoutAnts - next.medicAnts)));
  next.builderAnts = Math.floor(clamp(Number(next.builderAnts) || 0, 0, Math.max(0, next.antPopulation - next.soldierAnts)));
  next.woundedAnts = Math.floor(clamp(Number(next.woundedAnts) || 0, 0, next.antPopulation));
  next.nestLevel = Math.floor(clamp(Number(next.nestLevel) || 1, 1, 999));
  {
    const rawNestDurability = Number(source.nestDurability);
    next.nestDurability = clamp(
      Number.isFinite(rawNestDurability) ? rawNestDurability : base.nestDurability,
      0,
      PLAYER_NEST_MAX_DURABILITY,
    );
  }
  next.gameStatus = GAME_STATUSES.includes(source.gameStatus as ColonyGameStatus)
    ? source.gameStatus as ColonyGameStatus
    : next.nestDurability <= 0
      ? "defeat"
      : base.gameStatus;
  if (next.nestDurability <= 0 && next.gameStatus !== "victory") next.gameStatus = "defeat";
  if (next.gameStatus === "defeat") next.nestDurability = 0;
  next.territory = Math.floor(clamp(Number(next.territory) || 0, 0, 999999));
  next.enemyThreat = clamp(Number(next.enemyThreat) || base.enemyThreat, 0, 999999);
  next.fallenAnts = Math.floor(clamp(Number(next.fallenAnts) || 0, 0, 999999));
  next.hatchProgress = clamp(Number(next.hatchProgress) || 0, 0, 0.999);
  next.battleCooldownUntil = Number(next.battleCooldownUntil) || 0;
  next.lastSavedAt = Number(next.lastSavedAt) || Date.now();
  next.raidState = normalizeRaidState(next.raidState);
  next.nextEarthworkId = Math.floor(clamp(Number(next.nextEarthworkId) || 1, 1, 100000000));
  next.earthworks = Array.isArray(source.earthworks)
    ? source.earthworks.slice(0, 12).map((earthwork) => ({
        id: Math.floor(clamp(Number(earthwork?.id) || next.nextEarthworkId++, 1, 100000000)),
        kind: normalizeConstructionKind(earthwork?.kind),
        x: clamp(Number(earthwork?.x) || 0, -180, 180),
        z: clamp(Number(earthwork?.z) || 0, -180, 180),
        radius: clamp(Number(earthwork?.radius) || 12, 4, 24),
        progress: clamp(Number(earthwork?.progress) || 0, 0, 100),
        maxProgress: clamp(Number(earthwork?.maxProgress) || 1, 0.5, 100),
        rotation: Number.isFinite(Number(earthwork?.rotation)) ? Number(earthwork.rotation) : 0,
        owner: "colony",
      }))
    : [];
  for (const earthwork of next.earthworks) {
    earthwork.progress = clamp(earthwork.progress, 0, earthwork.maxProgress);
    next.nextEarthworkId = Math.max(next.nextEarthworkId, earthwork.id + 1);
  }
  next.nextBarracksOrderId = Math.floor(clamp(Number(next.nextBarracksOrderId) || 1, 1, 100000000));
  next.barracksQueue = Array.isArray(source.barracksQueue)
    ? source.barracksQueue.slice(0, BARRACKS_QUEUE_CAP).map((rawOrder) => {
        const order = rawOrder as Partial<BarracksTrainingItem>;
        const variant = normalizeBarracksTrainingVariant(order?.variant);
        const def = getBarracksTrainingDef(variant);
        const totalRaw = Number(order?.totalSeconds);
        const remainingRaw = Number(order?.remainingSeconds);
        const totalSeconds = clamp(Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : def.trainingSeconds, 1, 600);
        const remainingSeconds = clamp(Number.isFinite(remainingRaw) ? remainingRaw : totalSeconds, 0, totalSeconds);
        const id = Math.floor(clamp(Number(order?.id) || next.nextBarracksOrderId++, 1, 100000000));
        next.nextBarracksOrderId = Math.max(next.nextBarracksOrderId, id + 1);
        const foodCostRaw = Number(order?.foodCost);
        return {
          id,
          variant,
          foodCost: clamp(Number.isFinite(foodCostRaw) && foodCostRaw > 0 ? foodCostRaw : def.foodCost, 0, 1000000),
          totalSeconds,
          remainingSeconds,
        };
      })
    : [];
  for (const upgrade of UPGRADE_DEFS) {
    next.upgrades[upgrade.id] = Math.floor(clamp(Number(next.upgrades[upgrade.id]) || 0, 0, upgrade.max));
  }
  return next;
}
