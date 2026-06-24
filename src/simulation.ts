// @ts-nocheck
import * as THREE from "three";
import { runExpeditionAgentBattle } from "./expedition/agent";
import { runLegacyExpeditionBattle } from "./expedition/legacyAdapter";
import { AntBattleInspector } from "./expedition/qa/AntBattleInspector";

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
  expeditionTab: document.querySelector("#expeditionTab"),
  expeditionSoldiers: document.querySelector("#expeditionSoldiers"),
  expeditionChance: document.querySelector("#expeditionChance"),
  expeditionReward: document.querySelector("#expeditionReward"),
  expeditionBtn: document.querySelector("#expeditionBtn"),
  battleLog: document.querySelector("#battleLog"),
  empirePanel: document.querySelector("#empirePanel"),
  panelGrip: document.querySelector("#panelGrip"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingBar: document.querySelector("#loadingBar"),
  loadingLabel: document.querySelector("#loadingLabel"),
  errorPanel: document.querySelector("#errorPanel"),
  errorMessage: document.querySelector("#errorMessage"),
  debugPanel: document.querySelector("#debugPanel"),
  debugMetrics: document.querySelector("#debugMetrics"),
  qualitySelect: document.querySelector("#qualitySelect"),
};

const FIXED_DT = 1 / 60;
const MAX_FRAME_DELTA = 0.25;
const MAX_FIXED_STEPS = 5;
const SAVE_KEY = "ant3d.colonyState";
const DISPLAY_ANT_CAP = 80;
const RIVAL_ANT_COUNT = 4;
const RIVAL_CONTACT_RADIUS = 4.1;
const RIVAL_CLASH_DURATION = 2.0;
const CAMERA_DISTANCE_MIN = 138;
const CAMERA_DISTANCE_MAX = 340;
const CAMERA_DISTANCE_MOBILE = 252;
const CAMERA_DISTANCE_DESKTOP = 238;
const OFFLINE_CAP_SECONDS = 8 * 60 * 60;
const DEBUG_QUERY = new URLSearchParams(window.location.search);
const IS_DEBUG = DEBUG_QUERY.get("debug") === "1";
const IS_EXPEDITION_ONLY = DEBUG_QUERY.get("expeditionOnly") === "1" || DEBUG_QUERY.get("mode") === "expedition";
const EXPEDITION_ENGINE_KEY = "ant3d.expeditionEngine";
const SUPPORTED_EXPEDITION_ENGINES = new Set(["agent", "legacy"]);

function resolveExpeditionEngine(value) {
  return SUPPORTED_EXPEDITION_ENGINES.has(value) ? value : "agent";
}

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

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-critical user preference persistence can fail in private or locked-down contexts.
  }
}

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
  expedition: "遠征",
  expedition_wounded: "負傷帰巣",
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => Math.random() < p;
const distance2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const normAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const fmt = (value, digits = 0) => Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits });

const UPGRADE_BRANCHES = [
  { id: "foraging", name: "採餌網" },
  { id: "nursery", name: "育房" },
  { id: "architecture", name: "巣構造" },
  { id: "defense", name: "防衛" },
];

const UPGRADE_DEFS = [
  {
    id: "foragerTrails",
    branch: "foraging",
    name: "採餌道",
    desc: "働き蟻が餌場へ戻る道を覚えやすくする",
    effect: "採餌効率を大きく上げる",
    max: 8,
    baseCost: 40,
    costScale: 1.72,
    requires: {},
  },
  {
    id: "trailPheromones",
    branch: "foraging",
    name: "匂い道の維持",
    desc: "成功した採餌道の情報を長く使う",
    effect: "採餌効率を少し上げる",
    max: 4,
    baseCost: 95,
    costScale: 1.86,
    requires: { ants: 16, upgrades: { foragerTrails: 2 } },
  },
  {
    id: "storageChambers",
    branch: "architecture",
    name: "貯蔵室",
    desc: "餌と働き蟻を受け入れる空間を広げる",
    effect: "収容上限と採餌の安定性を上げる",
    max: 8,
    baseCost: 85,
    costScale: 1.9,
    requires: { ants: 18 },
  },
  {
    id: "chamberExcavation",
    branch: "architecture",
    name: "坑道分岐",
    desc: "巣内の通路を増やし、混雑を減らす",
    effect: "収容上限と採餌効率を上げる",
    max: 6,
    baseCost: 75,
    costScale: 1.75,
    requires: { ants: 14 },
  },
  {
    id: "ventilationShafts",
    branch: "architecture",
    name: "換気孔",
    desc: "巣内の空気と湿度を安定させる",
    effect: "収容上限、防御、脅威耐性を少し上げる",
    max: 5,
    baseCost: 140,
    costScale: 1.88,
    requires: { nestLevel: 2, upgrades: { chamberExcavation: 2 } },
  },
  {
    id: "wasteGallery",
    branch: "architecture",
    name: "廃棄坑",
    desc: "食べ残しや死骸を生活区から離す",
    effect: "回復、防御、脅威耐性を上げる",
    max: 4,
    baseCost: 190,
    costScale: 1.95,
    requires: { nestLevel: 3, upgrades: { ventilationShafts: 2 } },
  },
  {
    id: "broodNursery",
    branch: "nursery",
    name: "育児室",
    desc: "卵と幼虫をまとめて世話しやすくする",
    effect: "孵化速度と負傷回復を上げる",
    max: 8,
    baseCost: 65,
    costScale: 1.82,
    requires: { ants: 14 },
  },
  {
    id: "broodClimate",
    branch: "nursery",
    name: "育房の保温",
    desc: "幼虫と蛹を安定した場所へ移しやすくする",
    effect: "孵化速度を上げる",
    max: 5,
    baseCost: 115,
    costScale: 1.86,
    requires: { nestLevel: 2, upgrades: { broodNursery: 2 } },
  },
  {
    id: "foodDistribution",
    branch: "nursery",
    name: "食料分配",
    desc: "働き蟻どうしの食料受け渡しを滑らかにする",
    effect: "幼虫コストを下げ、採餌効率を少し上げる",
    max: 5,
    baseCost: 130,
    costScale: 1.9,
    requires: { upgrades: { storageChambers: 1, broodNursery: 1 } },
  },
  {
    id: "queenCare",
    branch: "nursery",
    name: "女王の世話",
    desc: "女王の周囲に世話役を集める",
    effect: "孵化速度を大きく上げる",
    max: 8,
    baseCost: 120,
    costScale: 2.05,
    requires: { lifetimeFood: 160, upgrades: { broodNursery: 1 } },
  },
  {
    id: "soldierTraining",
    branch: "defense",
    name: "兵隊訓練",
    desc: "大きめの働き蟻を防衛と遠征に回す",
    effect: "兵隊比率と攻撃力を上げる",
    max: 6,
    baseCost: 180,
    costScale: 2.1,
    requires: { ants: 24, nestLevel: 2 },
  },
  {
    id: "nestGuard",
    branch: "defense",
    name: "巣の守り",
    desc: "入口周辺を守る働き蟻を増やす",
    effect: "防御力と負傷回復を上げる",
    max: 6,
    baseCost: 220,
    costScale: 2.12,
    requires: { territory: 2 },
  },
  {
    id: "sentinelPosts",
    branch: "defense",
    name: "見張り口",
    desc: "外敵に近い入口へ警戒役を置く",
    effect: "防御力、攻撃力、脅威耐性を上げる",
    max: 4,
    baseCost: 260,
    costScale: 2.0,
    requires: { territory: 3, upgrades: { nestGuard: 2 } },
  },
];

function createDefaultColony() {
  return {
    version: 2,
    food: 36,
    lifetimeFood: 36,
    antPopulation: 12,
    soldierAnts: 1,
    woundedAnts: 0,
    attackPower: 1,
    defensePower: 1,
    nestLevel: 1,
    territory: 0,
    enemyThreat: 6,
    hatchProgress: 0,
    battleCooldownUntil: 0,
    unlockedEnemyColonies: ["near-food"],
    upgrades: Object.fromEntries(UPGRADE_DEFS.map((upgrade) => [upgrade.id, 0])),
    battleLog: ["小さな巣が地中で動き始めた"],
    lastSavedAt: Date.now(),
  };
}

function migrateColony(raw) {
  const base = createDefaultColony();
  if (!raw || typeof raw !== "object") return base;
  const next = {
    ...base,
    ...raw,
    version: 2,
    upgrades: { ...base.upgrades, ...(raw.upgrades ?? {}) },
    battleLog: Array.isArray(raw.battleLog) ? raw.battleLog.slice(0, 5) : base.battleLog,
  };

  if (!Number.isFinite(next.antPopulation) || next.antPopulation > 80) {
    next.antPopulation = clamp(Number(next.antPopulation) || 12, 12, 32);
  }
  next.food = clamp(Number(next.food) || base.food, 0, 100000000);
  next.lifetimeFood = Math.max(next.food, Number(next.lifetimeFood) || next.food);
  next.antPopulation = Math.floor(clamp(Number(next.antPopulation) || 12, 12, 1000000));
  next.soldierAnts = Math.floor(clamp(Number(next.soldierAnts) || 1, 0, next.antPopulation));
  next.woundedAnts = Math.floor(clamp(Number(next.woundedAnts) || 0, 0, next.antPopulation));
  next.nestLevel = Math.floor(clamp(Number(next.nestLevel) || 1, 1, 999));
  next.territory = Math.floor(clamp(Number(next.territory) || 0, 0, 999999));
  next.enemyThreat = clamp(Number(next.enemyThreat) || base.enemyThreat, 0, 999999);
  next.hatchProgress = clamp(Number(next.hatchProgress) || 0, 0, 0.999);
  next.battleCooldownUntil = Number(next.battleCooldownUntil) || 0;
  next.lastSavedAt = Number(next.lastSavedAt) || Date.now();
  for (const upgrade of UPGRADE_DEFS) {
    next.upgrades[upgrade.id] = Math.floor(clamp(Number(next.upgrades[upgrade.id]) || 0, 0, upgrade.max));
  }
  return next;
}

function readColonyState() {
  const raw = readStorage(SAVE_KEY);
  if (!raw) return createDefaultColony();
  try {
    return migrateColony(JSON.parse(raw));
  } catch {
    return createDefaultColony();
  }
}

function upgradeCost(upgrade, level) {
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.costScale, level));
}

function upgradeLevel(upgrades, id) {
  return Math.max(0, Number(upgrades?.[id]) || 0);
}

function upgradeName(id) {
  return UPGRADE_DEFS.find((upgrade) => upgrade.id === id)?.name ?? id;
}

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
      `objects ${this.sim.water.length + this.sim.stones.length + this.sim.food.length + this.sim.branches.length + this.sim.predators.length}`,
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
    this.baseSpeed = rand(7.2, 12.8);
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
    this.expeditionControl = null;
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
    if (roll < 0.72) return "worker";
    if (roll < 0.9) return "nurse";
    return "guard";
  }

  update(dt, sim) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevAngle = this.angle;
    if (this.expeditionControl) {
      this.currentTask = this.state;
      return;
    }
    this.stateTime += dt;
    this.homeTimer += dt;
    this.wet = Math.max(0, this.wet - dt * 0.11);
    this.energy = clamp(this.energy + dt * 0.012, 0, 1);
    this.lastTrail += dt;

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

    if (sensed.alarm > 0.55 && this.state === "explore" && chance(dt * (0.55 + this.traits.caution))) {
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
    steering.x += sensed.hazard.x * (1.2 + this.traits.caution);
    steering.z += sensed.hazard.z * (1.2 + this.traits.caution);

    if (this.state === "panic") this.updatePanic(dt, sim, steering, sensed);
    else if (this.state === "wet") this.updateWet(dt, sim, steering);
    else if (this.state === "return") this.updateReturn(dt, sim, steering);
    else if (this.state === "rescue") this.updateRescue(dt, sim, steering);
    else this.updateExplore(dt, sim, steering, sensed);

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

  beginExpeditionControl(phase, frame) {
    this.expeditionControl = {
      phase,
      startedAtX: this.x,
      startedAtZ: this.z,
      startedAtHeading: this.angle,
      startedAtGait: this.gaitPhase,
    };
    this.carrying = 0;
    this.foodSourceId = null;
    this.clashRival = null;
    this.clashTimer = 0;
    this.fleeTimer = 0;
    this.stun = 0;
    this.setState("expedition");
    if (frame) this.applyExpeditionFrame(frame);
  }

  applyExpeditionFrame(frame) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevAngle = this.angle;
    this.x = frame.x;
    this.z = frame.y;
    this.vx = frame.vx ?? 0;
    this.vz = frame.vy ?? 0;
    this.angle = Math.PI / 2 - frame.heading;
    this.gaitPhase = frame.gaitPhase ?? this.gaitPhase;
    this.health = clamp(frame.hp ?? this.health, 0, 1);
    this.stamina = clamp(frame.stamina ?? this.stamina, 0, 1);
    this.wounded = this.wounded || this.health < 0.68 || frame.state === "retreat";
    this.currentTask = frame.state ?? "expedition";
    if (frame.renderIndex != null) this.renderInstanceIndex = frame.renderIndex;
    this.setState(this.wounded ? "expedition_wounded" : "expedition");
  }

  finishExpeditionControl(finalFrame, nest) {
    if (finalFrame) this.applyExpeditionFrame(finalFrame);
    this.expeditionControl = null;
    this.fatigue = clamp(1 - this.stamina, 0, 1);
    if (this.wounded || this.health < 0.72) {
      this.wounded = true;
      this.fleeFromX = this.x;
      this.fleeFromZ = this.z;
      this.fleeTimer = 3.2;
      this.setState("flee");
    } else {
      this.setState(this.carrying > 0 ? "return" : "explore");
    }
    if (nest && this.wounded) {
      const d = distance2(this.x, this.z, nest.x, nest.z);
      if (d < nest.radius * 0.8) this.setState("wet");
    }
  }

  startRivalClash(rival, anchorX, anchorZ, duration = RIVAL_CLASH_DURATION) {
    if (this.clashTimer > 0 || this.fleeTimer > 0 || this.stun > 0 || this.state === "stunned") return false;
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
    if (!rival || rival.clash?.ant !== this) {
      this.clashRival = null;
      this.clashTimer = 0;
      if (this.state === "clash") this.setState(this.fleeTimer > 0 ? "flee" : "explore");
      return;
    }
    this.clashTimer = Math.max(0, this.clashTimer - dt);
    this.angle = Math.atan2(rival.x - this.x, rival.z - this.z);
    this.energy = clamp(this.energy - dt * 0.018, 0, 1);
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
      if (rival.retreat > 0) continue;
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
    if (sensed.closestFood && sensed.foodDistance < sensed.closestFood.radius + 1.5 && this.role !== "guard") {
      this.carrying = Math.min(1, sensed.closestFood.amount);
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
      this.setState("explore");
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

    if (this.role === "guard" || this.traits.persistence > 0.72) {
      const rival = sim.findRivalThreat(this.x, this.z, 18);
      if (rival) {
        const d = distance2(this.x, this.z, rival.x, rival.z) || 1;
        const pressure = this.role === "guard" ? 1.35 : 0.68;
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
      const turnRate = (this.state === "panic" ? 8.6 : 4.6) * dt;
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
    speed *= clamp(1 - this.wet * 0.3, 0.34, 1);
    speed *= sim.terrainSpeedAt(this.x, this.z);
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
      scale: (this.state === "stunned" ? 0.82 : this.state === "clash" ? 1.06 : 1) * this.bodyScale,
      state: this.state,
      carrying: this.carrying,
      gaitPhase: this.gaitPhase,
      renderIndex: this.renderInstanceIndex,
      id: this.id,
    };
  }
}

class RivalAnt3D {
  constructor(id, sim) {
    this.id = id;
    this.isRival = true;
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
    this.steering = { x: 0, z: 0 };
    this.placeAtSpawn(sim);
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
      else this.addFoodCompetition(steering, sim);
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

  findHarassmentTarget(sim) {
    if (this.retreat > 0 || this.clash) return null;
    let best = null;
    let bestScore = 0;
    for (const ant of sim.ants) {
      if (ant.state === "stunned" || ant.state === "clash" || ant.state === "flee" || ant.fleeTimer > 0) continue;
      const d = distance2(this.x, this.z, ant.x, ant.z);
      if (d > 18) continue;
      const carryingBonus = ant.carrying > 0 ? 10 : 0;
      const guardPenalty = ant.role === "guard" ? -4 : 0;
      const foodBonus = sim.isNearFood(ant.x, ant.z, 14) ? 6 : 0;
      const score = 22 - d + carryingBonus + foodBonus + guardPenalty;
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
    const reach = sim.nest.radius + 24;
    if (d >= reach) return;
    const strength = (1 - d / reach) * 1.1;
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

    if (d < 3.2) this.retreat = Math.min(this.retreat, 0.35);
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

  combatPowers(ant) {
    const rivalPower = 0.74 + this.aggression * 0.86 + this.stubbornness * 0.48 + this.scale * 0.28;
    const rolePower = ant.role === "guard" ? 1.0 : ant.role === "worker" ? 0.22 : ant.role === "scout" ? 0.24 : 0.1;
    const carriedPenalty = ant.carrying > 0 ? -0.18 : 0;
    const antPower = 0.7 + ant.traits.persistence * 0.74 + ant.traits.caution * 0.52 + rolePower + carriedPenalty;
    return { rivalPower, antPower };
  }

  startClash(ant, anchorX, anchorZ) {
    if (this.clash || this.retreat > 0 || !ant.startRivalClash(this, anchorX, anchorZ, RIVAL_CLASH_DURATION)) return false;
    const dx = ant.x - this.x;
    const dz = ant.z - this.z;
    const length = Math.hypot(dx, dz);
    const lineX = length > 0.0001 ? dx / length : Math.sin(this.angle);
    const lineZ = length > 0.0001 ? dz / length : Math.cos(this.angle);
    this.clash = {
      ant,
      elapsed: 0,
      duration: RIVAL_CLASH_DURATION,
      anchorX,
      anchorZ,
      phase: rand(0, Math.PI * 2),
      lineX,
      lineZ,
      nextTrail: 0.24,
    };
    this.state = "clash";
    this.disrupt = Math.max(this.disrupt, 0.55);
    return true;
  }

  updateClash(dt, sim) {
    const clash = this.clash;
    const ant = clash?.ant;
    if (!clash || !ant || !sim.ants.includes(ant)) {
      this.clash = null;
      this.state = "rival";
      return;
    }

    clash.elapsed += dt;
    const progress = clamp(clash.elapsed / clash.duration, 0, 1);
    const lineX = clash.lineX;
    const lineZ = clash.lineZ;
    const sideX = -lineZ;
    const sideZ = lineX;
    const shove = Math.sin(clash.elapsed * 18 + clash.phase) * 0.1;
    const brace = Math.sin(clash.elapsed * 27 + this.id) * 0.07;
    const spacing = 0.72 + brace;
    const lateral = sideX * shove;
    const lateralZ = sideZ * shove;
    const antTargetX = clash.anchorX + lineX * spacing + lateral;
    const antTargetZ = clash.anchorZ + lineZ * spacing + lateralZ;
    const rivalTargetX = clash.anchorX - lineX * spacing * 0.86 - lateral * 0.72;
    const rivalTargetZ = clash.anchorZ - lineZ * spacing * 0.86 - lateralZ * 0.72;

    ant.x += (antTargetX - ant.x) * 0.45;
    ant.z += (antTargetZ - ant.z) * 0.45;
    this.x += (rivalTargetX - this.x) * 0.45;
    this.z += (rivalTargetZ - this.z) * 0.45;
    ant.angle = Math.atan2(this.x - ant.x, this.z - ant.z);
    this.angle = Math.atan2(ant.x - this.x, ant.z - this.z);
    ant.energy = clamp(ant.energy - dt * (0.018 + this.aggression * 0.012), 0, 1);
    this.disrupt = Math.max(this.disrupt, 0.35 + progress * 0.28);
    ant.keepInWorld(sim);
    this.keepInWorld(sim);

    if (clash.elapsed >= clash.nextTrail) {
      sim.addTrail(clash.anchorX, clash.anchorZ, "alarm", 0.52);
      clash.nextTrail += 0.5;
    }

    if (clash.elapsed >= clash.duration) this.finishClash(sim);
  }

  finishClash(sim) {
    const clash = this.clash;
    if (!clash) return;
    const ant = clash.ant;
    this.clash = null;
    this.state = "rival";
    ant.clashRival = null;
    ant.clashTimer = 0;
    ant.clashDuration = 0;

    const { rivalPower, antPower } = this.combatPowers(ant);
    const dx = ant.x - this.x;
    const dz = ant.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;

    if (rivalPower >= antPower) {
      ant.x += nx * 0.42;
      ant.z += nz * 0.42;
      ant.angle = Math.atan2(sim.nest.x - ant.x, sim.nest.z - ant.z);
      ant.energy = clamp(ant.energy - 0.18 * this.aggression, 0, 1);
      ant.startFleeHome(this.x, this.z, 4.4 + this.aggression * 1.4);
      this.victoryFlash = 1;
      this.lastFightWinner = "rival";
      sim.registerRivalFight("rival", ant, this);
    } else {
      this.x -= nx * 0.38;
      this.z -= nz * 0.38;
      this.angle = Math.atan2(this.homeX - this.x, this.homeZ - this.z);
      this.disrupt = Math.max(this.disrupt, 1.15);
      this.startRetreatHome(ant.x, ant.z, 4.8 + ant.traits.persistence * 1.5);
      if (ant.state === "clash") ant.setState(ant.carrying > 0 ? "return" : "explore");
      this.lastFightWinner = "colony";
      sim.registerRivalFight("colony", ant, this);
    }

    sim.addTrail((this.x + ant.x) * 0.5, (this.z + ant.z) * 0.5, "alarm", 0.9);
    this.fightCooldown = 1.05;
    ant.keepInWorld(sim);
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
    const speed = this.baseSpeed * (1 - this.disrupt * 0.28) * (this.retreat > 0 ? 1.28 : 1) * sim.terrainSpeedAt(this.x, this.z) * sim.timeScale;
    this.x += Math.sin(this.angle) * speed * dt;
    this.z += Math.cos(this.angle) * speed * dt;
    this.keepInWorld(sim);
  }

  resolveAntContacts(sim) {
    if (this.clash) return true;
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
      if (this.startClash(ant, anchorX, anchorZ)) {
        sim.addTrail(anchorX, anchorZ, "alarm", 0.55);
        resolved = true;
        break;
      }
    }
    return resolved;
  }

  keepInWorld(sim) {
    const d = Math.hypot(this.x, this.z);
    if (d > sim.worldRadius) {
      const nx = this.x / d;
      const nz = this.z / d;
      this.x = nx * sim.worldRadius;
      this.z = nz * sim.worldRadius;
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
    };
  }
}

class ExpeditionEnemyVisual {
  constructor(id, renderIndex = null) {
    this.id = id;
    this.isRival = true;
    this.isExpeditionEnemy = true;
    this.renderInstanceIndex = renderIndex;
    this.state = "rival";
    this.prevX = 0;
    this.prevZ = 0;
    this.x = 0;
    this.z = 0;
    this.prevAngle = Math.PI;
    this.angle = Math.PI;
    this.vx = 0;
    this.vz = 0;
    this.gaitPhase = 0;
    this.animationSeed = id * 1103515245;
    this.scale = 1.18;
    this.health = 1;
    this.currentTask = "spawn";
    this.spawnReason = "enemy_from_edge";
  }

  update() {
    // Controlled by expedition frame logs.
  }

  applyExpeditionFrame(frame) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevAngle = this.angle;
    this.x = frame.x;
    this.z = frame.y;
    this.vx = frame.vx ?? 0;
    this.vz = frame.vy ?? 0;
    this.angle = Math.PI / 2 - frame.heading;
    this.gaitPhase = frame.gaitPhase ?? this.gaitPhase;
    this.health = clamp(frame.hp ?? this.health, 0, 1);
    this.currentTask = frame.state ?? "expedition";
    this.spawnReason = frame.spawnReason ?? this.spawnReason;
    if (frame.renderIndex != null) this.renderInstanceIndex = frame.renderIndex;
  }

  renderState(_sim, alpha) {
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      z: this.prevZ + (this.z - this.prevZ) * alpha,
      angle: this.prevAngle + normAngle(this.angle - this.prevAngle) * alpha,
      y: 0.24 + Math.sin(this.gaitPhase + this.animationSeed * 0.000001) * 0.012,
      scale: this.scale,
      state: "rival",
      carrying: 0,
      gaitPhase: this.gaitPhase,
      renderIndex: this.renderInstanceIndex,
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
    for (const leg of legs) {
      segments.push({ radius: 0.026, from: [side * leg.rootX, -0.02, leg.rootZ], to: [side * leg.elbowX, -0.13, leg.elbowZ] });
      segments.push({ radius: 0.021, from: [side * leg.elbowX, -0.13, leg.elbowZ], to: [side * leg.footX, -0.25, leg.footZ] });
    }
    segments.push({ radius: 0.021, from: [side * 0.16, 0.05, 1.54], to: [side * 0.42, 0.02, 1.96] });
    segments.push({ radius: 0.017, from: [side * 0.42, 0.02, 1.96], to: [side * 0.78, -0.06, 2.26] });
    segments.push({ radius: 0.024, from: [side * 0.12, -0.04, 1.54], to: [side * 0.34, -0.08, 1.76] });
  }
  return segments;
})();

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
    this.appendageMesh = new THREE.InstancedMesh(this.appendageGeometry, sim.materials.antAppendage, capacity * ANT_APPENDAGE_SEGMENTS.length);
    this.appendageMesh.count = 0;
    this.appendageMesh.castShadow = sim.quality.shadowQuality !== "off";
    this.appendageMesh.frustumCulled = false;
    sim.scene.add(this.appendageMesh);

    this.foodMesh = new THREE.InstancedMesh(sim.geometries.foodCrumb, sim.materials.food, capacity);
    this.foodMesh.count = 0;
    this.foodMesh.castShadow = sim.quality.shadowQuality !== "off";
    this.foodMesh.frustumCulled = false;
    sim.scene.add(this.foodMesh);
  }

  beginFrame() {
    const limit = Math.min(this.capacity, this.highWaterMark);
    for (const meshes of this.bodyMeshes.values()) {
      for (const mesh of meshes.values()) {
        mesh.count = limit;
        for (let i = 0; i < limit; i += 1) mesh.setMatrixAt(i, this.hiddenMatrix);
      }
    }
    for (let i = 0; i < limit * ANT_APPENDAGE_SEGMENTS.length; i += 1) {
      this.appendageMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    for (let i = 0; i < limit; i += 1) this.foodMesh.setMatrixAt(i, this.hiddenMatrix);
    this.appendageMesh.count = limit * ANT_APPENDAGE_SEGMENTS.length;
    this.foodMesh.count = limit;
  }

  keyFor(ant) {
    if (ant.isExpeditionEnemy) return `expedition-enemy:${ant.id}`;
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
    const start = index * ANT_APPENDAGE_SEGMENTS.length;
    for (let i = 0; i < ANT_APPENDAGE_SEGMENTS.length; i += 1) this.appendageMesh.setMatrixAt(start + i, this.hiddenMatrix);
    this.foodMesh.setMatrixAt(index, this.hiddenMatrix);
  }

  releaseRenderObject(ant) {
    const key = this.keyFor(ant);
    const index = this.idToRenderIndex.get(key);
    if (index != null) this.renderIndexToKey.delete(index);
    this.idToRenderIndex.delete(key);
    if (ant.renderInstanceIndex === index) ant.renderInstanceIndex = null;
  }

  renderAnt(ant, renderState) {
    const index = this.assignRenderIndex(ant);
    const meshes = this.bodyMeshes.get(renderState.state) ?? this.bodyMeshes.get("explore");
    for (const part of ANT_BODY_PARTS) {
      this.composeLocalMatrix(renderState, part.x, part.y, part.z, part.sx, part.sy, part.sz);
      meshes.get(part.name).setMatrixAt(index, this.dummy.matrix);
    }

    let segmentIndex = index * ANT_APPENDAGE_SEGMENTS.length;
    for (const segment of ANT_APPENDAGE_SEGMENTS) {
      this.composeSegmentMatrix(renderState, segment);
      this.appendageMesh.setMatrixAt(segmentIndex, this.dummy.matrix);
      segmentIndex += 1;
    }

    if (renderState.carrying > 0) {
      this.composeLocalMatrix(renderState, 0, 0.14, 1.9, 0.36, 0.36, 0.36);
      this.foodMesh.setMatrixAt(index, this.dummy.matrix);
    }
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
    this.localPointToWorld(renderState, segment.from, this.segmentStart);
    this.localPointToWorld(renderState, segment.to, this.segmentEnd);
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

  localPointToWorld(renderState, point, target) {
    const sin = Math.sin(renderState.angle);
    const cos = Math.cos(renderState.angle);
    const visualScale = renderState.scale * ANT_VISUAL_SCALE;
    const localX = point[0] * visualScale;
    const localY = point[1] * visualScale;
    const localZ = point[2] * visualScale;
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
    this.appendageMesh.count = limit * ANT_APPENDAGE_SEGMENTS.length;
    this.appendageMesh.instanceMatrix.needsUpdate = true;
    this.foodMesh.count = limit;
    this.foodMesh.instanceMatrix.needsUpdate = true;
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
    this.expeditionOnlyMode = IS_EXPEDITION_ONLY;
    this.expeditionOnlyNextStartAt = 0;
    document.body.classList.toggle("is-expedition-only", this.expeditionOnlyMode);
    this.worldRadius = 132;
    this.nest = { x: -42, z: 12, radius: 8 };
    this.colony = this.expeditionOnlyMode ? createDefaultColony() : readColonyState();
    this.derived = {};
    this.expeditionEngine = resolveExpeditionEngine(DEBUG_QUERY.get("expeditionEngine") ?? readStorage(EXPEDITION_ENGINE_KEY));
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
    this.ants = [];
    this.water = [];
    this.stones = [];
    this.food = [];
    this.branches = [];
    this.trails = [];
    this.terrain = [];
    this.terrainBumps = [];
    this.nestEntrances = [];
    this.nestSpoils = [];
    this.predators = [];
    this.rivalAnts = [];
    this.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };
    this.renderAntBuffer = [];
    this.expeditionReplay = null;
    this.lastExpeditionBattle = null;
    this.expeditionInspector = new AntBattleInspector();
    this.lastExpeditionDiagnostics = [];
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
    if (!this.expeditionOnlyMode) this.applyOfflineProgress(Date.now());
    this.createSharedAssets();
    this.antRenderer = new AntRenderSystem(this, DISPLAY_ANT_CAP + RIVAL_ANT_COUNT);
    this.createWorld();
    this.expeditionAgentRenderer = null;
    this.bindEvents();
    this.debugPanel = new DebugPanel(this);
    this.reset(false);
    if (this.expeditionOnlyMode) this.activateExpeditionOnlyMode();
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
      trailFood: new THREE.MeshBasicMaterial({ color: 0xd9a63f, transparent: true, opacity: 0.2, depthWrite: false }),
      trailAlarm: new THREE.MeshBasicMaterial({ color: 0xd96f58, transparent: true, opacity: 0.24, depthWrite: false }),
      trailRescue: new THREE.MeshBasicMaterial({ color: 0x51b7a6, transparent: true, opacity: 0.22, depthWrite: false }),
      trailWater: new THREE.MeshBasicMaterial({ color: 0x55aee0, transparent: true, opacity: 0.18, depthWrite: false }),
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
      expedition: new THREE.MeshStandardMaterial({ color: 0x20170f, roughness: 0.74 }),
      expedition_wounded: new THREE.MeshStandardMaterial({ color: 0x4f2a22, roughness: 0.82 }),
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

  createNest() {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.materials.nest);
    mound.position.set(this.nest.x, 1.25, this.nest.z);
    mound.scale.set(this.nest.radius * 1.15, 2.1, this.nest.radius * 0.82);
    mound.castShadow = this.quality.shadowQuality !== "off";
    mound.receiveShadow = this.quality.shadowQuality !== "off";
    this.scene.add(mound);
    this.sharedGeometries.add(mound.geometry);
    this.nestMound = mound;
    this.nestEntrances = [];
    this.nestSpoils = [];
    this.nestHoles = this.nestEntrances;

    const entrances = [
      { angle: -0.45, distance: 0.62, y: 2.12, rx: 2.45, ry: 0.92, tilt: -0.5, spoils: 12 },
      { angle: 1.02, distance: 0.42, y: 2.55, rx: 1.18, ry: 0.52, tilt: -0.72, spoils: 6 },
      { angle: 2.55, distance: 0.5, y: 2.42, rx: 1.02, ry: 0.46, tilt: -0.64, spoils: 5 },
      { angle: 3.76, distance: 0.34, y: 2.72, rx: 0.82, ry: 0.38, tilt: -0.78, spoils: 4 },
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
    group.rotation.y = Math.PI / 2 - config.angle;
    group.userData.base = { ...config, radial };

    const shadow = new THREE.Mesh(this.geometries.trailCircle, this.materials.nestDark);
    shadow.rotation.x = config.tilt;
    shadow.scale.set(config.rx, config.ry, 1);
    shadow.position.z = 0.035;
    group.add(shadow);

    const rim = new THREE.Mesh(this.geometries.nestRim, this.materials.nestRim);
    rim.rotation.x = config.tilt;
    rim.scale.set(config.rx * 1.1, config.ry * 1.04, 1);
    rim.position.z = 0.085;
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
    ui.expeditionBtn.addEventListener("click", () => this.startExpedition());

    const canvas = this.renderer.domElement;
    this.input = new InputManager(this, canvas);
  }

  setActiveTab(tab) {
    this.activeTab = tab === "expedition" ? "expedition" : "growth";
    if (this.expeditionOnlyMode) this.activeTab = "expedition";
    ui.buttons.forEach((item) => item.classList.toggle("active", item.dataset.tab === this.activeTab));
    ui.growthTab.classList.toggle("active", this.activeTab === "growth");
    ui.expeditionTab.classList.toggle("active", this.activeTab === "expedition");
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
    for (const list of [this.water, this.stones, this.food, this.branches, this.trails, this.predators]) {
      for (const item of list) this.disposeDynamicItem(item);
    }
    this.dynamicObjects.clear();
    this.ants = [];
    this.water = [];
    this.stones = [];
    this.food = [];
    this.branches = [];
    this.trails = [];
    this.predators = [];
    this.rivalAnts = [];
    this.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };
    this.renderAntBuffer.length = 0;
    this.expeditionReplay = null;
    this.expeditionInspector = new AntBattleInspector();
    this.lastExpeditionDiagnostics = [];
    this.expeditionAgentRenderer?.setVisible(false);
    this.expeditionAgentRenderer?.render([]);
    this.antRenderer?.beginFrame();
    this.antRenderer?.endFrame();
    this.collectedFood = 0;
    this.nextFoodId = 1;
    this.selectedAnt = null;
    if (newGame) {
      this.colony = createDefaultColony();
      this.saveColony();
    }
    this.seedNaturalEnvironment();
    this.seedRivalAnts();
    this.syncAntPopulation();
    this.updateColonyVisuals();
    this.renderUpgrades();
    this.updateStats();
  }

  activateExpeditionOnlyMode() {
    this.prepareExpeditionOnlyColony();
    this.setActiveTab("expedition");
    this.setPanelCompact(window.innerWidth < 680, false);
    this.cameraTarget.set(-2, 0, 8);
    this.targetCameraDistance = window.innerWidth < 680 ? 205 : 188;
    this.pushLog("遠征確認モード");
    this.updateStats();
    this.startExpedition();
  }

  prepareExpeditionOnlyColony() {
    if (!this.expeditionOnlyMode || this.expeditionReplay) return;
    this.colony.food = 1200;
    this.colony.lifetimeFood = Math.max(this.colony.lifetimeFood, 2000);
    this.colony.antPopulation = 48;
    this.colony.woundedAnts = 0;
    this.colony.soldierAnts = 16;
    this.colony.nestLevel = Math.max(this.colony.nestLevel, 4);
    this.colony.territory = Math.max(this.colony.territory, 3);
    this.colony.enemyThreat = 5.5;
    this.colony.battleCooldownUntil = 0;
    this.colony.hatchProgress = 0;
    for (const ant of this.ants) {
      ant.expeditionControl = null;
      ant.health = 1;
      ant.wounded = false;
      ant.fatigue = 0;
      ant.energy = Math.max(ant.energy, 0.82);
      ant.stamina = ant.energy;
      ant.fleeTimer = 0;
      if (ant.state === "expedition" || ant.state === "expedition_wounded" || ant.state === "flee") ant.setState("explore");
    }
    this.computeDerived();
    this.syncAntPopulation();
    this.updateColonyVisuals();
    this.renderUpgrades();
  }

  updateExpeditionOnlyMode() {
    if (!this.expeditionOnlyMode) return;
    if (this.expeditionReplay?.objective) {
      this.cameraTarget.set(this.expeditionReplay.objective.x, 0, this.expeditionReplay.objective.y);
    }
    if (!this.expeditionReplay && this.expeditionOnlyNextStartAt > 0 && Date.now() >= this.expeditionOnlyNextStartAt) {
      this.prepareExpeditionOnlyColony();
      this.expeditionOnlyNextStartAt = 0;
      this.startExpedition();
    }
  }

  computeDerived() {
    const upgrades = this.colony.upgrades;
    const foragerTrails = upgradeLevel(upgrades, "foragerTrails");
    const trailPheromones = upgradeLevel(upgrades, "trailPheromones");
    const storageChambers = upgradeLevel(upgrades, "storageChambers");
    const chamberExcavation = upgradeLevel(upgrades, "chamberExcavation");
    const ventilationShafts = upgradeLevel(upgrades, "ventilationShafts");
    const wasteGallery = upgradeLevel(upgrades, "wasteGallery");
    const broodNursery = upgradeLevel(upgrades, "broodNursery");
    const broodClimate = upgradeLevel(upgrades, "broodClimate");
    const foodDistribution = upgradeLevel(upgrades, "foodDistribution");
    const queenCare = upgradeLevel(upgrades, "queenCare");
    const soldierTraining = upgradeLevel(upgrades, "soldierTraining");
    const nestGuard = upgradeLevel(upgrades, "nestGuard");
    const sentinelPosts = upgradeLevel(upgrades, "sentinelPosts");

    const capacity = Math.floor(
      18 +
      this.colony.nestLevel * 10 +
      storageChambers * 12 +
      chamberExcavation * 10 +
      ventilationShafts * 4 +
      this.colony.territory * 3,
    );
    const activeAnts = Math.max(0, this.colony.antPopulation - this.colony.woundedAnts);
    const soldierTarget = Math.floor(this.colony.antPopulation * (0.08 + soldierTraining * 0.023 + sentinelPosts * 0.004));
    this.colony.soldierAnts = Math.floor(clamp(this.colony.soldierAnts, 0, activeAnts));
    const workers = Math.max(0, activeAnts - this.colony.soldierAnts);
    const foragingBonus = 1 + foragerTrails * 0.24 + trailPheromones * 0.07 + foodDistribution * 0.025;
    const trafficBonus = 1 + chamberExcavation * 0.035 + ventilationShafts * 0.018;
    const foodRate =
      workers * 0.034 * foragingBonus * trafficBonus +
      this.colony.territory * 0.075 +
      this.colony.nestLevel * 0.025 +
      storageChambers * 0.012;
    const distributionDiscount = clamp(1 - foodDistribution * 0.025 - storageChambers * 0.008, 0.78, 1);
    const antCost = (5.5 + this.colony.nestLevel * 1.3 + this.colony.antPopulation * 0.035) * distributionDiscount;
    const growthPerSecond =
      (0.017 + queenCare * 0.0058 + broodNursery * 0.0038 + broodClimate * 0.003 + foodDistribution * 0.0012) *
      clamp(this.colony.food / Math.max(antCost * 2, 1), 0.18, 1) *
      (1 + ventilationShafts * 0.008);
    const recoveryPerSecond = 0.006 + broodNursery * 0.0025 + nestGuard * 0.0032 + wasteGallery * 0.0026 + broodClimate * 0.0008;
    const attackPower = 1 + soldierTraining * 0.15 + sentinelPosts * 0.03;
    const defensePower = 1 + nestGuard * 0.18 + sentinelPosts * 0.1 + ventilationShafts * 0.02 + wasteGallery * 0.03;
    const threatGrowthMultiplier = clamp(1 - wasteGallery * 0.055 - sentinelPosts * 0.03 - ventilationShafts * 0.015, 0.55, 1);
    const foragedFoodMultiplier = 1 + foodDistribution * 0.025 + storageChambers * 0.01;
    this.colony.attackPower = attackPower;
    this.colony.defensePower = defensePower;
    this.derived = {
      capacity,
      activeAnts,
      soldierTarget,
      workers,
      foodRate,
      antCost,
      growthPerSecond,
      recoveryPerSecond,
      attackPower,
      defensePower,
      threatGrowthMultiplier,
      foragedFoodMultiplier,
    };
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

    if (this.colony.woundedAnts > 0) {
      const healed = nextDerived.recoveryPerSecond * dt;
      this.colony.woundedAnts = Math.max(0, this.colony.woundedAnts - healed);
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
    const target = Math.floor(clamp(this.colony.antPopulation - this.colony.woundedAnts, 1, DISPLAY_ANT_CAP));
    while (this.ants.length < target) this.ants.push(new Ant3D(this.ants.length + 1, this));
    if (this.expeditionReplay && this.ants.length > target) return;
    while (this.ants.length > target) {
      let removeIndex = -1;
      for (let i = this.ants.length - 1; i >= 0; i -= 1) {
        const ant = this.ants[i];
        if (!ant.expeditionControl && !ant.wounded && ant.state !== "flee" && ant.state !== "expedition" && ant.state !== "expedition_wounded") {
          removeIndex = i;
          break;
        }
      }
      if (removeIndex < 0) break;
      const [removed] = this.ants.splice(removeIndex, 1);
      this.antRenderer?.releaseRenderObject(removed);
    }
  }

  gainFood(amount, fromAnt = false) {
    const gained = fromAnt ? amount * (this.computeDerived().foragedFoodMultiplier ?? 1) : amount;
    this.colony.food += gained;
    this.colony.lifetimeFood += gained;
    if (fromAnt) this.collectedFood += gained;
  }

  saveColony() {
    if (!this.colony || this.expeditionOnlyMode) return;
    this.colony.lastSavedAt = Date.now();
    writeStorage(SAVE_KEY, JSON.stringify(this.colony));
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
    this.pushLog(`${upgrade.name} Lv${level + 1} を強化`);
    this.computeDerived();
    this.renderUpgrades();
    this.updateStats();
    this.saveColony();
    return true;
  }

  startExpedition() {
    const now = Date.now();
    this.expeditionEngine = resolveExpeditionEngine(this.expeditionEngine);
    if (this.expeditionReplay) return;
    if (now < this.colony.battleCooldownUntil) return;
    const d = this.computeDerived();
    const soldiers = Math.max(0, Math.floor(Math.min(this.colony.soldierAnts, d.activeAnts - 1)));
    if (soldiers < 1) {
      this.pushLog("遠征には兵隊が1匹以上必要");
      this.updateStats();
      return;
    }
    const assigned = Math.max(1, Math.floor(soldiers * 0.65));
    const participants = this.selectExpeditionParticipants(assigned);
    if (participants.length < 1) {
      this.pushLog("遠征に参加できる既存個体がいない");
      this.updateStats();
      return;
    }
    const objective = this.expeditionObjectiveFor(participants);
    const seed = (
      (now & 0xffffffff) ^
      (participants.length * 2654435761) ^
      (this.colony.territory * 2246822519) ^
      Math.floor(this.colony.enemyThreat * 1000)
    ) >>> 0;
    const battleInput = {
      seed,
      assignedSoldiers: participants.length,
      activeAnts: d.activeAnts,
      soldierAnts: soldiers,
      territory: this.colony.territory,
      enemyThreat: this.colony.enemyThreat,
      attackPower: d.attackPower,
      defensePower: d.defensePower,
      recoveryPerSecond: d.recoveryPerSecond,
      threatGrowthMultiplier: d.threatGrowthMultiplier,
      playerSeeds: participants.map((ant) => this.antToAgentSeed(ant)),
      objective,
      worldLimit: this.worldRadius,
    };
    const outcome = this.expeditionEngine === "legacy"
      ? runLegacyExpeditionBattle(battleInput)
      : runExpeditionAgentBattle(battleInput);
    this.lastExpeditionBattle = outcome.battle;
    if (outcome.success) {
      this.colony.food += outcome.rewardFood;
      this.colony.lifetimeFood += outcome.rewardFood;
      this.colony.territory += outcome.territoryDelta;
      this.colony.enemyThreat = Math.max(0, this.colony.enemyThreat + outcome.threatDelta);
      this.colony.woundedAnts = Math.min(this.colony.antPopulation - 1, this.colony.woundedAnts + outcome.wounded);
      this.pushLog(`遠征成功: 食料+${outcome.rewardFood} / 領土+${outcome.territoryDelta}`);
    } else {
      this.colony.woundedAnts = Math.min(this.colony.antPopulation - 1, this.colony.woundedAnts + outcome.wounded);
      this.colony.food = Math.max(0, this.colony.food - outcome.foodLoss);
      this.colony.enemyThreat += outcome.threatDelta;
      this.pushLog(`遠征失敗: 負傷${outcome.wounded} / ${outcome.reason}`);
    }
    for (const line of outcome.diagnosis.slice(0, 2).reverse()) this.pushLog(line);
    if (outcome.battle.frameLogs?.length) this.startExpeditionReplay(outcome.battle, participants, objective);
    else {
      this.expeditionReplay = null;
      this.expeditionAgentRenderer?.setVisible(false);
      this.expeditionAgentRenderer?.render([]);
    }
    this.colony.battleCooldownUntil = now + 45000;
    this.syncAntPopulation();
    this.renderUpgrades();
    this.updateStats();
    this.saveColony();
  }

  selectExpeditionParticipants(assigned) {
    const available = this.ants.filter((ant) =>
      !ant.expeditionControl &&
      ant.state !== "stunned" &&
      ant.state !== "clash" &&
      ant.fleeTimer <= 0 &&
      ant.health > 0.12,
    );
    const roleRank = { guard: 0, worker: 1, scout: 2, nurse: 3 };
    available.sort((a, b) => {
      const role = (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9);
      if (role) return role;
      const energy = b.energy - a.energy;
      if (Math.abs(energy) > 0.0001) return energy;
      return a.id - b.id;
    });
    return available.slice(0, Math.min(assigned, available.length));
  }

  expeditionObjectiveFor(participants) {
    const count = Math.max(1, participants.length);
    const center = participants.reduce((acc, ant) => {
      acc.x += ant.x;
      acc.z += ant.z;
      return acc;
    }, { x: 0, z: 0 });
    center.x /= count;
    center.z /= count;
    const towardField = { x: center.x + 28, z: center.z - 4 };
    const d = Math.hypot(towardField.x, towardField.z);
    if (d > this.worldRadius * 0.78) {
      const k = (this.worldRadius * 0.78) / d;
      towardField.x *= k;
      towardField.z *= k;
    }
    return { x: towardField.x, y: towardField.z };
  }

  antToAgentSeed(ant) {
    const speed = Math.hypot(ant.vx ?? 0, ant.vz ?? 0);
    const velocityScale = speed > 4 ? 4 / speed : 1;
    return {
      id: ant.id,
      side: "player",
      position: { x: ant.x, y: ant.z },
      velocity: { x: (ant.vx ?? 0) * velocityScale, y: (ant.vz ?? 0) * velocityScale },
      heading: Math.PI / 2 - ant.angle,
      gaitPhase: ant.gaitPhase,
      bodyScale: ant.bodyScale,
      animationSeed: ant.animationSeed,
      currentTask: ant.state,
      renderIndex: ant.renderInstanceIndex,
      hp: ant.health,
      stamina: ant.stamina,
      wounded: ant.wounded,
      spawnReason: "existing_colony_ant",
      worldLimit: this.worldRadius,
    };
  }

  startExpeditionReplay(battle, participants = [], objective = { x: 0, y: 0 }) {
    this.expeditionInspector = new AntBattleInspector();
    this.lastExpeditionDiagnostics = [];
    const framesById = new Map();
    for (const frame of battle.frameLogs) {
      const list = framesById.get(frame.id);
      if (list) list.push(frame);
      else framesById.set(frame.id, [frame]);
    }
    const participantMap = new Map(participants.map((ant) => [ant.id, ant]));
    const enemyVisuals = [];
    for (const ant of participants) this.antRenderer?.assignRenderIndex(ant);
    for (const id of framesById.keys()) {
      if (participantMap.has(id)) continue;
      const first = framesById.get(id)?.[0];
      const enemy = new ExpeditionEnemyVisual(id, first?.renderIndex ?? null);
      this.antRenderer?.assignRenderIndex(enemy);
      if (first) enemy.applyExpeditionFrame(first);
      enemyVisuals.push(enemy);
      this.rivalAnts.push(enemy);
    }
    this.lastExpeditionBattle = battle;
    this.expeditionReplay = {
      battle,
      framesById,
      ids: [...framesById.keys()].sort((a, b) => a - b),
      participants: participantMap,
      enemyVisuals,
      objective,
      time: 0,
      duration: Math.max(1, battle.steps / 60),
      speed: 1,
      phase: "summon",
      diagnostics: [],
      inspectorStarted: false,
    };
    for (const ant of participants) {
      const first = this.sampleExpeditionFrame(framesById.get(ant.id) ?? [], 0);
      ant.beginExpeditionControl("summon", first);
    }
    this.expeditionAgentRenderer?.setVisible(false);
    this.expeditionAgentRenderer?.render([]);
  }

  updateExpeditionReplay(dt) {
    const replay = this.expeditionReplay;
    if (!replay) return;
    replay.time += dt * replay.speed;
    replay.phase = replay.time < 1.2 ? "summon" : replay.time < replay.duration * 0.34 ? "approach" : "engage";
    if (replay.time > replay.duration + 4) {
      this.finishExpeditionReplay();
    }
  }

  renderExpeditionReplay() {
    const replay = this.expeditionReplay;
    if (!replay) return;
    const step = Math.min(replay.battle.steps, replay.time * 60);
    for (const id of replay.ids) {
      const frames = replay.framesById.get(id);
      if (!frames?.length) continue;
      const current = this.sampleExpeditionFrame(frames, step);
      if (!current) continue;
      const ant = replay.participants.get(id);
      if (ant) ant.applyExpeditionFrame(current);
      else {
        const enemy = replay.enemyVisuals.find((item) => item.id === id);
        if (enemy) enemy.applyExpeditionFrame(current);
      }
    }
    this.inspectExpeditionReplay(replay);
  }

  inspectExpeditionReplay(replay) {
    const events = [];
    if (!replay.inspectorStarted) {
      for (const id of replay.participants.keys()) events.push({ type: "spawn", antId: id, reason: "existing_colony_ant" });
      for (const enemy of replay.enemyVisuals) events.push({ type: "spawn", antId: enemy.id, reason: enemy.spawnReason });
      replay.inspectorStarted = true;
    }
    const ants = [];
    for (const ant of replay.participants.values()) {
      ants.push({
        id: ant.id,
        position: { x: ant.x, y: ant.z },
        velocity: { x: ant.vx ?? 0, y: ant.vz ?? 0 },
        heading: Math.PI / 2 - ant.angle,
        state: ant.currentTask ?? ant.state,
        renderIndex: ant.renderInstanceIndex ?? null,
        health: ant.health,
        gaitPhase: ant.gaitPhase,
      });
    }
    for (const enemy of replay.enemyVisuals) {
      ants.push({
        id: enemy.id,
        position: { x: enemy.x, y: enemy.z },
        velocity: { x: enemy.vx ?? 0, y: enemy.vz ?? 0 },
        heading: Math.PI / 2 - enemy.angle,
        state: enemy.currentTask ?? enemy.state,
        renderIndex: enemy.renderInstanceIndex ?? null,
        health: enemy.health,
        gaitPhase: enemy.gaitPhase,
      });
    }
    const perf = {
      frameTimeMs: this.debugPanel?.frameMs ?? 0,
      simUpdateMs: 0,
      renderMs: 0,
      inspectorMs: 0,
      fixedStepCount: 1,
      fixedStepBacklogMs: this.frameAccumulator * 1000,
      antCountTotal: this.ants.length + this.rivalAnts.length,
      battleAntCount: ants.length,
      visibleAntCount: this.ants.length + this.rivalAnts.length,
      collisionPairCount: 0,
      spatialHashBucketCount: 0,
      maxBucketSize: 0,
      stateTransitionCount: 0,
      drawCallCount: this.renderer?.info?.render?.calls ?? 0,
      instanceUpdateCount: (this.ants.length + this.rivalAnts.length) * (ANT_BODY_PARTS.length + ANT_APPENDAGE_SEGMENTS.length),
      heapUsedMB: performance?.memory?.usedJSHeapSize ? performance.memory.usedJSHeapSize / 1024 / 1024 : undefined,
      longTaskCount: 0,
    };
    const start = performance.now();
    const diagnostics = this.expeditionInspector.inspect({
      time: replay.time,
      ants,
      events,
      battlePhase: replay.phase,
      perf,
    });
    perf.inspectorMs = performance.now() - start;
    replay.diagnostics.push(...diagnostics);
    this.lastExpeditionDiagnostics = replay.diagnostics.slice(-24);
  }

  sampleExpeditionFrame(frames, step) {
    if (!frames?.length) return null;
    if (step <= frames[0].step) return frames[0];
    const last = frames[frames.length - 1];
    if (step >= last.step) return last;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (frames[mid].step <= step) lo = mid;
      else hi = mid;
    }
    const a = frames[lo];
    const b = frames[hi];
    const t = clamp((step - a.step) / Math.max(1, b.step - a.step), 0, 1);
    const heading = normAngle(a.heading + normAngle(b.heading - a.heading) * t);
    return {
      ...b,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      vx: a.vx + (b.vx - a.vx) * t,
      vy: a.vy + (b.vy - a.vy) * t,
      heading,
      gaitPhase: a.gaitPhase + (b.gaitPhase - a.gaitPhase) * t,
      hp: a.hp + (b.hp - a.hp) * t,
    };
  }

  finishExpeditionReplay() {
    const replay = this.expeditionReplay;
    if (!replay) return;
    for (const [id, ant] of replay.participants.entries()) {
      const frames = replay.framesById.get(id) ?? [];
      ant.finishExpeditionControl(frames[frames.length - 1], this.nest);
    }
    for (const enemy of replay.enemyVisuals) {
      const index = this.rivalAnts.indexOf(enemy);
      if (index >= 0) this.rivalAnts.splice(index, 1);
      this.antRenderer?.releaseRenderObject(enemy);
    }
    this.expeditionAgentRenderer?.setVisible(false);
    this.expeditionAgentRenderer?.render([]);
    this.expeditionReplay = null;
    this.syncAntPopulation();
    if (this.expeditionOnlyMode) {
      this.colony.battleCooldownUntil = 0;
      this.expeditionOnlyNextStartAt = Date.now() + 1400;
      this.updateStats();
    }
  }

  updateColonyVisuals() {
    if (!this.nestMound) return;
    const growth = 1 + Math.min(2.3, (this.colony.nestLevel - 1) * 0.13 + this.colony.territory * 0.025);
    this.nestMound.scale.set(this.nest.radius * 1.15 * growth, 2.1 + growth * 0.55, this.nest.radius * 0.82 * growth);
    for (const entrance of this.nestEntrances ?? []) {
      const base = entrance.userData.base;
      if (!base) continue;
      const radial = base.radial * (1 + (growth - 1) * 0.1);
      entrance.position.set(
        this.nest.x + Math.cos(base.angle) * radial,
        base.y + (growth - 1) * 0.24,
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
    if (item.mesh) {
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
    if (!this.expeditionOnlyMode) this.updateColony(dt);

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

    for (const ant of this.ants) ant.update(dt, this);
    for (const rival of this.rivalAnts) rival.update(dt, this);
    this.updateExpeditionReplay(dt);
    this.updateExpeditionOnlyMode();
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
    this.renderExpeditionReplay();
    const renderAnts = this.renderAntBuffer;
    renderAnts.length = 0;
    for (const ant of this.ants) renderAnts.push(ant);
    for (const rival of this.rivalAnts) renderAnts.push(rival);
    this.antRenderer.render(renderAnts, this, alpha);
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
    this.expeditionAgentRenderer?.dispose();
    this.expeditionAgentRenderer = null;
    for (const list of [this.water, this.stones, this.food, this.branches, this.trails, this.predators]) {
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

    const branches = [
      { x1: -4, z1: 62, x2: 22, z2: 76, width: 0.9 },
      { x1: 44, z1: -8, x2: 70, z2: -2, width: 0.82 },
      { x1: -88, z1: -18, x2: -68, z2: -34, width: 0.86 },
      { x1: 2, z1: -60, x2: 28, z2: -72, width: 0.78 },
      { x1: -34, z1: 34, x2: -20, z2: 22, width: 0.72 },
    ];
    for (const branch of branches) this.addBranch(branch);
  }

  seedRivalAnts() {
    this.rivalAnts.length = 0;
    for (let i = 0; i < RIVAL_ANT_COUNT; i += 1) this.rivalAnts.push(new RivalAnt3D(i + 1, this));
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
      if (rival.retreat > 0 || rival.clash) continue;
      const d = distance2(x, z, rival.x, rival.z);
      if (d < bestDistance) {
        best = rival;
        bestDistance = d;
      }
    }
    return best;
  }

  registerRivalFight(winner, ant, rival) {
    this.rivalFightStats.clashes += 1;
    if (winner === "colony") {
      this.rivalFightStats.colonyWins += 1;
      this.pushLog(`敵アリを撃退: 個体${ant.id}`);
    } else {
      this.rivalFightStats.rivalWins += 1;
      this.pushLog(`敵アリが個体${ant.id}を弾いた`);
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
      const d = distance2(x, z, ant.x, ant.z);
      if (d < bestDistance) {
        best = ant;
        bestDistance = d;
      }
    }
    this.selectedAnt = best;
    this.updateInspector();
  }

  updateStats() {
    const d = this.computeDerived();
    const cooldownLeft = Math.max(0, Math.ceil((this.colony.battleCooldownUntil - Date.now()) / 1000));
    const availableSoldiers = Math.max(0, Math.floor(Math.min(this.colony.soldierAnts, d.activeAnts - 1)));
    const assigned = Math.max(0, Math.floor(availableSoldiers * 0.65));
    const reward = Math.floor(34 + this.colony.territory * 9 + assigned * 4);

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
    ui.colonySummary.textContent = `巣Lv${this.colony.nestLevel} / 働き蟻 ${fmt(d.workers, 0)} / 兵隊 ${fmt(this.colony.soldierAnts, 0)}`;
    ui.growthFill.style.width = `${Math.round(this.colony.hatchProgress * 100)}%`;
    ui.activeToolLabel.textContent = this.expeditionOnlyMode
      ? "遠征挙動だけ確認中"
      : `領土 ${fmt(this.colony.territory, 0)} / 大帝国まで拡張中`;
    ui.expeditionSoldiers.textContent = fmt(assigned, 0);
    ui.expeditionChance.textContent = assigned > 0 ? this.expeditionEngine : "待機";
    ui.expeditionReward.textContent = fmt(reward, 0);
    ui.expeditionBtn.disabled = cooldownLeft > 0 || assigned < 1;
    ui.expeditionBtn.textContent = this.expeditionOnlyMode && this.expeditionReplay
      ? "遠征を観察中"
      : cooldownLeft > 0 ? `再遠征まで ${cooldownLeft}s` : "近隣の餌場へ遠征";
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
