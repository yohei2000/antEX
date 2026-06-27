// @ts-nocheck
import * as THREE from "three";
import {
  CAMERA_DISTANCE_DESKTOP,
  CAMERA_DISTANCE_MAX,
  CAMERA_DISTANCE_MIN,
  CAMERA_DISTANCE_MOBILE,
  COLONY_CORPSE_CAP,
  COMBAT_EFFECT_CAP,
  COMBAT_EFFECT_LIFE,
  CORPSE_LIFE_SECONDS,
  DISPLAY_ANT_CAP,
  FIXED_DT,
  GUARD_INTERCEPT_RANGE,
  MAX_FIXED_STEPS,
  MAX_FRAME_DELTA,
  MIN_COLONY_SURVIVORS,
  OFFLINE_CAP_SECONDS,
  RAID_ACTIVE_SECONDS,
  RAID_BASE_INTERVAL_SECONDS,
  RAID_EXIT_PADDING,
  RAID_GRAPPLER_RECRUIT_RANGE,
  RAID_HARASSMENT_RANGE,
  RAID_NOTICE_SECONDS,
  RAID_RECOVERY_SECONDS,
  RAID_RETREAT_SECONDS,
  RAID_RIVAL_CAP,
  BUILD_TASK_ASSIGNEE_CAP,
  BUILDERS_PER_TRAINING,
  FOOD_INCOME_MULTIPLIER,
  NEST_HOLE_DIAMETER_SCALE,
  NEST_STAY_SECONDS,
  RAID_SOON_CALM_SECONDS,
  RAID_SOON_WARNING_SECONDS,
  RAID_WARNING_SECONDS,
  RIVAL_CLASH_DURATION,
  RIVAL_CONTACT_RADIUS,
  RIVAL_CORPSE_CAP,
  RIVAL_GRAPPLER_RECRUIT_RANGE,
  RIVAL_HARASSMENT_RANGE,
  SOLDIER_PATROL_RADIUS,
  SOLDIER_SORTIE_COOLDOWN_SECONDS,
  SOLDIER_SORTIE_SECONDS,
  SOLDIER_SORTIE_SEEK_RANGE,
} from "./config/balance";
import { getConstructionDef, isConstructionKind, normalizeConstructionKind } from "./config/construction";
import { UPGRADE_BRANCHES, UPGRADE_DEFS, upgradeCost, upgradeLevel, upgradeName } from "./config/upgrades";
import { ANT_VARIANTS, ANT_VARIANT_CONFIG, getAntVariantConfig, normalizeAntVariant } from "./config/variants";
import { clamp } from "./shared/math";
import { createDefaultColony } from "./state/colony";
import { computeDerivedColony } from "./state/derived";
import { normalizeRaidState } from "./state/migrations";
import { SAVE_KEY, readColonyState, readStorage, serializeColonyState, writeStorage } from "./state/save";

const ui = {
  world: document.querySelector("#world3d"),
  buttons: [...document.querySelectorAll(".tab-button")],
  activeToolLabel: document.querySelector("#activeToolLabel"),
  pause: document.querySelector("#pauseBtn"),
  reset: document.querySelector("#resetBtn"),
  statAnts: document.querySelector("#statAnts"),
  statFoodRate: document.querySelector("#statFoodRate"),
  statTerritory: document.querySelector("#statTerritory"),
  statFood: document.querySelector("#statFood"),
  statNestLevel: document.querySelector("#statNestLevel"),
  statCapacity: document.querySelector("#statCapacity"),
  statSoldiers: document.querySelector("#statSoldiers"),
  statWounded: document.querySelector("#statWounded"),
  statGrowthRate: document.querySelector("#statGrowthRate"),
  statThreat: document.querySelector("#statThreat"),
  colonySummary: document.querySelector("#colonySummary"),
  growthFill: document.querySelector("#growthFill"),
  upgradeList: document.querySelector("#upgradeList"),
  growthTab: document.querySelector("#growthTab"),
  constructionTab: document.querySelector("#constructionTab"),
  constructionBuilders: document.querySelector("#constructionBuilders"),
  constructionActive: document.querySelector("#constructionActive"),
  constructionComplete: document.querySelector("#constructionComplete"),
  constructionTrailBtn: document.querySelector("#constructionTrailBtn"),
  constructionBarricadeBtn: document.querySelector("#constructionBarricadeBtn"),
  constructionWallBtn: document.querySelector("#constructionWallBtn"),
  constructionStatus: document.querySelector("#constructionStatus"),
  constructionCrew: document.querySelector("#constructionCrew"),
  constructionProgressList: document.querySelector("#constructionProgressList"),
  soldierTab: document.querySelector("#soldierTab"),
  soldierNest: document.querySelector("#soldierNest"),
  soldierDeployed: document.querySelector("#soldierDeployed"),
  soldierStatus: document.querySelector("#soldierStatus"),
  soldierSortieBtn: document.querySelector("#soldierSortieBtn"),
  battleLog: document.querySelector("#battleLog"),
  empirePanel: document.querySelector("#empirePanel"),
  panelGrip: document.querySelector("#panelGrip"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingBar: document.querySelector("#loadingBar"),
  loadingLabel: document.querySelector("#loadingLabel"),
  raidNotice: document.querySelector("#raidNotice"),
  errorPanel: document.querySelector("#errorPanel"),
  errorMessage: document.querySelector("#errorMessage"),
  debugPanel: document.querySelector("#debugPanel"),
  debugMetrics: document.querySelector("#debugMetrics"),
  qualitySelect: document.querySelector("#qualitySelect"),
};

const DEBUG_QUERY = new URLSearchParams(window.location.search);
const IS_DEBUG = DEBUG_QUERY.get("debug") === "1";
const IS_RAID_SOON = ["1", "true"].includes((DEBUG_QUERY.get("raidSoon") ?? "").toLowerCase());

const QUALITY_PRESETS = {
  low: {
    label: "low",
    resolutionScale: 0.78,
    maxPixelRatio: 1.15,
    antialias: false,
    shadowQuality: "off",
    postprocessQuality: "off",
    effectsQuality: 0.7,
    toneMappingExposure: 0.95,
  },
  medium: {
    label: "medium",
    resolutionScale: 0.9,
    maxPixelRatio: 1.45,
    antialias: true,
    shadowQuality: "low",
    postprocessQuality: "off",
    effectsQuality: 1,
    toneMappingExposure: 1,
  },
  high: {
    label: "high",
    resolutionScale: 1,
    maxPixelRatio: 1.8,
    antialias: true,
    shadowQuality: "medium",
    postprocessQuality: "off",
    effectsQuality: 1,
    toneMappingExposure: 1.05,
  },
};

function chooseQualityPreset() {
  const queryQuality = DEBUG_QUERY.get("quality");
  const savedQuality = readStorage("ant3d.quality");
  const autoQuality = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 680 ? "medium" : "high";
  const qualityName = queryQuality || savedQuality || autoQuality;
  const preset = QUALITY_PRESETS[qualityName] ?? QUALITY_PRESETS.medium;
  const resolutionScale = Number(DEBUG_QUERY.get("resolutionScale"));
  const maxPixelRatio = Number(DEBUG_QUERY.get("maxPixelRatio"));
  return {
    ...preset,
    resolutionScale: Number.isFinite(resolutionScale) && resolutionScale > 0 ? clamp(resolutionScale, 0.5, 1.2) : preset.resolutionScale,
    maxPixelRatio: Number.isFinite(maxPixelRatio) && maxPixelRatio > 0 ? clamp(maxPixelRatio, 0.8, 2) : preset.maxPixelRatio,
  };
}

const ROLE_LABELS = {
  scout: "斥候",
  worker: "運搬",
  nurse: "世話",
  guard: "警戒",
};

const STATE_LABELS = {
  explore: "探索",
  return: "帰巣",
  panic: "避難",
  wet: "乾燥",
  stunned: "停止",
  rescue: "救助",
  build: "土木",
};

const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => Math.random() < p;
const distance2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const normAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const fmt = (value, digits = 0) => Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits });

// Food trails model short-lived recruitment signals: successful returners reinforce them,
// and depleted sources stop reinforcement so the trail quickly evaporates.
const PHEROMONE_PARAMS = {
  foodDepositInterval: 0.46,
  foodBaseStrength: 0.64,
  foodSourceStrengthBonus: 0.34,
  foodFollowRadius: 15,
  foodFollowGain: 0.42,
  foodActiveDecay: 0.072,
  foodLowSourceExtraDecay: 0.12,
  foodDepletedDecay: 0.58,
  foodLowSourceThreshold: 0.18,
  alarmDecay: 0.32,
  rescueDecay: 0.14,
  waterDecay: 0.14,
};

function closestPointOnSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len = vx * vx + vz * vz || 1;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / len, 0, 1);
  return { x: ax + vx * t, z: az + vz * t, t };
}

function makeGroundTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  context.fillStyle = "#a9824b";
  context.fillRect(0, 0, 768, 768);

  for (let i = 0; i < 80; i += 1) {
    const x = Math.random() * 768;
    const y = Math.random() * 768;
    const rx = rand(24, 92);
    const ry = rand(16, 74);
    context.fillStyle = Math.random() > 0.52 ? "rgba(68,50,28,0.08)" : "rgba(221,187,111,0.07)";
    context.beginPath();
    context.ellipse(x, y, rx, ry, rand(0, Math.PI), 0, Math.PI * 2);
    context.fill();
  }

  for (let i = 0; i < 3400; i += 1) {
    const x = Math.random() * 768;
    const y = Math.random() * 768;
    const r = Math.random() * 1.8 + 0.35;
    context.fillStyle = Math.random() > 0.5 ? "rgba(53,38,23,0.17)" : "rgba(255,232,170,0.12)";
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function getMaterialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function disposeMaterial(material) {
  for (const item of getMaterialList(material)) {
    for (const value of Object.values(item)) {
      if (value && value.isTexture) value.dispose();
    }
    item.dispose();
  }
}

function disposeObject3D(root, { skipGeometries = new Set(), skipMaterials = new Set() } = {}) {
  root.traverse((object) => {
    if (object.geometry && !skipGeometries.has(object.geometry)) object.geometry.dispose();
    for (const material of getMaterialList(object.material)) {
      if (material && !skipMaterials.has(material)) disposeMaterial(material);
    }
  });
  root.parent?.remove(root);
}

class LoadingScreen {
  constructor(elements) {
    this.overlay = elements.overlay;
    this.bar = elements.bar;
    this.label = elements.label;
    this.errorPanel = elements.errorPanel;
    this.errorMessage = elements.errorMessage;
  }

  setProgress(label, loaded = 0, total = 1) {
    if (!this.overlay) return;
    const progress = total > 0 ? clamp((loaded / total) * 100, 3, 100) : 20;
    this.label.textContent = label;
    this.bar.style.width = `${progress}%`;
  }

  hide() {
    if (!this.overlay) return;
    this.overlay.classList.add("is-hidden");
    window.setTimeout(() => {
      this.overlay.hidden = true;
    }, 220);
  }

  showError(message) {
    if (this.overlay) this.overlay.hidden = true;
    if (!this.errorPanel) return;
    this.errorMessage.textContent = message;
    this.errorPanel.hidden = false;
  }
}

class AssetService {
  constructor(loadingScreen) {
    this.loadingScreen = loadingScreen;
    this.manager = new THREE.LoadingManager(
      () => this.loadingScreen.setProgress("ready", 1, 1),
      (_url, loaded, total) => this.loadingScreen.setProgress("assets", loaded, total),
      (url) => this.loadingScreen.showError(`Asset failed to load: ${url}`),
    );
    this.cache = new Map();
  }

  preloadProceduralAssets() {
    this.manager.itemStart("procedural-ground");
    const groundTexture = makeGroundTexture();
    groundTexture.anisotropy = 4;
    this.cache.set("groundTexture", groundTexture);
    this.manager.itemEnd("procedural-ground");
  }

  get(name) {
    return this.cache.get(name);
  }

  dispose() {
    for (const asset of this.cache.values()) {
      if (asset && typeof asset.dispose === "function") asset.dispose();
    }
    this.cache.clear();
  }
}

class InputManager {
  constructor(sim, element) {
    this.sim = sim;
    this.element = element;
    this.handlers = {
      pointerdown: (event) => sim.onPointerDown(event),
      pointermove: (event) => sim.onPointerMove(event),
      pointerup: (event) => sim.onPointerUp(event),
      pointercancel: (event) => sim.onPointerUp(event),
      wheel: (event) => sim.onWheel(event),
    };
    for (const [type, handler] of Object.entries(this.handlers)) {
      element.addEventListener(type, handler, { passive: false });
    }
  }

  dispose() {
    for (const [type, handler] of Object.entries(this.handlers)) {
      this.element.removeEventListener(type, handler);
    }
  }
}

class DebugPanel {
  constructor(sim) {
    this.sim = sim;
    this.enabled = IS_DEBUG;
    this.elapsed = 0;
    this.frames = 0;
    this.frameMs = 0;
    if (!this.enabled) return;
    ui.debugPanel.hidden = false;
    ui.qualitySelect.value = sim.quality.label;
    ui.qualitySelect.addEventListener("change", () => {
      writeStorage("ant3d.quality", ui.qualitySelect.value);
      window.location.reload();
    });
  }

  sample(dt) {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.frames += 1;
    if (this.elapsed < 0.5) return;
    const info = this.sim.renderer.info;
    this.frameMs = (this.elapsed / this.frames) * 1000;
    ui.debugMetrics.textContent = [
      `frame ${this.frameMs.toFixed(1)}ms`,
      `fps ${(1000 / this.frameMs).toFixed(0)}`,
      `pixelRatio ${this.sim.currentPixelRatio.toFixed(2)}`,
      `calls ${info.render.calls}`,
      `triangles ${info.render.triangles}`,
      `geometries ${info.memory.geometries}`,
      `textures ${info.memory.textures}`,
      `ants ${this.sim.ants.length}`,
      `rivals ${this.sim.rivalAnts.length}`,
      `objects ${this.sim.water.length + this.sim.stones.length + this.sim.food.length + this.sim.branches.length + this.sim.earthworks.length + this.sim.combatEffects.length + this.sim.predators.length + this.sim.rivalCorpses.length + this.sim.colonyCorpses.length}`,
      `terrain ${this.sim.terrain.length}`,
    ].join("\n");
    this.elapsed = 0;
    this.frames = 0;
  }
}

class Ant3D {
  constructor(id, sim) {
    this.id = id;
    this.role = this.pickRole();
    const angle = rand(0, Math.PI * 2);
    const spread = rand(3, sim.nest.radius * 1.2);
    this.x = sim.nest.x + Math.cos(angle) * spread;
    this.z = sim.nest.z + Math.sin(angle) * spread;
    this.angle = rand(0, Math.PI * 2);
    this.turnBias = rand(-0.4, 0.4);
    this.variant = "worker";
    this.variantConfig = getAntVariantConfig(this.variant);
    this.baseSpeedSeed = rand(7.2, 12.8);
    this.baseSpeed = this.baseSpeedSeed * this.variantConfig.speed;
    this.state = "explore";
    this.stateTime = 0;
    this.wander = rand(0, Math.PI * 2);
    this.wet = 0;
    this.stun = 0;
    this.carrying = 0;
    this.foodSourceId = null;
    this.energy = rand(0.55, 1);
    this.lastTrail = rand(0, 1);
    this.homeTimer = rand(0, 8);
    this.rescueTarget = null;
    this.clashRival = null;
    this.clashTimer = 0;
    this.clashDuration = 0;
    this.clashAnchorX = this.x;
    this.clashAnchorZ = this.z;
    this.clashPhase = rand(0, Math.PI * 2);
    this.fleeTimer = 0;
    this.fleeFromX = this.x;
    this.fleeFromZ = this.z;
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevAngle = this.angle;
    this.vx = 0;
    this.vz = 0;
    this.gaitPhase = rand(0, Math.PI * 2);
    this.animationSeed = id * 2654435761;
    this.bodyScale = rand(0.94, 1.08);
    this.health = 1;
    this.stamina = this.energy;
    this.fatigue = 0;
    this.wounded = false;
    this.currentTask = this.state;
    this.renderInstanceIndex = id - 1;
    this.isSortieSoldier = false;
    this.sortieTimer = 0;
    this.sortieIndex = 0;
    this.sortieTargetX = null;
    this.sortieTargetZ = null;
    this.inNest = false;
    this.nestStayTimer = 0;
    this.nestExitAngle = angle;
    this.carryingSoil = false;
    this.buildTaskId = null;
    this.braceIntent = 0;
    this.lastTacticalAction = "idle";
    this.steering = { x: 0, z: 0 };
    this.sensed = {
      hazard: { x: 0, z: 0 },
      waterDepth: 0,
      alarm: 0,
      closestFood: null,
      foodDistance: Infinity,
    };
    this.traits = {
      curiosity: rand(0.18, 1),
      caution: rand(0.16, 1),
      social: rand(0.14, 1),
      persistence: rand(0.24, 1),
    };

    if (this.role === "scout") {
      this.traits.curiosity = clamp(this.traits.curiosity + 0.25, 0, 1);
      this.baseSpeed += 2.6;
    } else if (this.role === "nurse") {
      this.traits.social = clamp(this.traits.social + 0.3, 0, 1);
      this.traits.caution = clamp(this.traits.caution + 0.12, 0, 1);
    } else if (this.role === "guard") {
      this.traits.caution = clamp(this.traits.caution + 0.24, 0, 1);
      this.traits.persistence = clamp(this.traits.persistence + 0.18, 0, 1);
    }

  }

  pickRole() {
    const roll = Math.random();
    if (roll < 0.22) return "scout";
    if (roll < 0.82) return "worker";
    return "nurse";
  }

  setVariant(variant) {
    const nextVariant = normalizeAntVariant(variant);
    if (this.variant === nextVariant) return;
    this.variant = nextVariant;
    this.variantConfig = getAntVariantConfig(nextVariant);
    this.baseSpeed = this.baseSpeedSeed * this.variantConfig.speed;
    if (nextVariant === "heavySoldier") {
      this.role = "guard";
      this.carrying = 0;
      this.foodSourceId = null;
      this.traits.caution = clamp(Math.max(this.traits.caution, 0.76) + 0.08, 0, 1);
      this.traits.persistence = clamp(Math.max(this.traits.persistence, 0.78) + 0.1, 0, 1);
    } else if (nextVariant === "soldier") {
      this.role = "guard";
      this.carrying = 0;
      this.foodSourceId = null;
      this.traits.caution = clamp(Math.max(this.traits.caution, 0.66) + 0.05, 0, 1);
      this.traits.persistence = clamp(Math.max(this.traits.persistence, 0.66) + 0.06, 0, 1);
    } else if (nextVariant === "builder") {
      if (this.role === "guard") this.role = "worker";
      this.traits.social = clamp(Math.max(this.traits.social, 0.6) + 0.1, 0, 1);
      this.traits.persistence = clamp(Math.max(this.traits.persistence, 0.55) + 0.06, 0, 1);
    } else {
      this.carryingSoil = false;
      this.buildTaskId = null;
    }
    if (nextVariant !== "builder") {
      this.carryingSoil = false;
      this.buildTaskId = null;
    }
  }

  update(dt, sim) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevAngle = this.angle;
    this.stateTime += dt;
    this.homeTimer += dt;
    this.wet = Math.max(0, this.wet - dt * 0.11);
    this.braceIntent = Math.max(0, this.braceIntent - dt * 1.4);
    this.energy = clamp(this.energy + dt * 0.012 * this.variantConfig.staminaRecovery, 0, 1);
    this.lastTrail += dt;
    this.skipMoveThisFrame = false;
    if (this.isSortieSoldier) this.sortieTimer = Math.max(0, this.sortieTimer - dt);

    if (this.inNest || this.nestStayTimer > 0) {
      this.nestStayTimer = Math.max(0, this.nestStayTimer - dt);
      if (this.nestStayTimer <= 0 && this.variant === "builder" && this.buildTaskId == null) sim.claimBuildTask(this);
      if (this.nestStayTimer <= 0 && (this.variant !== "builder" || this.buildTaskId != null)) sim.releaseAntFromNest(this);
      else sim.holdAntInNest(this);
      return;
    }

    if (this.clashTimer > 0 || this.state === "clash") {
      this.updateClash(dt, sim);
      return;
    }

    const sensed = this.sense(sim);
    if (sensed.waterDepth > 0.08) {
      this.wet = clamp(this.wet + sensed.waterDepth * dt * 1.8, 0, 1.8);
      if (this.state !== "rescue") {
        this.setState(sensed.waterDepth > 0.64 && chance(0.025 + this.wet * 0.02) ? "stunned" : "panic");
      }
    }

    const alarmThreshold = this.variant === "heavySoldier" ? 0.78 : this.variant === "builder" ? 0.42 : 0.55;
    if (sensed.alarm > alarmThreshold && this.state === "explore" && chance(dt * (0.55 + this.traits.caution) * this.variantConfig.dangerResponse)) {
      this.setState("panic");
    }

    if (this.stun > 0) {
      this.stun -= dt;
      this.state = "stunned";
      this.x += Math.cos(this.angle + rand(-1.5, 1.5)) * dt * 0.8;
      this.z += Math.sin(this.angle + rand(-1.5, 1.5)) * dt * 0.8;
      if (this.stun <= 0 && this.wet < 0.76) this.setState("wet");
      this.keepInWorld(sim);
      return;
    }

    if (this.state === "stunned") {
      this.stun = rand(1.1, 3);
      return;
    }

    if (this.fleeTimer > 0 || this.state === "flee") {
      const steering = this.steering;
      steering.x = 0;
      steering.z = 0;
      this.addSeparation(steering, sim);
      this.addObstacleAvoidance(steering, sim);
      this.updateFlee(dt, sim, steering);
      this.move(dt, sim, steering);
      if (this.lastTrail > 0.36) {
        sim.addTrail(this.x, this.z, "alarm", 0.55);
        this.lastTrail = 0;
      }
      return;
    }

    if (this.state !== "rescue") {
      const rescueCandidate = sim.findRescueCandidate(this);
      if (rescueCandidate && this.traits.social > 0.57 && chance(dt * (0.8 + this.traits.social))) {
        this.rescueTarget = rescueCandidate;
        this.setState("rescue");
      }
    }

    const steering = this.steering;
    steering.x = 0;
    steering.z = 0;
    this.addSeparation(steering, sim);
    this.addObstacleAvoidance(steering, sim);
    const hazardResponse = this.variant === "heavySoldier" ? 0.22 : 1.2 + this.traits.caution;
    steering.x += sensed.hazard.x * hazardResponse;
    steering.z += sensed.hazard.z * hazardResponse;

    if (this.state === "panic") this.updatePanic(dt, sim, steering, sensed);
    else if (this.state === "wet") this.updateWet(dt, sim, steering);
    else if (this.state === "return") this.updateReturn(dt, sim, steering);
    else if (this.state === "rescue") this.updateRescue(dt, sim, steering);
    else this.updateExplore(dt, sim, steering, sensed);

    if (this.skipMoveThisFrame) {
      this.vx = 0;
      this.vz = 0;
      return;
    }
    this.move(dt, sim, steering);
    this.leaveTrail(sim);
  }

  setState(nextState) {
    if (this.state !== nextState) {
      this.state = nextState;
      this.stateTime = 0;
    }
    this.currentTask = nextState;
  }

  startRivalClash(rival, anchorX, anchorZ, duration = RIVAL_CLASH_DURATION) {
    if (this.clashTimer > 0 || this.fleeTimer > 0 || this.stun > 0 || this.state === "stunned") return false;
    if (this.variant === "heavySoldier") this.braceIntent = 1;
    this.clashRival = rival;
    this.clashTimer = duration;
    this.clashDuration = duration;
    this.clashAnchorX = anchorX;
    this.clashAnchorZ = anchorZ;
    this.clashPhase = rand(0, Math.PI * 2);
    this.setState("clash");
    return true;
  }

  updateClash(dt, sim) {
    const rival = this.clashRival;
    if (!rival || !rival.clash?.ants?.includes(this)) {
      this.clashRival = null;
      this.clashTimer = 0;
      if (this.state === "clash") this.setState(this.fleeTimer > 0 ? "flee" : "explore");
      return;
    }
    this.clashTimer = Math.max(0, this.clashTimer - dt);
    this.angle = Math.atan2(rival.x - this.x, rival.z - this.z);
    this.gaitPhase = (this.gaitPhase + dt * (15 + this.traits.persistence * 8)) % (Math.PI * 2);
    this.energy = clamp(this.energy - dt * 0.018, 0, 1);
    this.vx = (this.x - this.prevX) / Math.max(dt, 0.000001);
    this.vz = (this.z - this.prevZ) / Math.max(dt, 0.000001);
    this.keepInWorld(sim);
  }

  startFleeHome(fromX, fromZ, duration = 4.6) {
    this.clashRival = null;
    this.clashTimer = 0;
    this.clashDuration = 0;
    this.fleeTimer = Math.max(this.fleeTimer, duration);
    this.fleeFromX = fromX;
    this.fleeFromZ = fromZ;
    this.foodSourceId = null;
    this.carrying = 0;
    this.homeTimer = 0;
    this.stun = 0;
    this.setState("flee");
  }

  updateFlee(dt, sim, steering) {
    this.fleeTimer = Math.max(0, this.fleeTimer - dt);
    const homeDistance = distance2(this.x, this.z, sim.nest.x, sim.nest.z) || 1;
    steering.x += ((sim.nest.x - this.x) / homeDistance) * (2.2 + this.traits.caution * 0.8);
    steering.z += ((sim.nest.z - this.z) / homeDistance) * (2.2 + this.traits.caution * 0.8);

    const threatDistance = distance2(this.x, this.z, this.fleeFromX, this.fleeFromZ) || 1;
    if (threatDistance < 18) {
      const away = (1 - threatDistance / 18) * 1.2;
      steering.x += ((this.x - this.fleeFromX) / threatDistance) * away;
      steering.z += ((this.z - this.fleeFromZ) / threatDistance) * away;
    }

    this.energy = clamp(this.energy - dt * 0.018, 0, 1);
    if (homeDistance < sim.nest.radius * 0.82 || this.fleeTimer <= 0) {
      this.fleeTimer = 0;
      this.energy = clamp(this.energy + 0.18, 0, 1);
      this.setState("explore");
    }
  }

  sense(sim) {
    const sensed = this.sensed;
    const hazard = sensed.hazard;
    hazard.x = 0;
    hazard.z = 0;
    sensed.waterDepth = 0;
    sensed.alarm = 0;
    sensed.closestFood = null;
    sensed.foodDistance = Infinity;

    for (const patch of sim.water) {
      const d = distance2(this.x, this.z, patch.x, patch.z);
      const reach = patch.radius + 10;
      if (d < reach) {
        const strength = (1 - d / reach) * patch.power;
        hazard.x += ((this.x - patch.x) / (d || 1)) * strength * 1.7;
        hazard.z += ((this.z - patch.z) / (d || 1)) * strength * 1.7;
        if (d < patch.radius) sensed.waterDepth = Math.max(sensed.waterDepth, (1 - d / patch.radius) * patch.power);
      }
    }

    for (const stone of sim.stones) {
      const d = distance2(this.x, this.z, stone.x, stone.z);
      const reach = stone.radius + 16;
      if (d < reach) {
        const strength = 1 - d / reach;
        hazard.x += ((this.x - stone.x) / (d || 1)) * strength * 1.25;
        hazard.z += ((this.z - stone.z) / (d || 1)) * strength * 1.25;
      }
      if (stone.shock > 0 && d < stone.radius + stone.shock * 34) {
        sensed.alarm = Math.max(sensed.alarm, stone.shock * (1 - d / (stone.radius + stone.shock * 34)));
      }
    }

    for (const branch of sim.branches) {
      const p = closestPointOnSegment(this.x, this.z, branch.x1, branch.z1, branch.x2, branch.z2);
      const d = distance2(this.x, this.z, p.x, p.z);
      const reach = branch.width + 7;
      if (d < reach) {
        const strength = 1 - d / reach;
        hazard.x += ((this.x - p.x) / (d || 1)) * strength * 1.3;
        hazard.z += ((this.z - p.z) / (d || 1)) * strength * 1.3;
      }
    }

    for (const predator of sim.predators) {
      const d = distance2(this.x, this.z, predator.x, predator.z);
      const reach = predator.radius + 16 + predator.threat * 10;
      if (d < reach) {
        const strength = (1 - d / reach) * predator.threat;
        hazard.x += ((this.x - predator.x) / (d || 1)) * strength * 2.1;
        hazard.z += ((this.z - predator.z) / (d || 1)) * strength * 2.1;
        sensed.alarm = Math.max(sensed.alarm, strength);
        if (d < predator.radius + 1.2 && chance(0.004 * predator.threat)) this.shock(strength);
      }
    }

    for (const rival of sim.rivalAnts) {
      if (rival.defeated || rival.leftRaid || rival.retreat > 0) continue;
      const d = distance2(this.x, this.z, rival.x, rival.z);
      const reach = 7 + rival.scale * 2.8 + rival.aggression * 4;
      if (d < reach) {
        const strength = (1 - d / reach) * (0.38 + rival.aggression * 0.62);
        const guardResolve = this.role === "guard" ? 0.42 : 0;
        const avoidance = Math.max(0.18, 0.86 + this.traits.caution * 0.55 - guardResolve - this.traits.persistence * 0.22);
        hazard.x += ((this.x - rival.x) / (d || 1)) * strength * avoidance;
        hazard.z += ((this.z - rival.z) / (d || 1)) * strength * avoidance;
        if (d < 4.6 + rival.scale * 1.3) sensed.alarm = Math.max(sensed.alarm, strength * 0.9);
      }
    }

    for (const trail of sim.trails) {
      const d = distance2(this.x, this.z, trail.x, trail.z);
      if (trail.kind === "alarm" && d < 12) {
        const strength = trail.life * (1 - d / 12);
        sensed.alarm = Math.max(sensed.alarm, strength);
        hazard.x += ((this.x - trail.x) / (d || 1)) * strength * 0.7;
        hazard.z += ((this.z - trail.z) / (d || 1)) * strength * 0.7;
      }
    }

    for (const food of sim.food) {
      if (food.amount <= 0) continue;
      const d = distance2(this.x, this.z, food.x, food.z);
      if (d < sensed.foodDistance) {
        sensed.foodDistance = d;
        sensed.closestFood = food;
      }
    }

    return sensed;
  }

  updateExplore(dt, sim, steering, sensed) {
    if (this.variant === "heavySoldier" && this.updateHeavySoldier(dt, sim, steering, sensed)) return;
    if (this.role === "guard" && this.isSortieSoldier && this.updateGuardIntercept(dt, sim, steering)) return;
    if (this.role === "guard" && this.isSortieSoldier && this.updateSortiePatrol(dt, sim, steering)) return;
    if (this.variant === "builder" && this.updateBuilder(dt, sim, steering, sensed)) return;

    const forageEfficiency = this.variantConfig.forageEfficiency;
    if (sensed.closestFood && sensed.foodDistance < sensed.closestFood.radius + 1.5 && this.role !== "guard" && forageEfficiency > 0) {
      this.carrying = Math.min(forageEfficiency, sensed.closestFood.amount);
      this.foodSourceId = sensed.closestFood.id;
      sensed.closestFood.amount -= this.carrying;
      sim.refreshFoodMesh(sensed.closestFood);
      this.setState("return");
      return;
    }

    if (sensed.closestFood && sensed.foodDistance < 45 + this.traits.curiosity * 26) {
      const sourceRatio = clamp(sensed.closestFood.amount / sensed.closestFood.initialAmount, 0, 1);
      const strength = (1 - sensed.foodDistance / 75) * (0.85 + this.traits.curiosity) * (0.35 + sourceRatio * 0.65);
      steering.x += ((sensed.closestFood.x - this.x) / (sensed.foodDistance || 1)) * strength;
      steering.z += ((sensed.closestFood.z - this.z) / (sensed.foodDistance || 1)) * strength;
    }

    for (const trail of sim.trails) {
      if (trail.kind !== "food") continue;
      const d = distance2(this.x, this.z, trail.x, trail.z);
      if (d < PHEROMONE_PARAMS.foodFollowRadius && trail.followStrength > 0) {
        const strength = trail.life * trail.followStrength * (1 - d / PHEROMONE_PARAMS.foodFollowRadius) * PHEROMONE_PARAMS.foodFollowGain;
        steering.x += ((trail.x - this.x) / (d || 1)) * strength;
        steering.z += ((trail.z - this.z) / (d || 1)) * strength;
      }
    }

    if (this.homeTimer > 9 + this.traits.persistence * 7 || this.energy < 0.2) {
      this.setState("return");
      this.carrying = 0;
      this.foodSourceId = null;
      this.homeTimer = 0;
      return;
    }

    this.wander += (Math.random() - 0.5) * dt * (2.3 + this.traits.curiosity * 3.2) + this.turnBias * dt;
    steering.x += Math.sin(this.wander) * (0.58 + this.traits.curiosity * 0.5);
    steering.z += Math.cos(this.wander) * (0.58 + this.traits.curiosity * 0.5);

    const homeDistance = distance2(this.x, this.z, sim.nest.x, sim.nest.z);
    if (homeDistance > sim.worldRadius * 0.72) {
      steering.x += ((sim.nest.x - this.x) / homeDistance) * 0.9;
      steering.z += ((sim.nest.z - this.z) / homeDistance) * 0.9;
    }
  }

  updateHeavySoldier(dt, sim, steering) {
    if (this.isSortieSoldier && this.sortieTimer <= 0 && this.state !== "return") {
      this.setState("return");
      return true;
    }
    const seekRange = this.isSortieSoldier ? SOLDIER_SORTIE_SEEK_RANGE : GUARD_INTERCEPT_RANGE;
    const threat = sim.findRivalThreat(this.x, this.z, seekRange);
    const raid = sim.ensureRaidState();
    let target = threat;
    if (!target && this.isSortieSoldier) {
      target = sim.currentSortieTarget(this.x, this.z);
      if (!target && this.sortieTargetX != null && this.sortieTargetZ != null) {
        target = { x: this.sortieTargetX, z: this.sortieTargetZ };
      }
    }
    if (!target && (raid.phase === "warning" || raid.phase === "active" || raid.phase === "retreating")) {
      target = sim.raidSignalPoint(raid, 0.78);
    }
    if (!target) {
      const guardAngle = (this.id * 2.399 + sim.colony.nestLevel * 0.31) % (Math.PI * 2);
      target = {
        x: sim.nest.x + Math.cos(guardAngle) * (sim.nest.radius + 8),
        z: sim.nest.z + Math.sin(guardAngle) * (sim.nest.radius + 8),
      };
    }
    const nestDistance = distance2(this.x, this.z, sim.nest.x, sim.nest.z) || 1;
    const targetDistance = distance2(this.x, this.z, target.x, target.z) || 1;
    const maxGuardDistance = sim.nest.radius + 54;
    if (!this.isSortieSoldier && nestDistance > maxGuardDistance) {
      steering.x += ((sim.nest.x - this.x) / nestDistance) * 2.3;
      steering.z += ((sim.nest.z - this.z) / nestDistance) * 2.3;
      this.lastTacticalAction = "returnGuard";
      return true;
    }
    if (threat && targetDistance < 6.2) {
      this.braceIntent = 1;
      this.lastTacticalAction = "brace";
      this.energy = clamp(this.energy - dt * 0.009, 0, 1);
      if (this.lastTrail > 0.32) {
        sim.addTrail(this.x, this.z, "alarm", 0.7);
        this.lastTrail = 0;
      }
      return true;
    }
    const pressure = this.isSortieSoldier ? (targetDistance > 18 ? 1.92 : 0.86) : (targetDistance > 9 ? 1.5 : 0.72);
    steering.x += ((target.x - this.x) / targetDistance) * pressure;
    steering.z += ((target.z - this.z) / targetDistance) * pressure;
    this.lastTacticalAction = threat ? "block" : "guardPost";
    return true;
  }

  updateBuilder(dt, sim, steering) {
    const rival = sim.findRivalThreat(this.x, this.z, 16);
    if (rival) {
      sim.releaseBuildTask(this);
      const cover = sim.findNearestVariant(this.x, this.z, "heavySoldier", this);
      const targetX = cover ? cover.x : sim.nest.x;
      const targetZ = cover ? cover.z : sim.nest.z;
      const d = distance2(this.x, this.z, targetX, targetZ) || 1;
      steering.x += ((targetX - this.x) / d) * 2.2;
      steering.z += ((targetZ - this.z) / d) * 2.2;
      const away = distance2(this.x, this.z, rival.x, rival.z) || 1;
      steering.x += ((this.x - rival.x) / away) * 1.4;
      steering.z += ((this.z - rival.z) / away) * 1.4;
      this.lastTacticalAction = "retreatBehindGuard";
      if (this.lastTrail > 0.35) {
        sim.addTrail(this.x, this.z, "alarm", 0.45);
        this.lastTrail = 0;
      }
      return true;
    }

    const task = sim.claimBuildTask(this);
    if (!task) {
      sim.dockBuilderInNest(this);
      return true;
    }
    const taskDistance = distance2(this.x, this.z, task.x, task.z) || 1;
    if (!this.carryingSoil) {
      const sourceX = sim.nest.x + Math.cos(this.id * 1.7) * (sim.nest.radius + 4.5);
      const sourceZ = sim.nest.z + Math.sin(this.id * 1.7) * (sim.nest.radius + 4.5);
      const sourceDistance = distance2(this.x, this.z, sourceX, sourceZ) || 1;
      if (sourceDistance < 2.4) {
        this.carryingSoil = true;
        this.lastTacticalAction = "carrySoil";
      } else {
        steering.x += ((sourceX - this.x) / sourceDistance) * 1.55;
        steering.z += ((sourceZ - this.z) / sourceDistance) * 1.55;
        this.lastTacticalAction = "fetchSoil";
      }
      return true;
    }
    if (taskDistance > task.radius * 0.5) {
      steering.x += ((task.x - this.x) / taskDistance) * 1.65;
      steering.z += ((task.z - this.z) / taskDistance) * 1.65;
      this.lastTacticalAction = "deliverSoil";
      return true;
    }
    sim.progressBuildTask(task, this, dt * this.variantConfig.buildPower);
    this.carryingSoil = false;
    this.lastTacticalAction = "build";
    this.setState("build");
    return true;
  }

  updateGuardIntercept(dt, sim, steering) {
    const raid = sim.ensureRaidState();
    if (raid.phase !== "active" && raid.phase !== "retreating") return false;
    const threat = sim.findRivalThreat(this.x, this.z, this.isSortieSoldier ? SOLDIER_SORTIE_SEEK_RANGE : GUARD_INTERCEPT_RANGE);
    if (!threat) return false;
    this.sortieTargetX = threat.x;
    this.sortieTargetZ = threat.z;
    const d = distance2(this.x, this.z, threat.x, threat.z) || 1;
    const pressure = d > 7 ? 2.55 + this.traits.persistence * 0.8 : 1.1;
    steering.x += ((threat.x - this.x) / d) * pressure;
    steering.z += ((threat.z - this.z) / d) * pressure;
    this.energy = clamp(this.energy - dt * 0.018, 0, 1);
    if (this.lastTrail > 0.42) {
      sim.addTrail(this.x, this.z, "alarm", 0.5);
      this.lastTrail = 0;
    }
    return true;
  }

  updateSortiePatrol(dt, sim, steering) {
    if (this.sortieTimer <= 0 && this.state !== "return") {
      this.setState("return");
      return true;
    }
    const target = sim.currentSortieTarget(this.x, this.z);
    if (target) {
      this.sortieTargetX = target.x;
      this.sortieTargetZ = target.z;
    }
    if (this.sortieTargetX != null && this.sortieTargetZ != null) {
      const d = distance2(this.x, this.z, this.sortieTargetX, this.sortieTargetZ) || 1;
      const pressure = d > 18 ? 2.15 + this.traits.persistence * 0.55 : 1.05;
      steering.x += ((this.sortieTargetX - this.x) / d) * pressure;
      steering.z += ((this.sortieTargetZ - this.z) / d) * pressure;
      this.energy = clamp(this.energy - dt * 0.014, 0, 1);
      if (this.lastTrail > 0.5) {
        sim.addTrail(this.x, this.z, "alarm", 0.38);
        this.lastTrail = 0;
      }
      return true;
    }
    const angle = (this.sortieIndex * 1.74 + this.id * 0.37) % (Math.PI * 2);
    const radius = sim.nest.radius + SOLDIER_PATROL_RADIUS + (this.sortieIndex % 3) * 2.6;
    const targetX = sim.nest.x + Math.cos(angle) * radius;
    const targetZ = sim.nest.z + Math.sin(angle) * radius;
    const d = distance2(this.x, this.z, targetX, targetZ) || 1;
    steering.x += ((targetX - this.x) / d) * 1.45;
    steering.z += ((targetZ - this.z) / d) * 1.45;
    if (d < 3.8) this.wander += dt * 1.8;
    this.energy = clamp(this.energy - dt * 0.01, 0, 1);
    return true;
  }

  updateReturn(dt, sim, steering) {
    const d = distance2(this.x, this.z, sim.nest.x, sim.nest.z) || 1;
    steering.x += ((sim.nest.x - this.x) / d) * (1.55 + this.traits.persistence);
    steering.z += ((sim.nest.z - this.z) / d) * (1.55 + this.traits.persistence);
    this.energy = clamp(this.energy - dt * 0.024, 0, 1);
    if (d < sim.nest.radius * 0.7) {
      if (this.carrying > 0) sim.gainFood(this.carrying, true);
      this.carrying = 0;
      this.foodSourceId = null;
      this.energy = 1;
      this.homeTimer = 0;
      if (this.isSortieSoldier) {
        sim.queueSortieRetire(this);
        return;
      }
      sim.enterNest(this);
    }
  }

  updatePanic(dt, sim, steering, sensed) {
    this.wander += (Math.random() - 0.5) * dt * 8;
    steering.x += Math.sin(this.wander) * 0.78;
    steering.z += Math.cos(this.wander) * 0.78;
    const d = distance2(this.x, this.z, sim.nest.x, sim.nest.z) || 1;
    steering.x += ((sim.nest.x - this.x) / d) * this.traits.caution * 0.28;
    steering.z += ((sim.nest.z - this.z) / d) * this.traits.caution * 0.28;
    if (this.lastTrail > 0.28) {
      sim.addTrail(this.x, this.z, "alarm", 0.9);
      this.lastTrail = 0;
    }
    if (this.stateTime > 1.15 + this.traits.caution * 2.1 && sensed.waterDepth < 0.08) {
      this.setState(this.wet > 0.35 ? "wet" : "explore");
    }
  }

  updateWet(dt, sim, steering) {
    const d = distance2(this.x, this.z, sim.nest.x, sim.nest.z) || 1;
    steering.x += ((sim.nest.x - this.x) / d) * 0.62;
    steering.z += ((sim.nest.z - this.z) / d) * 0.62;
    this.wander += (Math.random() - 0.5) * dt * 2.2;
    steering.x += Math.sin(this.wander) * 0.32;
    steering.z += Math.cos(this.wander) * 0.32;
    if (this.wet < 0.18 && this.stateTime > 1.2) this.setState("explore");
  }

  updateRescue(dt, sim, steering) {
    const target = this.rescueTarget;
    if (!target || target.stun <= 0 || target === this) {
      this.rescueTarget = null;
      this.setState("explore");
      return;
    }
    const d = distance2(this.x, this.z, target.x, target.z) || 1;
    if (d > 2.6) {
      steering.x += ((target.x - this.x) / d) * 2.2;
      steering.z += ((target.z - this.z) / d) * 2.2;
    } else {
      const homeDistance = distance2(target.x, target.z, sim.nest.x, sim.nest.z) || 1;
      const pullX = ((sim.nest.x - target.x) / homeDistance) * 5.5;
      const pullZ = ((sim.nest.z - target.z) / homeDistance) * 5.5;
      target.x += pullX * dt;
      target.z += pullZ * dt;
      target.wet = Math.max(0, target.wet - dt * 0.35);
      target.stun = Math.max(0, target.stun - dt * (0.42 + this.traits.social * 0.55));
      if (this.lastTrail > 0.38) {
        sim.addTrail(this.x, this.z, "rescue", 0.86);
        this.lastTrail = 0;
      }
    }
    if (this.stateTime > 7.5) {
      this.rescueTarget = null;
      this.setState("explore");
    }
  }

  addSeparation(steering, sim) {
    let sx = 0;
    let sz = 0;
    let count = 0;
    for (const other of sim.ants) {
      if (other === this) continue;
      if (!sim.shouldRenderAnt(other)) continue;
      const d = distance2(this.x, this.z, other.x, other.z);
      if (d > 0 && d < 2.2) {
        sx += (this.x - other.x) / d;
        sz += (this.z - other.z) / d;
        count += 1;
      }
    }
    if (count) {
      steering.x += (sx / count) * 0.52;
      steering.z += (sz / count) * 0.52;
    }
  }

  addObstacleAvoidance(steering, sim) {
    for (const stone of sim.stones) {
      const d = distance2(this.x, this.z, stone.x, stone.z);
      if (d < stone.radius + 1.1) {
        const nx = (this.x - stone.x) / (d || 1);
        const nz = (this.z - stone.z) / (d || 1);
        this.x = stone.x + nx * (stone.radius + 1.1);
        this.z = stone.z + nz * (stone.radius + 1.1);
        steering.x += nx * 1.25;
        steering.z += nz * 1.25;
      }
    }
    for (const branch of sim.branches) {
      const p = closestPointOnSegment(this.x, this.z, branch.x1, branch.z1, branch.x2, branch.z2);
      const d = distance2(this.x, this.z, p.x, p.z);
      if (d < branch.width + 0.8) {
        const nx = (this.x - p.x) / (d || 1);
        const nz = (this.z - p.z) / (d || 1);
        this.x = p.x + nx * (branch.width + 0.8);
        this.z = p.z + nz * (branch.width + 0.8);
        steering.x += nx;
        steering.z += nz;
      }
    }
    for (const predator of sim.predators) {
      const d = distance2(this.x, this.z, predator.x, predator.z);
      if (d < predator.radius + 1.3) {
        const nx = (this.x - predator.x) / (d || 1);
        const nz = (this.z - predator.z) / (d || 1);
        this.x = predator.x + nx * (predator.radius + 1.3);
        this.z = predator.z + nz * (predator.radius + 1.3);
        steering.x += nx * 1.5;
        steering.z += nz * 1.5;
      }
    }

    if ((this.role === "guard" && this.isSortieSoldier) || this.traits.persistence > 0.72) {
      const rival = sim.findRivalThreat(this.x, this.z, 18);
      if (rival) {
        const d = distance2(this.x, this.z, rival.x, rival.z) || 1;
        const pressure = this.role === "guard" && this.isSortieSoldier ? 1.35 : 0.68;
        steering.x += ((rival.x - this.x) / d) * pressure;
        steering.z += ((rival.z - this.z) / d) * pressure;
      }
    }
    for (const rival of sim.rivalAnts) {
      const d = distance2(this.x, this.z, rival.x, rival.z);
      const radius = 1.45 + rival.scale * 0.72;
      if (d < radius) {
        const nx = (this.x - rival.x) / (d || 1);
        const nz = (this.z - rival.z) / (d || 1);
        this.x = rival.x + nx * radius;
        this.z = rival.z + nz * radius;
        steering.x += nx * (0.65 + this.traits.caution);
        steering.z += nz * (0.65 + this.traits.caution);
      }
    }
  }

  move(dt, sim, steering) {
    const length = Math.hypot(steering.x, steering.z);
    if (length > 0.001) {
      const targetAngle = Math.atan2(steering.x, steering.z);
      const turnRate = (this.state === "panic" ? 8.6 : 4.6) * this.variantConfig.turnRate * dt;
      this.angle += clamp(normAngle(targetAngle - this.angle), -turnRate, turnRate);
    } else {
      this.angle += (Math.random() - 0.5) * dt;
    }

    let speed = this.baseSpeed;
    if (this.state === "panic") speed *= 1.42;
    if (this.state === "flee") speed *= 1.36;
    if (this.state === "return") speed *= 1.08;
    if (this.state === "rescue") speed *= 0.92;
    if (this.state === "wet") speed *= 0.56;
    if (this.carrying > 0) speed *= 0.75;
    if (this.carryingSoil) speed *= 0.74;
    speed *= clamp(1 - this.wet * 0.3, 0.34, 1);
    speed *= sim.terrainSpeedAt(this.x, this.z);
    speed *= sim.earthworkSpeedAt(this.x, this.z, this.variant);
    speed *= sim.timeScale;

    this.x += Math.sin(this.angle) * speed * dt;
    this.z += Math.cos(this.angle) * speed * dt;
    this.vx = (this.x - this.prevX) / Math.max(dt, 0.000001);
    this.vz = (this.z - this.prevZ) / Math.max(dt, 0.000001);
    const traveled = Math.hypot(this.x - this.prevX, this.z - this.prevZ);
    if (traveled > 0.0001) this.gaitPhase = (this.gaitPhase + traveled * 3.6) % (Math.PI * 2);
    this.stamina = clamp(this.energy - this.fatigue * 0.25, 0, 1);
    this.keepInWorld(sim);
  }

  keepInWorld(sim) {
    const d = Math.hypot(this.x, this.z);
    if (d > sim.worldRadius) {
      const nx = this.x / d;
      const nz = this.z / d;
      this.x = nx * sim.worldRadius;
      this.z = nz * sim.worldRadius;
      this.angle += Math.PI * 0.8;
    }
  }

  leaveTrail(sim) {
    if (this.state === "return" && this.carrying > 0 && this.lastTrail > PHEROMONE_PARAMS.foodDepositInterval) {
      const source = sim.getFoodSource(this.foodSourceId);
      if (source) {
        const sourceRatio = clamp(source.amount / source.initialAmount, 0, 1);
        const strength = PHEROMONE_PARAMS.foodBaseStrength + sourceRatio * PHEROMONE_PARAMS.foodSourceStrengthBonus;
        sim.addTrail(this.x, this.z, "food", strength, {
          sourceId: this.foodSourceId,
          sourceRatio,
        });
      }
      this.lastTrail = 0;
    } else if (this.state === "wet" && this.lastTrail > 0.6) {
      sim.addTrail(this.x, this.z, "water", 0.45);
      this.lastTrail = 0;
    }
  }

  shock(strength) {
    if (this.variant === "heavySoldier" && strength < 0.95) {
      this.braceIntent = 1;
      this.lastTacticalAction = "braceShock";
      return;
    }
    strength *= this.variantConfig.dangerResponse;
    if (strength > 0.82 && chance(0.24 + this.traits.caution * 0.18)) {
      this.stun = rand(0.8, 2.8) * strength;
      this.setState("stunned");
    } else if (strength > 0.18) {
      this.setState("panic");
    }
  }

  renderState(sim, alpha) {
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      z: this.prevZ + (this.z - this.prevZ) * alpha,
      angle: this.prevAngle + normAngle(this.angle - this.prevAngle) * alpha,
      y: 0.2 + Math.sin(this.gaitPhase + this.animationSeed * 0.000001) * 0.012,
      scale: (this.state === "stunned" ? 0.82 : this.state === "clash" ? 1.06 : 1) * this.bodyScale * this.variantConfig.bodyScale,
      state: this.state,
      carrying: this.carrying,
      carryingSoil: this.carryingSoil,
      variant: this.variant,
      variantConfig: this.variantConfig,
      gaitPhase: this.gaitPhase,
      renderIndex: this.renderInstanceIndex,
      id: this.id,
    };
  }
}

class RivalAnt3D {
  constructor(id, sim, options = {}) {
    this.id = id;
    this.isRival = true;
    this.isRaidRival = Boolean(options.raid);
    this.raidWave = options.raid?.wave ?? 0;
    this.raidIndex = options.raid?.index ?? 0;
    this.raidCount = options.raid?.count ?? 1;
    this.raidTargetX = sim.nest.x;
    this.raidTargetZ = sim.nest.z;
    this.leftRaid = false;
    this.defeated = false;
    this.scale = rand(1.22, 1.42);
    this.baseSpeed = rand(4.6, 7.2);
    this.aggression = rand(0.42, 1);
    this.stubbornness = rand(0.36, 1);
    this.state = "rival";
    this.wander = rand(0, Math.PI * 2);
    this.angle = rand(0, Math.PI * 2);
    this.prevAngle = this.angle;
    this.prevX = 0;
    this.prevZ = 0;
    this.disrupt = 0;
    this.retreat = 0;
    this.retreatFromX = 0;
    this.retreatFromZ = 0;
    this.victoryFlash = 0;
    this.fightCooldown = rand(0, 0.8);
    this.lastFightWinner = null;
    this.clash = null;
    this.gaitPhase = rand(0, Math.PI * 2);
    this.steering = { x: 0, z: 0 };
    if (this.isRaidRival) this.placeAtRaidSpawn(sim, options.raid);
    else this.placeAtSpawn(sim);
  }

  placeAtSpawn(sim) {
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const angle = rand(0, Math.PI * 2);
      const radius = rand(sim.worldRadius * 0.36, sim.worldRadius * 0.86);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (distance2(x, z, sim.nest.x, sim.nest.z) > sim.nest.radius + 34) {
        this.x = x;
        this.z = z;
        this.prevX = x;
        this.prevZ = z;
        this.homeX = x;
        this.homeZ = z;
        return;
      }
    }
    this.x = sim.worldRadius * 0.55;
    this.z = -sim.worldRadius * 0.38;
    this.prevX = this.x;
    this.prevZ = this.z;
    this.homeX = this.x;
    this.homeZ = this.z;
  }

  placeAtRaidSpawn(sim, raid = {}) {
    const count = Math.max(1, raid.count ?? this.raidCount);
    const baseAngle = raid.approachAngle ?? rand(0, Math.PI * 2);
    const lane = this.raidIndex - (count - 1) * 0.5;
    const row = Math.floor(this.raidIndex / 3);
    const fanAngle = baseAngle + lane * 0.055 + rand(-0.035, 0.035);
    const edgeX = Math.cos(fanAngle);
    const edgeZ = Math.sin(fanAngle);
    const sideX = -edgeZ;
    const sideZ = edgeX;
    const depth = (this.raidIndex % 4) * 1.7 + row * 1.15 + rand(-0.5, 0.5);
    const sideOffset = lane * 1.65 + (this.raidIndex % 2 === 0 ? -0.8 : 0.8) + rand(-1.0, 1.0);
    const radius = sim.worldRadius * 0.965 - depth + rand(-0.45, 0.45);
    this.x = edgeX * radius + sideX * sideOffset;
    this.z = edgeZ * radius + sideZ * sideOffset;
    const spawnDistance = Math.hypot(this.x, this.z);
    if (spawnDistance > sim.worldRadius * 0.99) {
      const limit = (sim.worldRadius * 0.99) / spawnDistance;
      this.x *= limit;
      this.z *= limit;
    } else if (spawnDistance > 0 && spawnDistance < sim.worldRadius * 0.86) {
      const limit = (sim.worldRadius * 0.86) / spawnDistance;
      this.x *= limit;
      this.z *= limit;
    }
    this.prevX = this.x;
    this.prevZ = this.z;
    const exitDistance = sim.worldRadius + RAID_EXIT_PADDING;
    const exitLength = Math.hypot(this.x, this.z) || 1;
    this.homeX = (this.x / exitLength) * exitDistance;
    this.homeZ = (this.z / exitLength) * exitDistance;

    const towardNestX = sim.nest.x - this.x;
    const towardNestZ = sim.nest.z - this.z;
    const d = Math.hypot(towardNestX, towardNestZ) || 1;
    const approachX = towardNestX / d;
    const approachZ = towardNestZ / d;
    const flankX = -approachZ;
    const flankZ = approachX;
    const targetDistance = sim.nest.radius + 15 + (this.raidIndex % 3) * 4.5 + row * 1.8;
    const targetFlank = -lane * 2.8 + (this.raidIndex % 2 === 0 ? -1.3 : 1.3);
    this.raidTargetX = sim.nest.x - approachX * targetDistance + flankX * targetFlank;
    this.raidTargetZ = sim.nest.z - approachZ * targetDistance + flankZ * targetFlank;
    this.angle = Math.atan2(approachX, approachZ);
    this.prevAngle = this.angle;
  }

  update(dt, sim) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevAngle = this.angle;
    this.fightCooldown = Math.max(0, this.fightCooldown - dt);
    this.disrupt = Math.max(0, this.disrupt - dt * 0.72);
    this.retreat = Math.max(0, this.retreat - dt);
    this.victoryFlash = Math.max(0, this.victoryFlash - dt * 1.4);

    if (this.clash) {
      this.updateClash(dt, sim);
      return;
    }

    const steering = this.steering;
    steering.x = 0;
    steering.z = 0;
    if (this.retreat > 0) {
      this.addRetreatHome(steering, sim);
    } else {
      const targetAnt = this.findHarassmentTarget(sim);
      if (targetAnt) this.addAntHarassment(steering, targetAnt);
      else {
        this.addFoodCompetition(steering, sim);
        if (this.isRaidRival) this.addRaidPressure(steering, sim);
      }
      this.addNestAvoidance(steering, sim);
    }
    this.addRivalSeparation(steering, sim);

    this.wander += (Math.random() - 0.5) * dt * (1.9 + this.aggression * 1.2);
    const wanderStrength = this.retreat > 0 ? 0.16 : 0.52 + this.stubbornness * 0.26;
    steering.x += Math.sin(this.wander) * wanderStrength;
    steering.z += Math.cos(this.wander) * wanderStrength;

    const centerDistance = Math.hypot(this.x, this.z) || 1;
    if (centerDistance > sim.worldRadius * 0.78) {
      steering.x += (-this.x / centerDistance) * 0.62;
      steering.z += (-this.z / centerDistance) * 0.62;
    }

    this.move(dt, sim, steering);
    this.resolveAntContacts(sim);
  }

  addFoodCompetition(steering, sim) {
    let closest = null;
    let closestDistance = Infinity;
    for (const food of sim.food) {
      if (food.amount <= 0) continue;
      const d = distance2(this.x, this.z, food.x, food.z);
      if (d < closestDistance) {
        closest = food;
        closestDistance = d;
      }
    }
    if (!closest || closestDistance > 72) return;
    const strength = (1 - closestDistance / 72) * (0.72 + this.aggression * 0.5);
    steering.x += ((closest.x - this.x) / (closestDistance || 1)) * strength;
    steering.z += ((closest.z - this.z) / (closestDistance || 1)) * strength;
  }

  addRaidPressure(steering, sim) {
    let targetX = this.raidTargetX;
    let targetZ = this.raidTargetZ;
    let bestFood = null;
    let bestFoodScore = -Infinity;
    for (const food of sim.food) {
      if (food.amount <= 0) continue;
      const distanceFromSelf = distance2(this.x, this.z, food.x, food.z);
      const distanceFromNest = distance2(food.x, food.z, sim.nest.x, sim.nest.z);
      const score = food.amount * 1.4 - distanceFromSelf * 0.04 - distanceFromNest * 0.012;
      if (score > bestFoodScore) {
        bestFood = food;
        bestFoodScore = score;
      }
    }
    if (bestFood) {
      targetX = bestFood.x;
      targetZ = bestFood.z;
    }
    const d = distance2(this.x, this.z, targetX, targetZ) || 1;
    const pressure = d > 7 ? 1.28 + this.aggression * 0.72 : 0.34;
    steering.x += ((targetX - this.x) / d) * pressure;
    steering.z += ((targetZ - this.z) / d) * pressure;
  }

  findHarassmentTarget(sim) {
    if (this.defeated || this.leftRaid || this.retreat > 0 || this.clash) return null;
    let best = null;
    let bestScore = 0;
    const range = this.isRaidRival ? RAID_HARASSMENT_RANGE : RIVAL_HARASSMENT_RANGE;
    const baseScore = this.isRaidRival ? 42 : 30;
    for (const ant of sim.ants) {
      if (!sim.shouldRenderAnt(ant)) continue;
      if (ant.state === "stunned" || ant.state === "clash" || ant.state === "flee" || ant.fleeTimer > 0) continue;
      const d = distance2(this.x, this.z, ant.x, ant.z);
      if (d > range) continue;
      const nestDistance = distance2(ant.x, ant.z, sim.nest.x, sim.nest.z);
      const workerBonus = this.isRaidRival
        ? ant.role === "worker" ? 18 : ant.role === "nurse" ? 4 : ant.role === "scout" ? 3 : -4
        : ant.role === "worker" ? 8 : ant.role === "nurse" ? 3 : ant.role === "scout" ? 2 : -2;
      const carryingBonus = ant.carrying > 0 ? (this.isRaidRival ? 20 : 14) : 0;
      const returnBonus = ant.state === "return" ? (this.isRaidRival ? 8 : 5) : 0;
      const foodBonus = sim.isNearFood(ant.x, ant.z, 18) ? (this.isRaidRival ? 10 : 7) : 0;
      const exposedBonus = ant.role === "worker" && nestDistance > sim.nest.radius + 18 ? (this.isRaidRival ? 12 : 4) : 0;
      const builderBonus = ant.variant === "builder" ? (this.isRaidRival ? 9 : 5) : 0;
      const guardPenalty = ant.variant === "heavySoldier" || ant.role === "guard" ? (this.isRaidRival ? -8 : -5) : 0;
      const score = baseScore - d + carryingBonus + workerBonus + returnBonus + foodBonus + exposedBonus + builderBonus + guardPenalty;
      if (score > bestScore) {
        best = ant;
        bestScore = score;
      }
    }
    return best;
  }

  addAntHarassment(steering, ant) {
    const d = distance2(this.x, this.z, ant.x, ant.z) || 1;
    const charge = 1.65 + this.aggression * 1.25;
    steering.x += ((ant.x - this.x) / d) * charge;
    steering.z += ((ant.z - this.z) / d) * charge;
  }

  addNestAvoidance(steering, sim) {
    const d = distance2(this.x, this.z, sim.nest.x, sim.nest.z);
    const reach = sim.nest.radius + (this.isRaidRival ? 10 : 24);
    if (d >= reach) return;
    const strength = (1 - d / reach) * (this.isRaidRival ? 0.72 : 1.1);
    steering.x += ((this.x - sim.nest.x) / (d || 1)) * strength;
    steering.z += ((this.z - sim.nest.z) / (d || 1)) * strength;
  }

  addRetreatHome(steering, sim) {
    const d = distance2(this.x, this.z, this.homeX, this.homeZ) || 1;
    steering.x += ((this.homeX - this.x) / d) * 2.6;
    steering.z += ((this.homeZ - this.z) / d) * 2.6;

    const threatDistance = distance2(this.x, this.z, this.retreatFromX, this.retreatFromZ) || 1;
    if (threatDistance < 22) {
      const away = (1 - threatDistance / 22) * 0.86;
      steering.x += ((this.x - this.retreatFromX) / threatDistance) * away;
      steering.z += ((this.z - this.retreatFromZ) / threatDistance) * away;
    }

    if (this.isRaidRival && d < 5.2) {
      this.leftRaid = true;
      this.retreat = 0;
    } else if (d < 3.2) this.retreat = Math.min(this.retreat, 0.35);
    this.addNestAvoidance(steering, sim);
  }

  addRivalSeparation(steering, sim) {
    for (const other of sim.rivalAnts) {
      if (other === this) continue;
      const d = distance2(this.x, this.z, other.x, other.z);
      if (d > 0 && d < 3.4) {
        steering.x += ((this.x - other.x) / d) * 0.44;
        steering.z += ((this.z - other.z) / d) * 0.44;
      }
    }
  }

  combatPowers(ant, sim = null) {
    const threatPressure = this.isRaidRival && sim ? clamp(sim.colony.enemyThreat / 22, 0, 0.58) : 0;
    const defenseBonus = sim ? Math.max(0, (sim.computeDerived().defensePower ?? 1) - 1) : 0;
    const variant = ant.variantConfig ?? getAntVariantConfig(ant.variant);
    const rivalPower = 0.74 + this.aggression * 0.86 + this.stubbornness * 0.48 + this.scale * 0.28 + threatPressure;
    const rolePower = ant.role === "guard" ? 1.0 : ant.role === "worker" ? 0.22 : ant.role === "scout" ? 0.24 : 0.1;
    const carriedPenalty = ant.carrying > 0 ? -0.18 : 0;
    const braceBonus = ant.braceIntent > 0 ? variant.brace * 0.34 + (sim?.braceBonusAt(ant.x, ant.z) ?? 0) : 0;
    const nestDefense = defenseBonus * (ant.role === "guard" || ant.variant === "heavySoldier" ? 0.62 : 0.26);
    const antPower =
      0.7 +
      ant.traits.persistence * 0.74 +
      ant.traits.caution * 0.52 +
      rolePower +
      variant.attack +
      variant.contact +
      variant.carapace * 0.2 +
      variant.pushMass * 0.17 +
      nestDefense +
      braceBonus +
      carriedPenalty;
    return { rivalPower, antPower };
  }

  startClash(ant, anchorX, anchorZ, sim) {
    const duration = RIVAL_CLASH_DURATION + (this.isRaidRival ? 0.45 : 0);
    if (this.defeated || this.leftRaid || this.clash || this.retreat > 0 || !ant.startRivalClash(this, anchorX, anchorZ, duration)) return false;
    const dx = ant.x - this.x;
    const dz = ant.z - this.z;
    const length = Math.hypot(dx, dz);
    const lineX = length > 0.0001 ? dx / length : Math.sin(this.angle);
    const lineZ = length > 0.0001 ? dz / length : Math.cos(this.angle);
    this.clash = {
      ants: [ant],
      elapsed: 0,
      duration,
      anchorX,
      anchorZ,
      phase: rand(0, Math.PI * 2),
      lineX,
      lineZ,
      nextTrail: 0.24,
      nextRecruit: 0.16,
      nextEffect: 0.06,
    };
    this.state = "clash";
    this.disrupt = Math.max(this.disrupt, 0.55);
    this.recruitGrapplers(sim);
    sim.addCombatEffect(anchorX, anchorZ, 0.85, 1, Math.atan2(lineZ, lineX));
    return true;
  }

  maxGrapplers(sim) {
    const defense = sim.computeDerived().defensePower ?? 1;
    const guardBonus = defense >= 1.45 ? 1 : 0;
    const raidGroupBonus = this.isRaidRival ? 1 : 0;
    return Math.min(3, 2 + Math.max(guardBonus, raidGroupBonus));
  }

  addGrappler(ant) {
    const clash = this.clash;
    if (!clash || clash.ants.includes(ant)) return false;
    const remaining = Math.max(0.45, clash.duration - clash.elapsed);
    if (!ant.startRivalClash(this, clash.anchorX, clash.anchorZ, remaining)) return false;
    clash.ants.push(ant);
    return true;
  }

  recruitGrapplers(sim) {
    const clash = this.clash;
    if (!clash) return;
    const limit = this.maxGrapplers(sim);
    if (clash.ants.length >= limit) return;
    const recruitRange = this.isRaidRival ? RAID_GRAPPLER_RECRUIT_RANGE : RIVAL_GRAPPLER_RECRUIT_RANGE;
    const candidates = sim.ants
      .filter((ant) =>
        !clash.ants.includes(ant) &&
        ant.state !== "stunned" &&
        ant.state !== "flee" &&
        ant.fleeTimer <= 0 &&
        ant.stun <= 0 &&
        distance2(ant.x, ant.z, this.x, this.z) < recruitRange,
      )
      .sort((a, b) => {
        const roleRank = (a.role === "guard" ? 0 : a.role === "worker" ? 1 : 2) - (b.role === "guard" ? 0 : b.role === "worker" ? 1 : 2);
        if (roleRank) return roleRank;
        return distance2(a.x, a.z, this.x, this.z) - distance2(b.x, b.z, this.x, this.z);
      });
    for (const ant of candidates) {
      if (clash.ants.length >= limit) break;
      this.addGrappler(ant);
    }
  }

  grapplerSlot(lineAngle, index, count, ant) {
    const layouts =
      count <= 1 ? [{ angle: 0, radius: 0.95 }] :
      count === 2 ? [
        { angle: 0, radius: 0.96 },
        { angle: Math.PI * 0.58, radius: 1.04 },
      ] :
      [
        { angle: 0, radius: 0.96 },
        { angle: -Math.PI * 0.52, radius: 1.06 },
        { angle: Math.PI * 0.86, radius: 1.12 },
      ];
    const slot = layouts[Math.min(index, layouts.length - 1)];
    const lockedJitter = Math.sin(this.clash.elapsed * 6.5 + ant.id * 1.7) * 0.035;
    return {
      orbit: lineAngle + slot.angle + lockedJitter,
      radius: slot.radius,
    };
  }

  updateClash(dt, sim) {
    const clash = this.clash;
    if (!clash) {
      this.clash = null;
      this.state = "rival";
      return;
    }
    clash.ants = clash.ants.filter((ant) => sim.ants.includes(ant) && ant.clashRival === this);
    if (clash.ants.length === 0) {
      this.clash = null;
      this.state = "rival";
      return;
    }

    clash.elapsed += dt;
    const progress = clamp(clash.elapsed / clash.duration, 0, 1);
    if (clash.elapsed >= clash.nextRecruit) {
      this.recruitGrapplers(sim);
      clash.nextRecruit += 0.38;
    }

    const lineAngle = Math.atan2(clash.lineZ, clash.lineX);
    let pullX = 0;
    let pullZ = 0;
    const count = Math.max(1, clash.ants.length);
    clash.ants.forEach((ant, index) => {
      const beforeX = ant.x;
      const beforeZ = ant.z;
      const slot = this.grapplerSlot(lineAngle, index, count, ant);
      const orbit = slot.orbit;
      const tug = slot.radius + Math.sin(clash.elapsed * 23 + ant.id) * 0.045;
      const scrape = Math.cos(clash.elapsed * 31 + ant.id * 1.7) * (0.045 + count * 0.01);
      const biteX = Math.cos(orbit) * tug;
      const biteZ = Math.sin(orbit) * tug;
      const antTargetX = clash.anchorX + biteX + Math.cos(orbit + Math.PI / 2) * scrape;
      const antTargetZ = clash.anchorZ + biteZ + Math.sin(orbit + Math.PI / 2) * scrape;
      ant.x += (antTargetX - ant.x) * 0.5;
      ant.z += (antTargetZ - ant.z) * 0.5;
      ant.angle = Math.atan2(this.x - ant.x, this.z - ant.z) + Math.sin(clash.elapsed * 16 + index) * 0.3;
      ant.gaitPhase = (ant.gaitPhase + dt * (18 + this.aggression * 7 + count * 2)) % (Math.PI * 2);
      ant.energy = clamp(ant.energy - dt * (0.022 + this.aggression * 0.013), 0, 1);
      ant.vx = (ant.x - beforeX) / Math.max(dt, 0.000001);
      ant.vz = (ant.z - beforeZ) / Math.max(dt, 0.000001);
      ant.keepInWorld(sim);
      pullX += biteX;
      pullZ += biteZ;
    });

    const rivalBeforeX = this.x;
    const rivalBeforeZ = this.z;
    const averagePullX = pullX / count;
    const averagePullZ = pullZ / count;
    const brace = Math.sin(clash.elapsed * 27 + this.id) * 0.1;
    const rivalTargetX = clash.anchorX - averagePullX * (0.28 + count * 0.05) + Math.cos(lineAngle + Math.PI / 2) * brace;
    const rivalTargetZ = clash.anchorZ - averagePullZ * (0.28 + count * 0.05) + Math.sin(lineAngle + Math.PI / 2) * brace;
    this.x += (rivalTargetX - this.x) * 0.5;
    this.z += (rivalTargetZ - this.z) * 0.5;
    this.angle = Math.atan2(averagePullX, averagePullZ) + Math.sin(clash.elapsed * 13 + this.id) * 0.24;
    this.gaitPhase = (this.gaitPhase + dt * (14 + this.aggression * 8 + count * 1.4)) % (Math.PI * 2);
    this.vx = (this.x - rivalBeforeX) / Math.max(dt, 0.000001);
    this.vz = (this.z - rivalBeforeZ) / Math.max(dt, 0.000001);
    this.disrupt = Math.max(this.disrupt, 0.35 + progress * 0.3 + Math.min(0.28, count * 0.06));
    this.keepInWorld(sim);

    if (clash.elapsed >= clash.nextTrail) {
      sim.addTrail(clash.anchorX, clash.anchorZ, "alarm", 0.48 + count * 0.08);
      clash.nextTrail += 0.5;
    }
    if (clash.elapsed >= clash.nextEffect) {
      sim.addCombatEffect(clash.anchorX, clash.anchorZ, 0.72 + count * 0.14, count, lineAngle + Math.sin(clash.elapsed * 8) * 0.4);
      clash.nextEffect += count > 1 ? 0.16 : 0.22;
    }

    if (clash.elapsed >= clash.duration) this.finishClash(sim);
  }

  finishClash(sim) {
    const clash = this.clash;
    if (!clash) return;
    const ants = clash.ants.filter((ant) => sim.ants.includes(ant));
    const primaryAnt = ants[0];
    this.clash = null;
    this.state = "rival";

    for (const ant of ants) {
      ant.clashRival = null;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
    }
    if (!primaryAnt) return;

    const groupPower = ants.reduce((sum, ant) => sum + this.combatPowers(ant, sim).antPower, 0);
    const groupBonus = 0.82 + Math.min(0.42, Math.max(0, ants.length - 1) * 0.14);
    const colonyPower = groupPower * groupBonus;
    const threatPressure = this.isRaidRival ? clamp(sim.colony.enemyThreat / 14, 0, 0.95) : 0;
    const rivalPower = 1.35 + this.aggression * 1.04 + this.stubbornness * 0.64 + this.scale * 0.36 + threatPressure;
    const dx = primaryAnt.x - this.x;
    const dz = primaryAnt.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;

    if (rivalPower >= colonyPower * 0.94) {
      const victim = ants
        .slice()
        .sort((a, b) => this.combatPowers(a, sim).antPower - this.combatPowers(b, sim).antPower)[0];
      for (const ant of ants) {
        ant.x += nx * 0.34;
        ant.z += nz * 0.34;
        ant.angle = Math.atan2(sim.nest.x - ant.x, sim.nest.z - ant.z);
        ant.energy = clamp(ant.energy - 0.16 * this.aggression, 0, 1);
        if (ant !== victim) ant.startFleeHome(this.x, this.z, 4.2 + this.aggression * 1.2);
      }
      if (this.isRaidRival && sim.canLoseAnt()) {
        sim.killAnt(victim, this);
      } else {
        victim.startFleeHome(this.x, this.z, 4.8 + this.aggression * 1.5);
      }
      this.victoryFlash = 1;
      this.lastFightWinner = "rival";
      sim.registerRivalFight("rival", victim, this, { grapplers: ants.length, casualty: this.isRaidRival });
    } else {
      this.x -= nx * 0.38;
      this.z -= nz * 0.38;
      this.angle = Math.atan2(this.homeX - this.x, this.homeZ - this.z);
      this.disrupt = Math.max(this.disrupt, 1.15);
      this.startRetreatHome(primaryAnt.x, primaryAnt.z, 4.8 + primaryAnt.traits.persistence * 1.5);
      for (const ant of ants) {
        ant.energy = clamp(ant.energy - 0.08, 0, 1);
        if (ant.state === "clash") ant.setState(ant.carrying > 0 ? "return" : "explore");
      }
      this.lastFightWinner = "colony";
      let enemyDefeated = false;
      if (this.isRaidRival && colonyPower > rivalPower * 1.24) {
        enemyDefeated = sim.defeatRivalAnt(this, primaryAnt);
      }
      sim.registerRivalFight("colony", primaryAnt, this, { grapplers: ants.length, enemyCasualty: enemyDefeated });
    }

    sim.addTrail((this.x + primaryAnt.x) * 0.5, (this.z + primaryAnt.z) * 0.5, "alarm", 1.0);
    sim.addCombatEffect((this.x + primaryAnt.x) * 0.5, (this.z + primaryAnt.z) * 0.5, 1.25 + ants.length * 0.12, ants.length, Math.atan2(nz, nx));
    this.fightCooldown = 1.35;
    for (const ant of ants) ant.keepInWorld(sim);
    this.keepInWorld(sim);
  }

  startRetreatHome(fromX, fromZ, duration) {
    this.retreatFromX = fromX;
    this.retreatFromZ = fromZ;
    this.retreat = Math.max(this.retreat, duration);
    this.fightCooldown = Math.max(this.fightCooldown, 1.05);
  }

  move(dt, sim, steering) {
    const length = Math.hypot(steering.x, steering.z);
    if (length > 0.001) {
      const targetAngle = Math.atan2(steering.x, steering.z);
      this.angle += clamp(normAngle(targetAngle - this.angle), -3.8 * dt, 3.8 * dt);
    } else {
      this.angle += (Math.random() - 0.5) * dt * 0.4;
    }
    const speed = this.baseSpeed * (1 - this.disrupt * 0.28) * (this.retreat > 0 ? 1.28 : 1) * sim.terrainSpeedAt(this.x, this.z) * sim.rivalSpeedAt(this.x, this.z) * sim.timeScale;
    this.x += Math.sin(this.angle) * speed * dt;
    this.z += Math.cos(this.angle) * speed * dt;
    this.vx = (this.x - this.prevX) / Math.max(dt, 0.000001);
    this.vz = (this.z - this.prevZ) / Math.max(dt, 0.000001);
    const traveled = Math.hypot(this.x - this.prevX, this.z - this.prevZ);
    if (traveled > 0.0001) this.gaitPhase = (this.gaitPhase + traveled * 3.1) % (Math.PI * 2);
    this.keepInWorld(sim);
  }

  resolveAntContacts(sim) {
    if (this.clash) return true;
    if (this.defeated || this.leftRaid || this.retreat > 0) return false;
    let resolved = false;
    for (const ant of sim.ants) {
      if (ant.state === "clash" || ant.state === "flee" || ant.fleeTimer > 0 || ant.stun > 0) continue;
      const contact = RIVAL_CONTACT_RADIUS + this.scale * 0.52;
      const dx = ant.x - this.x;
      const dz = ant.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d >= contact) continue;

      const nx = d > 0.0001 ? dx / d : Math.sin(this.angle);
      const nz = d > 0.0001 ? dz / d : Math.cos(this.angle);
      const overlap = contact - d;

      if (this.fightCooldown > 0) {
        const shove = Math.min(0.34, overlap * 0.18 + 0.06);
        ant.x += nx * shove;
        ant.z += nz * shove;
        this.x -= nx * shove * 0.35;
        this.z -= nz * shove * 0.35;
        ant.keepInWorld(sim);
        this.keepInWorld(sim);
        resolved = true;
        continue;
      }

      const anchorX = (this.x + ant.x) * 0.5;
      const anchorZ = (this.z + ant.z) * 0.5;
      if (this.startClash(ant, anchorX, anchorZ, sim)) {
        sim.addTrail(anchorX, anchorZ, "alarm", 0.55);
        resolved = true;
        break;
      }
    }
    return resolved;
  }

  keepInWorld(sim) {
    const d = Math.hypot(this.x, this.z);
    const limit = this.isRaidRival && this.retreat > 0 ? sim.worldRadius + RAID_EXIT_PADDING + 2 : sim.worldRadius;
    if (d > limit) {
      const nx = this.x / d;
      const nz = this.z / d;
      this.x = nx * limit;
      this.z = nz * limit;
      this.angle += Math.PI * 0.75;
    }
  }

  renderState(sim, alpha) {
    const jitter = this.disrupt > 0 || this.victoryFlash > 0 || this.clash ? Math.sin(sim.renderTime * 0.018 + this.id) * 0.045 : 0;
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      z: this.prevZ + (this.z - this.prevZ) * alpha,
      angle: this.prevAngle + normAngle(this.angle - this.prevAngle) * alpha,
      y: 0.24 + Math.sin(sim.renderTime * 0.004 + this.id) * 0.01,
      scale: this.scale + jitter + this.victoryFlash * 0.08,
      state: this.state,
      carrying: 0,
      gaitPhase: this.gaitPhase,
      id: this.id,
    };
  }
}

const ANT_VISUAL_SCALE = 0.46;

const ANT_BODY_PARTS = [
  { name: "gaster", x: 0, y: 0, z: -1.78, sx: 0.48, sy: 0.29, sz: 0.72 },
  { name: "postpetiole", x: 0, y: -0.02, z: -0.82, sx: 0.18, sy: 0.16, sz: 0.19 },
  { name: "petiole", x: 0, y: -0.02, z: -0.48, sx: 0.14, sy: 0.14, sz: 0.16 },
  { name: "mesosoma", x: 0, y: 0, z: 0.18, sx: 0.36, sy: 0.25, sz: 0.58 },
  { name: "head", x: 0, y: 0, z: 1.22, sx: 0.42, sy: 0.27, sz: 0.42 },
];

const ANT_APPENDAGE_SEGMENTS = (() => {
  const segments = [];
  for (const side of [-1, 1]) {
    const legs = [
      { rootX: 0.22, rootZ: 0.52, elbowX: 0.64, elbowZ: 0.96, footX: 1.22, footZ: 1.22 },
      { rootX: 0.28, rootZ: 0.13, elbowX: 0.82, elbowZ: 0.08, footX: 1.36, footZ: -0.02 },
      { rootX: 0.22, rootZ: -0.22, elbowX: 0.64, elbowZ: -0.64, footX: 1.18, footZ: -1.08 },
    ];
    for (const [legIndex, leg] of legs.entries()) {
      const phase = legIndex * 1.78 + (side > 0 ? Math.PI : 0);
      segments.push({ kind: "leg", side, phase, radius: 0.026, from: [side * leg.rootX, -0.02, leg.rootZ], to: [side * leg.elbowX, -0.13, leg.elbowZ] });
      segments.push({ kind: "leg", side, phase: phase + 0.7, radius: 0.021, from: [side * leg.elbowX, -0.13, leg.elbowZ], to: [side * leg.footX, -0.25, leg.footZ] });
    }
    segments.push({ kind: "antenna", side, phase: side > 0 ? 0.4 : 2.1, radius: 0.021, from: [side * 0.16, 0.05, 1.54], to: [side * 0.42, 0.02, 1.96] });
    segments.push({ kind: "antenna", side, phase: side > 0 ? 1.1 : 2.8, radius: 0.017, from: [side * 0.42, 0.02, 1.96], to: [side * 0.78, -0.06, 2.26] });
    segments.push({ kind: "mandible", side, phase: side > 0 ? 0.2 : 1.9, radius: 0.024, from: [side * 0.12, -0.04, 1.54], to: [side * 0.34, -0.08, 1.76] });
  }
  return segments;
})();
const HEAVY_SOLDIER_SEGMENTS = [
  { kind: "mandible", side: -1, phase: 0.8, radius: 0.035, from: [-0.2, -0.05, 1.54], to: [-0.62, -0.1, 1.95] },
  { kind: "mandible", side: 1, phase: 2.4, radius: 0.035, from: [0.2, -0.05, 1.54], to: [0.62, -0.1, 1.95] },
  { kind: "exoskeleton", side: -1, phase: 0, radius: 0.022, from: [-0.34, 0.12, 0.42], to: [-0.42, 0.05, -0.54] },
  { kind: "exoskeleton", side: 1, phase: 0, radius: 0.022, from: [0.34, 0.12, 0.42], to: [0.42, 0.05, -0.54] },
];
const ANT_VARIANT_APPENDAGE_CAP = HEAVY_SOLDIER_SEGMENTS.length;
const ANT_ROLE_LABEL_CONFIG = {
  soldier: {
    text: "兵隊",
    asset: "assets/generated/ant-role-soldier-20260627.png",
    accent: "#b8873d",
    band: "#7d5f2d",
    bg: "rgba(37, 29, 20, 0.84)",
    iconBg: "rgba(151, 109, 44, 0.34)",
  },
  heavySoldier: {
    text: "重兵装",
    asset: "assets/generated/ant-role-heavy-soldier-20260627.png",
    accent: "#9c563e",
    band: "#693728",
    bg: "rgba(38, 24, 19, 0.86)",
    iconBg: "rgba(132, 67, 47, 0.38)",
  },
  builder: {
    text: "土木",
    asset: "assets/generated/ant-role-builder-20260627.png",
    accent: "#71804c",
    band: "#4d5a36",
    bg: "rgba(28, 33, 24, 0.84)",
    iconBg: "rgba(99, 112, 67, 0.36)",
  },
};

class AntRoleLabelSystem {
  constructor(sim, capacity) {
    this.sim = sim;
    this.capacity = capacity;
    this.sprites = [];
    this.textures = new Map();
    this.materials = [];
    for (const [variant, config] of Object.entries(ANT_ROLE_LABEL_CONFIG)) {
      this.textures.set(variant, this.createLabelTexture(config));
    }
    for (let i = 0; i < capacity; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.textures.get("builder"),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.94,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 60;
      sim.scene.add(sprite);
      this.sprites.push(sprite);
      this.materials.push(material);
    }
  }

  createLabelTexture(config) {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const draw = (image = null) => {
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = config.bg;
      roundedRect(context, 8, 18, 368, 92, 32);
      context.fill();
      context.fillStyle = config.band;
      roundedRect(context, 12, 23, 32, 82, 26);
      context.fill();
      context.strokeStyle = config.accent;
      context.lineWidth = 5;
      roundedRect(context, 8, 18, 368, 92, 32);
      context.stroke();
      context.fillStyle = config.iconBg;
      context.beginPath();
      context.arc(63, 64, 43, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = config.accent;
      context.globalAlpha = 0.22;
      context.beginPath();
      context.moveTo(106, 29);
      context.lineTo(351, 29);
      context.lineTo(333, 99);
      context.lineTo(118, 99);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
      if (image) {
        context.drawImage(image, 22, 25, 78, 78);
      } else {
        context.fillStyle = config.accent;
        context.beginPath();
        context.arc(61, 64, 26, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = "rgba(255, 248, 225, 0.96)";
      context.font = "700 42px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      context.textBaseline = "middle";
      context.fillText(config.text, 116, 64);
      texture.needsUpdate = true;
    };
    draw();
    const image = new Image();
    image.decoding = "async";
    image.onload = () => draw(image);
    image.src = config.asset;
    return texture;
  }

  render(ants, sim, alpha) {
    let labelIndex = 0;
    for (const ant of ants) {
      if (ant.isRival) continue;
      const config = ANT_ROLE_LABEL_CONFIG[ant.variant];
      if (!config || labelIndex >= this.capacity) continue;
      const sprite = this.sprites[labelIndex];
      const material = this.materials[labelIndex];
      const texture = this.textures.get(ant.variant);
      if (material.map !== texture) {
        material.map = texture;
        material.needsUpdate = true;
      }
      const state = ant.renderState(sim, alpha);
      const scale = clamp(sim.cameraDistance / 238, 0.72, 1.28);
      sprite.visible = true;
      sprite.position.set(state.x, state.y + 4.6 + state.scale * 0.9, state.z);
      sprite.scale.set(11.5 * scale, 3.85 * scale, 1);
      labelIndex += 1;
    }
    for (let i = labelIndex; i < this.sprites.length; i += 1) this.sprites[i].visible = false;
  }

  destroy() {
    for (const sprite of this.sprites) this.sim.scene.remove(sprite);
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
  }
}

class AntRenderSystem {
  constructor(sim, capacity) {
    this.sim = sim;
    this.capacity = capacity;
    this.bodyMeshes = new Map();
    this.bodyCounts = new Map();
    this.dummy = new THREE.Object3D();
    this.segmentStart = new THREE.Vector3();
    this.segmentEnd = new THREE.Vector3();
    this.segmentMid = new THREE.Vector3();
    this.segmentDirection = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.segmentQuaternion = new THREE.Quaternion();
    this.hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    this.idToRenderIndex = new Map();
    this.renderIndexToKey = new Map();
    this.highWaterMark = 0;

    for (const [state, material] of Object.entries(sim.materials.antByState)) {
      const partMeshes = new Map();
      const partCounts = new Map();
      for (const part of ANT_BODY_PARTS) {
        const mesh = new THREE.InstancedMesh(sim.geometries.antSphere, material, capacity);
        mesh.count = 0;
        mesh.castShadow = sim.quality.shadowQuality !== "off";
        mesh.frustumCulled = false;
        sim.scene.add(mesh);
        partMeshes.set(part.name, mesh);
        partCounts.set(part.name, 0);
      }
      this.bodyMeshes.set(state, partMeshes);
      this.bodyCounts.set(state, partCounts);
    }

    this.appendageGeometry = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
    this.appendageSlotCount = ANT_APPENDAGE_SEGMENTS.length + ANT_VARIANT_APPENDAGE_CAP;
    this.appendageMesh = new THREE.InstancedMesh(this.appendageGeometry, sim.materials.antAppendage, capacity * this.appendageSlotCount);
    this.appendageMesh.count = 0;
    this.appendageMesh.castShadow = sim.quality.shadowQuality !== "off";
    this.appendageMesh.frustumCulled = false;
    sim.scene.add(this.appendageMesh);

    this.foodMesh = new THREE.InstancedMesh(sim.geometries.foodCrumb, sim.materials.food, capacity);
    this.foodMesh.count = 0;
    this.foodMesh.castShadow = sim.quality.shadowQuality !== "off";
    this.foodMesh.frustumCulled = false;
    sim.scene.add(this.foodMesh);

    this.soilMesh = new THREE.InstancedMesh(sim.geometries.soilPebble, sim.materials.nestLoose, capacity);
    this.soilMesh.count = 0;
    this.soilMesh.castShadow = sim.quality.shadowQuality !== "off";
    this.soilMesh.frustumCulled = false;
    sim.scene.add(this.soilMesh);
  }

  beginFrame() {
    const limit = Math.min(this.capacity, this.highWaterMark);
    for (const meshes of this.bodyMeshes.values()) {
      for (const mesh of meshes.values()) {
        mesh.count = limit;
        for (let i = 0; i < limit; i += 1) mesh.setMatrixAt(i, this.hiddenMatrix);
      }
    }
    for (let i = 0; i < limit * this.appendageSlotCount; i += 1) {
      this.appendageMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    for (let i = 0; i < limit; i += 1) this.foodMesh.setMatrixAt(i, this.hiddenMatrix);
    for (let i = 0; i < limit; i += 1) this.soilMesh.setMatrixAt(i, this.hiddenMatrix);
    this.appendageMesh.count = limit * this.appendageSlotCount;
    this.foodMesh.count = limit;
    this.soilMesh.count = limit;
  }

  keyFor(ant) {
    return `${ant.isRival ? "rival" : "colony"}:${ant.id}`;
  }

  assignRenderIndex(ant) {
    const key = this.keyFor(ant);
    if (this.idToRenderIndex.has(key)) {
      const index = this.idToRenderIndex.get(key);
      ant.renderInstanceIndex = index;
      return index;
    }
    const requested = Number.isInteger(ant.renderInstanceIndex) ? ant.renderInstanceIndex : null;
    let index = requested != null && requested >= 0 && requested < this.capacity && !this.renderIndexToKey.has(requested)
      ? requested
      : null;
    if (index == null) {
      for (let i = 0; i < this.capacity; i += 1) {
        if (!this.renderIndexToKey.has(i)) {
          index = i;
          break;
        }
      }
    }
    if (index == null) index = Math.min(this.capacity - 1, this.highWaterMark);
    this.idToRenderIndex.set(key, index);
    this.renderIndexToKey.set(index, key);
    this.highWaterMark = Math.max(this.highWaterMark, index + 1);
    ant.renderInstanceIndex = index;
    this.clearRenderSlot(index);
    return index;
  }

  clearRenderSlot(index) {
    for (const meshes of this.bodyMeshes.values()) {
      for (const mesh of meshes.values()) mesh.setMatrixAt(index, this.hiddenMatrix);
    }
    const start = index * this.appendageSlotCount;
    for (let i = 0; i < this.appendageSlotCount; i += 1) this.appendageMesh.setMatrixAt(start + i, this.hiddenMatrix);
    this.foodMesh.setMatrixAt(index, this.hiddenMatrix);
    this.soilMesh.setMatrixAt(index, this.hiddenMatrix);
  }

  releaseRenderObject(ant) {
    const key = this.keyFor(ant);
    const index = this.idToRenderIndex.get(key);
    if (index != null) this.renderIndexToKey.delete(index);
    this.idToRenderIndex.delete(key);
    if (ant.renderInstanceIndex === index) ant.renderInstanceIndex = null;
  }

  materialStateFor(ant, renderState) {
    return ant.isRival ? "rival" : "explore";
  }

  renderAnt(ant, renderState) {
    const index = this.assignRenderIndex(ant);
    const materialState = this.materialStateFor(ant, renderState);
    const meshes = this.bodyMeshes.get(materialState) ?? this.bodyMeshes.get("explore");
    for (const part of ANT_BODY_PARTS) {
      const scale = this.bodyPartScale(renderState, part.name);
      this.composeLocalMatrix(renderState, part.x, part.y, part.z, part.sx * scale.x, part.sy * scale.y, part.sz * scale.z);
      meshes.get(part.name).setMatrixAt(index, this.dummy.matrix);
    }

    let segmentIndex = index * this.appendageSlotCount;
    for (const segment of ANT_APPENDAGE_SEGMENTS) {
      this.composeSegmentMatrix(renderState, segment);
      this.appendageMesh.setMatrixAt(segmentIndex, this.dummy.matrix);
      segmentIndex += 1;
    }
    if (renderState.variant === "heavySoldier") {
      for (const segment of HEAVY_SOLDIER_SEGMENTS) {
        this.composeSegmentMatrix(renderState, segment);
        this.appendageMesh.setMatrixAt(segmentIndex, this.dummy.matrix);
        segmentIndex += 1;
      }
    }

    if (renderState.carrying > 0) {
      this.composeLocalMatrix(renderState, 0, 0.14, 1.9, 0.36, 0.36, 0.36);
      this.foodMesh.setMatrixAt(index, this.dummy.matrix);
    }
    if (renderState.carryingSoil) {
      this.composeLocalMatrix(renderState, 0.28, 0.1, 1.5, 0.28, 0.22, 0.28);
      this.soilMesh.setMatrixAt(index, this.dummy.matrix);
    }
  }

  bodyPartScale(renderState, partName) {
    const config = renderState.variantConfig ?? getAntVariantConfig(renderState.variant);
    const scale = { x: 1, y: 1, z: 1 };
    if (partName === "head") {
      scale.x *= config.headScale;
      scale.y *= config.headScale * 0.96;
      scale.z *= config.headScale;
    } else if (partName === "gaster") {
      scale.x *= config.abdomenScale;
      scale.y *= config.abdomenScale;
      scale.z *= config.abdomenScale;
    } else if (renderState.variant === "heavySoldier" && partName === "mesosoma") {
      scale.x *= 1.16;
      scale.y *= 1.18;
      scale.z *= 1.08;
    } else if (renderState.variant === "builder" && partName === "mesosoma") {
      scale.x *= 1.08;
      scale.y *= 1.06;
      scale.z *= 1.02;
    }
    return scale;
  }

  composeLocalMatrix(renderState, localX, localY, localZ, scaleX, scaleY, scaleZ) {
    const sin = Math.sin(renderState.angle);
    const cos = Math.cos(renderState.angle);
    const visualScale = renderState.scale * ANT_VISUAL_SCALE;
    const x = localX * visualScale;
    const y = localY * visualScale;
    const z = localZ * visualScale;
    this.dummy.position.set(
      renderState.x + x * cos + z * sin,
      renderState.y + y,
      renderState.z - x * sin + z * cos,
    );
    this.dummy.rotation.set(0, renderState.angle, 0);
    this.dummy.scale.set(scaleX * visualScale, scaleY * visualScale, scaleZ * visualScale);
    this.dummy.updateMatrix();
  }

  composeSegmentMatrix(renderState, segment) {
    this.localPointToWorld(renderState, segment.from, this.segmentStart, segment, 0);
    this.localPointToWorld(renderState, segment.to, this.segmentEnd, segment, 1);
    this.segmentMid.addVectors(this.segmentStart, this.segmentEnd).multiplyScalar(0.5);
    this.segmentDirection.subVectors(this.segmentEnd, this.segmentStart);
    const length = this.segmentDirection.length();
    this.segmentDirection.normalize();
    this.segmentQuaternion.setFromUnitVectors(this.up, this.segmentDirection);
    this.dummy.position.copy(this.segmentMid);
    this.dummy.quaternion.copy(this.segmentQuaternion);
    const radius = segment.radius * renderState.scale * ANT_VISUAL_SCALE;
    this.dummy.scale.set(radius, length, radius);
    this.dummy.updateMatrix();
  }

  localPointToWorld(renderState, point, target, segment = null, endpoint = 0) {
    const sin = Math.sin(renderState.angle);
    const cos = Math.cos(renderState.angle);
    const visualScale = renderState.scale * ANT_VISUAL_SCALE;
    let px = point[0];
    let py = point[1];
    let pz = point[2];
    const phase = Number.isFinite(renderState.gaitPhase) ? renderState.gaitPhase : (renderState.id ?? 0) * 0.17;
    if (segment?.kind === "leg") {
      const stride = Math.sin(phase + segment.phase);
      const brace = Math.cos(phase * 1.2 + segment.phase);
      const intensity = renderState.state === "clash" ? 1.85 : renderState.state === "panic" || renderState.state === "flee" ? 1.28 : 1;
      px += segment.side * brace * (0.035 + endpoint * 0.055) * intensity;
      pz += stride * (0.045 + endpoint * 0.115) * intensity;
      py += Math.abs(stride) * (0.012 + endpoint * 0.026) * intensity;
    } else if (segment?.kind === "antenna") {
      const wave = Math.sin(phase * 0.72 + segment.phase);
      const intensity = renderState.state === "clash" ? 1.6 : 1;
      px += segment.side * wave * (0.035 + endpoint * 0.07) * intensity;
      pz += Math.cos(phase * 0.52 + segment.phase) * endpoint * 0.045 * intensity;
    } else if (segment?.kind === "mandible" && renderState.state === "clash") {
      const bite = Math.sin(phase * 1.7 + segment.phase);
      px += segment.side * bite * endpoint * 0.07;
      pz -= Math.abs(bite) * endpoint * 0.08;
    }
    const localX = px * visualScale;
    const localY = py * visualScale;
    const localZ = pz * visualScale;
    target.set(
      renderState.x + localX * cos + localZ * sin,
      renderState.y + localY,
      renderState.z - localX * sin + localZ * cos,
    );
  }

  endFrame() {
    const limit = Math.min(this.capacity, this.highWaterMark);
    for (const meshes of this.bodyMeshes.values()) {
      for (const mesh of meshes.values()) {
        mesh.count = limit;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.appendageMesh.count = limit * this.appendageSlotCount;
    this.appendageMesh.instanceMatrix.needsUpdate = true;
    this.foodMesh.count = limit;
    this.foodMesh.instanceMatrix.needsUpdate = true;
    this.soilMesh.count = limit;
    this.soilMesh.instanceMatrix.needsUpdate = true;
  }

  render(ants, sim, alpha) {
    this.beginFrame();
    for (const ant of ants) this.renderAnt(ant, ant.renderState(sim, alpha));
    this.endFrame();
  }

  destroy() {
    for (const meshes of this.bodyMeshes.values()) {
      for (const mesh of meshes.values()) this.sim.scene.remove(mesh);
    }
    this.sim.scene.remove(this.appendageMesh);
    this.sim.scene.remove(this.foodMesh);
    this.sim.scene.remove(this.soilMesh);
    this.appendageGeometry.dispose();
  }
}

class AntColony3D {
  constructor() {
    this.loadingScreen = new LoadingScreen({
      overlay: ui.loadingOverlay,
      bar: ui.loadingBar,
      label: ui.loadingLabel,
      errorPanel: ui.errorPanel,
      errorMessage: ui.errorMessage,
    });
    this.quality = chooseQualityPreset();
    this.assetService = new AssetService(this.loadingScreen);
    this.currentPixelRatio = 1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181a18);
    this.scene.fog = new THREE.Fog(0x181a18, 210, 420);
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 460);
    this.renderer = this.createRenderer();
    if (!this.renderer) return;
    ui.world.appendChild(this.renderer.domElement);

    this.frameAccumulator = 0;
    this.lastFrameTime = 0;
    this.renderTime = 0;
    this.isRunning = false;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.groundHit = new THREE.Vector3();
    this.pointerMap = new Map();
    this.pointerStart = null;
    this.branchDraft = null;
    this.branchPreview = null;
    this.pinchStart = null;
    this.dragMoved = false;

    this.tool = "inspect";
    this.paused = false;
    this.timeScale = 1;
    this.raidSoonMode = IS_RAID_SOON;
    document.body.classList.toggle("is-raid-soon", this.raidSoonMode);
    this.worldRadius = 132;
    this.nest = { x: -42, z: 12, radius: 8 };
    this.colony = readColonyState();
    this.derived = {};
    this.saveTimer = 0;
    this.activeTab = "growth";
    {
      const savedPanelCompact = readStorage("ant3d.panelCompact");
      this.panelCompact = savedPanelCompact == null ? window.innerWidth < 680 : savedPanelCompact === "1";
    }
    this.panelDrag = null;
    this.selectedAnt = null;
    this.collectedFood = 0;
    this.nextFoodId = 1;
    this.nextAntId = 1;
    this.ants = [];
    this.water = [];
    this.stones = [];
    this.food = [];
    this.branches = [];
    this.trails = [];
    this.buildTasks = [];
    this.earthworks = [];
    this.combatEffects = [];
    this.terrain = [];
    this.terrainBumps = [];
    this.nestEntrances = [];
    this.nestSpoils = [];
    this.predators = [];
    this.rivalAnts = [];
    this.rivalCorpses = [];
    this.colonyCorpses = [];
    this.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };
    this.raidNotice = { message: "", kind: "warning", timer: 0 };
    this.constructionMessage = "待機";
    this.renderAntBuffer = [];
    this.soldierSortieCooldown = 0;
    this.sortieRetireQueue = [];
    this.lastUiUpdate = 0;
    this.resizeWidth = 0;
    this.resizeHeight = 0;

    this.cameraTarget = new THREE.Vector3(this.nest.x * 0.36, 0, this.nest.z * 0.36);
    this.cameraRenderTarget = this.cameraTarget.clone();
    this.cameraYaw = -0.62;
    this.cameraPitch = 1.05;
    this.targetCameraYaw = this.cameraYaw;
    this.targetCameraPitch = this.cameraPitch;
    this.cameraDistance = window.innerWidth < 680 ? CAMERA_DISTANCE_MOBILE : CAMERA_DISTANCE_DESKTOP;
    this.targetCameraDistance = this.cameraDistance;

    this.sharedGeometries = new Set();
    this.sharedMaterials = new Set();
    this.dynamicObjects = new Set();

    this.assetService.preloadProceduralAssets();
    this.applyOfflineProgress(Date.now());
    this.createSharedAssets();
    this.antRenderer = new AntRenderSystem(this, DISPLAY_ANT_CAP + RAID_RIVAL_CAP);
    this.roleLabelSystem = new AntRoleLabelSystem(this, DISPLAY_ANT_CAP);
    this.createWorld();
    this.bindEvents();
    this.debugPanel = new DebugPanel(this);
    this.reset(false);
    if (this.raidSoonMode) this.activateRaidSoonMode();
    this.resize();
    window.__ANT_SIM = this;
    this.prewarmAndStart();
  }

  createRenderer() {
    this.loadingScreen.setProgress("renderer", 0, 1);
    const probe = document.createElement("canvas");
    const hasWebGL2 = Boolean(probe.getContext("webgl2"));
    const hasWebGL = hasWebGL2 || Boolean(probe.getContext("webgl") || probe.getContext("experimental-webgl"));
    if (!hasWebGL) {
      this.loadingScreen.showError("この端末では WebGL を開始できません。ブラウザまたはGPU設定を確認してください。");
      return null;
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: this.quality.antialias,
        alpha: false,
        stencil: false,
        depth: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
    } catch (error) {
      this.loadingScreen.showError(`Renderer init failed: ${error.message}`);
      return null;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.quality.toneMappingExposure;
    renderer.shadowMap.enabled = this.quality.shadowQuality !== "off";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = true;
    this.webglTier = hasWebGL2 ? "webgl2" : "webgl1";
    return renderer;
  }

  createSharedAssets() {
    this.geometries = {
      antSphere: new THREE.SphereGeometry(1, 12, 8),
      foodCrumb: new THREE.SphereGeometry(0.8, 10, 8),
      waterCircle: new THREE.CircleGeometry(1, 64),
      trailCircle: new THREE.CircleGeometry(1, 18),
      impactRing: new THREE.TorusGeometry(1, 0.035, 8, 72),
      combatDust: new THREE.SphereGeometry(1, 8, 6),
      combatSlash: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
      nestRim: new THREE.TorusGeometry(1, 0.11, 8, 36),
      soilPebble: new THREE.DodecahedronGeometry(1, 0),
      terrainBump: new THREE.SphereGeometry(1, 12, 8),
      stoneRock: new THREE.DodecahedronGeometry(1, 0),
    };

    this.materials = {
      ground: new THREE.MeshStandardMaterial({
        map: this.assetService.get("groundTexture"),
        roughness: 0.92,
        metalness: 0,
      }),
      nest: new THREE.MeshStandardMaterial({ color: 0x6d4e2a, roughness: 0.95 }),
      nestLoose: new THREE.MeshStandardMaterial({ color: 0x8a6335, roughness: 0.96 }),
      nestRim: new THREE.MeshStandardMaterial({ color: 0x5a3a1f, roughness: 0.98 }),
      nestDark: new THREE.MeshBasicMaterial({ color: 0x1d140e, side: THREE.DoubleSide }),
      antDefault: new THREE.MeshStandardMaterial({ color: 0x18130f, roughness: 0.72 }),
      antRival: new THREE.MeshStandardMaterial({ color: 0x8a4a2f, emissive: 0x120705, roughness: 0.8 }),
      antCorpse: new THREE.MeshStandardMaterial({ color: 0x6a3325, roughness: 0.94 }),
      antColonyCorpse: new THREE.MeshStandardMaterial({ color: 0x19110c, roughness: 0.96 }),
      antCorpseAppendage: new THREE.MeshStandardMaterial({ color: 0x2b1711, roughness: 0.96 }),
      antAppendage: new THREE.MeshStandardMaterial({ color: 0x17100b, roughness: 0.82 }),
      food: new THREE.MeshStandardMaterial({ color: 0xd9a63f, roughness: 0.62 }),
      foodFruit: new THREE.MeshStandardMaterial({ color: 0xc45b33, roughness: 0.7 }),
      foodSeed: new THREE.MeshStandardMaterial({ color: 0xb28c45, roughness: 0.72 }),
      foodLeaf: new THREE.MeshStandardMaterial({ color: 0x6f8d38, roughness: 0.8 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x777c75, roughness: 0.86 }),
      branch: new THREE.MeshStandardMaterial({ color: 0x8a6232, roughness: 0.9 }),
      terrainMoss: new THREE.MeshBasicMaterial({ color: 0x456f42, transparent: true, opacity: 0.32, depthWrite: false }),
      terrainLeaf: new THREE.MeshBasicMaterial({ color: 0x7b5b30, transparent: true, opacity: 0.28, depthWrite: false }),
      terrainSand: new THREE.MeshBasicMaterial({ color: 0xd1b36d, transparent: true, opacity: 0.24, depthWrite: false }),
      terrainDamp: new THREE.MeshBasicMaterial({ color: 0x3d5f58, transparent: true, opacity: 0.25, depthWrite: false }),
      terrainRise: new THREE.MeshStandardMaterial({ color: 0x9a7440, roughness: 0.96 }),
      predatorBody: new THREE.MeshStandardMaterial({ color: 0x2b211c, roughness: 0.78 }),
      predatorAccent: new THREE.MeshBasicMaterial({ color: 0xb44a36, transparent: true, opacity: 0.58 }),
      water: new THREE.MeshPhysicalMaterial({
        color: 0x4aa6d9,
        transparent: true,
        opacity: 0.42,
        roughness: 0.12,
        metalness: 0,
        transmission: 0.15,
        depthWrite: false,
      }),
      waterRing: new THREE.MeshBasicMaterial({ color: 0x9ce7ff, transparent: true, opacity: 0.48 }),
      impact: new THREE.MeshBasicMaterial({ color: 0xe47f63, transparent: true, opacity: 0.42 }),
      combatDust: new THREE.MeshBasicMaterial({ color: 0xb88a55, transparent: true, opacity: 0.32, depthWrite: false }),
      combatFlash: new THREE.MeshBasicMaterial({ color: 0xffa15c, transparent: true, opacity: 0.5, depthWrite: false }),
      combatRing: new THREE.MeshBasicMaterial({ color: 0xd96f58, transparent: true, opacity: 0.34, depthWrite: false }),
      trailFood: new THREE.MeshBasicMaterial({ color: 0xd9a63f, transparent: true, opacity: 0.2, depthWrite: false }),
      trailAlarm: new THREE.MeshBasicMaterial({ color: 0xd96f58, transparent: true, opacity: 0.24, depthWrite: false }),
      corpseMark: new THREE.MeshBasicMaterial({ color: 0x5b271f, transparent: true, opacity: 0.34, depthWrite: false }),
      trailRescue: new THREE.MeshBasicMaterial({ color: 0x51b7a6, transparent: true, opacity: 0.22, depthWrite: false }),
      trailWater: new THREE.MeshBasicMaterial({ color: 0x55aee0, transparent: true, opacity: 0.18, depthWrite: false }),
      earthworkTrail: new THREE.MeshBasicMaterial({ color: 0xb68b43, transparent: true, opacity: 0.3, depthWrite: false }),
      earthworkBarricade: new THREE.MeshBasicMaterial({ color: 0x8a6335, transparent: true, opacity: 0.28, depthWrite: false }),
      earthworkWall: new THREE.MeshBasicMaterial({ color: 0x6f4b29, transparent: true, opacity: 0.36, depthWrite: false }),
    };

    this.materials.antByState = {
      explore: this.materials.antDefault,
      return: new THREE.MeshStandardMaterial({ color: 0x2a1b0e, roughness: 0.72 }),
      panic: new THREE.MeshStandardMaterial({ color: 0x7f241a, roughness: 0.7 }),
      wet: new THREE.MeshStandardMaterial({ color: 0x174b63, roughness: 0.64 }),
      stunned: new THREE.MeshStandardMaterial({ color: 0x5b6261, roughness: 0.82 }),
      rescue: new THREE.MeshStandardMaterial({ color: 0x17645a, roughness: 0.7 }),
      flee: new THREE.MeshStandardMaterial({ color: 0x49332a, roughness: 0.78 }),
      clash: new THREE.MeshStandardMaterial({ color: 0x5f2f24, roughness: 0.76 }),
      rival: this.materials.antRival,
    };

    for (const geometry of Object.values(this.geometries)) this.sharedGeometries.add(geometry);
    for (const material of Object.values(this.materials)) {
      if (material && material.isMaterial) this.sharedMaterials.add(material);
    }
    for (const material of Object.values(this.materials.antByState)) this.sharedMaterials.add(material);
  }

  createWorld() {
    const hemi = new THREE.HemisphereLight(0xf8ead2, 0x21352e, 1.8);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffedc8, 2.2);
    sun.position.set(-48, 88, 42);
    sun.castShadow = this.quality.shadowQuality !== "off";
    if (sun.castShadow) {
      const mapSize = this.quality.shadowQuality === "medium" ? 1024 : 512;
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.camera.left = -145;
      sun.shadow.camera.right = 145;
      sun.shadow.camera.top = 145;
      sun.shadow.camera.bottom = -145;
      sun.shadow.camera.near = 20;
      sun.shadow.camera.far = 280;
      sun.shadow.bias = -0.00015;
    }
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(this.worldRadius + 12, 144), this.materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = this.quality.shadowQuality !== "off";
    this.scene.add(ground);
    this.sharedGeometries.add(ground.geometry);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(this.worldRadius + 2, 0.26, 8, 160),
      new THREE.MeshBasicMaterial({ color: 0x51412b, transparent: true, opacity: 0.46 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    this.scene.add(rim);
    this.sharedGeometries.add(rim.geometry);
    this.sharedMaterials.add(rim.material);

    this.seedTerrain();
    this.createNest();
  }

  seedTerrain() {
    const patches = [
      { kind: "damp", x: -74, z: 52, rx: 30, rz: 18, rotation: -0.42, speed: 0.78, material: this.materials.terrainDamp },
      { kind: "moss", x: -18, z: 76, rx: 34, rz: 19, rotation: 0.28, speed: 0.88, material: this.materials.terrainMoss },
      { kind: "leaf", x: 42, z: 55, rx: 38, rz: 23, rotation: -0.22, speed: 0.82, material: this.materials.terrainLeaf },
      { kind: "sand", x: 70, z: -18, rx: 40, rz: 22, rotation: 0.5, speed: 1.04, material: this.materials.terrainSand },
      { kind: "damp", x: 18, z: -70, rx: 32, rz: 18, rotation: -0.12, speed: 0.76, material: this.materials.terrainDamp },
      { kind: "leaf", x: -82, z: -42, rx: 34, rz: 21, rotation: 0.36, speed: 0.84, material: this.materials.terrainLeaf },
      { kind: "moss", x: 93, z: 34, rx: 22, rz: 14, rotation: 0.18, speed: 0.9, material: this.materials.terrainMoss },
      { kind: "sand", x: -12, z: -12, rx: 24, rz: 15, rotation: -0.56, speed: 1.02, material: this.materials.terrainSand },
    ];

    for (const patch of patches) this.createTerrainPatch(patch);
    this.seedTerrainBumps();
  }

  createTerrainPatch(patch) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), patch.material);
    mesh.rotation.set(-Math.PI / 2, 0, patch.rotation);
    mesh.position.set(patch.x, 0.004, patch.z);
    mesh.scale.set(patch.rx, patch.rz, 1);
    this.scene.add(mesh);
    this.sharedGeometries.add(mesh.geometry);
    this.terrain.push({
      kind: patch.kind,
      x: patch.x,
      z: patch.z,
      rx: patch.rx,
      rz: patch.rz,
      rotation: patch.rotation,
      cos: Math.cos(patch.rotation),
      sin: Math.sin(patch.rotation),
      speed: patch.speed,
      mesh,
    });
  }

  seedTerrainBumps() {
    const bumps = [
      { x: -86, z: 28, rx: 5.8, rz: 2.2, h: 0.55, rotation: -0.2 },
      { x: -70, z: -66, rx: 4.8, rz: 2.4, h: 0.48, rotation: 0.45 },
      { x: -36, z: 58, rx: 4.4, rz: 2.0, h: 0.42, rotation: -0.72 },
      { x: -4, z: -24, rx: 6.1, rz: 2.7, h: 0.5, rotation: 0.18 },
      { x: 22, z: 88, rx: 5.2, rz: 2.1, h: 0.45, rotation: -0.36 },
      { x: 46, z: 16, rx: 7.2, rz: 2.9, h: 0.58, rotation: 0.62 },
      { x: 66, z: -58, rx: 4.9, rz: 2.2, h: 0.44, rotation: -0.14 },
      { x: 88, z: 34, rx: 4.0, rz: 1.8, h: 0.38, rotation: 0.72 },
      { x: 104, z: -8, rx: 5.1, rz: 2.0, h: 0.46, rotation: -0.54 },
      { x: -108, z: -12, rx: 4.6, rz: 1.9, h: 0.36, rotation: 0.08 },
    ];
    for (const bump of bumps) this.addTerrainBump(bump);
  }

  addTerrainBump(bump) {
    const mesh = new THREE.Mesh(this.geometries.terrainBump, this.materials.terrainRise);
    mesh.position.set(bump.x, bump.h * 0.44, bump.z);
    mesh.scale.set(bump.rx, bump.h, bump.rz);
    mesh.rotation.set(0, bump.rotation, 0);
    mesh.castShadow = this.quality.shadowQuality !== "off";
    mesh.receiveShadow = this.quality.shadowQuality !== "off";
    this.scene.add(mesh);
    this.terrainBumps.push({ ...bump, mesh });
  }

  terrainSpeedAt(x, z) {
    let multiplier = 1;
    for (const patch of this.terrain) {
      const dx = x - patch.x;
      const dz = z - patch.z;
      const localX = dx * patch.cos + dz * patch.sin;
      const localZ = -dx * patch.sin + dz * patch.cos;
      const normalized = (localX * localX) / (patch.rx * patch.rx) + (localZ * localZ) / (patch.rz * patch.rz);
      if (normalized >= 1) continue;
      const influence = (1 - normalized) * 0.75;
      multiplier *= 1 + (patch.speed - 1) * influence;
    }
    return clamp(multiplier, 0.64, 1.12);
  }

  earthworkProductionBonus() {
    let bonus = 0;
    for (const earthwork of this.earthworks ?? []) {
      if (earthwork.kind === "trailReinforce" && earthwork.strength > 0.95) bonus += 0.012;
    }
    return clamp(bonus, 0, 0.08);
  }

  earthworkSpeedAt(x, z, variant = "worker") {
    let multiplier = 1;
    for (const earthwork of this.earthworks ?? []) {
      if (earthwork.kind !== "trailReinforce" || earthwork.strength <= 0) continue;
      const d = distance2(x, z, earthwork.x, earthwork.z);
      if (d >= earthwork.radius) continue;
      const influence = (1 - d / earthwork.radius) * earthwork.strength;
      const variantBonus = variant === "builder" ? 0.11 : 0.07;
      multiplier *= 1 + variantBonus * influence;
    }
    return clamp(multiplier, 1, 1.16);
  }

  rivalSpeedAt(x, z) {
    let multiplier = 1;
    let hasWallInfluence = false;
    for (const earthwork of this.earthworks ?? []) {
      const def = getConstructionDef(earthwork.kind);
      if (def.enemySlowStrength <= 0 || earthwork.strength <= 0) continue;
      const d = distance2(x, z, earthwork.x, earthwork.z);
      if (d >= earthwork.radius) continue;
      if (earthwork.kind === "earthWall") hasWallInfluence = true;
      multiplier *= 1 - def.enemySlowStrength * (1 - d / earthwork.radius) * earthwork.strength;
    }
    return clamp(multiplier, hasWallInfluence ? 0.68 : 0.78, 1);
  }

  braceBonusAt(x, z) {
    let bonus = 0;
    let hasWallInfluence = false;
    for (const earthwork of this.earthworks ?? []) {
      const def = getConstructionDef(earthwork.kind);
      if (def.braceBonus <= 0 || earthwork.strength <= 0) continue;
      const d = distance2(x, z, earthwork.x, earthwork.z);
      if (d < earthwork.radius) {
        if (earthwork.kind === "earthWall") hasWallInfluence = true;
        bonus += def.braceBonus * (1 - d / earthwork.radius) * earthwork.strength;
      }
    }
    return clamp(bonus, 0, hasWallInfluence ? 0.62 : 0.45);
  }

  ensureBuildTasks() {
    this.buildTasks = this.buildTasks.filter((task) => task.progress < task.maxProgress);
    this.cleanupBuildTaskAssignments();
  }

  activeBuildTasks() {
    return this.buildTasks.filter((task) => task.progress < task.maxProgress);
  }

  availableBuilderSlotsForNewConstruction() {
    const builders = this.computeDerived().builders ?? 0;
    const activeTasks = this.activeBuildTasks();
    return Math.max(0, builders - activeTasks.length);
  }

  canStartConstruction(kind) {
    if (!isConstructionKind(kind)) return { ok: false, reason: "不明な土木工事" };
    const def = getConstructionDef(kind);
    const d = this.computeDerived();
    if ((d.builders ?? 0) <= 0) return { ok: false, reason: "土木アリがいない" };
    if (this.buildTasks.some((task) => task.kind === kind && task.progress < task.maxProgress)) {
      return { ok: false, reason: "同じ作業が進行中" };
    }
    const completedSameKind = this.earthworks.filter((earthwork) => earthwork.kind === kind && earthwork.strength > 0.82).length;
    if (completedSameKind >= def.completedLimit) return { ok: false, reason: "作れる場所が埋まっている" };
    if (def.requiresHeavySoldier && (d.heavySoldiers ?? 0) <= 0) return { ok: false, reason: "重兵装アリがいない" };
    if (this.availableBuilderSlotsForNewConstruction() <= 0) return { ok: false, reason: "待機中の土木アリがいない" };
    return { ok: true, reason: "" };
  }

  startConstruction(kind) {
    const def = getConstructionDef(kind);
    const checked = this.canStartConstruction(kind);
    if (!checked.ok) {
      this.constructionMessage = checked.reason;
      this.updateStats();
      return false;
    }
    const target = this.constructionTarget(kind);
    const task = this.createBuildTask(kind, target.x, target.z, target);
    this.constructionMessage = def.startMessage;
    this.pushLog(def.startLog);
    this.syncEarthworksToColony();
    this.updateStats();
    this.saveColony();
    return Boolean(task);
  }

  constructionTarget(kind) {
    if (kind === "trailReinforce") {
      const def = getConstructionDef(kind);
      const foodTrail = this.findStrongestTrail("food", this.nest.x, this.nest.z, 96);
      const x = foodTrail ? foodTrail.x : this.nest.x + this.nest.radius + 17;
      const z = foodTrail ? foodTrail.z : this.nest.z + 7;
      const angle = Math.atan2(z - this.nest.z, x - this.nest.x);
      return { x, z, radius: def.targetRadius, maxProgress: def.buildCost, rotation: angle };
    }
    const def = getConstructionDef(kind);
    const raid = this.ensureRaidState();
    let point;
    if (raid.phase === "warning" || raid.phase === "active" || raid.phase === "retreating") {
      point = this.raidSignalPoint(raid, 0.36);
    } else {
      const threat = this.findRivalThreat(this.nest.x, this.nest.z, 96);
      point = threat ? { x: threat.x, z: threat.z } : { x: this.nest.x + this.nest.radius * 1.45, z: this.nest.z - this.nest.radius * 0.2 };
    }
    const angle = Math.atan2(point.z - this.nest.z, point.x - this.nest.x);
    return {
      x: this.nest.x + Math.cos(angle) * (this.nest.radius + 9.5),
      z: this.nest.z + Math.sin(angle) * (this.nest.radius + 9.5),
      radius: def.targetRadius,
      maxProgress: def.buildCost,
      rotation: angle,
    };
  }

  createBuildTask(kind, x, z, options = {}) {
    const constructionKind = normalizeConstructionKind(kind);
    const def = getConstructionDef(constructionKind);
    const id = this.colony.nextEarthworkId ?? 1;
    this.colony.nextEarthworkId = id + 1;
    const radius = options.radius ?? def.defaultRadius;
    const maxProgress = options.maxProgress ?? def.buildCost;
    const earthwork = this.addEarthwork({ id, kind: constructionKind, x, z, radius, progress: 0, maxProgress, owner: "colony", rotation: options.rotation ?? 0 });
    const task = {
      id: earthwork.id,
      kind: earthwork.kind,
      x: earthwork.x,
      z: earthwork.z,
      radius: earthwork.radius,
      progress: earthwork.progress,
      maxProgress: earthwork.maxProgress,
      owner: earthwork.owner,
      rotation: earthwork.rotation,
      claimedBy: null,
      claimedByIds: [],
    };
    this.buildTasks.push(task);
    this.syncEarthworksToColony();
    return task;
  }

  addEarthwork(config) {
    const material =
      config.kind === "earthWall" ? this.materials.earthworkWall.clone() :
      config.kind === "lowBarricade" ? this.materials.earthworkBarricade.clone() :
      this.materials.earthworkTrail.clone();
    const group = new THREE.Group();
    group.position.set(config.x, 0, config.z);
    group.rotation.y = config.rotation ?? 0;
    const mesh = new THREE.Mesh(this.geometries.trailCircle, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, config.kind === "earthWall" ? 0.14 : config.kind === "lowBarricade" ? 0.075 : 0.05, 0);
    if (config.kind === "earthWall") mesh.scale.set(config.radius * 1.08, config.radius * 0.5, 1);
    else if (config.kind === "lowBarricade") mesh.scale.set(config.radius * 0.95, config.radius * 0.28, 1);
    else mesh.scale.set(config.radius * 1.35, config.radius * 0.36, 1);
    mesh.visible = false;
    group.add(mesh);
    const details = this.createEarthworkDetails(config.kind, config.radius);
    for (const detail of details) group.add(detail.mesh);
    this.scene.add(group);
    this.dynamicObjects.add(group);
    const earthwork = {
      id: config.id,
      kind: config.kind,
      x: config.x,
      z: config.z,
      radius: config.radius,
      strength: config.strength ?? 0,
      progress: config.progress ?? 0,
      maxProgress: config.maxProgress ?? 1,
      owner: config.owner ?? "colony",
      rotation: config.rotation ?? 0,
      group,
      mesh,
      details,
    };
    this.earthworks.push(earthwork);
    return earthwork;
  }

  createEarthworkDetails(kind, radius) {
    const details = [];
    if (kind === "earthWall") {
      const count = 46;
      for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const lane = i % 4;
        const localX = (t - 0.5) * radius * 1.95 + Math.sin(i * 1.21) * 0.38;
        const localZ = (lane - 1.5) * radius * 0.13 + Math.cos(i * 0.77) * 0.22;
        const scale = 0.28 + (lane % 3) * 0.045 + (i % 5) * 0.018;
        const mesh = new THREE.Mesh(this.geometries.soilPebble, this.materials.nestLoose);
        mesh.position.set(localX, 0.2 + lane * 0.055 + scale * 0.24, localZ);
        mesh.scale.set(scale * 1.35, scale * 0.9, scale * 1.05);
        mesh.rotation.set(Math.sin(i * 0.9) * 0.22, (i * 1.67) % Math.PI, Math.cos(i * 1.1) * 0.18);
        mesh.castShadow = this.quality.shadowQuality !== "off";
        mesh.receiveShadow = this.quality.shadowQuality !== "off";
        mesh.visible = false;
        details.push({ mesh, threshold: 0.05 + t * 0.88 });
      }
      return details;
    }
    if (kind === "lowBarricade") {
      const count = 26;
      for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const arc = -1.18 + t * 2.36;
        const lane = i % 3;
        const localX = Math.sin(arc) * radius * (0.78 + lane * 0.035);
        const localZ = Math.cos(arc) * radius * 0.32 + (lane - 1) * 0.34;
        const scale = 0.28 + (i % 5) * 0.035;
        const mesh = new THREE.Mesh(this.geometries.soilPebble, this.materials.nestLoose);
        mesh.position.set(localX, 0.12 + scale * 0.18, localZ);
        mesh.scale.set(scale * 1.15, scale * 0.7, scale);
        mesh.rotation.set(Math.sin(i * 1.3) * 0.32, (i * 2.17) % Math.PI, Math.cos(i * 0.9) * 0.28);
        mesh.castShadow = this.quality.shadowQuality !== "off";
        mesh.receiveShadow = this.quality.shadowQuality !== "off";
        mesh.visible = false;
        details.push({ mesh, threshold: 0.08 + t * 0.86 });
      }
      return details;
    }
    const count = 30;
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const side = i % 2 === 0 ? -1 : 1;
      const localX = (t - 0.5) * radius * 2.15 + Math.sin(i * 1.7) * 0.42;
      const localZ = side * (radius * 0.26 + (i % 4) * 0.11);
      const scale = 0.16 + (i % 4) * 0.03;
      const mesh = new THREE.Mesh(this.geometries.soilPebble, this.materials.nestLoose);
      mesh.position.set(localX, 0.06 + scale * 0.12, localZ);
      mesh.scale.set(scale * 1.15, scale * 0.46, scale * 0.9);
      mesh.rotation.set(Math.sin(i * 0.8) * 0.16, (i * 1.91) % Math.PI, Math.cos(i * 1.2) * 0.12);
      mesh.castShadow = this.quality.shadowQuality !== "off";
      mesh.receiveShadow = this.quality.shadowQuality !== "off";
      mesh.visible = false;
      details.push({ mesh, threshold: 0.04 + t * 0.9 });
    }
    return details;
  }

  normalizeBuildTaskClaims(task) {
    if (!task) return [];
    if (!Array.isArray(task.claimedByIds)) task.claimedByIds = task.claimedBy == null ? [] : [task.claimedBy];
    task.claimedByIds = task.claimedByIds.filter((id, index, ids) => Number.isFinite(id) && ids.indexOf(id) === index);
    task.claimedBy = task.claimedByIds[0] ?? null;
    return task.claimedByIds;
  }

  buildTaskAssigneeLimit() {
    const builders = this.computeDerived().builders ?? 0;
    return Math.max(1, Math.min(BUILD_TASK_ASSIGNEE_CAP, builders || BUILD_TASK_ASSIGNEE_CAP));
  }

  cleanupBuildTaskAssignments() {
    const builderTaskIds = new Map();
    for (const ant of this.ants) {
      if (ant.variant === "builder" && ant.buildTaskId != null) builderTaskIds.set(ant.id, ant.buildTaskId);
    }
    for (const task of this.buildTasks) {
      const ids = this.normalizeBuildTaskClaims(task);
      task.claimedByIds = ids.filter((id) => builderTaskIds.get(id) === task.id);
      task.claimedBy = task.claimedByIds[0] ?? null;
    }
  }

  releaseBuildTask(ant) {
    const task = this.buildTasks.find((item) => item.id === ant.buildTaskId);
    if (task) {
      const ids = this.normalizeBuildTaskClaims(task);
      task.claimedByIds = ids.filter((id) => id !== ant.id);
      task.claimedBy = task.claimedByIds[0] ?? null;
    }
    ant.buildTaskId = null;
    ant.carryingSoil = false;
  }

  claimBuildTask(ant) {
    this.cleanupBuildTaskAssignments();
    const limit = this.buildTaskAssigneeLimit();
    let task = this.buildTasks.find((item) => item.id === ant.buildTaskId && item.progress < item.maxProgress);
    if (task) {
      const ids = this.normalizeBuildTaskClaims(task);
      const underfilled = this.buildTasks
        .filter((item) => item !== task && item.progress < item.maxProgress)
        .map((item) => ({ task: item, ids: this.normalizeBuildTaskClaims(item) }))
        .filter((item) => item.ids.length < Math.min(limit, ids.length - 1))
        .sort((a, b) => a.ids.length - b.ids.length)[0];
      if (underfilled && ids.includes(ant.id)) {
        task.claimedByIds = ids.filter((id) => id !== ant.id);
        task.claimedBy = task.claimedByIds[0] ?? null;
        ant.buildTaskId = null;
        task = null;
      } else if (!ids.includes(ant.id) && ids.length < limit) {
        ids.push(ant.id);
      }
    }
    if (task) {
      const ids = this.normalizeBuildTaskClaims(task);
      if (ids.includes(ant.id)) {
        task.claimedBy = ids[0] ?? null;
        return task;
      }
      ant.buildTaskId = null;
    }
    task = this.buildTasks
      .filter((item) => {
        if (item.progress >= item.maxProgress) return false;
        const ids = this.normalizeBuildTaskClaims(item);
        return ids.includes(ant.id) || ids.length < limit;
      })
      .sort((a, b) => {
        const aIds = this.normalizeBuildTaskClaims(a);
        const bIds = this.normalizeBuildTaskClaims(b);
        const assigneeDelta = aIds.length - bIds.length;
        if (assigneeDelta) return assigneeDelta;
        return distance2(ant.x, ant.z, a.x, a.z) - distance2(ant.x, ant.z, b.x, b.z);
      })[0];
    if (!task) {
      ant.buildTaskId = null;
      return null;
    }
    const ids = this.normalizeBuildTaskClaims(task);
    if (!ids.includes(ant.id)) ids.push(ant.id);
    task.claimedBy = ids[0] ?? null;
    ant.buildTaskId = task.id;
    return task;
  }

  progressBuildTask(task, ant, amount) {
    if (!task || amount <= 0) return;
    task.progress = clamp(task.progress + amount, 0, task.maxProgress);
    const earthwork = this.earthworks.find((item) => item.id === task.id);
    if (earthwork) {
      earthwork.progress = task.progress;
      earthwork.strength = clamp(task.progress / task.maxProgress, 0, 1);
    }
    if (task.progress >= task.maxProgress) {
      const def = getConstructionDef(task.kind);
      task.claimedByIds = [];
      task.claimedBy = null;
      for (const builder of this.ants) {
        if (builder.buildTaskId === task.id) {
          builder.buildTaskId = null;
          builder.carryingSoil = false;
        }
      }
      this.constructionMessage = def.completeMessage;
      this.pushLog(def.completeLog);
    }
    this.syncEarthworksToColony();
  }

  updateEarthworks() {
    for (const earthwork of this.earthworks ?? []) {
      if (!earthwork.mesh) continue;
      earthwork.strength = clamp(earthwork.progress / Math.max(earthwork.maxProgress, 0.001), 0, 1);
      earthwork.mesh.visible = earthwork.strength > 0.02;
      earthwork.mesh.material.opacity = (earthwork.kind === "earthWall" ? 0.36 : earthwork.kind === "lowBarricade" ? 0.28 : 0.3) * Math.max(0.15, earthwork.strength);
      const scale = 0.78 + earthwork.strength * 0.22;
      if (earthwork.kind === "earthWall") earthwork.mesh.scale.set(earthwork.radius * 1.08 * scale, earthwork.radius * 0.5 * scale, 1);
      else if (earthwork.kind === "lowBarricade") earthwork.mesh.scale.set(earthwork.radius * 0.95 * scale, earthwork.radius * 0.28 * scale, 1);
      else earthwork.mesh.scale.set(earthwork.radius * 1.35 * scale, earthwork.radius * 0.36 * scale, 1);
      for (const detail of earthwork.details ?? []) {
        detail.mesh.visible = earthwork.strength >= detail.threshold;
      }
    }
    this.buildTasks = this.buildTasks.filter((task) => task.progress < task.maxProgress);
  }

  serializeEarthworks() {
    return (this.earthworks ?? []).map((earthwork) => ({
      id: earthwork.id,
      kind: earthwork.kind,
      x: earthwork.x,
      z: earthwork.z,
      radius: earthwork.radius,
      progress: earthwork.progress,
      maxProgress: earthwork.maxProgress,
      rotation: earthwork.rotation ?? 0,
      owner: "colony",
    }));
  }

  syncEarthworksToColony() {
    if (!this.colony) return;
    this.colony.earthworks = this.serializeEarthworks();
  }

  restoreEarthworksFromState() {
    for (const record of this.colony.earthworks ?? []) {
      const earthwork = this.addEarthwork(record);
      if (earthwork.progress < earthwork.maxProgress) {
        this.buildTasks.push({
          id: earthwork.id,
          kind: earthwork.kind,
          x: earthwork.x,
          z: earthwork.z,
          radius: earthwork.radius,
          progress: earthwork.progress,
          maxProgress: earthwork.maxProgress,
          owner: earthwork.owner,
          rotation: earthwork.rotation ?? 0,
          claimedBy: null,
          claimedByIds: [],
        });
      }
    }
    this.updateEarthworks();
  }

  findStrongestTrail(kind, x, z, radius) {
    let best = null;
    let bestScore = 0;
    for (const trail of this.trails) {
      if (trail.kind !== kind) continue;
      const d = distance2(x, z, trail.x, trail.z);
      if (d > radius) continue;
      const score = trail.life * (1 - d / radius);
      if (score > bestScore) {
        best = trail;
        bestScore = score;
      }
    }
    return best;
  }

  findNearestVariant(x, z, variant, exclude = null) {
    let best = null;
    let bestDistance = Infinity;
    for (const ant of this.ants) {
      if (ant === exclude || ant.variant !== variant) continue;
      if (!this.shouldRenderAnt(ant)) continue;
      const d = distance2(x, z, ant.x, ant.z);
      if (d < bestDistance) {
        best = ant;
        bestDistance = d;
      }
    }
    return best;
  }

  createNest() {
    const mainHole = new THREE.Group();
    mainHole.position.set(this.nest.x, 0.035, this.nest.z);
    const shadow = new THREE.Mesh(this.geometries.trailCircle, this.materials.nestDark);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(this.nest.radius * 0.78 * NEST_HOLE_DIAMETER_SCALE, this.nest.radius * 0.52 * NEST_HOLE_DIAMETER_SCALE, 1);
    shadow.position.y = 0.012;
    mainHole.add(shadow);
    const rim = new THREE.Mesh(this.geometries.nestRim, this.materials.nestRim);
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(this.nest.radius * 0.86 * NEST_HOLE_DIAMETER_SCALE, this.nest.radius * 0.58 * NEST_HOLE_DIAMETER_SCALE, 1);
    rim.position.y = 0.055;
    rim.castShadow = this.quality.shadowQuality !== "off";
    rim.receiveShadow = this.quality.shadowQuality !== "off";
    mainHole.add(rim);
    this.scene.add(mainHole);
    this.nestMound = mainHole;
    this.nestEntrances = [];
    this.nestSpoils = [];
    this.nestHoles = this.nestEntrances;

    const entrances = [
      { angle: -0.45, distance: 0.12, y: 0.04, rx: 3.0, ry: 1.25, tilt: -Math.PI / 2, spoils: 12 },
      { angle: 1.02, distance: 0.54, y: 0.045, rx: 1.18, ry: 0.52, tilt: -Math.PI / 2, spoils: 6 },
      { angle: 2.55, distance: 0.5, y: 0.045, rx: 1.02, ry: 0.46, tilt: -Math.PI / 2, spoils: 5 },
      { angle: 3.76, distance: 0.38, y: 0.045, rx: 0.82, ry: 0.38, tilt: -Math.PI / 2, spoils: 4 },
    ];
    for (const entrance of entrances) this.createNestEntrance(entrance);
    this.updateColonyVisuals();
  }

  createNestEntrance(config) {
    const radial = this.nest.radius * config.distance;
    const x = this.nest.x + Math.cos(config.angle) * radial;
    const z = this.nest.z + Math.sin(config.angle) * radial;
    const group = new THREE.Group();
    group.position.set(x, config.y, z);
    group.rotation.y = -config.angle;
    group.userData.base = { ...config, radial };
    group.userData.angle = config.angle;

    const shadow = new THREE.Mesh(this.geometries.trailCircle, this.materials.nestDark);
    shadow.rotation.x = config.tilt;
    shadow.scale.set(config.rx * NEST_HOLE_DIAMETER_SCALE, config.ry * NEST_HOLE_DIAMETER_SCALE, 1);
    shadow.position.y = 0.008;
    group.add(shadow);

    const rim = new THREE.Mesh(this.geometries.nestRim, this.materials.nestRim);
    rim.rotation.x = config.tilt;
    rim.scale.set(config.rx * 1.1 * NEST_HOLE_DIAMETER_SCALE, config.ry * 1.04 * NEST_HOLE_DIAMETER_SCALE, 1);
    rim.position.y = 0.045;
    rim.castShadow = this.quality.shadowQuality !== "off";
    rim.receiveShadow = this.quality.shadowQuality !== "off";
    group.add(rim);

    this.scene.add(group);
    this.nestEntrances.push(group);

    for (let i = 0; i < config.spoils; i += 1) {
      const spread = 0.7 + (i % 4) * 0.38 + Math.floor(i / 4) * 0.22;
      const offset = (i - (config.spoils - 1) * 0.5) * 0.18;
      const a = config.angle + offset;
      this.addNestSpoil(
        this.nest.x + Math.cos(config.angle) * (radial + config.rx * 0.58 + spread) + Math.cos(a + Math.PI / 2) * offset * 2.3,
        this.nest.z + Math.sin(config.angle) * (radial + config.rx * 0.58 + spread) + Math.sin(a + Math.PI / 2) * offset * 2.3,
        0.16 + (i % 3) * 0.04,
      );
    }
  }

  addNestSpoil(x, z, scale) {
    const pebble = new THREE.Mesh(this.geometries.soilPebble, this.materials.nestLoose);
    pebble.position.set(x, 0.16 + scale * 0.32, z);
    pebble.scale.setScalar(scale);
    pebble.rotation.set(rand(-0.4, 0.4), rand(0, Math.PI), rand(-0.3, 0.3));
    pebble.castShadow = this.quality.shadowQuality !== "off";
    pebble.receiveShadow = this.quality.shadowQuality !== "off";
    pebble.userData.base = { x, z, scale };
    this.scene.add(pebble);
    this.nestSpoils.push(pebble);
  }

  bindEvents() {
    this.boundResize = () => this.resize();
    this.boundPageHide = () => {
      this.saveColony();
      this.dispose();
    };
    window.addEventListener("resize", this.boundResize);
    window.addEventListener("pagehide", this.boundPageHide, { once: true });
    this.setPanelCompact(this.panelCompact, false);
    this.bindPanelGestures();

    ui.buttons.forEach((button) => {
      button.addEventListener("click", () => {
        this.setActiveTab(button.dataset.tab);
      });
    });

    ui.pause.addEventListener("click", () => {
      this.paused = !this.paused;
      ui.pause.classList.toggle("is-paused", this.paused);
      ui.pause.title = this.paused ? "再開" : "一時停止";
      ui.pause.setAttribute("aria-label", ui.pause.title);
    });

    ui.reset.addEventListener("click", () => this.reset(true));
    ui.upgradeList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-upgrade]");
      if (!button) return;
      event.preventDefault();
      this.buyUpgrade(button.dataset.upgrade);
    });
    ui.soldierSortieBtn.addEventListener("click", () => this.startSoldierSortie());
    ui.constructionTrailBtn?.addEventListener("click", () => this.startConstruction("trailReinforce"));
    ui.constructionBarricadeBtn?.addEventListener("click", () => this.startConstruction("lowBarricade"));
    ui.constructionWallBtn?.addEventListener("click", () => this.startConstruction("earthWall"));

    const canvas = this.renderer.domElement;
    this.input = new InputManager(this, canvas);
  }

  setActiveTab(tab) {
    this.activeTab = tab === "soldiers" || tab === "construction" ? tab : "growth";
    ui.buttons.forEach((item) => item.classList.toggle("active", item.dataset.tab === this.activeTab));
    ui.growthTab.classList.toggle("active", this.activeTab === "growth");
    ui.constructionTab?.classList.toggle("active", this.activeTab === "construction");
    ui.soldierTab.classList.toggle("active", this.activeTab === "soldiers");
  }

  bindPanelGestures() {
    if (!ui.panelGrip) return;
    this.boundPanelPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      this.panelDrag = {
        id: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
      };
      try {
        ui.panelGrip.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events in tests may not own a real pointer capture.
      }
    };
    this.boundPanelPointerMove = (event) => {
      if (!this.panelDrag || this.panelDrag.id !== event.pointerId) return;
      event.preventDefault();
      this.panelDrag.lastY = event.clientY;
    };
    this.boundPanelPointerUp = (event) => {
      if (!this.panelDrag || this.panelDrag.id !== event.pointerId) return;
      event.preventDefault();
      const deltaY = this.panelDrag.lastY - this.panelDrag.startY;
      this.panelDrag = null;
      if (deltaY > 28) this.setPanelCompact(true);
      else if (deltaY < -28) this.setPanelCompact(false);
      else this.setPanelCompact(!this.panelCompact);
    };
    ui.panelGrip.addEventListener("pointerdown", this.boundPanelPointerDown, { passive: false });
    ui.panelGrip.addEventListener("pointermove", this.boundPanelPointerMove, { passive: false });
    ui.panelGrip.addEventListener("pointerup", this.boundPanelPointerUp, { passive: false });
    ui.panelGrip.addEventListener("pointercancel", this.boundPanelPointerUp, { passive: false });
  }

  setPanelCompact(compact, persist = true) {
    this.panelCompact = Boolean(compact);
    ui.empirePanel?.classList.toggle("is-compact", this.panelCompact);
    ui.panelGrip?.setAttribute("aria-expanded", String(!this.panelCompact));
    ui.panelGrip?.setAttribute("aria-label", this.panelCompact ? "管理パネルを広げる" : "管理パネルを小さくする");
    if (persist) writeStorage("ant3d.panelCompact", this.panelCompact ? "1" : "0");
  }

  reset(newGame = true) {
    for (const list of [this.water, this.stones, this.food, this.branches, this.trails, this.buildTasks, this.earthworks, this.combatEffects, this.predators, this.rivalCorpses, this.colonyCorpses]) {
      for (const item of list) this.disposeDynamicItem(item);
    }
    this.dynamicObjects.clear();
    this.ants = [];
    this.water = [];
    this.stones = [];
    this.food = [];
    this.branches = [];
    this.trails = [];
    this.buildTasks = [];
    this.earthworks = [];
    this.combatEffects = [];
    this.predators = [];
    this.rivalCorpses = [];
    this.colonyCorpses = [];
    for (const rival of this.rivalAnts) this.antRenderer?.releaseRenderObject(rival);
    this.rivalAnts = [];
    this.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };
    this.constructionMessage = "待機";
    this.renderAntBuffer.length = 0;
    this.soldierSortieCooldown = 0;
    this.sortieRetireQueue = [];
    this.antRenderer?.beginFrame();
    this.antRenderer?.endFrame();
    this.collectedFood = 0;
    this.nextFoodId = 1;
    this.nextAntId = 1;
    this.selectedAnt = null;
    if (newGame) {
      this.colony = createDefaultColony();
      this.saveColony();
    }
    this.ensureRaidState();
    this.seedNaturalEnvironment();
    this.restoreEarthworksFromState();
    this.syncAntPopulation();
    this.updateColonyVisuals();
    this.renderUpgrades();
    this.updateStats();
  }

  activateRaidSoonMode() {
    const raid = this.ensureRaidState();
    if (raid.phase === "calm") raid.timer = Math.min(Math.max(0.2, raid.timer), RAID_SOON_CALM_SECONDS);
    else if (raid.phase === "warning") raid.timer = Math.min(Math.max(0.2, raid.timer), RAID_SOON_WARNING_SECONDS);
    else if (raid.phase === "recovering") raid.timer = Math.min(Math.max(0.2, raid.timer), RAID_SOON_CALM_SECONDS);
    this.updateStats();
  }

  computeDerived() {
    const derived = computeDerivedColony(this.colony, {
      earthworkProductionBonus: this.earthworkProductionBonus(),
    });
    this.colony.soldierAnts = derived.soldierAnts;
    this.colony.heavySoldierAnts = derived.heavySoldiers;
    this.colony.builderAnts = derived.builders;
    this.colony.attackPower = derived.attackPower;
    this.colony.defensePower = derived.defensePower;
    this.derived = derived;
    return this.derived;
  }

  updateColony(dt) {
    const d = this.computeDerived();

    if (this.colony.antPopulation < d.capacity && this.colony.food >= d.antCost) {
      this.colony.hatchProgress += d.growthPerSecond * dt;
      while (this.colony.hatchProgress >= 1 && this.colony.antPopulation < d.capacity && this.colony.food >= d.antCost) {
        this.colony.hatchProgress -= 1;
        this.colony.food -= d.antCost;
        this.colony.antPopulation += 1;
      }
    } else if (this.colony.antPopulation >= d.capacity) {
      this.colony.hatchProgress = Math.min(this.colony.hatchProgress, 0.96);
    }

    const nextDerived = this.computeDerived();
    if (this.colony.soldierAnts < nextDerived.soldierTarget && this.colony.food > nextDerived.antCost * 1.4) {
      this.colony.soldierAnts += 1;
      this.colony.food -= 2.5;
    }
    if (this.colony.heavySoldierAnts < nextDerived.heavyTarget && this.colony.food > nextDerived.antCost * 2.2) {
      this.colony.heavySoldierAnts += 1;
      this.colony.food -= 4.5;
    }
    if (this.colony.builderAnts < nextDerived.builderTarget && this.colony.food > nextDerived.antCost * 1.35) {
      this.colony.builderAnts += 1;
      this.colony.food -= 2;
    }

    if (this.colony.woundedAnts > 0) {
      const healed = nextDerived.recoveryPerSecond * dt;
      this.colony.woundedAnts = Math.max(0, this.colony.woundedAnts - healed);
    }
    if (nextDerived.upkeepPerSecond > 0) {
      this.colony.food = Math.max(0, this.colony.food - nextDerived.upkeepPerSecond * dt);
    }

    this.colony.enemyThreat += dt * (0.0014 + this.colony.territory * 0.00022) * nextDerived.threatGrowthMultiplier;
    this.autoLevelNest();
    this.syncAntPopulation();

    this.saveTimer += dt;
    if (this.saveTimer > 3) {
      this.saveColony();
      this.saveTimer = 0;
    }
  }

  autoLevelNest() {
    let leveled = false;
    while (
      this.colony.antPopulation >= 10 + this.colony.nestLevel * 9 &&
      this.colony.lifetimeFood >= 80 + this.colony.nestLevel * 120
    ) {
      this.colony.nestLevel += 1;
      this.colony.food += 10 + this.colony.nestLevel * 3;
      leveled = true;
    }
    if (leveled) {
      this.pushLog(`巣がLv${this.colony.nestLevel}に拡張した`);
      this.updateColonyVisuals();
    }
  }

  syncAntPopulation() {
    const d = this.computeDerived();
    const deployed = this.deployedSoldierCount();
    const homeTarget = Math.floor(clamp(d.workers + d.builders, 1, Math.max(1, DISPLAY_ANT_CAP - deployed)));
    const target = Math.floor(clamp(homeTarget + deployed, 1, DISPLAY_ANT_CAP));
    for (const ant of this.ants) {
      if (ant.role === "guard" && !ant.isSortieSoldier && ant.variant !== "soldier" && ant.variant !== "heavySoldier") ant.role = "worker";
    }
    while (this.ants.length < target) this.ants.push(new Ant3D(this.nextAntId++, this));
    while (this.ants.length > target) {
      let removeIndex = -1;
      for (let i = this.ants.length - 1; i >= 0; i -= 1) {
        const ant = this.ants[i];
        if (!ant.isSortieSoldier && !ant.wounded && ant.state !== "flee") {
          removeIndex = i;
          break;
        }
      }
      if (removeIndex < 0) break;
      const [removed] = this.ants.splice(removeIndex, 1);
      this.antRenderer?.releaseRenderObject(removed);
    }
    const counts = {
      heavySoldier: 0,
      soldier: 0,
      builder: d.builders,
      worker: Math.max(0, homeTarget - d.builders),
    };
    let homeIndex = 0;
    for (const ant of this.ants) {
      const nextVariant = ant.isSortieSoldier ? ant.variant : this.variantForIndex(homeIndex, counts);
      if (ant.variant === "builder" && nextVariant !== "builder") this.releaseBuildTask(ant);
      if (ant.isSortieSoldier) {
        ant.role = "guard";
        continue;
      }
      ant.setVariant(nextVariant);
      if (nextVariant === "builder" && ant.buildTaskId == null && !ant.carryingSoil) this.dockBuilderInNest(ant);
      homeIndex += 1;
    }
  }

  nestExitPoint(ant, radiusScale = 0.76) {
    const entrance = this.nestEntrances?.[(ant.id - 1) % Math.max(1, this.nestEntrances.length)];
    const base = entrance?.userData?.base;
    const angle = base?.angle ?? ant.nestExitAngle ?? ((ant.id * 2.399) % (Math.PI * 2));
    const radial = base?.radial ?? this.nest.radius * 0.42;
    const radius = Math.max(this.nest.radius * radiusScale, radial + 1.2);
    return {
      x: this.nest.x + Math.cos(angle) * radius,
      z: this.nest.z + Math.sin(angle) * radius,
      angle,
    };
  }

  enterNest(ant, staySeconds = NEST_STAY_SECONDS) {
    if (!ant) return;
    ant.inNest = true;
    ant.nestStayTimer = Math.max(ant.nestStayTimer ?? 0, staySeconds);
    ant.nestExitAngle = Math.atan2(ant.z - this.nest.z, ant.x - this.nest.x);
    ant.carrying = 0;
    ant.carryingSoil = false;
    ant.foodSourceId = null;
    ant.vx = 0;
    ant.vz = 0;
    ant.energy = 1;
    ant.homeTimer = 0;
    ant.lastTacticalAction = "inNest";
    ant.setState("explore");
    this.holdAntInNest(ant);
  }

  holdAntInNest(ant) {
    if (!ant) return;
    const angle = ant.nestExitAngle ?? ((ant.id * 2.399) % (Math.PI * 2));
    const radius = this.nest.radius * (0.12 + (ant.id % 5) * 0.035);
    const x = this.nest.x + Math.cos(angle) * radius;
    const z = this.nest.z + Math.sin(angle) * radius;
    ant.inNest = true;
    ant.x = x;
    ant.z = z;
    ant.prevX = x;
    ant.prevZ = z;
    ant.vx = 0;
    ant.vz = 0;
    ant.gaitPhase = (ant.gaitPhase + 0.03) % (Math.PI * 2);
  }

  releaseAntFromNest(ant) {
    if (!ant) return;
    const point = this.nestExitPoint(ant);
    ant.inNest = false;
    ant.nestStayTimer = 0;
    ant.x = point.x;
    ant.z = point.z;
    ant.prevX = point.x;
    ant.prevZ = point.z;
    ant.angle = point.angle + Math.PI * 0.5;
    ant.prevAngle = ant.angle;
    ant.vx = 0;
    ant.vz = 0;
    ant.homeTimer = 0;
    ant.lastTacticalAction = ant.variant === "builder" && ant.buildTaskId != null ? "leaveNestForBuild" : "leaveNest";
    ant.setState("explore");
  }

  dockBuilderInNest(ant) {
    if (!ant || ant.variant !== "builder") return;
    this.releaseBuildTask(ant);
    ant.inNest = true;
    ant.nestExitAngle = (ant.id * 2.399 + this.colony.nestLevel * 0.31) % (Math.PI * 2);
    ant.vx = 0;
    ant.vz = 0;
    ant.carrying = 0;
    ant.carryingSoil = false;
    ant.foodSourceId = null;
    ant.lastTacticalAction = ant.nestStayTimer > 0 ? "inNest" : "idleInNest";
    ant.homeTimer = 0;
    ant.energy = Math.min(1, ant.energy + 0.02);
    ant.skipMoveThisFrame = true;
    if (ant.state !== "explore") ant.setState("explore");
    this.holdAntInNest(ant);
  }

  shouldRenderAnt(ant) {
    if (ant.inNest || ant.nestStayTimer > 0) return false;
    if (ant.variant === "builder" && ant.buildTaskId == null && !ant.carryingSoil) return false;
    return true;
  }

  variantForIndex(index, counts) {
    if (index < counts.heavySoldier) return "heavySoldier";
    if (index < counts.heavySoldier + counts.soldier) return "soldier";
    if (index < counts.heavySoldier + counts.soldier + counts.builder) return "builder";
    return "worker";
  }

  getAntVariantConfig(variant) {
    return getAntVariantConfig(variant);
  }

  gainFood(amount, fromAnt = false) {
    const gained = fromAnt ? amount * (this.computeDerived().foragedFoodMultiplier ?? 1) : amount;
    this.colony.food += gained;
    this.colony.lifetimeFood += gained;
    if (fromAnt) this.collectedFood += gained;
  }

  saveColony() {
    if (!this.colony || this.raidSoonMode) return;
    this.syncEarthworksToColony();
    this.colony.lastSavedAt = Date.now();
    writeStorage(SAVE_KEY, serializeColonyState(this.colony));
  }

  applyOfflineProgress(now) {
    const elapsed = Math.min(Math.max(0, (now - this.colony.lastSavedAt) / 1000), OFFLINE_CAP_SECONDS);
    if (elapsed < 2) return;
    let remaining = elapsed;
    while (remaining > 0) {
      const step = Math.min(remaining, 10);
      const d = this.computeDerived();
      const offlineFoodGain = d.foodRate * step * 0.72;
      this.colony.food += offlineFoodGain;
      this.colony.lifetimeFood += offlineFoodGain;
      this.updateColony(step);
      remaining -= step;
    }
    this.pushLog(`不在中に${fmt(elapsed / 60, 0)}分ぶん成長した`);
  }

  pushLog(message) {
    this.colony.battleLog.unshift(message);
    this.colony.battleLog = this.colony.battleLog.slice(0, 5);
  }

  showRaidNotice(message, kind = "warning", duration = RAID_NOTICE_SECONDS) {
    this.raidNotice.message = message;
    this.raidNotice.kind = kind;
    this.raidNotice.timer = duration;
  }

  missingRequirements(upgrade, cost) {
    const missing = [];
    if (this.colony.food < cost) missing.push(`食料 ${fmt(cost - this.colony.food, 0)}`);
    if (upgrade.requires.ants && this.colony.antPopulation < upgrade.requires.ants) missing.push(`アリ ${upgrade.requires.ants}`);
    if (upgrade.requires.lifetimeFood && this.colony.lifetimeFood < upgrade.requires.lifetimeFood) missing.push(`累計食料 ${upgrade.requires.lifetimeFood}`);
    if (upgrade.requires.territory && this.colony.territory < upgrade.requires.territory) missing.push(`領土 ${upgrade.requires.territory}`);
    if (upgrade.requires.nestLevel && this.colony.nestLevel < upgrade.requires.nestLevel) missing.push(`巣Lv ${upgrade.requires.nestLevel}`);
    for (const [id, requiredLevel] of Object.entries(upgrade.requires.upgrades ?? {})) {
      if (upgradeLevel(this.colony.upgrades, id) < requiredLevel) missing.push(`${upgradeName(id)} Lv${requiredLevel}`);
    }
    return missing;
  }

  buyUpgrade(id) {
    const upgrade = UPGRADE_DEFS.find((item) => item.id === id);
    if (!upgrade) return false;
    const level = upgradeLevel(this.colony.upgrades, id);
    if (level >= upgrade.max) return false;
    const cost = upgradeCost(upgrade, level);
    if (this.missingRequirements(upgrade, cost).length > 0) return false;
    this.colony.food -= cost;
    this.colony.upgrades[id] = level + 1;
    if (id === "heavySoldierBrood") {
      this.colony.soldierAnts = Math.max(this.colony.soldierAnts, this.colony.heavySoldierAnts + 1);
      this.colony.heavySoldierAnts = Math.min(this.colony.soldierAnts, this.colony.heavySoldierAnts + 1);
    } else if (id === "builderTraining") {
      const availableWorkers = Math.max(0, this.colony.antPopulation - this.colony.woundedAnts - this.colony.soldierAnts);
      this.colony.builderAnts = Math.min(availableWorkers, this.colony.builderAnts + BUILDERS_PER_TRAINING);
    }
    this.pushLog(`${upgrade.name} Lv${level + 1} を強化`);
    this.computeDerived();
    this.syncAntPopulation();
    this.renderUpgrades();
    this.updateStats();
    this.saveColony();
    return true;
  }

  deployedSoldiers() {
    return this.ants.filter((ant) => ant.isSortieSoldier);
  }

  deployedSoldierCount() {
    return this.deployedSoldiers().length;
  }

  deployedSoldierCountByVariant(variant) {
    return this.deployedSoldiers().filter((ant) => ant.variant === variant).length;
  }

  sortieSoldierPool(derived = this.computeDerived()) {
    return Math.max(0, Math.floor((derived.normalSoldiers ?? 0) + (derived.heavySoldiers ?? 0)));
  }

  sortieSoldierLimit(derived = this.computeDerived()) {
    const total = this.sortieSoldierPool(derived);
    return total > 0 ? Math.max(1, Math.ceil(total / 2)) : 0;
  }

  availableSortieSoldiers() {
    const d = this.computeDerived();
    const deployed = this.deployedSoldierCount();
    const healthyCombatSoldiers = Math.floor(Math.min(this.sortieSoldierPool(d), Math.max(0, d.activeAnts - 1)));
    const remainingInNest = Math.max(0, healthyCombatSoldiers - deployed);
    return Math.max(0, Math.min(remainingInNest, this.sortieSoldierLimit(d)));
  }

  sortieComposition(count = this.plannedSortieCount()) {
    const d = this.computeDerived();
    const desired = Math.max(0, Math.floor(count));
    const nestHeavy = Math.max(0, Math.floor((d.heavySoldiers ?? 0) - this.deployedSoldierCountByVariant("heavySoldier")));
    const nestNormal = Math.max(0, Math.floor((d.normalSoldiers ?? 0) - this.deployedSoldierCountByVariant("soldier")));
    const heavy = Math.min(nestHeavy, desired);
    const normal = Math.min(nestNormal, desired - heavy);
    return { heavy, normal, total: heavy + normal };
  }

  plannedSortieCount() {
    return Math.max(0, Math.floor(this.availableSortieSoldiers()));
  }

  currentSortieTarget(x = this.nest.x, z = this.nest.z) {
    const threat = this.findRivalThreat(x, z, SOLDIER_SORTIE_SEEK_RANGE);
    if (threat) return { x: threat.x, z: threat.z, kind: "rival" };
    const raid = this.ensureRaidState();
    if (raid.phase === "warning" || raid.phase === "active" || raid.phase === "retreating") {
      return { ...this.raidSignalPoint(raid, 0.78), kind: "raid-signal" };
    }
    return null;
  }

  makeRoomForSortie(count) {
    const desiredMax = Math.max(1, DISPLAY_ANT_CAP - count);
    while (this.ants.length > desiredMax) {
      let removeIndex = -1;
      for (let i = this.ants.length - 1; i >= 0; i -= 1) {
        const ant = this.ants[i];
        if (!ant.isSortieSoldier && !ant.wounded && ant.state !== "clash" && ant.state !== "flee") {
          removeIndex = i;
          break;
        }
      }
      if (removeIndex < 0) break;
      const [removed] = this.ants.splice(removeIndex, 1);
      this.antRenderer?.releaseRenderObject(removed);
    }
  }

  startSoldierSortie() {
    if (this.soldierSortieCooldown > 0) return false;
    const composition = this.sortieComposition();
    const count = composition.total;
    if (count < 1) {
      this.pushLog("出撃できる兵隊がいない");
      this.updateStats();
      return false;
    }

    this.makeRoomForSortie(count);
    const sortieTarget = this.currentSortieTarget();
    const targetAngle = sortieTarget ? Math.atan2(sortieTarget.z - this.nest.z, sortieTarget.x - this.nest.x) : null;
    const variants = [
      ...Array.from({ length: composition.heavy }, () => "heavySoldier"),
      ...Array.from({ length: composition.normal }, () => "soldier"),
    ];
    for (let i = 0; i < count; i += 1) {
      const ant = new Ant3D(this.nextAntId++, this);
      const variant = variants[i] ?? "soldier";
      const entrance = this.nestEntrances?.[i % Math.max(1, this.nestEntrances.length)];
      const spread = (i - (count - 1) / 2) * 0.14;
      const baseAngle = targetAngle == null ? (entrance?.userData?.angle ?? ((i / count) * Math.PI * 2)) : targetAngle + spread;
      const radius = this.nest.radius * 0.58 + (i % 3) * 0.55;
      ant.role = "guard";
      ant.setVariant(variant);
      ant.isSortieSoldier = true;
      ant.sortieTimer = SOLDIER_SORTIE_SECONDS;
      ant.sortieIndex = i;
      ant.sortieTargetX = sortieTarget?.x ?? null;
      ant.sortieTargetZ = sortieTarget?.z ?? null;
      ant.traits.caution = clamp(Math.max(ant.traits.caution, 0.72) + 0.12, 0, 1);
      ant.traits.persistence = clamp(Math.max(ant.traits.persistence, 0.72) + 0.12, 0, 1);
      ant.energy = 1;
      ant.stamina = 1;
      ant.carrying = 0;
      ant.foodSourceId = null;
      ant.state = "explore";
      ant.currentTask = "sortie";
      ant.x = this.nest.x + Math.cos(baseAngle) * radius;
      ant.z = this.nest.z + Math.sin(baseAngle) * radius;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.angle = baseAngle;
      this.ants.push(ant);
      this.antRenderer?.assignRenderIndex(ant);
    }

    this.soldierSortieCooldown = SOLDIER_SORTIE_COOLDOWN_SECONDS;
    const heavyText = composition.heavy > 0 ? ` / 重兵装${composition.heavy}匹` : "";
    this.pushLog(`兵隊出撃: ${count}匹${heavyText}が巣口から防衛へ`);
    this.updateStats();
    this.saveColony();
    return true;
  }

  recallSortieSoldiers(reason = "timeout") {
    for (const ant of this.deployedSoldiers()) {
      if (ant.state === "clash") continue;
      ant.sortieTimer = 0;
      ant.carrying = 0;
      ant.foodSourceId = null;
      ant.setState("return");
    }
    if (reason === "raid-clear" && this.deployedSoldierCount() > 0) this.pushLog("兵隊帰還: 敵襲終了で巣へ戻る");
  }

  queueSortieRetire(ant) {
    if (!ant?.isSortieSoldier || this.sortieRetireQueue.includes(ant)) return;
    this.sortieRetireQueue.push(ant);
  }

  flushSortieRetires() {
    if (!this.sortieRetireQueue.length) return;
    for (const ant of this.sortieRetireQueue.splice(0)) {
      const index = this.ants.indexOf(ant);
      if (index < 0) continue;
      this.ants.splice(index, 1);
      this.antRenderer?.releaseRenderObject(ant);
    }
    this.updateStats();
  }

  updateSoldierSorties(dt) {
    this.soldierSortieCooldown = Math.max(0, this.soldierSortieCooldown - dt);
    const raid = this.ensureRaidState();
    const raidLive = raid.phase === "warning" || raid.phase === "active" || raid.phase === "retreating";
    if (!raidLive && this.deployedSoldierCount() > 0) {
      const allExpired = this.deployedSoldiers().every((ant) => ant.sortieTimer <= 0 || ant.state === "return");
      if (allExpired) this.recallSortieSoldiers("timeout");
    }
  }

  updateColonyVisuals() {
    if (!this.nestMound) return;
    const growth = 1 + Math.min(2.3, (this.colony.nestLevel - 1) * 0.13 + this.colony.territory * 0.025);
    this.nestMound.scale.setScalar(1 + (growth - 1) * 0.08);
    for (const entrance of this.nestEntrances ?? []) {
      const base = entrance.userData.base;
      if (!base) continue;
      const radial = base.radial * (1 + (growth - 1) * 0.1);
      entrance.position.set(
        this.nest.x + Math.cos(base.angle) * radial,
        base.y,
        this.nest.z + Math.sin(base.angle) * radial,
      );
      entrance.scale.setScalar(1 + (growth - 1) * 0.08);
    }
    for (const spoil of this.nestSpoils ?? []) {
      const base = spoil.userData.base;
      if (!base) continue;
      const spread = 1 + (growth - 1) * 0.13;
      spoil.position.set(
        this.nest.x + (base.x - this.nest.x) * spread,
        0.16 + base.scale * 0.32,
        this.nest.z + (base.z - this.nest.z) * spread,
      );
      spoil.scale.setScalar(base.scale * (1 + (growth - 1) * 0.06));
    }
  }

  renderUpgrades() {
    const html = UPGRADE_BRANCHES.map((branch) => {
      const cards = UPGRADE_DEFS.filter((upgrade) => upgrade.branch === branch.id).map((upgrade) => {
        const level = upgradeLevel(this.colony.upgrades, upgrade.id);
        const complete = level >= upgrade.max;
        const cost = complete ? 0 : upgradeCost(upgrade, level);
        const missing = complete ? [] : this.missingRequirements(upgrade, cost);
        const disabled = complete || missing.length > 0 ? "disabled" : "";
        const meta = complete ? "最大Lv" : missing.length ? `不足: ${missing.join(" / ")}` : `費用: 食料 ${fmt(cost, 0)}`;
        return `
          <article class="upgrade-card" data-branch="${branch.id}">
            <strong>${upgrade.name} Lv${level}/${upgrade.max}</strong>
            <p>${upgrade.desc}</p>
            <div class="upgrade-effect">${upgrade.effect}</div>
            <div class="upgrade-meta">${meta}</div>
            <button type="button" data-upgrade="${upgrade.id}" ${disabled}>強化</button>
          </article>
        `;
      }).join("");
      return `<div class="upgrade-branch">${branch.name}</div>${cards}`;
    }).join("");
    ui.upgradeList.innerHTML = html;
  }

  disposeDynamicItem(item) {
    if (item.group) {
      disposeObject3D(item.group, {
        skipGeometries: this.sharedGeometries,
        skipMaterials: this.sharedMaterials,
      });
      this.dynamicObjects.delete(item.group);
    }
    if (item.mesh && item.mesh.parent !== item.group) {
      disposeObject3D(item.mesh, {
        skipGeometries: this.sharedGeometries,
        skipMaterials: this.sharedMaterials,
      });
      this.dynamicObjects.delete(item.mesh);
    }
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width === this.resizeWidth && height === this.resizeHeight) return;
    this.resizeWidth = width;
    this.resizeHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.currentPixelRatio = Math.min((window.devicePixelRatio || 1) * this.quality.resolutionScale, this.quality.maxPixelRatio);
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(width, height, false);
    const baseCameraDistance = width < 680 ? CAMERA_DISTANCE_MOBILE : CAMERA_DISTANCE_DESKTOP;
    this.cameraDistance = clamp(this.cameraDistance || baseCameraDistance, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
    this.targetCameraDistance = clamp(this.targetCameraDistance || baseCameraDistance, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
    this.updateCamera();
  }

  updateCamera() {
    this.cameraYaw += (this.targetCameraYaw - this.cameraYaw) * 0.16;
    this.cameraPitch += (this.targetCameraPitch - this.cameraPitch) * 0.16;
    this.cameraDistance += (this.targetCameraDistance - this.cameraDistance) * 0.16;
    this.cameraRenderTarget.lerp(this.cameraTarget, 0.14);
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    const y = Math.sin(this.cameraPitch) * this.cameraDistance;
    this.camera.position.set(
      this.cameraRenderTarget.x + Math.sin(this.cameraYaw) * horizontal,
      y,
      this.cameraRenderTarget.z + Math.cos(this.cameraYaw) * horizontal,
    );
    this.camera.lookAt(this.cameraRenderTarget);
  }

  async prewarmAndStart() {
    this.loadingScreen.setProgress("compile", 0.75, 1);
    try {
      if (typeof this.renderer.compileAsync === "function") {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        this.renderer.compile(this.scene, this.camera);
      }
    } catch (error) {
      this.loadingScreen.showError(`Shader compile failed: ${error.message}`);
      return;
    }
    this.loadingScreen.hide();
    this.startLoop();
  }

  startLoop() {
    this.isRunning = true;
    this.lastFrameTime = 0;
    this.frameAccumulator = 0;
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  tick(timeMs) {
    if (!this.isRunning) return;
    const time = timeMs / 1000;
    const frameDelta = this.lastFrameTime === 0 ? FIXED_DT : clamp(time - this.lastFrameTime, 0, MAX_FRAME_DELTA);
    this.lastFrameTime = time;
    this.renderTime = timeMs;
    this.debugPanel.sample(frameDelta);

    if (!this.paused) {
      this.frameAccumulator += frameDelta;
      let steps = 0;
      while (this.frameAccumulator >= FIXED_DT && steps < MAX_FIXED_STEPS) {
        this.updateGame(FIXED_DT);
        this.frameAccumulator -= FIXED_DT;
        steps += 1;
      }
      if (steps === MAX_FIXED_STEPS) this.frameAccumulator = 0;
    }

    const alpha = this.paused ? 1 : clamp(this.frameAccumulator / FIXED_DT, 0, 1);
    this.renderGame(alpha);
  }

  updateGame(dt) {
    this.updateColony(dt);
    this.updateRaid(dt);
    this.updateSoldierSorties(dt);
    this.raidNotice.timer = Math.max(0, this.raidNotice.timer - dt);

    for (const patch of this.water) {
      patch.age += dt;
      patch.power = Math.max(0.08, patch.power - dt * 0.014);
      patch.group.scale.setScalar(1 + Math.sin(patch.age * 2.5) * 0.015);
      patch.ring.material.opacity = Math.max(0.1, patch.power * 0.44);
      patch.ring.scale.setScalar(1 + (patch.age % 1) * 0.05);
    }
    this.water = this.water.filter((patch) => {
      if (patch.power > 0.09 && patch.age < 85) return true;
      this.disposeDynamicItem(patch);
      return false;
    });

    for (const stone of this.stones) {
      stone.shock = Math.max(0, stone.shock - dt * 0.7);
      if (!stone.ring) continue;
      stone.ring.visible = stone.shock > 0.02;
      if (stone.ring.visible) {
        stone.ring.scale.setScalar(1 + (1 - stone.shock) * 7);
        stone.ring.material.opacity = stone.shock * 0.45;
      }
    }

    this.updatePredators(dt);
    this.updateCorpses(dt);

    for (const trail of this.trails) {
      this.updateTrailPheromone(trail, dt);
      const followVisibility = trail.kind === "food" ? trail.followStrength : 1;
      trail.mesh.material.opacity = Math.max(0, trail.life * trail.baseOpacity * followVisibility);
      trail.mesh.scale.setScalar(trail.scale * (1 + (1 - trail.life) * 0.2));
    }
    this.trails = this.trails.filter((trail) => {
      if (trail.life > 0.02) return true;
      this.disposeDynamicItem(trail);
      return false;
    });

    this.updateCombatEffects(dt);
    this.ensureBuildTasks();
    this.updateEarthworks();

    for (const ant of this.ants) ant.update(dt, this);
    this.flushSortieRetires();
    for (const rival of this.rivalAnts) rival.update(dt, this);
    this.lastUiUpdate += dt;
    if (this.lastUiUpdate > 0.15) {
      this.updateStats();
      this.lastUiUpdate = 0;
    }
  }

  updateTrailPheromone(trail, dt) {
    if (trail.kind !== "food") {
      trail.life -= dt * trail.decay;
      return;
    }

    const source = this.getFoodSource(trail.sourceId);
    if (!source || source.amount <= 0.05) {
      trail.followStrength = 0;
      trail.life -= dt * PHEROMONE_PARAMS.foodDepletedDecay;
      return;
    }

    const sourceRatio = clamp(source.amount / source.initialAmount, 0, 1);
    const lowSourceFactor = 1 - clamp(sourceRatio / PHEROMONE_PARAMS.foodLowSourceThreshold, 0, 1);
    trail.followStrength = clamp(sourceRatio * trail.sourceRatio, 0.08, 1);
    trail.life -= dt * (PHEROMONE_PARAMS.foodActiveDecay + lowSourceFactor * PHEROMONE_PARAMS.foodLowSourceExtraDecay);
  }

  renderGame(alpha) {
    this.updateCamera();
    const renderAnts = this.renderAntBuffer;
    renderAnts.length = 0;
    for (const ant of this.ants) {
      if (this.shouldRenderAnt(ant)) renderAnts.push(ant);
    }
    for (const rival of this.rivalAnts) renderAnts.push(rival);
    this.antRenderer.render(renderAnts, this, alpha);
    this.roleLabelSystem.render(renderAnts, this, alpha);
    this.renderer.render(this.scene, this.camera);
    window.__ANT_SIM_READY = true;
  }

  dispose() {
    if (!this.renderer) return;
    this.isRunning = false;
    this.renderer.setAnimationLoop(null);
    this.input?.dispose();
    if (ui.panelGrip && this.boundPanelPointerDown) {
      ui.panelGrip.removeEventListener("pointerdown", this.boundPanelPointerDown);
      ui.panelGrip.removeEventListener("pointermove", this.boundPanelPointerMove);
      ui.panelGrip.removeEventListener("pointerup", this.boundPanelPointerUp);
      ui.panelGrip.removeEventListener("pointercancel", this.boundPanelPointerUp);
    }
    window.removeEventListener("resize", this.boundResize);
    window.removeEventListener("pagehide", this.boundPageHide);
    this.clearBranchPreview();
    this.antRenderer?.destroy();
    this.roleLabelSystem?.destroy();
    for (const list of [this.water, this.stones, this.food, this.branches, this.trails, this.buildTasks, this.earthworks, this.combatEffects, this.predators, this.rivalCorpses, this.colonyCorpses]) {
      for (const item of list) this.disposeDynamicItem(item);
    }
    this.assetService.dispose();
    for (const geometry of this.sharedGeometries) geometry.dispose();
    for (const material of this.sharedMaterials) disposeMaterial(material);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.renderer = null;
    if (window.__ANT_SIM === this) window.__ANT_SIM = null;
  }

  onPointerDown(event) {
    event.preventDefault();
    try {
      this.renderer.domElement.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events in tests may not own a real pointer capture.
    }
    this.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragMoved = false;
    if (this.pointerMap.size === 2) {
      const points = [...this.pointerMap.values()];
      this.pinchStart = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        cameraDistance: this.targetCameraDistance,
      };
      return;
    }

    const point = this.screenToGround(event.clientX, event.clientY);
    if (!point) return;
    this.pointerStart = { screenX: event.clientX, screenY: event.clientY, ...point };
  }

  onPointerMove(event) {
    const previous = this.pointerMap.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    this.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointerMap.size === 2 && this.pinchStart) {
      const points = [...this.pointerMap.values()];
      const current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      this.targetCameraDistance = clamp(this.pinchStart.cameraDistance * (this.pinchStart.distance / (current || 1)), CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
      return;
    }

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true;

    this.targetCameraYaw -= dx * 0.006;
    this.targetCameraPitch = clamp(this.targetCameraPitch + dy * 0.004, 0.62, 1.28);
  }

  onPointerUp(event) {
    event.preventDefault();
    const point = this.screenToGround(event.clientX, event.clientY);
    if (point && !this.dragMoved) this.selectNearestAnt(point.x, point.z);
    this.pointerMap.delete(event.pointerId);
    if (this.pointerMap.size < 2) this.pinchStart = null;
  }

  onWheel(event) {
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
    const delta = clamp(event.deltaY * unit, -480, 480);
    const factor = Math.exp(delta * 0.0012);
    this.targetCameraDistance = clamp(this.targetCameraDistance * factor, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
  }

  screenToGround(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.groundHit);
    if (!hit) return null;
    const d = Math.hypot(hit.x, hit.z);
    if (d > this.worldRadius + 7) return null;
    return { x: hit.x, z: hit.z };
  }

  seedNaturalEnvironment() {
    const naturalFoods = [
      { x: -16, z: 42, amount: 12, radius: 3.4, crumbs: 12, material: this.materials.foodSeed, kind: "seed" },
      { x: 38, z: -32, amount: 15, radius: 4.2, crumbs: 14, material: this.materials.foodFruit, kind: "fruit" },
      { x: 72, z: 44, amount: 9, radius: 3.1, crumbs: 10, material: this.materials.foodLeaf, kind: "leaf" },
      { x: -78, z: -46, amount: 13, radius: 3.8, crumbs: 13, material: this.materials.foodSeed, kind: "seed" },
      { x: 8, z: -82, amount: 10, radius: 3.2, crumbs: 10, material: this.materials.foodFruit, kind: "fruit" },
    ];
    for (const food of naturalFoods) this.addFood(food.x, food.z, food);
    this.seedNaturalObstacles();
  }

  seedNaturalObstacles() {
    const stones = [
      { x: -92, z: 18, radius: 3.3, scaleY: 0.52, rotation: 0.2 },
      { x: -58, z: 78, radius: 2.7, scaleY: 0.44, rotation: 1.2 },
      { x: -14, z: -42, radius: 3.0, scaleY: 0.5, rotation: 2.4 },
      { x: 26, z: 68, radius: 2.4, scaleY: 0.42, rotation: -0.7 },
      { x: 62, z: -66, radius: 3.5, scaleY: 0.48, rotation: 0.9 },
      { x: 92, z: 12, radius: 2.8, scaleY: 0.46, rotation: -1.1 },
    ];
    for (const stone of stones) this.addNaturalStone(stone);
  }

  ensureRaidState() {
    this.colony.raidState = normalizeRaidState(this.colony.raidState);
    return this.colony.raidState;
  }

  raidRivals() {
    return this.rivalAnts.filter((rival) => rival.isRaidRival);
  }

  raidNextInterval() {
    const d = this.computeDerived();
    const pressure = clamp(this.colony.enemyThreat * 1.7 + this.colony.territory * 3 - (d.defensePower - 1) * 16, 0, 76);
    return Math.floor(clamp(RAID_BASE_INTERVAL_SECONDS - pressure, 64, 170));
  }

  raidCalmSeconds() {
    return this.raidSoonMode ? RAID_SOON_CALM_SECONDS : this.raidNextInterval();
  }

  raidWarningSeconds() {
    return this.raidSoonMode ? RAID_SOON_WARNING_SECONDS : RAID_WARNING_SECONDS;
  }

  raidEnemyCount() {
    const d = this.computeDerived();
    const colonyScalePressure =
      Math.max(0, d.activeAnts - 24) * 0.055 +
      Math.max(0, this.colony.nestLevel - 2) * 0.8 +
      this.colony.territory * 0.35 +
      (d.normalSoldiers ?? 0) * 0.025 +
      (d.heavySoldiers ?? 0) * 0.06;
    const pressure = this.colony.enemyThreat * 0.34 + this.colony.territory * 0.14 + colonyScalePressure - (d.defensePower - 1) * 0.9;
    return Math.floor(clamp(4 + pressure, 4, RAID_RIVAL_CAP));
  }

  raidSignalPoint(raid = this.ensureRaidState(), radiusFactor = 0.86) {
    const angle = raid.approachAngle ?? 0;
    const radius = this.worldRadius * radiusFactor;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  }

  emitRaidSignal(raid = this.ensureRaidState(), strength = 0.72) {
    const point = this.raidSignalPoint(raid);
    this.addTrail(point.x, point.z, "alarm", strength);
  }

  enterRaidWarning() {
    const raid = this.ensureRaidState();
    raid.phase = "warning";
    raid.timer = this.raidWarningSeconds();
    raid.wave += 1;
    raid.activeCount = this.raidEnemyCount();
    raid.approachAngle = rand(0, Math.PI * 2);
    raid.signalTimer = 0;
    raid.breachTimer = 0;
    raid.casualties = 0;
    raid.enemyCasualties = 0;
    raid.startFallenAnts = Math.floor(this.colony.fallenAnts ?? 0);
    raid.lastOutcome = "warning";
    this.emitRaidSignal(raid, 0.88);
    this.pushLog(`敵アリの気配: 外縁から${raid.activeCount}匹が集団接近`);
    this.showRaidNotice(`敵アリ接近: 外縁から${raid.activeCount}匹。兵隊を出撃できます`, "warning");
  }

  beginRaid() {
    const raid = this.ensureRaidState();
    this.clearRaidRivals();
    const count = Math.floor(clamp(raid.activeCount || this.raidEnemyCount(), 1, RAID_RIVAL_CAP));
    for (let i = 0; i < count; i += 1) {
      const rival = new RivalAnt3D(i + 1, this, {
        raid: {
          wave: raid.wave,
          index: i,
          count,
          approachAngle: raid.approachAngle,
        },
      });
      this.rivalAnts.push(rival);
    }
    raid.phase = "active";
    raid.timer = RAID_ACTIVE_SECONDS;
    raid.activeCount = count;
    raid.signalTimer = 0;
    raid.lastOutcome = "active";
    this.pushLog(`敵襲開始: ${count}匹が巣と餌場へ侵入`);
    this.showRaidNotice(`敵襲開始: ${count}匹が巣と餌場へ侵入`, "warning");
  }

  orderRaidRetreat(outcome = "held") {
    const raid = this.ensureRaidState();
    for (const rival of this.raidRivals()) {
      rival.startRetreatHome(this.nest.x, this.nest.z, RAID_RETREAT_SECONDS);
    }
    raid.phase = "retreating";
    raid.timer = RAID_RETREAT_SECONDS;
    raid.lastOutcome = outcome;
    this.pushLog("敵アリが外縁へ退却中");
  }

  removeRivalAnt(rival) {
    const index = this.rivalAnts.indexOf(rival);
    if (index >= 0) this.rivalAnts.splice(index, 1);
    this.antRenderer?.releaseRenderObject(rival);
  }

  corpseLocalPoint(point, segment, endpoint, corpseScale) {
    const spread = segment.kind === "leg" ? 1.03 + endpoint * 0.08 : segment.kind === "antenna" ? 1.02 : 1.0;
    const lengthen = segment.kind === "antenna" ? 1.02 : segment.kind === "mandible" ? 0.96 : 1.02;
    return new THREE.Vector3(
      point[0] * corpseScale * spread,
      Math.max(0.035, 0.075 + point[1] * corpseScale * 0.24 - (segment.kind === "leg" ? endpoint * 0.01 : 0)),
      point[2] * corpseScale * lengthen,
    );
  }

  addCorpseSegment(group, segment, corpseScale, material = this.materials.antCorpseAppendage) {
    const start = this.corpseLocalPoint(segment.from, segment, 0, corpseScale);
    const end = this.corpseLocalPoint(segment.to, segment, 1, corpseScale);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length <= 0.001) return;
    direction.normalize();
    const mesh = new THREE.Mesh(this.geometries.combatSlash, material);
    mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const radius = segment.radius * corpseScale * (segment.kind === "leg" ? 1.08 : 0.98);
    mesh.scale.set(radius, length, radius);
    mesh.castShadow = this.quality.shadowQuality !== "off";
    mesh.receiveShadow = this.quality.shadowQuality !== "off";
    group.add(mesh);
  }

  addAntCorpse(source, options = {}) {
    if (!source) return null;
    const side = options.side ?? "rival";
    const group = new THREE.Group();
    const corpseScale = (options.scale ?? source.scale ?? source.bodyScale ?? 1) * ANT_VISUAL_SCALE;
    const bodyMaterial = side === "colony" ? this.materials.antColonyCorpse : this.materials.antCorpse;
    group.position.set(source.x, 0, source.z);
    group.rotation.set(rand(-0.035, 0.035), source.angle + rand(-0.18, 0.18), rand(-0.08, 0.08));

    const stain = new THREE.Mesh(this.geometries.trailCircle, this.materials.corpseMark);
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.025;
    stain.scale.setScalar(1.45 * corpseScale);
    group.add(stain);

    for (const part of ANT_BODY_PARTS) {
      const mesh = new THREE.Mesh(this.geometries.antSphere, bodyMaterial);
      mesh.position.set(part.x * corpseScale, 0.075 + part.y * corpseScale * 0.32, part.z * corpseScale);
      mesh.scale.set(part.sx * corpseScale, part.sy * corpseScale * 0.46, part.sz * corpseScale);
      mesh.castShadow = this.quality.shadowQuality !== "off";
      mesh.receiveShadow = this.quality.shadowQuality !== "off";
      group.add(mesh);
    }

    for (const segment of ANT_APPENDAGE_SEGMENTS) this.addCorpseSegment(group, segment, corpseScale);

    this.scene.add(group);
    this.dynamicObjects.add(group);
    const corpse = { x: source.x, z: source.z, group, age: 0, life: CORPSE_LIFE_SECONDS, side, scale: corpseScale };
    const list = side === "colony" ? this.colonyCorpses : this.rivalCorpses;
    const cap = side === "colony" ? COLONY_CORPSE_CAP : RIVAL_CORPSE_CAP;
    list.push(corpse);
    while (list.length > cap) {
      const old = list.shift();
      this.disposeDynamicItem(old);
    }
    return corpse;
  }

  addRivalCorpse(rival) {
    return this.addAntCorpse(rival, { side: "rival", scale: rival?.scale ?? 1 });
  }

  addColonyCorpse(ant) {
    return this.addAntCorpse(ant, { side: "colony", scale: ant?.bodyScale ?? 1 });
  }

  updateCorpses(dt) {
    for (const list of [this.rivalCorpses, this.colonyCorpses]) {
      for (const corpse of list) corpse.age += dt;
      for (const corpse of [...list]) {
        if (corpse.age < corpse.life) continue;
        this.disposeDynamicItem(corpse);
        const index = list.indexOf(corpse);
        if (index >= 0) list.splice(index, 1);
      }
    }
  }

  clearRaidRivals() {
    for (const rival of this.raidRivals()) {
      this.removeRivalAnt(rival);
    }
  }

  cleanupRaidRivals() {
    for (const rival of [...this.raidRivals()]) {
      if (!rival.leftRaid) continue;
      this.removeRivalAnt(rival);
    }
  }

  raidDeathCount(raid = this.ensureRaidState()) {
    const baseline = Number.isFinite(Number(raid.startFallenAnts)) ? Number(raid.startFallenAnts) : null;
    if (baseline == null) return Math.floor(clamp(Number(raid.casualties) || 0, 0, 999999));
    return Math.floor(clamp((this.colony.fallenAnts ?? 0) - baseline, 0, 999999));
  }

  resolveRaid(outcome = "repelled") {
    const raid = this.ensureRaidState();
    const count = Math.max(1, raid.activeCount || this.raidEnemyCount());
    if (outcome === "repelled") {
      const relief = 0.75 + count * 0.22 + Math.max(0, this.computeDerived().defensePower - 1) * 0.22;
      this.colony.enemyThreat = Math.max(0, this.colony.enemyThreat - relief);
      const deaths = this.raidDeathCount(raid);
      raid.casualties = deaths;
      this.pushLog(`襲撃を防衛: 死亡${deaths} / 脅威-${fmt(relief, 1)}`);
      this.showRaidNotice(`敵アリ撃退: 味方死亡${deaths} / 敵撃破${raid.enemyCasualties}`, "repelled");
    } else {
      const defense = this.computeDerived().defensePower;
      const loss = Math.min(this.colony.food, Math.max(2, count * 4.8 + this.colony.enemyThreat * 0.32) / defense);
      const wounded = defense >= 1.65 ? Math.min(1, count) : Math.min(this.colony.antPopulation - 1, Math.ceil(count * 0.45));
      this.colony.food = Math.max(0, this.colony.food - loss);
      this.colony.woundedAnts = Math.min(this.colony.antPopulation - 1, this.colony.woundedAnts + wounded);
      this.applyRaidCasualties(Math.max(0, Math.ceil(count * 0.16) - raid.casualties), "breach");
      const deaths = this.raidDeathCount(raid);
      raid.casualties = deaths;
      this.colony.enemyThreat += 0.65 + count * 0.12;
      this.pushLog(`襲撃被害: 食料-${fmt(loss, 0)} / 負傷${wounded} / 死亡${deaths}`);
      this.showRaidNotice(`襲撃被害: 食料-${fmt(loss, 0)} / 死亡${deaths}`, "warning");
    }
    this.clearRaidRivals();
    this.recallSortieSoldiers("raid-clear");
    raid.phase = "recovering";
    raid.timer = RAID_RECOVERY_SECONDS;
    raid.activeCount = 0;
    raid.signalTimer = 0;
    raid.lastOutcome = outcome;
    this.saveColony();
  }

  canLoseAnt() {
    return this.colony.antPopulation > MIN_COLONY_SURVIVORS && this.ants.length > MIN_COLONY_SURVIVORS;
  }

  killAnt(ant, rival = null) {
    if (!ant || !this.canLoseAnt()) return false;
    const index = this.ants.indexOf(ant);
    if (index < 0) return false;
    ant.clashRival = null;
    ant.clashTimer = 0;
    ant.clashDuration = 0;
    ant.fleeTimer = 0;
    this.addColonyCorpse(ant);
    this.ants.splice(index, 1);
    this.antRenderer?.releaseRenderObject(ant);
    if (ant.isSortieSoldier) {
      if (ant.variant === "heavySoldier") this.colony.heavySoldierAnts = Math.max(0, Math.floor(this.colony.heavySoldierAnts) - 1);
      this.colony.soldierAnts = Math.max(0, Math.floor(this.colony.soldierAnts) - 1);
    }
    this.colony.antPopulation = Math.max(MIN_COLONY_SURVIVORS, Math.floor(this.colony.antPopulation) - 1);
    this.colony.woundedAnts = Math.min(this.colony.woundedAnts, Math.max(0, this.colony.antPopulation - 1));
    this.colony.fallenAnts = Math.floor((this.colony.fallenAnts ?? 0) + 1);
    const raid = this.ensureRaidState();
    if (raid.phase === "active" || raid.phase === "retreating") raid.casualties += 1;
    this.addTrail(ant.x, ant.z, "alarm", 1.15);
    this.pushLog(`個体${ant.id}死亡: ${rival?.isRaidRival ? "襲撃で噛み倒された" : "外敵に倒された"}`);
    this.syncAntPopulation();
    return true;
  }

  applyRaidCasualties(count, reason = "breach") {
    let losses = 0;
    for (let i = 0; i < count; i += 1) {
      if (!this.canLoseAnt()) break;
      const candidates = this.ants
        .filter((ant) => ant)
        .sort((a, b) => {
          const roleRank = (a.role === "guard" ? 2 : a.role === "worker" ? 0 : 1) - (b.role === "guard" ? 2 : b.role === "worker" ? 0 : 1);
          if (roleRank) return roleRank;
          return a.energy - b.energy;
        });
      if (!this.killAnt(candidates[0], reason === "breach" ? { isRaidRival: true } : null)) break;
      losses += 1;
    }
    return losses;
  }

  defeatRivalAnt(rival, ant = null) {
    if (!rival || rival.leftRaid || rival.defeated) return false;
    rival.defeated = true;
    rival.leftRaid = true;
    rival.retreat = 0;
    rival.disrupt = Math.max(rival.disrupt, 1.6);
    const raid = this.ensureRaidState();
    if (rival.isRaidRival && (raid.phase === "active" || raid.phase === "retreating")) raid.enemyCasualties += 1;
    this.addRivalCorpse(rival);
    this.addTrail(rival.x, rival.z, "alarm", 0.95);
    this.removeRivalAnt(rival);
    return true;
  }

  updateRaidBreachDamage(dt) {
    const raid = this.ensureRaidState();
    if (raid.phase !== "active") return;
    const pressure = this.raidRivals().filter((rival) => {
      if (rival.defeated || rival.leftRaid || rival.retreat > 0) return false;
      return (
        distance2(rival.x, rival.z, this.nest.x, this.nest.z) < this.nest.radius + 24 ||
        this.isNearFood(rival.x, rival.z, 7)
      );
    }).length;
    if (pressure <= 0) {
      raid.breachTimer = Math.max(0, raid.breachTimer - dt * 0.6);
      return;
    }
    raid.breachTimer += dt * pressure;
    if (raid.breachTimer < 7.2) return;
    raid.breachTimer = 0;
    const defense = this.computeDerived().defensePower;
    const loss = Math.min(this.colony.food, (1.8 + pressure * 1.4 + this.colony.enemyThreat * 0.08) / defense);
    this.colony.food = Math.max(0, this.colony.food - loss);
    const casualtyChance = clamp((pressure - 1) * 0.18 + this.colony.enemyThreat * 0.012 - (defense - 1) * 0.18, 0, 0.62);
    let casualties = 0;
    if (Math.random() < casualtyChance) casualties = this.applyRaidCasualties(1, "breach");
    this.pushLog(`敵が巣周辺を荒らした: 食料-${fmt(loss, 0)}${casualties ? ` / 死亡${casualties}` : ""}`);
  }

  updateRaid(dt) {
    const raid = this.ensureRaidState();

    if (raid.phase === "calm") {
      raid.timer -= dt;
      if (raid.timer <= 0) this.enterRaidWarning();
      return;
    }

    if (raid.phase === "warning") {
      raid.timer -= dt;
      raid.signalTimer -= dt;
      if (raid.signalTimer <= 0) {
        this.emitRaidSignal(raid);
        raid.signalTimer = 3.2;
      }
      if (raid.timer <= 0) this.beginRaid();
      return;
    }

    if (raid.phase === "active") {
      raid.timer -= dt;
      this.updateRaidBreachDamage(dt);
      this.cleanupRaidRivals();
      const remainingRivals = this.raidRivals();
      if (remainingRivals.length === 0 && raid.activeCount > 0) {
        this.resolveRaid("repelled");
        return;
      }
      if (remainingRivals.length > 0 && remainingRivals.every((rival) => rival.defeated || rival.leftRaid)) {
        this.orderRaidRetreat("repelled");
        return;
      }
      if (raid.timer <= 0) this.orderRaidRetreat("held");
      return;
    }

    if (raid.phase === "retreating") {
      raid.timer -= dt;
      this.cleanupRaidRivals();
      if (this.raidRivals().length === 0 || raid.timer <= 0) {
        if (raid.timer <= 0) this.clearRaidRivals();
        this.resolveRaid(raid.lastOutcome === "held" ? "held" : "repelled");
      }
      return;
    }

    if (raid.phase === "recovering") {
      raid.timer -= dt;
      if (raid.timer <= 0) {
        raid.phase = "calm";
        raid.timer = this.raidCalmSeconds();
        raid.lastOutcome = "none";
      }
    }
  }

  isNearFood(x, z, radius) {
    for (const food of this.food) {
      if (food.amount <= 0) continue;
      if (distance2(x, z, food.x, food.z) < radius + food.radius) return true;
    }
    return false;
  }

  findRivalThreat(x, z, radius) {
    let best = null;
    let bestDistance = radius;
    for (const rival of this.rivalAnts) {
      if (rival.defeated || rival.leftRaid || rival.retreat > 0 || rival.clash) continue;
      const d = distance2(x, z, rival.x, rival.z);
      if (d < bestDistance) {
        best = rival;
        bestDistance = d;
      }
    }
    return best;
  }

  registerRivalFight(winner, ant, rival, detail = {}) {
    this.rivalFightStats.clashes += 1;
    if (winner === "colony") {
      this.rivalFightStats.colonyWins += 1;
      const group = detail.grapplers && detail.grapplers > 1 ? `${detail.grapplers}匹で` : "";
      this.pushLog(`敵アリを${group}制圧: 個体${ant.id}`);
    } else {
      this.rivalFightStats.rivalWins += 1;
      const loss = detail.casualty ? "死亡" : "退避";
      this.pushLog(`敵アリが個体${ant.id}を噛み倒した: ${loss}`);
    }
  }

  updatePredators(dt) {
    for (const predator of this.predators) {
      const previousX = predator.x;
      const previousZ = predator.z;
      predator.age += dt * predator.speed;
      predator.x = predator.homeX + Math.cos(predator.age + predator.phase) * predator.patrolX + Math.sin(predator.age * 0.47 + predator.phase) * predator.patrolX * 0.28;
      predator.z = predator.homeZ + Math.sin(predator.age * 0.82 + predator.phase) * predator.patrolZ + Math.cos(predator.age * 0.35) * predator.patrolZ * 0.22;
      const distanceFromCenter = Math.hypot(predator.x, predator.z);
      if (distanceFromCenter > this.worldRadius - predator.radius) {
        const limit = (this.worldRadius - predator.radius) / distanceFromCenter;
        predator.x *= limit;
        predator.z *= limit;
      }
      predator.group.position.set(predator.x, 0, predator.z);
      const travelX = predator.x - previousX;
      const travelZ = predator.z - previousZ;
      if (Math.abs(travelX) + Math.abs(travelZ) > 0.0001) predator.group.rotation.y = Math.atan2(travelX, travelZ);
      predator.ring.scale.setScalar(1 + Math.sin(predator.age * 2.4) * 0.05);
      predator.ring.material.opacity = 0.12 + predator.threat * 0.08 + Math.sin(predator.age * 3.2) * 0.025;
    }
  }

  addPredator(config) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), this.materials.predatorBody);
    body.position.y = 1.1;
    body.scale.set(config.radius * 0.72, 0.58, config.radius * 1.12);
    body.castShadow = this.quality.shadowQuality !== "off";
    body.receiveShadow = this.quality.shadowQuality !== "off";
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), this.materials.predatorBody);
    head.position.set(0, 1.05, config.radius * 0.8);
    head.scale.set(config.radius * 0.42, 0.38, config.radius * 0.38);
    head.castShadow = this.quality.shadowQuality !== "off";
    group.add(head);

    const ring = new THREE.Mesh(this.geometries.trailCircle, this.materials.predatorAccent.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.055;
    ring.scale.setScalar(config.radius + config.threat * 4.5);
    group.add(ring);

    group.position.set(config.x, 0, config.z);
    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.predators.push({
      ...config,
      x: config.x,
      z: config.z,
      homeX: config.x,
      homeZ: config.z,
      patrolX: config.patrolX ?? 8,
      patrolZ: config.patrolZ ?? 8,
      phase: config.phase ?? rand(0, Math.PI * 2),
      age: rand(0, 2),
      group,
      ring,
    });
  }

  addWater(x, z, scale = 1) {
    const intensity = ui.intensity ? Number(ui.intensity.value) : 3;
    const radius = 5.5 + intensity * 1.6 * scale + rand(-0.4, 0.8);
    const group = new THREE.Group();
    const pool = new THREE.Mesh(this.geometries.waterCircle, this.materials.water.clone());
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(radius * 1.18, radius * 0.82, 1);
    pool.position.y = 0.035;
    group.add(pool);
    const ring = new THREE.Mesh(this.geometries.impactRing, this.materials.waterRing.clone());
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(radius * 0.85, radius * 0.85, radius * 0.85);
    ring.position.y = 0.08;
    group.add(ring);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.water.push({ x, z, radius, power: clamp(0.45 + intensity * 0.13 * scale, 0.35, 1.08), age: 0, group, ring });
  }

  addNaturalStone(config) {
    const group = new THREE.Group();
    const stone = new THREE.Mesh(this.geometries.stoneRock, this.materials.stone);
    stone.position.y = config.radius * 0.42;
    stone.scale.set(config.radius * 1.05, config.radius * config.scaleY, config.radius * 0.86);
    stone.rotation.set(0.14, config.rotation, -0.08);
    stone.castShadow = this.quality.shadowQuality !== "off";
    stone.receiveShadow = this.quality.shadowQuality !== "off";
    group.add(stone);
    group.position.set(config.x, 0, config.z);
    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.stones.push({ x: config.x, z: config.z, radius: config.radius, shock: 0, group });
  }

  addStone(x, z) {
    const intensity = ui.intensity ? Number(ui.intensity.value) : 3;
    const radius = 3.1 + intensity * 0.85 + rand(-0.2, 0.4);
    const group = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), this.materials.stone);
    stone.position.y = radius * 0.46;
    stone.scale.y = 0.58;
    stone.rotation.set(rand(-0.4, 0.4), rand(0, Math.PI), rand(-0.3, 0.3));
    stone.castShadow = this.quality.shadowQuality !== "off";
    stone.receiveShadow = this.quality.shadowQuality !== "off";
    group.add(stone);
    const ring = new THREE.Mesh(this.geometries.impactRing, this.materials.impact.clone());
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(radius * 1.1, radius * 1.1, radius * 1.1);
    ring.position.y = 0.12;
    group.add(ring);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.dynamicObjects.add(group);

    const item = { x, z, radius, shock: 1, group, ring };
    this.stones.push(item);
    for (const ant of this.ants) {
      if (!this.shouldRenderAnt(ant)) continue;
      const d = distance2(ant.x, ant.z, x, z);
      if (d < radius + 28) ant.shock((1 - d / (radius + 28)) * (0.78 + intensity * 0.13));
    }
  }

  addFood(x, z, options = {}) {
    const intensity = ui.intensity ? Number(ui.intensity.value) : 3;
    const amount = options.amount ?? 7 + intensity * 4;
    const radius = options.radius ?? 4.5 + intensity * 0.7;
    const crumbs = options.crumbs ?? 18;
    const material = options.material ?? this.materials.food;
    const group = new THREE.Group();
    const item = { id: this.nextFoodId, x, z, radius, amount, initialAmount: amount, group, crumbs: [], kind: options.kind ?? "placed" };
    this.nextFoodId += 1;
    for (let i = 0; i < crumbs; i += 1) {
      const crumb = new THREE.Mesh(this.geometries.foodCrumb, material);
      const a = rand(0, Math.PI * 2);
      const r = rand(0, item.radius);
      crumb.position.set(Math.cos(a) * r, 0.52 + rand(0, 0.45), Math.sin(a) * r);
      crumb.scale.setScalar(rand(options.minScale ?? 0.2, options.maxScale ?? 0.48));
      crumb.castShadow = this.quality.shadowQuality !== "off";
      group.add(crumb);
      item.crumbs.push(crumb);
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.food.push(item);
  }

  getFoodSource(sourceId) {
    if (sourceId == null) return null;
    return this.food.find((item) => item.id === sourceId && item.amount > 0.05) ?? null;
  }

  refreshFoodMesh(food) {
    const ratio = clamp(food.amount / food.initialAmount, 0, 1);
    food.crumbs.forEach((crumb, index) => {
      crumb.visible = index / food.crumbs.length < ratio;
    });
    if (food.amount <= 0.05) {
      this.fadeFoodTrails(food.id);
      this.disposeDynamicItem(food);
      this.food = this.food.filter((item) => item !== food);
    }
  }

  fadeFoodTrails(sourceId) {
    for (const trail of this.trails) {
      if (trail.kind !== "food" || trail.sourceId !== sourceId) continue;
      trail.followStrength = 0;
      trail.life = Math.min(trail.life, 0.18);
      trail.decay = PHEROMONE_PARAMS.foodDepletedDecay;
    }
  }

  addBranch(branch) {
    const dx = branch.x2 - branch.x1;
    const dz = branch.z2 - branch.z1;
    const length = Math.hypot(dx, dz);
    const width = branch.width ?? 1.35 + (ui.intensity ? Number(ui.intensity.value) : 3) * 0.18;
    const geometry = new THREE.CylinderGeometry(width, width * 0.75, length, 10);
    const mesh = new THREE.Mesh(geometry, this.materials.branch);
    mesh.position.set((branch.x1 + branch.x2) / 2, width * 0.95, (branch.z1 + branch.z2) / 2);
    const direction = new THREE.Vector3(dx, 0, dz).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    mesh.castShadow = this.quality.shadowQuality !== "off";
    mesh.receiveShadow = this.quality.shadowQuality !== "off";
    this.scene.add(mesh);
    this.dynamicObjects.add(mesh);
    this.branches.push({ ...branch, width: width * 1.45, group: mesh });
  }

  updateBranchPreview() {
    this.clearBranchPreview();
    if (!this.branchDraft) return;
    const dx = this.branchDraft.x2 - this.branchDraft.x1;
    const dz = this.branchDraft.z2 - this.branchDraft.z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.5) return;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.6, length, 8),
      new THREE.MeshBasicMaterial({ color: 0x51b7a6, transparent: true, opacity: 0.58 }),
    );
    mesh.position.set((this.branchDraft.x1 + this.branchDraft.x2) / 2, 0.7, (this.branchDraft.z1 + this.branchDraft.z2) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dz).normalize());
    this.branchPreview = mesh;
    this.scene.add(mesh);
  }

  clearBranchPreview() {
    if (this.branchPreview) {
      disposeObject3D(this.branchPreview);
      this.branchPreview = null;
    }
  }

  eraseAt(x, z) {
    const radius = 7;
    const removeFrom = (list, predicate, onRemove = () => {}) => {
      for (const item of [...list]) {
        if (predicate(item)) {
          onRemove(item);
          this.disposeDynamicItem(item);
          const index = list.indexOf(item);
          if (index >= 0) list.splice(index, 1);
        }
      }
    };
    removeFrom(this.water, (item) => distance2(item.x, item.z, x, z) < radius + item.radius * 0.45);
    removeFrom(this.stones, (item) => distance2(item.x, item.z, x, z) < radius + item.radius * 0.45);
    removeFrom(
      this.food,
      (item) => distance2(item.x, item.z, x, z) < radius + item.radius * 0.45,
      (item) => this.fadeFoodTrails(item.id),
    );
    removeFrom(this.branches, (item) => {
      const p = closestPointOnSegment(x, z, item.x1, item.z1, item.x2, item.z2);
      return distance2(x, z, p.x, p.z) < radius + item.width;
    });
  }

  addCombatEffect(x, z, intensity = 1, grapplers = 1, angle = 0) {
    const quality = this.quality.effectsQuality ?? 1;
    if (quality <= 0) return;
    const strength = clamp(intensity * quality, 0.35, 1.8);
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const ringMaterial = this.materials.combatRing.clone();
    const ring = new THREE.Mesh(this.geometries.impactRing, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    ring.scale.setScalar(0.9 + strength * 0.5);
    group.add(ring);

    const dustMaterial = this.materials.combatDust.clone();
    const puffs = [];
    const puffCount = Math.floor(clamp(2 + grapplers, 3, 6) * quality);
    for (let i = 0; i < puffCount; i += 1) {
      const puff = new THREE.Mesh(this.geometries.combatDust, dustMaterial);
      const spread = angle + rand(-1.9, 1.9) + (i / Math.max(1, puffCount - 1) - 0.5) * 1.1;
      const baseScale = rand(0.18, 0.34) * (0.9 + strength * 0.22);
      puff.position.set(Math.cos(spread) * rand(0.12, 0.42), 0.1 + rand(0, 0.08), Math.sin(spread) * rand(0.12, 0.42));
      puff.scale.setScalar(baseScale);
      group.add(puff);
      puffs.push({
        mesh: puff,
        angle: spread,
        speed: rand(0.95, 2.4) * (0.75 + strength * 0.24),
        lift: rand(0.12, 0.34),
        baseScale,
      });
    }

    const flashMaterial = this.materials.combatFlash.clone();
    const flashes = [];
    for (let i = 0; i < 2; i += 1) {
      const slash = new THREE.Mesh(this.geometries.combatSlash, flashMaterial);
      const slashAngle = angle + (i === 0 ? Math.PI / 2 : -Math.PI / 2) + rand(-0.45, 0.45);
      const direction = new THREE.Vector3(Math.cos(slashAngle), 0.14, Math.sin(slashAngle)).normalize();
      slash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      slash.position.set(Math.cos(slashAngle) * rand(0.05, 0.28), 0.34 + rand(0, 0.14), Math.sin(slashAngle) * rand(0.05, 0.28));
      slash.scale.set(0.045 + strength * 0.016, 0.9 + strength * 0.5, 0.045 + strength * 0.016);
      group.add(slash);
      flashes.push(slash);
    }

    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.combatEffects.push({
      age: 0,
      life: COMBAT_EFFECT_LIFE,
      strength,
      radius: 1.1 + strength * 0.75,
      group,
      ring,
      ringMaterial,
      dustMaterial,
      flashMaterial,
      puffs,
      flashes,
    });
    while (this.combatEffects.length > COMBAT_EFFECT_CAP) {
      const old = this.combatEffects.shift();
      this.disposeDynamicItem(old);
    }
  }

  updateCombatEffects(dt) {
    for (const effect of this.combatEffects) {
      effect.age += dt;
      const t = clamp(effect.age / effect.life, 0, 1);
      const fade = Math.pow(1 - t, 1.35);
      effect.group.position.y = Math.sin(t * Math.PI) * 0.08;
      effect.ring.scale.setScalar(effect.radius * (0.58 + t * 1.35));
      effect.ringMaterial.opacity = 0.42 * effect.strength * fade;
      effect.dustMaterial.opacity = 0.38 * effect.strength * fade;
      effect.flashMaterial.opacity = 0.58 * effect.strength * Math.max(0, 1 - t * 2.5);
      for (const puff of effect.puffs) {
        const outward = puff.speed * t;
        puff.mesh.position.set(
          Math.cos(puff.angle) * outward,
          0.1 + puff.lift * Math.sin(t * Math.PI),
          Math.sin(puff.angle) * outward,
        );
        puff.mesh.scale.setScalar(puff.baseScale * (1 + t * 1.8));
      }
      for (const flash of effect.flashes) flash.visible = t < 0.48;
    }
    this.combatEffects = this.combatEffects.filter((effect) => {
      if (effect.age < effect.life) return true;
      this.disposeDynamicItem(effect);
      return false;
    });
  }

  addTrail(x, z, kind, strength, options = {}) {
    const material =
      kind === "food"
        ? this.materials.trailFood.clone()
        : kind === "alarm"
          ? this.materials.trailAlarm.clone()
          : kind === "rescue"
            ? this.materials.trailRescue.clone()
            : this.materials.trailWater.clone();
    const mesh = new THREE.Mesh(this.geometries.trailCircle, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.045, z);
    const scale = kind === "alarm" ? 1.3 : 0.85;
    mesh.scale.setScalar(scale);
    this.scene.add(mesh);
    this.dynamicObjects.add(mesh);
    this.trails.push({
      x,
      z,
      kind,
      life: strength,
      decay:
        kind === "food"
          ? PHEROMONE_PARAMS.foodActiveDecay
          : kind === "alarm"
            ? PHEROMONE_PARAMS.alarmDecay
            : kind === "rescue"
              ? PHEROMONE_PARAMS.rescueDecay
              : PHEROMONE_PARAMS.waterDecay,
      sourceId: options.sourceId ?? null,
      sourceRatio: options.sourceRatio ?? 1,
      followStrength: kind === "food" ? clamp(options.sourceRatio ?? 1, 0, 1) : 1,
      mesh,
      scale,
      baseOpacity: material.opacity,
    });
    if (this.trails.length > 520) {
      const old = this.trails.shift();
      this.disposeDynamicItem(old);
    }
  }

  findRescueCandidate(helper) {
    let best = null;
    let bestDistance = Infinity;
    for (const ant of this.ants) {
      if (ant === helper || ant.stun <= 0) continue;
      if (!this.shouldRenderAnt(ant)) continue;
      const d = distance2(helper.x, helper.z, ant.x, ant.z);
      if (d < bestDistance && d < 22) {
        best = ant;
        bestDistance = d;
      }
    }
    return best;
  }

  selectNearestAnt(x, z) {
    let best = null;
    let bestDistance = 5;
    for (const ant of this.ants) {
      if (!this.shouldRenderAnt(ant)) continue;
      const d = distance2(x, z, ant.x, ant.z);
      if (d < bestDistance) {
        best = ant;
        bestDistance = d;
      }
    }
    this.selectedAnt = best;
    this.updateInspector();
  }

  constructionLabel(kind) {
    return isConstructionKind(kind) ? getConstructionDef(kind).label : "土木";
  }

  constructionButtonTitle(kind, commandState) {
    if (!isConstructionKind(kind)) return commandState?.reason ?? "";
    const detail = getConstructionDef(kind);
    return `${detail.command}: 工数 ${fmt(detail.buildCost, 1)} / 目安 ${detail.timeHint} / ${detail.timeNote} / 採土・往復あり / ${detail.effect}${commandState?.reason ? ` / ${commandState.reason}` : ""}`;
  }

  updateConstructionCommandButton(button, kind, commandState) {
    if (!button || !isConstructionKind(kind)) return;
    const detail = getConstructionDef(kind);
    button.disabled = !commandState.ok;
    button.title = this.constructionButtonTitle(kind, commandState);
    const main = button.querySelector(".button-main");
    const sub = button.querySelector(".button-sub");
    if (main) main.textContent = detail.command;
    if (sub) sub.textContent = `工数${fmt(detail.buildCost, 1)} / ${detail.timeHint} / ${detail.buttonSummary}`;
  }

  constructionAssignees(task) {
    return this.ants.filter((ant) => ant.variant === "builder" && ant.buildTaskId === task.id);
  }

  constructionTaskStatus(task) {
    const assignees = this.constructionAssignees(task);
    if (assignees.length <= 0) return "担当待ち";
    if (assignees.some((ant) => ant.lastTacticalAction === "build")) return "作業中";
    if (assignees.some((ant) => ant.lastTacticalAction === "deliverSoil" || ant.carryingSoil)) return "運搬中";
    if (assignees.some((ant) => ant.lastTacticalAction === "fetchSoil")) return "採土中";
    if (assignees.some((ant) => ant.lastTacticalAction === "retreatBehindGuard")) return "退避中";
    return "移動中";
  }

  constructionCrewStatus() {
    const totals = { fetching: 0, carrying: 0, building: 0, retreating: 0, idle: 0 };
    for (const ant of this.ants) {
      if (ant.variant !== "builder") continue;
      if (ant.lastTacticalAction === "retreatBehindGuard") totals.retreating += 1;
      else if (ant.lastTacticalAction === "build") totals.building += 1;
      else if (ant.lastTacticalAction === "deliverSoil" || ant.lastTacticalAction === "carrySoil" || ant.carryingSoil) totals.carrying += 1;
      else if (ant.lastTacticalAction === "fetchSoil") totals.fetching += 1;
      else totals.idle += 1;
    }
    const { fetching, carrying, building, retreating, idle } = totals;
    return { fetching, carrying, building, retreating, idle };
  }

  renderConstructionProgress() {
    if (!ui.constructionProgressList) return;
    this.cleanupBuildTaskAssignments();
    const activeTasks = this.buildTasks.filter((task) => task.progress < task.maxProgress);
    const assigneeLimit = this.buildTaskAssigneeLimit();
    ui.constructionProgressList.replaceChildren();
    if (activeTasks.length <= 0) {
      const empty = document.createElement("div");
      empty.className = "construction-task";
      empty.textContent = this.constructionMessage || "作業なし";
      ui.constructionProgressList.append(empty);
      return;
    }
    for (const task of activeTasks) {
      const progress = clamp(task.progress / Math.max(task.maxProgress, 0.001), 0, 1);
      const percent = Math.round(progress * 100);
      const detail = getConstructionDef(task.kind);
      const assigneeCount = Math.max(this.constructionAssignees(task).length, this.normalizeBuildTaskClaims(task).length);
      const row = document.createElement("div");
      row.className = "construction-task";

      const header = document.createElement("div");
      header.className = "construction-task-header";
      const label = document.createElement("strong");
      label.textContent = this.constructionLabel(task.kind);
      const value = document.createElement("span");
      value.textContent = `${percent}%`;
      header.append(label, value);

      const track = document.createElement("div");
      track.className = "construction-progress-track";
      const fill = document.createElement("span");
      fill.className = "construction-progress-fill";
      fill.style.width = `${percent}%`;
      track.append(fill);

      const meta = document.createElement("div");
      meta.className = "construction-task-meta";
      meta.textContent = `${this.constructionTaskStatus(task)} / 工数 ${fmt(task.maxProgress, 1)} / 目安 ${detail.timeHint} / 担当 ${fmt(assigneeCount, 0)}/${fmt(assigneeLimit, 0)}`;

      row.append(header, track, meta);
      ui.constructionProgressList.append(row);
    }
  }

  updateStats() {
    const d = this.computeDerived();
    const deployedSoldiers = this.deployedSoldierCount();
    const availableSoldiers = this.availableSortieSoldiers();
    const plannedSortie = this.plannedSortieCount();
    const sortiePool = this.sortieSoldierPool(d);
    const activeConstruction = this.buildTasks.filter((task) => task.progress < task.maxProgress).length;
    const completeConstruction = this.earthworks.filter((earthwork) => earthwork.strength > 0.95).length;
    const trailCommand = this.canStartConstruction("trailReinforce");
    const barricadeCommand = this.canStartConstruction("lowBarricade");
    const wallCommand = this.canStartConstruction("earthWall");
    const cooldownLeft = Math.ceil(this.soldierSortieCooldown);
    const raid = this.ensureRaidState();
    const raidTime = Math.max(0, Math.ceil(raid.timer));
    const raidLabel =
      raid.phase === "warning" ? `敵襲予兆 ${raidTime}s / 防衛準備` :
      raid.phase === "active" ? `敵襲防衛中 / 侵入 ${this.raidRivals().length}` :
      raid.phase === "retreating" ? "敵アリ退却中" :
      raid.phase === "recovering" ? `防衛後の警戒 ${raidTime}s` :
      `次の敵襲まで ${raidTime}s`;

    ui.statFood.textContent = fmt(this.colony.food, 0);
    ui.statAnts.textContent = `${fmt(this.colony.antPopulation, 0)}/${fmt(d.capacity, 0)}`;
    ui.statFoodRate.textContent = fmt(d.foodRate, 2);
    ui.statTerritory.textContent = fmt(this.colony.territory, 0);
    ui.statNestLevel.textContent = fmt(this.colony.nestLevel, 0);
    ui.statCapacity.textContent = fmt(d.capacity, 0);
    ui.statSoldiers.textContent = fmt(this.colony.soldierAnts, 0);
    ui.statWounded.textContent = fmt(this.colony.woundedAnts, 0);
    ui.statGrowthRate.textContent = fmt(d.growthPerSecond * 60, 2);
    ui.statThreat.textContent = fmt(this.colony.enemyThreat, 1);
    ui.colonySummary.textContent =
      `巣Lv${this.colony.nestLevel} / 働き蟻 ${fmt(d.workers, 0)} / 兵隊 ${fmt(d.normalSoldiers, 0)} / 重兵装 ${fmt(d.heavySoldiers, 0)} / 土木 ${fmt(d.builders, 0)}`;
    ui.growthFill.style.width = `${Math.round(this.colony.hatchProgress * 100)}%`;
    ui.activeToolLabel.textContent = this.raidSoonMode ? "通常モード / 敵襲を短縮確認中" : raidLabel;
    if (ui.constructionBuilders) ui.constructionBuilders.textContent = fmt(d.builders, 0);
    if (ui.constructionActive) ui.constructionActive.textContent = fmt(activeConstruction, 0);
    if (ui.constructionComplete) ui.constructionComplete.textContent = fmt(completeConstruction, 0);
    this.updateConstructionCommandButton(ui.constructionTrailBtn, "trailReinforce", trailCommand);
    this.updateConstructionCommandButton(ui.constructionBarricadeBtn, "lowBarricade", barricadeCommand);
    this.updateConstructionCommandButton(ui.constructionWallBtn, "earthWall", wallCommand);
    if (ui.constructionStatus) {
      const activeProgress = this.buildTasks
        .filter((task) => task.progress < task.maxProgress)
        .map((task) => clamp(task.progress / Math.max(task.maxProgress, 0.001), 0, 1));
      const averageProgress = activeProgress.length > 0
        ? Math.round((activeProgress.reduce((sum, value) => sum + value, 0) / activeProgress.length) * 100)
        : 0;
      ui.constructionStatus.textContent =
        activeConstruction > 0 ? `作業中 ${fmt(activeConstruction, 0)} / 平均 ${averageProgress}% / 完成 ${fmt(completeConstruction, 0)}` :
        this.constructionMessage || "待機";
    }
    if (ui.constructionCrew) {
      const crew = this.constructionCrewStatus();
      ui.constructionCrew.textContent =
        `採土 ${fmt(crew.fetching, 0)} / 運搬 ${fmt(crew.carrying, 0)} / 作業 ${fmt(crew.building, 0)} / 退避 ${fmt(crew.retreating, 0)} / 待機 ${fmt(crew.idle, 0)}`;
    }
    if (this.activeTab === "construction") this.renderConstructionProgress();
    ui.soldierNest.textContent = fmt(Math.max(0, sortiePool - deployedSoldiers), 0);
    ui.soldierDeployed.textContent = fmt(deployedSoldiers, 0);
    ui.soldierStatus.textContent =
      deployedSoldiers > 0 ? "出撃中" :
      cooldownLeft > 0 ? `再準備 ${cooldownLeft}s` :
      plannedSortie > 0 ? `出撃可 ${plannedSortie}` :
      availableSoldiers > 0 ? "上限待ち" : "兵隊不足";
    ui.soldierSortieBtn.disabled = cooldownLeft > 0 || plannedSortie < 1;
    ui.soldierSortieBtn.textContent = cooldownLeft > 0 ? `再出撃まで ${cooldownLeft}s` : `兵隊を出撃 ${fmt(plannedSortie, 0)}`;
    if (ui.raidNotice) {
      const visible = this.raidNotice.timer > 0 && this.raidNotice.message;
      ui.raidNotice.hidden = !visible;
      ui.raidNotice.textContent = visible ? this.raidNotice.message : "";
      ui.raidNotice.classList.toggle("is-repelled", this.raidNotice.kind === "repelled");
      ui.raidNotice.classList.toggle("is-warning", this.raidNotice.kind !== "repelled");
    }
    ui.battleLog.innerHTML = this.colony.battleLog.map((entry) => `<div>${entry}</div>`).join("");
    this.renderUpgrades();
  }

  updateInspector() {
    this.updateStats();
    return;
    const ant = this.selectedAnt;
    if (!ant) {
      ui.inspector.innerHTML = '<span class="muted">個体未選択</span>';
      return;
    }
    ui.inspector.innerHTML = `
      <strong>個体 ${ant.id} / ${ROLE_LABELS[ant.role]} / ${STATE_LABELS[ant.state]}</strong>
      <div class="trait-grid">
        <span>好奇心 ${Math.round(ant.traits.curiosity * 100)}</span>
        <span>警戒心 ${Math.round(ant.traits.caution * 100)}</span>
        <span>協調性 ${Math.round(ant.traits.social * 100)}</span>
        <span>粘り ${Math.round(ant.traits.persistence * 100)}</span>
      </div>
    `;
  }
}

new AntColony3D();
