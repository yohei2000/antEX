// @ts-nocheck
import * as THREE from "three";
import {
  ACID_DEBUFF_MAX,
  ACID_DEBUFF_SECONDS,
  ACID_SPRAY_COOLDOWN_SECONDS,
  ACID_SPRAY_DURATION_SECONDS,
  ACID_SPRAY_RANGE,
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
  MEDIC_AID_COOLDOWN_SECONDS,
  MEDIC_AID_RANGE,
  MEDIC_AID_SECONDS,
  MEDIC_EVACUATE_ENERGY,
  MEDIC_STANDOFF,
  MIN_COLONY_SURVIVORS,
  OFFLINE_CAP_SECONDS,
  PLAYER_NEST_BREACH_BASE_DAMAGE,
  PLAYER_NEST_BREACH_PRESSURE_DAMAGE,
  PLAYER_NEST_MAX_DURABILITY,
  RAID_ACTIVE_SECONDS,
  RAID_BASE_INTERVAL_SECONDS,
  RAID_EXIT_PADDING,
  RAID_GRAPPLER_RECRUIT_RANGE,
  RAID_HARASSMENT_RANGE,
  RAID_NEST_PRESSURE_LOSS_SCALE,
  RAID_NEST_THREAT_LOSS_SCALE,
  RAID_NOTICE_SECONDS,
  RAID_RECOVERY_SECONDS,
  RAID_RETREAT_SECONDS,
  RAID_RIVAL_CAP,
  BUILD_TASK_ASSIGNEE_CAP,
  CAPTAIN_COHESION_RADIUS,
  CAPTAIN_COMMAND_RANGE,
  CAPTAIN_SQUAD_SIZE,
  CAPTAIN_UNSUPPORTED_DAMAGE_WEIGHT_SCALE,
  CAPTAIN_UNSUPPORTED_POWER_SCALE,
  FOOD_INCOME_MULTIPLIER,
  NEST_HOLE_DIAMETER_SCALE,
  NEST_STAY_SECONDS,
  RAID_SOON_CALM_SECONDS,
  RAID_SOON_WARNING_SECONDS,
  RAID_WARNING_SECONDS,
  RIVAL_CLASH_DURATION,
  RIVAL_COMBAT_DAMAGE_DEFEAT_THRESHOLD,
  RIVAL_COMBAT_DAMAGE_LOSS_SCALE,
  RIVAL_COMBAT_DAMAGE_POWER_PENALTY,
  RIVAL_COMBAT_PEEL_APPROACH_RADIUS,
  RIVAL_COMBAT_PEEL_RELEASE_DISTANCE,
  RIVAL_COMBAT_PEEL_TRIGGER_RADIUS,
  RIVAL_COMBAT_DAMAGE_SORTIE_ESCAPE_THRESHOLD,
  RIVAL_COMBAT_DAMAGE_UNSUPPORTED_SORTIE_ESCAPE_THRESHOLD,
  RIVAL_COMBAT_DAMAGE_WIN_SCALE,
  RIVAL_CONTACT_RADIUS,
  RIVAL_CORPSE_CAP,
  RIVAL_GRAPPLER_RECRUIT_RANGE,
  RIVAL_HARASSMENT_RANGE,
  RIVAL_NEST_DEFENSE_ALERT_RADIUS,
  RIVAL_NEST_DEFENSE_ATTACKERS_PER_DEFENDER,
  RIVAL_NEST_DEFENSE_FORCE_RETURN_SECONDS,
  RIVAL_NEST_DEFENSE_REARM_SECONDS,
  RIVAL_NEST_DEFENDER_DAMAGE_TAKEN_SCALE,
  RIVAL_NEST_DEFENDER_MAX_COUNT,
  RIVAL_NEST_DEFENDER_MIN_COUNT,
  RIVAL_NEST_WORKER_COMBAT_POWER_SCALE,
  RIVAL_NEST_WORKER_DAMAGE_DEFEAT_THRESHOLD_SCALE,
  RIVAL_NEST_WORKER_OVERWHELM_POWER_RATIO,
  SCOUT_MARK_RANGE,
  SCOUT_MARK_SECONDS,
  SCOUT_MARK_STANDOFF,
  SOLDIER_PATROL_RADIUS,
  SOLDIER_SORTIE_COOLDOWN_SECONDS,
  SOLDIER_SORTIE_SECONDS,
  SOLDIER_SORTIE_SEEK_RANGE,
  UNSUPPORTED_SORTIE_DAMAGE_PRESSURE_SCALE,
  UNSUPPORTED_SORTIE_LARGE_RAID_MIN_SIZE,
  UNSUPPORTED_SORTIE_POWER_SCALE,
} from "./config/balance";
import { BARRACKS_QUEUE_CAP, BARRACKS_TRAINING_VARIANTS, getBarracksTrainingDef, isBarracksTrainingVariant } from "./config/barracks";
import { getConstructionDef, isConstructionKind, normalizeConstructionKind } from "./config/construction";
import { UPGRADE_BRANCHES, UPGRADE_DEFS, upgradeCost, upgradeLevel, upgradeName } from "./config/upgrades";
import { ANT_VARIANTS, ANT_VARIANT_CONFIG, getAntVariantConfig, normalizeAntVariant } from "./config/variants";
import { VoxelBuildingRenderer } from "./render/VoxelBuildingRenderer";
import { clamp } from "./shared/math";
import { createDefaultColony } from "./state/colony";
import { computeDerivedColony } from "./state/derived";
import { normalizeRaidState } from "./state/migrations";
import { SAVE_KEY, readColonyState, readStorage, serializeColonyState, writeStorage } from "./state/save";

const ui = {
  world: document.querySelector("#world3d"),
  buttons: [...document.querySelectorAll(".tab-button")],
  activeToolLabel: document.querySelector("#activeToolLabel"),
  homeView: document.querySelector("#homeViewBtn"),
  pause: document.querySelector("#pauseBtn"),
  reset: document.querySelector("#resetBtn"),
  panelToggle: document.querySelector("#panelToggleBtn"),
  statAnts: document.querySelector("#statAnts"),
  statFoodRate: document.querySelector("#statFoodRate"),
  statFood: document.querySelector("#statFood"),
  statNestDurability: document.querySelector("#statNestDurability"),
  statNestLevel: document.querySelector("#statNestLevel"),
  statCapacity: document.querySelector("#statCapacity"),
  statSoldiers: document.querySelector("#statSoldiers"),
  statWounded: document.querySelector("#statWounded"),
  statGrowthRate: document.querySelector("#statGrowthRate"),
  statThreat: document.querySelector("#statThreat"),
  colonySummary: document.querySelector("#colonySummary"),
  growthFill: document.querySelector("#growthFill"),
  actionFeedback: document.querySelector("#actionFeedback"),
  upgradeList: document.querySelector("#upgradeList"),
  growthTab: document.querySelector("#growthTab"),
  constructionTab: document.querySelector("#constructionTab"),
  constructionBuilders: document.querySelector("#constructionBuilders"),
  constructionIdle: document.querySelector("#constructionIdle"),
  constructionActive: document.querySelector("#constructionActive"),
  constructionComplete: document.querySelector("#constructionComplete"),
  constructionTrailBtn: document.querySelector("#constructionTrailBtn"),
  constructionBarricadeBtn: document.querySelector("#constructionBarricadeBtn"),
  constructionWallBtn: document.querySelector("#constructionWallBtn"),
  constructionCancelBtn: document.querySelector("#constructionCancelBtn"),
  constructionWallConfirmBtn: document.querySelector("#constructionWallConfirmBtn"),
  constructionSentryBtn: document.querySelector("#constructionSentryBtn"),
  constructionPlacementPanel: document.querySelector("#constructionPlacementPanel"),
  constructionPlacementKind: document.querySelector("#constructionPlacementKind"),
  constructionPlacementMode: document.querySelector("#constructionPlacementMode"),
  constructionPlacementNote: document.querySelector("#constructionPlacementNote"),
  constructionStatus: document.querySelector("#constructionStatus"),
  constructionCrew: document.querySelector("#constructionCrew"),
  constructionProgressList: document.querySelector("#constructionProgressList"),
  barracksTab: document.querySelector("#barracksTab"),
  barracksQueueCount: document.querySelector("#barracksQueueCount"),
  barracksActive: document.querySelector("#barracksActive"),
  barracksStatus: document.querySelector("#barracksStatus"),
  barracksTrainingList: document.querySelector("#barracksTrainingList"),
  barracksQueueList: document.querySelector("#barracksQueueList"),
  soldierTab: document.querySelector("#soldierTab"),
  soldierNest: document.querySelector("#soldierNest"),
  soldierTotal: document.querySelector("#soldierTotal"),
  soldierWaveCap: document.querySelector("#soldierWaveCap"),
  soldierDeployed: document.querySelector("#soldierDeployed"),
  soldierCooldown: document.querySelector("#soldierCooldown"),
  soldierStatus: document.querySelector("#soldierStatus"),
  sortiePlanList: document.querySelector("#sortiePlanList"),
  sortiePlanTotal: document.querySelector("#sortiePlanTotal"),
  soldierTargetTitle: document.querySelector("#soldierTargetTitle"),
  soldierTargetDistance: document.querySelector("#soldierTargetDistance"),
  soldierTargetRisk: document.querySelector("#soldierTargetRisk"),
  soldierTargetIntegrityText: document.querySelector("#soldierTargetIntegrityText"),
  soldierTargetIntegrityFill: document.querySelector("#soldierTargetIntegrityFill"),
  soldierTargetHint: document.querySelector("#soldierTargetHint"),
  soldierSortieBtn: document.querySelector("#soldierSortieBtn"),
  reconSortieBtn: document.querySelector("#reconSortieBtn"),
  expeditionSortieBtn: document.querySelector("#expeditionSortieBtn"),
  battleLog: document.querySelector("#battleLog"),
  empirePanel: document.querySelector("#empirePanel"),
  panelGrip: document.querySelector("#panelGrip"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingBar: document.querySelector("#loadingBar"),
  loadingLabel: document.querySelector("#loadingLabel"),
  raidNotice: document.querySelector("#raidNotice"),
  gameEndBanner: document.querySelector("#gameEndBanner"),
  gameEndTitle: document.querySelector("#gameEndTitle"),
  gameEndDetail: document.querySelector("#gameEndDetail"),
  gameEndReset: document.querySelector("#gameEndResetBtn"),
  errorPanel: document.querySelector("#errorPanel"),
  errorMessage: document.querySelector("#errorMessage"),
  debugPanel: document.querySelector("#debugPanel"),
  debugMetrics: document.querySelector("#debugMetrics"),
  qualitySelect: document.querySelector("#qualitySelect"),
};

const DEBUG_QUERY = new URLSearchParams(window.location.search);
const IS_DEBUG = DEBUG_QUERY.get("debug") === "1";
const IS_RAID_SOON = ["1", "true"].includes((DEBUG_QUERY.get("raidSoon") ?? "").toLowerCase());
const GENERATED_TEXTURE_BASE_URL = `${import.meta.env.BASE_URL}assets/generated/`;
const generatedAssetUrl = (fileName) => `${GENERATED_TEXTURE_BASE_URL}${fileName}`;
const GENERATED_TEXTURE_ASSETS = {
  soil: "terrain-soil-tile-20260702.png",
  moss: "terrain-moss-damp-tile-20260702.png",
  sand: "terrain-sand-tile-20260702.png",
  gravel: "terrain-gravel-tile-20260702.png",
  stone: "stone-surface-tile-20260702.png",
  water: "water-surface-tile-20260702.png",
  grassTuft: "grass-tuft-cutout-20260702.png",
  mossWetland: "terrain-moss-wetland-tile-20260702.png",
  microGravel: "terrain-micro-gravel-tile-20260702.png",
  crackedMud: "terrain-cracked-mud-tile-20260702.png",
  shorelineWetEdge: "terrain-shoreline-wet-edge-tile-20260702.png",
};

const UI_ICON_ASSETS = {
  colonyMark: generatedAssetUrl("ant-ui-colony-mark-20260703.png"),
  foodSeed: generatedAssetUrl("ant-ui-food-seed-20260703.png"),
  territoryLeaf: generatedAssetUrl("ant-ui-territory-leaf-20260703.png"),
  antPopulation: generatedAssetUrl("ant-ui-ant-population-20260703.png"),
  soilMound: generatedAssetUrl("ant-ui-soil-mound-20260703.png"),
  upgradeArrow: generatedAssetUrl("ant-ui-upgrade-arrow-20260703.png"),
  scoutFlag: generatedAssetUrl("ant-ui-scout-flag-20260703.png"),
  defenseShield: generatedAssetUrl("ant-ui-defense-shield-20260703.png"),
  growthLeaf: generatedAssetUrl("ant-ui-growth-leaf-20260703.png"),
  constructionShovel: generatedAssetUrl("ant-ui-construction-shovel-20260703.png"),
  nurseryEggs: generatedAssetUrl("ant-ui-nursery-eggs-20260703.png"),
  militaryMandibles: generatedAssetUrl("ant-ui-military-mandibles-20260703.png"),
  forageTrail: generatedAssetUrl("ant-ui-forage-trail-20260703.png"),
  tunnelEntrance: generatedAssetUrl("ant-ui-tunnel-entrance-20260703.png"),
  raidWarning: generatedAssetUrl("ant-ui-raid-warning-20260703.png"),
  queenCare: generatedAssetUrl("ant-ui-queen-care-20260703.png"),
};

const SORTIE_PLAN_VARIANTS = [
  {
    variant: "shieldHead",
    compositionKey: "shield",
    derivedKey: "shieldHeads",
    label: "盾頭",
    role: "前線の盾・味方保護",
    icon: UI_ICON_ASSETS.defenseShield,
  },
  {
    variant: "heavySoldier",
    compositionKey: "heavy",
    derivedKey: "heavySoldiers",
    label: "重兵装",
    role: "高火力で敵を圧制",
    icon: generatedAssetUrl("ant-role-heavy-soldier-20260627.png"),
  },
  {
    variant: "acidShooter",
    compositionKey: "acid",
    derivedKey: "acidShooters",
    label: "酸射",
    role: "遠距離から持続ダメージ",
    icon: UI_ICON_ASSETS.militaryMandibles,
  },
  {
    variant: "scout",
    compositionKey: "scout",
    derivedKey: "scouts",
    label: "斥候",
    role: "敵標識・狙いを統一",
    icon: UI_ICON_ASSETS.scoutFlag,
  },
  {
    variant: "medic",
    compositionKey: "medic",
    derivedKey: "medics",
    label: "救護",
    role: "負傷者支援・後方退避",
    icon: UI_ICON_ASSETS.queenCare,
  },
  {
    variant: "captain",
    compositionKey: "captain",
    derivedKey: "captains",
    label: "小隊長",
    role: "小隊指揮・集合と集中",
    icon: UI_ICON_ASSETS.scoutFlag,
  },
  {
    variant: "soldier",
    compositionKey: "normal",
    derivedKey: "normalSoldiers",
    label: "兵隊",
    role: "近接戦闘の主力",
    icon: generatedAssetUrl("ant-role-soldier-20260627.png"),
  },
];

const SORTIE_PLAN_KEYS = SORTIE_PLAN_VARIANTS.map((item) => item.compositionKey);
const SORTIE_BALANCED_PLAN_KEYS = ["captain", "shield", "heavy", "acid", "scout", "medic", "normal"];
const SORTIE_VARIANT_BY_PLAN_KEY = SORTIE_PLAN_VARIANTS.reduce((memo, item) => {
  memo[item.compositionKey] = item.variant;
  return memo;
}, {});

const BRANCH_ICON_ASSETS = {
  foraging: UI_ICON_ASSETS.forageTrail,
  nursery: UI_ICON_ASSETS.nurseryEggs,
  architecture: UI_ICON_ASSETS.tunnelEntrance,
  defense: UI_ICON_ASSETS.defenseShield,
};

const UPGRADE_ICON_ASSETS = {
  foragerTrails: UI_ICON_ASSETS.forageTrail,
  trailPheromones: UI_ICON_ASSETS.territoryLeaf,
  storageChambers: UI_ICON_ASSETS.tunnelEntrance,
  chamberExcavation: UI_ICON_ASSETS.tunnelEntrance,
  builderTraining: UI_ICON_ASSETS.constructionShovel,
  ventilationShafts: UI_ICON_ASSETS.soilMound,
  wasteGallery: UI_ICON_ASSETS.soilMound,
  broodNursery: UI_ICON_ASSETS.nurseryEggs,
  broodClimate: UI_ICON_ASSETS.nurseryEggs,
  foodDistribution: UI_ICON_ASSETS.foodSeed,
  queenCare: UI_ICON_ASSETS.queenCare,
  soldierTraining: UI_ICON_ASSETS.militaryMandibles,
  heavySoldierBrood: UI_ICON_ASSETS.antPopulation,
  shieldHeadBrood: UI_ICON_ASSETS.defenseShield,
  acidShooterBrood: UI_ICON_ASSETS.militaryMandibles,
  scoutBrood: UI_ICON_ASSETS.scoutFlag,
  medicBrood: UI_ICON_ASSETS.queenCare,
  captainBrood: UI_ICON_ASSETS.scoutFlag,
  nestGuard: UI_ICON_ASSETS.defenseShield,
  sentinelPosts: UI_ICON_ASSETS.scoutFlag,
};

const UPGRADE_BRANCH_UI = {
  foraging: { label: "採餌", icon: "葉", summary: "食料と運搬を伸ばす" },
  nursery: { label: "育房", icon: "卵", summary: "育成速度を伸ばす" },
  architecture: { label: "巣構造", icon: "巣", summary: "収容と土木を伸ばす" },
  defense: { label: "防衛", icon: "盾", summary: "敵襲への備えを伸ばす" },
};

const UPGRADE_UI = {
  foragerTrails: { name: "採餌道", effect: "運搬量と採餌の往復効率を上げる", reason: "食料の持ち帰りが伸びます", icon: "道", priority: 10 },
  trailPheromones: { name: "匂い道の維持", effect: "採餌中の移動速度を上げる", reason: "遠い餌場への往復が軽くなります", icon: "香", priority: 8 },
  storageChambers: { name: "貯蔵室", effect: "収容上限と運搬受け入れを上げる", reason: "巣に余裕を作れます", icon: "蔵", priority: 7 },
  chamberExcavation: { name: "通路拡張", effect: "収容上限と巣内移動を上げる", reason: "成長の詰まりを減らせます", icon: "穴", priority: 8 },
  builderTraining: { name: "土木アリを育てる", effect: "土木アリ育成を解禁する", reason: "地表工事へ進めます", icon: "土", priority: 9 },
  ventilationShafts: { name: "換気孔", effect: "収容、防御、脅威耐性を上げる", reason: "大きい巣の安定性が増します", icon: "風", priority: 5 },
  wasteGallery: { name: "廃棄坑", effect: "回復、防御、脅威耐性を上げる", reason: "負傷後の立て直しが早くなります", icon: "坑", priority: 4 },
  broodNursery: { name: "育児室", effect: "育成速度と負傷回復を上げる", reason: "育成待ちの時間を短くできます", icon: "卵", priority: 9 },
  broodClimate: { name: "育房の保温", effect: "育成速度を上げる", reason: "育成キューの回転が良くなります", icon: "温", priority: 6 },
  foodDistribution: { name: "食料分配", effect: "育成速度と運搬効率を上げる", reason: "食料と育成を同時に支えます", icon: "配", priority: 6 },
  queenCare: { name: "女王の世話", effect: "育成速度を大きく上げる", reason: "コロニーの増え方が強くなります", icon: "王", priority: 7 },
  soldierTraining: { name: "兵隊訓練", effect: "兵隊比率と攻撃力を上げる", reason: "敵襲への対応力が増えます", icon: "剣", priority: 7 },
  heavySoldierBrood: { name: "重兵装アリを育てる", effect: "強い兵隊の育成を解禁する", reason: "押し合いに強い前線を作れます", icon: "重", priority: 5 },
  shieldHeadBrood: { name: "盾頭アリを育てる", effect: "敵を押し返す兵隊を解禁する", reason: "侵入を遅らせやすくなります", icon: "盾", priority: 5 },
  acidShooterBrood: { name: "酸射アリを育てる", effect: "酸で敵を弱らせる兵隊を解禁する", reason: "硬い敵への支援が増えます", icon: "酸", priority: 5 },
  scoutBrood: { name: "斥候アリを育てる", effect: "敵を標識する支援兵を解禁する", reason: "狙いを揃えやすくなります", icon: "斥", priority: 5 },
  medicBrood: { name: "救護アリを育てる", effect: "消耗した味方を支援する", reason: "前線から戻しやすくなります", icon: "救", priority: 4 },
  captainBrood: { name: "小隊長アリを育てる", effect: "小隊の集合位置と目標を揃える", reason: "混成小隊がまとまりやすくなります", icon: "隊", priority: 4 },
  nestGuard: { name: "巣の守り", effect: "防御力と負傷回復を上げる", reason: "入口周辺の守りが固くなります", icon: "守", priority: 6 },
  sentinelPosts: { name: "見張り哨", effect: "防御、攻撃、脅威耐性を上げる", reason: "敵襲に備える力が増えます", icon: "哨", priority: 5 },
};

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

const SQUAD_COLORS = [
  0xff2d55,
  0x1f7aff,
  0x19d66b,
  0xffc400,
  0xb14cff,
  0xff7a00,
];

const SQUAD_MEMBER_VARIANT_ORDER = ["shieldHead", "heavySoldier", "acidShooter", "scout", "medic", "soldier", "builder"];
const SQUAD_TARGET_ASSIGNMENT_PENALTY = 52;
const SQUAD_TARGET_STICKINESS_BONUS = 20;
const SQUAD_RALLY_SPACING = 16;
const SQUAD_THREAT_SPACING = 8.5;
const WORLD_RADIUS = 276;
const MAP_BASE_VISION_RADIUS = 78;
const MAP_TERRITORY_ACTIVITY_BONUS = 11.5;
const MAP_NEST_LEVEL_ACTIVITY_BONUS = 4.2;
const MAP_VISION_FADE_WIDTH = 9;
const MAP_UNEXPLORED_MAX_ALPHA = 0.995;
const MAP_UNEXPLORED_COLOR = 0x030403;
const MAP_REMEMBERED_FOG_ALPHA = 0.3;
const MAP_REMEMBERED_FOG_COLOR = 0x69716c;
const MAP_FOG_RENDER_ORDER = 80;
const MAP_MANUAL_VISION_STORAGE_KEY = "ant3d.manualMapVisionRadius";
const MAP_MANUAL_VISION_MIN_RADIUS = 36;
const MAP_VISION_EDGE_MOUSE_SLOP = 8;
const MAP_VISION_EDGE_TOUCH_SLOP = 18;
const MAP_RAID_FOOD_PRESSURE_RADIUS = 160;
const BUILDING_SIGHT_COMPLETED_STRENGTH = 0.95;
const SENTRY_MOUND_CURRENT_SIGHT_RADIUS = 96;
const LOW_BARRICADE_CURRENT_SIGHT_RADIUS = 34;
const EARTH_WALL_CURRENT_SIGHT_RADIUS = 32;
const RAID_SORTIE_SIGNAL_SEEK_RANGE = 148;
const LOCAL_RIVAL_THREAT_SIGHT_RANGE = 72;
const RIVAL_NEST_REVEAL_RADIUS = 44;
const RIVAL_NEST_ASSAULT_RADIUS = 13.5;
const RIVAL_NEST_WORKER_COUNT = 9;
const RIVAL_NEST_WORKER_MAX_COUNT = 24;
const RIVAL_NEST_WORKER_MIN_RADIUS = 6.5;
const RIVAL_NEST_WORKER_MAX_RADIUS = 30;
const RIVAL_NEST_WORKER_RETURN_RADIUS = 38;
const RIVAL_NEST_WORKER_THREAT_RADIUS = 24;
const RIVAL_NEST_WORKER_ATTACKER_RADIUS = 34;
const RIVAL_NEST_WORKER_WORKER_CONTACT_RADIUS = 12;
const RECON_SORTIE_SECONDS = 116;
const RECON_SORTIE_MAX_SCOUTS = 3;
const RECON_SEARCH_MIN_STEP = 34;
const RECON_SEARCH_STEP = 42;
const RECON_SEARCH_REACHED_RADIUS = 10;
const CAMERA_TARGET_PADDING = 18;
const CAMERA_KEY_PAN_SPEED = 92;
const POINTER_TAP_SLOP_BY_TYPE = {
  mouse: 3,
  pen: 7,
  touch: 12,
};
const DOM_BUTTON_TOUCH_TAP_SLOP = 42;
const DOM_BUTTON_TOUCH_TARGET_PADDING = DOM_BUTTON_TOUCH_TAP_SLOP;
const DOM_BUTTON_TOUCH_TAP_MAX_MS = 700;
const DOM_BUTTON_SUPPRESS_CLICK_MS = 700;
const ACTIVE_SIGHT_PATCH_LIMIT = DISPLAY_ANT_CAP + 48;
const EXPLORED_PATCH_UPDATE_SECONDS = 0.38;
const EXPLORED_PATCH_BASE_RADIUS = 18;
const EXPLORED_MASK_SIZE = 256;
const EXPLORED_MASK_VISIBLE_THRESHOLD = 0.9;
const FOOD_RESPAWN_MIN_SECONDS = 70;
const FOOD_RESPAWN_RANDOM_SECONDS = 52;
const FOOD_RESPAWN_DISTANCE_SECONDS = 0.12;
const FOOD_RESPAWN_JITTER_RADIUS = 4.2;
const FOOD_NEAR_DISTANCE = 96;
const FOOD_MID_DISTANCE = 158;
const FOOD_TERRITORY_DISTANCE = 128;
const FOOD_FAR_DISTANCE = 214;
const FORAGING_FAR_MIN_EFFICIENCY = 0.64;
const FORAGING_TERRITORY_BASE_COST = 10;
const FORAGING_TERRITORY_COST_STEP = 5;
const RECENT_FORAGING_WINDOW_SECONDS = 60;
const WORKER_CONTESTED_FOOD_STRIDE = 6;
const RIVAL_NEST_WORKER_FORAGE_BASE_RADIUS = 108;
const RIVAL_NEST_WORKER_FORAGE_MAX_RADIUS = 255;
const RIVAL_NEST_WORKER_FORAGE_TERRITORY_RADIUS = 10;
const RIVAL_NEST_WORKER_FORAGE_ACTIVITY_RADIUS = 0.25;
const RIVAL_NEST_WORKER_FORAGE_NEST_LEVEL_RADIUS = 4;
const RIVAL_NEST_WORKER_FORAGE_SPEED_SCALE = 1.36;

function squadColorForId(id) {
  return SQUAD_COLORS[Math.max(0, Math.floor((id ?? 1) - 1)) % SQUAD_COLORS.length];
}

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
  texture.flipY = false;
  return texture;
}

function configureGeneratedTexture(texture, { repeat = 1, anisotropy = 4 } = {}) {
  const repeatX = Array.isArray(repeat) ? repeat[0] : repeat;
  const repeatY = Array.isArray(repeat) ? repeat[1] : repeat;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.flipY = false;
  return texture;
}

function configureGeneratedSpriteTexture(texture, { anisotropy = 4 } = {}) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.flipY = false;
  return texture;
}

function hashSeed(value) {
  const source = String(value);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeIrregularBlobProfile(seedKey, segments = 48, { roughness = 0.18, minRadius = 0.76, maxRadius = 1.24 } = {}) {
  const rng = seededRandom(hashSeed(seedKey));
  const lobeA = 2 + Math.floor(rng() * 3);
  const lobeB = lobeA + 2 + Math.floor(rng() * 3);
  const lobeC = lobeB + 4 + Math.floor(rng() * 5);
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const phaseC = rng() * Math.PI * 2;
  const notches = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => ({
    angle: rng() * Math.PI * 2,
    width: 0.22 + rng() * 0.2,
    depth: roughness * (0.28 + rng() * 0.32),
  }));
  let values = Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const large = Math.sin(angle * lobeA + phaseA) * roughness * 0.64;
    const small = Math.sin(angle * lobeB + phaseB) * roughness * 0.34;
    const grain = Math.sin(angle * lobeC + phaseC) * roughness * 0.18;
    const chip = (rng() - 0.5) * roughness * 0.52;
    const notch = notches.reduce((sum, item) => {
      const delta = Math.atan2(Math.sin(angle - item.angle), Math.cos(angle - item.angle));
      return sum - item.depth * Math.exp(-(delta * delta) / (2 * item.width * item.width));
    }, 0);
    return clamp(1 + large + small + grain + chip + notch, minRadius, maxRadius);
  });
  for (let pass = 0; pass < 1; pass += 1) {
    values = values.map((value, index) => {
      const prev = values[(index - 1 + segments) % segments];
      const next = values[(index + 1) % segments];
      return clamp(value * 0.66 + (prev + next) * 0.17, minRadius, maxRadius);
    });
  }
  return values;
}

function createIrregularBlobGeometry(seedKey, segments = 48, options = {}) {
  const profile = makeIrregularBlobProfile(seedKey, segments, options);
  const uvScale = options.uvScale ?? 2.7;
  const positions = [0, 0, 0];
  const normals = [0, 0, 1];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const radius = profile[i];
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    positions.push(x, y, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5 + x / uvScale, 0.5 + y / uvScale);
    indices.push(0, i + 1, i === segments - 1 ? 1 : i + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.userData.naturalBlob = true;
  geometry.userData.irregularProfile = profile;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, profile };
}

function sampleIrregularProfile(profile, angle) {
  if (!profile?.length) return 1;
  const turn = Math.PI * 2;
  const wrapped = ((angle % turn) + turn) % turn;
  const scaled = (wrapped / turn) * profile.length;
  const index = Math.floor(scaled);
  const nextIndex = (index + 1) % profile.length;
  const t = scaled - index;
  return profile[index] * (1 - t) + profile[nextIndex] * t;
}

function naturalPatchDistance(patch, x, z, padding = 0) {
  const dx = x - patch.x;
  const dz = z - patch.z;
  const cos = patch.cos ?? Math.cos(patch.rotation ?? 0);
  const sin = patch.sin ?? Math.sin(patch.rotation ?? 0);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  const rx = Math.max(0.001, (patch.rx ?? patch.radius ?? 1) + padding);
  const rz = Math.max(0.001, (patch.rz ?? patch.radius ?? 1) + padding);
  const normalizedX = localX / rx;
  const normalizedZ = localZ / rz;
  const baseDistance = Math.hypot(normalizedX, normalizedZ);
  const boundary = sampleIrregularProfile(patch.boundaryProfile, Math.atan2(normalizedZ, normalizedX));
  return baseDistance / Math.max(0.001, boundary);
}

function naturalPatchBoundaryPoint(patch, x, z, padding = 0) {
  const dx = x - patch.x;
  const dz = z - patch.z;
  const cos = patch.cos ?? Math.cos(patch.rotation ?? 0);
  const sin = patch.sin ?? Math.sin(patch.rotation ?? 0);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  const rx = Math.max(0.001, (patch.rx ?? patch.radius ?? 1) + padding);
  const rz = Math.max(0.001, (patch.rz ?? patch.radius ?? 1) + padding);
  const normalizedX = localX / rx;
  const normalizedZ = localZ / rz;
  const normalizedLength = Math.hypot(normalizedX, normalizedZ);
  const angle = normalizedLength > 0.0001 ? Math.atan2(normalizedZ, normalizedX) : 0;
  const boundary = sampleIrregularProfile(patch.boundaryProfile, angle);
  const boundaryLocalX = Math.cos(angle) * boundary * rx;
  const boundaryLocalZ = Math.sin(angle) * boundary * rz;
  const worldX = patch.x + boundaryLocalX * cos - boundaryLocalZ * sin;
  const worldZ = patch.z + boundaryLocalX * sin + boundaryLocalZ * cos;
  const normalX = worldX - patch.x;
  const normalZ = worldZ - patch.z;
  const normalLength = Math.hypot(normalX, normalZ) || 1;
  return {
    x: worldX,
    z: worldZ,
    nx: normalX / normalLength,
    nz: normalZ / normalLength,
  };
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

  preloadAssets() {
    const loader = new THREE.TextureLoader(this.manager);
    const loadTexture = (fileName, options) => configureGeneratedTexture(loader.load(`${GENERATED_TEXTURE_BASE_URL}${fileName}`), options);
    this.cache.set("groundTexture", loadTexture(GENERATED_TEXTURE_ASSETS.soil, { repeat: 7, anisotropy: 8 }));
    this.cache.set("terrainMossTexture", loadTexture(GENERATED_TEXTURE_ASSETS.moss, { repeat: 2.4, anisotropy: 6 }));
    this.cache.set("terrainSandTexture", loadTexture(GENERATED_TEXTURE_ASSETS.sand, { repeat: 2.8, anisotropy: 6 }));
    this.cache.set("terrainGravelTexture", loadTexture(GENERATED_TEXTURE_ASSETS.gravel, { repeat: 3.2, anisotropy: 6 }));
    this.cache.set("stoneTexture", loadTexture(GENERATED_TEXTURE_ASSETS.stone, { repeat: 3.8, anisotropy: 6 }));
    this.cache.set("waterTexture", loadTexture(GENERATED_TEXTURE_ASSETS.water, { repeat: 1.8, anisotropy: 6 }));
    this.cache.set("grassTuftTexture", configureGeneratedSpriteTexture(loader.load(`${GENERATED_TEXTURE_BASE_URL}${GENERATED_TEXTURE_ASSETS.grassTuft}`), { anisotropy: 6 }));
    this.cache.set("mossWetlandTexture", loadTexture(GENERATED_TEXTURE_ASSETS.mossWetland, { repeat: 2.5, anisotropy: 6 }));
    this.cache.set("microGravelTexture", loadTexture(GENERATED_TEXTURE_ASSETS.microGravel, { repeat: 2.8, anisotropy: 6 }));
    this.cache.set("crackedMudTexture", loadTexture(GENERATED_TEXTURE_ASSETS.crackedMud, { repeat: 2.2, anisotropy: 6 }));
    this.cache.set("shorelineWetEdgeTexture", loadTexture(GENERATED_TEXTURE_ASSETS.shorelineWetEdge, { repeat: 1.7, anisotropy: 6 }));
    this.cache.set("groundTextureSource", "generated-soil-texture");
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
      pointercancel: (event) => sim.onPointerCancel(event),
      wheel: (event) => sim.onWheel(event),
      contextmenu: (event) => event.preventDefault(),
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
    this.carryingSourceDistance = null;
    this.carryingSourceTier = null;
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
    this.reconTargetX = null;
    this.reconTargetZ = null;
    this.reconWaypointIndex = 0;
    this.inNest = false;
    this.nestStayTimer = 0;
    this.nestExitAngle = angle;
    this.carryingSoil = false;
    this.buildTaskId = null;
    this.braceIntent = 0;
    this.acidSprayCooldown = rand(0, ACID_SPRAY_COOLDOWN_SECONDS * 0.4);
    this.acidSprayTimer = 0;
    this.acidTargetId = null;
    this.scoutMarkCooldown = 0;
    this.scoutTargetId = null;
    this.scoutSignal = 0;
    this.medicAidCooldown = rand(0, MEDIC_AID_COOLDOWN_SECONDS * 0.5);
    this.medicAidTimer = 0;
    this.medicTargetId = null;
    this.medicSignal = 0;
    this.commandPulse = 0;
    this.commandEffectCooldown = rand(0, 0.6);
    this.squadId = null;
    this.squadLeaderId = null;
    this.squadSlot = -1;
    this.squadAnchorX = null;
    this.squadAnchorZ = null;
    this.squadTargetId = null;
    this.squadCohesion = 0;
    this.squadColorHex = null;
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
    } else if (nextVariant === "shieldHead") {
      this.role = "guard";
      this.carrying = 0;
      this.foodSourceId = null;
      this.traits.caution = clamp(Math.max(this.traits.caution, 0.82) + 0.08, 0, 1);
      this.traits.persistence = clamp(Math.max(this.traits.persistence, 0.82) + 0.1, 0, 1);
    } else if (nextVariant === "acidShooter") {
      this.role = "guard";
      this.carrying = 0;
      this.foodSourceId = null;
      this.traits.caution = clamp(Math.max(this.traits.caution, 0.62) + 0.04, 0, 1);
      this.traits.persistence = clamp(Math.max(this.traits.persistence, 0.6) + 0.05, 0, 1);
    } else if (nextVariant === "scout") {
      this.role = "guard";
      this.carrying = 0;
      this.foodSourceId = null;
      this.traits.curiosity = clamp(Math.max(this.traits.curiosity, 0.82) + 0.08, 0, 1);
      this.traits.caution = clamp(Math.max(this.traits.caution, 0.74) + 0.06, 0, 1);
      this.traits.persistence = clamp(Math.max(this.traits.persistence, 0.58) + 0.04, 0, 1);
    } else if (nextVariant === "medic") {
      this.role = "guard";
      this.carrying = 0;
      this.foodSourceId = null;
      this.traits.social = clamp(Math.max(this.traits.social, 0.84) + 0.1, 0, 1);
      this.traits.caution = clamp(Math.max(this.traits.caution, 0.78) + 0.08, 0, 1);
      this.traits.persistence = clamp(Math.max(this.traits.persistence, 0.54) + 0.04, 0, 1);
    } else if (nextVariant === "captain") {
      this.role = "guard";
      this.carrying = 0;
      this.foodSourceId = null;
      this.traits.social = clamp(Math.max(this.traits.social, 0.82) + 0.08, 0, 1);
      this.traits.caution = clamp(Math.max(this.traits.caution, 0.72) + 0.06, 0, 1);
      this.traits.persistence = clamp(Math.max(this.traits.persistence, 0.72) + 0.08, 0, 1);
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
    this.scoutSignal = Math.max(0, this.scoutSignal - dt * 2.6);
    this.scoutMarkCooldown = Math.max(0, this.scoutMarkCooldown - dt);
    this.medicSignal = Math.max(0, this.medicSignal - dt * 2.2);
    this.medicAidCooldown = Math.max(0, this.medicAidCooldown - dt);
    this.medicAidTimer = Math.max(0, this.medicAidTimer - dt);
    if (this.medicAidTimer <= 0) this.medicTargetId = null;
    this.commandPulse = Math.max(0, this.commandPulse - dt * 2.8);
    this.commandEffectCooldown = Math.max(0, this.commandEffectCooldown - dt);
    this.acidSprayCooldown = Math.max(0, this.acidSprayCooldown - dt);
    this.acidSprayTimer = Math.max(0, this.acidSprayTimer - dt);
    if (this.acidSprayTimer <= 0) this.acidTargetId = null;
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

    const alarmThreshold = this.variant === "heavySoldier" || this.variant === "shieldHead" ? 0.78 : this.variant === "builder" ? 0.42 : this.variant === "scout" ? 0.68 : 0.55;
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
    const hazardResponse =
      this.variant === "heavySoldier" || this.variant === "shieldHead" ? 0.22 :
      this.variant === "captain" ? 0.62 + this.traits.caution * 0.45 :
      this.variant === "medic" && this.isSortieSoldier ? 0.92 + this.traits.caution * 0.42 :
      this.variant === "scout" && this.isSortieSoldier ? 0.78 + this.traits.caution * 0.38 :
      this.variant === "scout" ? 1.48 + this.traits.caution :
      1.2 + this.traits.caution;
    steering.x += sensed.hazard.x * hazardResponse;
    steering.z += sensed.hazard.z * hazardResponse;
    if (this.isSortieSoldier && this.variant !== "captain") sim.applySquadSteering(this, steering);

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
    if (this.variant === "shieldHead" || this.variant === "scout" || this.variant === "medic") return false;
    if (this.variant === "heavySoldier" || this.variant === "shieldHead") this.braceIntent = 1;
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
    this.carryingSourceDistance = null;
    this.carryingSourceTier = null;
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
      const reach = Math.max(patch.radius, patch.rx ?? 0, patch.rz ?? 0) + 10;
      if (d < reach) {
        const strength = (1 - d / reach) * patch.power;
        hazard.x += ((this.x - patch.x) / (d || 1)) * strength * 1.7;
        hazard.z += ((this.z - patch.z) / (d || 1)) * strength * 1.7;
        const waterDistance = naturalPatchDistance(patch, this.x, this.z);
        if (waterDistance < 1) sensed.waterDepth = Math.max(sensed.waterDepth, (1 - waterDistance * waterDistance) * patch.power);
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
    if (this.variant === "captain" && this.updateCaptain(dt, sim, steering)) return;
    if (this.variant === "shieldHead" && this.updateShieldHead(dt, sim, steering)) return;
    if (this.variant === "heavySoldier" && this.updateHeavySoldier(dt, sim, steering, sensed)) return;
    if (this.variant === "acidShooter" && this.updateAcidShooter(dt, sim, steering)) return;
    if (this.variant === "scout" && this.updateScout(dt, sim, steering)) return;
    if (this.variant === "medic" && this.updateMedic(dt, sim, steering)) return;
    if (this.role === "guard" && this.isSortieSoldier && this.updateGuardIntercept(dt, sim, steering)) return;
    if (this.role === "guard" && this.isSortieSoldier && this.updateSortiePatrol(dt, sim, steering)) return;
    if (this.variant === "builder" && this.updateBuilder(dt, sim, steering, sensed)) return;

    const forageEfficiency = this.variantConfig.forageEfficiency;
    if (sensed.closestFood && sensed.foodDistance < sensed.closestFood.radius + 1.5 && this.role !== "guard" && forageEfficiency > 0) {
      const forageCarryMultiplier = sim.derived?.forageCarryMultiplier ?? sim.computeDerived().forageCarryMultiplier ?? 1;
      const carryCapacity = forageEfficiency * forageCarryMultiplier;
      this.carrying = Math.min(carryCapacity, sensed.closestFood.amount);
      this.foodSourceId = sensed.closestFood.id;
      this.carryingSourceDistance = sim.foodDistanceFromNest(sensed.closestFood);
      this.carryingSourceTier = sensed.closestFood.distanceTier ?? sim.foodDistanceTier(this.carryingSourceDistance);
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

    const contestedFood = sim.findContestedFoodForWorker?.(this);
    if (contestedFood) {
      const d = distance2(this.x, this.z, contestedFood.x, contestedFood.z) || 1;
      const pressure = 1.08 + this.traits.curiosity * 0.42;
      steering.x += ((contestedFood.x - this.x) / d) * pressure;
      steering.z += ((contestedFood.z - this.z) / d) * pressure;
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

    const contestedForageWindow = contestedFood
      ? 32 + Math.min(20, sim.foodDistanceFromNest(contestedFood) / 20)
      : 0;
    if (this.homeTimer > 9 + this.traits.persistence * 7 + contestedForageWindow || this.energy < 0.2) {
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
    if (!this.isSortieSoldier && this.role !== "guard" && this.variantConfig.forageEfficiency > 0) {
      const activityRadius = sim.workerActivityRadius?.() ?? sim.mapVisionRadiusValue ?? sim.worldRadius;
      const buffer = 10 + this.traits.persistence * 7;
      if (homeDistance > activityRadius - buffer) {
        const pull = clamp((homeDistance - (activityRadius - buffer)) / 34, 0.38, 2.25);
        steering.x += ((sim.nest.x - this.x) / (homeDistance || 1)) * pull;
        steering.z += ((sim.nest.z - this.z) / (homeDistance || 1)) * pull;
        if (homeDistance > activityRadius + 18) this.homeTimer += dt * 0.8;
      }
    }
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
    const threat = sim.findRivalThreat(this.x, this.z, seekRange, this.squadTargetId);
    const raid = sim.ensureRaidState();
    let target = threat;
    if (!target && this.isSortieSoldier) {
      target = sim.currentSortieTarget(this.x, this.z, this.sortieMode);
      if (!target && this.sortieTargetX != null && this.sortieTargetZ != null) {
        target = { x: this.sortieTargetX, z: this.sortieTargetZ };
      }
    }
    if (!target && raid.phase === "warning" && this.isSortieSoldier && sim.hasRaidDirectionIntel()) {
      target = sim.raidFormationPointForAnt(this, raid);
    }
    if (!target && (raid.phase === "active" || raid.phase === "retreating" || (this.isSortieSoldier && raid.phase === "warning" && sim.hasRaidDirectionIntel()))) {
      target = sim.raidSignalPoint(raid, 0.78);
    }
    if (!target) {
      const guardAngle = (this.id * 2.399 + sim.colony.nestLevel * 0.31) % (Math.PI * 2);
      target = {
        x: sim.nest.x + Math.cos(guardAngle) * (sim.nest.radius + 8),
        z: sim.nest.z + Math.sin(guardAngle) * (sim.nest.radius + 8),
      };
    }
    if (target.kind === "raid-formation") {
      this.sortieTargetX = target.x;
      this.sortieTargetZ = target.z;
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

  updateShieldHead(dt, sim, steering) {
    if (this.isSortieSoldier && this.sortieTimer <= 0 && this.state !== "return") {
      this.setState("return");
      return true;
    }
    const blockPoint = sim.shieldHeadBlockPoint(this);
    const threat = sim.findRivalThreat(blockPoint.x, blockPoint.z, 36, this.squadTargetId) ?? sim.findRivalThreat(this.x, this.z, 22, this.squadTargetId);
    const blockDistance = distance2(this.x, this.z, blockPoint.x, blockPoint.z) || 1;

    if (blockDistance > 1.6) {
      steering.x += ((blockPoint.x - this.x) / blockDistance) * (blockDistance > 12 ? 2.45 : 1.35);
      steering.z += ((blockPoint.z - this.z) / blockDistance) * (blockDistance > 12 ? 2.45 : 1.35);
      this.braceIntent = Math.max(this.braceIntent, 0.35);
      this.energy = clamp(this.energy - dt * 0.01, 0, 1);
      this.lastTacticalAction = "shieldMove";
      return true;
    }

    if (threat) {
      this.angle = Math.atan2(threat.x - this.x, threat.z - this.z);
    } else {
      this.angle = blockPoint.angle;
    }
    this.braceIntent = 1;
    this.energy = clamp(this.energy - dt * 0.006, 0, 1);
    this.lastTacticalAction = "shieldBlock";
    this.skipMoveThisFrame = true;
    if (this.lastTrail > 0.38) {
      sim.addTrail(this.x, this.z, "alarm", 0.62);
      this.lastTrail = 0;
    }
    return true;
  }

  updateAcidShooter(dt, sim, steering) {
    if (this.isSortieSoldier && this.sortieTimer <= 0 && this.state !== "return") {
      this.setState("return");
      return true;
    }
    const threat = sim.findRivalThreat(this.x, this.z, SOLDIER_SORTIE_SEEK_RANGE, this.squadTargetId);
    const raid = sim.ensureRaidState();
    let target = threat;
    if (!target && this.isSortieSoldier) {
      target = sim.currentSortieTarget(this.x, this.z, this.sortieMode);
      if (!target && this.sortieTargetX != null && this.sortieTargetZ != null) {
        target = { x: this.sortieTargetX, z: this.sortieTargetZ };
      }
    }
    if (!target && (raid.phase === "active" || raid.phase === "retreating" || (raid.phase === "warning" && sim.hasRaidDirectionIntel()))) {
      target = sim.raidSignalPoint(raid, 0.78);
    }
    if (!target) return false;

    const targetDistance = distance2(this.x, this.z, target.x, target.z) || 1;
    this.sortieTargetX = target.x;
    this.sortieTargetZ = target.z;
    if (threat && targetDistance <= ACID_SPRAY_RANGE) {
      this.angle = Math.atan2(threat.x - this.x, threat.z - this.z);
      this.energy = clamp(this.energy - dt * 0.016, 0, 1);
      if (this.acidSprayCooldown <= 0) {
        sim.sprayAcid(this, threat);
        this.acidSprayCooldown = ACID_SPRAY_COOLDOWN_SECONDS;
        this.acidSprayTimer = ACID_SPRAY_DURATION_SECONDS;
        this.acidTargetId = threat.id;
        this.lastTacticalAction = "acidSpray";
        this.skipMoveThisFrame = true;
        return true;
      }
      if (this.acidSprayTimer > 0) {
        this.lastTacticalAction = "acidSpray";
        this.skipMoveThisFrame = true;
        return true;
      }
      const standoffDistance = ACID_SPRAY_RANGE * 0.62;
      if (targetDistance < standoffDistance) {
        const retreatPressure = 1.35 + (1 - targetDistance / standoffDistance) * 1.35;
        steering.x += ((this.x - threat.x) / targetDistance) * retreatPressure;
        steering.z += ((this.z - threat.z) / targetDistance) * retreatPressure;
        this.lastTacticalAction = "acidReposition";
        return true;
      }
      this.lastTacticalAction = "acidAim";
      this.skipMoveThisFrame = true;
      return true;
    }

    const desiredDistance = threat ? ACID_SPRAY_RANGE * 0.72 : 20;
    const pressure = targetDistance > desiredDistance ? 2.0 : 0.72;
    steering.x += ((target.x - this.x) / targetDistance) * pressure;
    steering.z += ((target.z - this.z) / targetDistance) * pressure;
    if (threat && targetDistance < ACID_SPRAY_RANGE * 0.55) {
      steering.x += ((this.x - threat.x) / targetDistance) * 0.8;
      steering.z += ((this.z - threat.z) / targetDistance) * 0.8;
    }
    this.energy = clamp(this.energy - dt * 0.012, 0, 1);
    this.lastTacticalAction = threat ? "acidRange" : "acidSeek";
    return true;
  }

  updateScout(dt, sim, steering) {
    if (this.isSortieSoldier && this.sortieTimer <= 0 && this.state !== "return") {
      this.setState("return");
      return true;
    }
    if (this.isSortieSoldier && this.sortieMode === "recon" && sim.isRivalNestKnown()) {
      this.sortieTimer = 0;
      this.lastTacticalAction = "reconComplete";
      this.setState("return");
      return true;
    }
    const threat = sim.findRivalThreat(this.x, this.z, SOLDIER_SORTIE_SEEK_RANGE, this.squadTargetId);
    const raid = sim.ensureRaidState();
    let target = threat;
    if (!target && this.isSortieSoldier) {
      target = this.sortieMode === "recon"
        ? sim.reconSearchTargetForAnt(this)
        : sim.currentSortieTarget(this.x, this.z, this.sortieMode);
      if (!target && this.sortieTargetX != null && this.sortieTargetZ != null) {
        target = { x: this.sortieTargetX, z: this.sortieTargetZ };
      }
    }
    if (!target && (raid.phase === "active" || raid.phase === "retreating" || (raid.phase === "warning" && sim.hasRaidDirectionIntel()))) {
      target = sim.raidSignalPoint(raid, 0.78);
    }
    if (!target) return false;

    const targetDistance = distance2(this.x, this.z, target.x, target.z) || 1;
    const hasSquadAnchor = this.squadAnchorX != null && this.squadAnchorZ != null;
    const anchorDistance = hasSquadAnchor ? distance2(this.x, this.z, this.squadAnchorX, this.squadAnchorZ) : 0;
    this.sortieTargetX = target.x;
    this.sortieTargetZ = target.z;
    if (threat && targetDistance <= SCOUT_MARK_RANGE) {
      this.angle = Math.atan2(threat.x - this.x, threat.z - this.z);
      sim.markRivalByScout(this, threat, targetDistance);
      this.energy = clamp(this.energy - dt * 0.008, 0, 1);
      if (targetDistance < SCOUT_MARK_STANDOFF) {
        const retreatPressure = 0.95 + (1 - targetDistance / SCOUT_MARK_STANDOFF) * 1.35;
        steering.x += ((this.x - threat.x) / targetDistance) * retreatPressure;
        steering.z += ((this.z - threat.z) / targetDistance) * retreatPressure;
        this.lastTacticalAction = "scoutEvade";
        return true;
      }
      const frontlineDistance = Math.max(SCOUT_MARK_STANDOFF + 5, SCOUT_MARK_RANGE * 0.54);
      if (targetDistance > frontlineDistance) {
        const closePressure = 0.92 + clamp((targetDistance - frontlineDistance) / Math.max(1, SCOUT_MARK_RANGE - frontlineDistance), 0, 1) * 1.15;
        steering.x += ((target.x - this.x) / targetDistance) * closePressure;
        steering.z += ((target.z - this.z) / targetDistance) * closePressure;
      }
      if (hasSquadAnchor && anchorDistance > 2.1) {
        const anchorPressure = clamp((anchorDistance - 2.1) / Math.max(1, CAPTAIN_COHESION_RADIUS * 0.72), 0.32, 1.35);
        steering.x += ((this.squadAnchorX - this.x) / anchorDistance) * anchorPressure;
        steering.z += ((this.squadAnchorZ - this.z) / anchorDistance) * anchorPressure;
      }
      this.lastTacticalAction = "scoutMark";
      if (targetDistance <= frontlineDistance + 1.5 && (!hasSquadAnchor || anchorDistance <= 2.8)) {
        this.skipMoveThisFrame = true;
      }
      return true;
    }

    const desiredDistance = threat ? Math.max(SCOUT_MARK_STANDOFF + 5, SCOUT_MARK_RANGE * 0.54) : 20;
    const pressure = targetDistance > desiredDistance ? 2.75 : 0.72;
    steering.x += ((target.x - this.x) / targetDistance) * pressure;
    steering.z += ((target.z - this.z) / targetDistance) * pressure;
    this.energy = clamp(this.energy - dt * 0.006, 0, 1);
    if (this.sortieMode === "recon" && !threat && this.lastTrail > 0.55) {
      sim.addTrail(this.x, this.z, "alarm", 0.24);
      this.lastTrail = 0;
    }
    this.lastTacticalAction = threat ? "scoutClose" : this.sortieMode === "recon" ? "reconSearch" : "scoutSeek";
    return true;
  }

  updateMedic(dt, sim, steering) {
    if (this.isSortieSoldier && this.sortieTimer <= 0 && this.state !== "return") {
      this.setState("return");
      return true;
    }
    const patient = sim.findMedicPatient(this);
    const raid = sim.ensureRaidState();
    let anchor = patient;
    if (!anchor && this.squadAnchorX != null && this.squadAnchorZ != null) {
      anchor = { x: this.squadAnchorX, z: this.squadAnchorZ };
    }
    if (!anchor && this.isSortieSoldier) {
      const target = sim.currentSortieTarget(this.x, this.z, this.sortieMode);
      if (target) {
        const d = distance2(target.x, target.z, sim.nest.x, sim.nest.z) || 1;
        anchor = {
          x: target.x + ((sim.nest.x - target.x) / d) * MEDIC_STANDOFF,
          z: target.z + ((sim.nest.z - target.z) / d) * MEDIC_STANDOFF,
        };
      } else if (raid.phase === "warning" && sim.hasRaidDirectionIntel()) {
        anchor = sim.raidFormationPointForAnt(this, raid);
      }
    }
    if (!anchor) return false;

    const d = distance2(this.x, this.z, anchor.x, anchor.z) || 1;
    this.sortieTargetX = anchor.x;
    this.sortieTargetZ = anchor.z;
    if (patient && d <= 3.2) {
      this.angle = Math.atan2(patient.x - this.x, patient.z - this.z);
      this.energy = clamp(this.energy - dt * 0.008, 0, 1);
      if (this.medicAidCooldown <= 0) {
        sim.applyMedicAid(this, patient);
        this.medicAidCooldown = MEDIC_AID_COOLDOWN_SECONDS;
        this.medicAidTimer = MEDIC_AID_SECONDS;
        this.medicTargetId = patient.id;
      }
      this.medicSignal = 1;
      this.lastTacticalAction = patient.state === "flee" || patient.fleeTimer > 0 ? "medicEvacuate" : "medicAid";
      this.skipMoveThisFrame = true;
      return true;
    }

    const nearestThreat = sim.findRivalThreat(this.x, this.z, MEDIC_AID_RANGE);
    if (nearestThreat) {
      const threatDistance = distance2(this.x, this.z, nearestThreat.x, nearestThreat.z) || 1;
      if (threatDistance < MEDIC_STANDOFF) {
        const retreatPressure = 0.9 + (1 - threatDistance / MEDIC_STANDOFF) * 1.35;
        steering.x += ((this.x - nearestThreat.x) / threatDistance) * retreatPressure;
        steering.z += ((this.z - nearestThreat.z) / threatDistance) * retreatPressure;
      }
    }
    const pressure = d > 14 ? 2.15 : patient ? 1.42 : 0.92;
    steering.x += ((anchor.x - this.x) / d) * pressure;
    steering.z += ((anchor.z - this.z) / d) * pressure;
    this.energy = clamp(this.energy - dt * 0.006, 0, 1);
    this.lastTacticalAction = patient ? "medicClose" : "medicFollow";
    return true;
  }

  updateCaptain(dt, sim, steering) {
    if (this.isSortieSoldier && this.sortieTimer <= 0 && this.state !== "return") {
      this.setState("return");
      return true;
    }
    const squad = sim.squadForLeader(this);
    const threat = squad
      ? sim.findSquadThreat(squad, this, SOLDIER_SORTIE_SEEK_RANGE)
      : sim.findRivalThreat(this.x, this.z, SOLDIER_SORTIE_SEEK_RANGE, this.squadTargetId);
    const raid = sim.ensureRaidState();
    let target = threat;
    if (!target && this.isSortieSoldier) {
      target = sim.currentSortieTarget(this.x, this.z, this.sortieMode);
      if (!target && this.sortieTargetX != null && this.sortieTargetZ != null) {
        target = { x: this.sortieTargetX, z: this.sortieTargetZ };
      }
    }
    if (!target && (raid.phase === "active" || raid.phase === "retreating" || (raid.phase === "warning" && sim.hasRaidDirectionIntel()))) {
      target = sim.raidSignalPoint(raid, 0.78);
    }
    if (!target) return false;

    const rallyTarget = squad ? sim.spreadSquadTarget(squad, this, target, threat) : target;
    const exactTarget = threat ?? target;
    const targetDistance = distance2(this.x, this.z, rallyTarget.x, rallyTarget.z) || 1;
    this.sortieTargetX = rallyTarget.x;
    this.sortieTargetZ = rallyTarget.z;
    this.squadTargetId = threat?.id ?? squad?.targetRivalId ?? null;
    this.commandPulse = Math.max(this.commandPulse, threat ? 0.95 : 0.68);
    if (squad) sim.commandSquad(this, target, threat);
    if (this.lastTrail > 0.55) {
      sim.addTrail(this.x, this.z, "alarm", threat ? 0.42 : 0.28);
      this.lastTrail = 0;
    }

    const desiredDistance = threat ? CAPTAIN_COMMAND_RANGE * 0.62 : 18;
    const tooCloseDistance = threat ? CAPTAIN_COMMAND_RANGE * 0.42 : 0;
    if (threat && targetDistance < tooCloseDistance) {
      const exactDistance = distance2(this.x, this.z, exactTarget.x, exactTarget.z) || 1;
      const pressure = 0.55 + (1 - targetDistance / Math.max(1, tooCloseDistance)) * 0.9;
      steering.x += ((this.x - exactTarget.x) / exactDistance) * pressure;
      steering.z += ((this.z - exactTarget.z) / exactDistance) * pressure;
      this.lastTacticalAction = "captainFallBack";
    } else if (targetDistance > desiredDistance) {
      const cohesionGate = squad?.memberIds?.length ? clamp(0.35 + (squad.cohesion ?? 0) * 0.65, 0.35, 1) : 1;
      const pressure = (targetDistance > 48 ? 1.35 : 0.82) * cohesionGate;
      steering.x += ((rallyTarget.x - this.x) / targetDistance) * pressure;
      steering.z += ((rallyTarget.z - this.z) / targetDistance) * pressure;
      this.lastTacticalAction = threat && cohesionGate > 0.58 ? "captainAdvance" : threat ? "captainWaitSquad" : "captainRally";
    } else {
      this.angle = Math.atan2(exactTarget.x - this.x, exactTarget.z - this.z);
      steering.x += ((rallyTarget.x - this.x) / targetDistance) * 0.18;
      steering.z += ((rallyTarget.z - this.z) / targetDistance) * 0.18;
      this.lastTacticalAction = threat ? "captainCommand" : "captainHold";
    }
    this.energy = clamp(this.energy - dt * 0.011, 0, 1);
    return true;
  }

  updateBuilder(dt, sim, steering) {
    const rival = sim.findRivalThreat(this.x, this.z, 16, this.squadTargetId);
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
    const activeRaidSortie = this.isSortieSoldier && (raid.phase === "active" || raid.phase === "retreating");
    const threat = activeRaidSortie
      ? sim.findRivalThreat(this.x, this.z, RAID_SORTIE_SIGNAL_SEEK_RANGE, this.squadTargetId, { requireVisible: false }) ??
        sim.findRivalThreat(this.x, this.z, SOLDIER_SORTIE_SEEK_RANGE, this.squadTargetId)
      : sim.findRivalThreat(this.x, this.z, GUARD_INTERCEPT_RANGE, this.squadTargetId);
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
    const raid = sim.ensureRaidState();
    const target = raid.phase === "warning" && sim.hasRaidDirectionIntel()
      ? sim.raidFormationPointForAnt(this, raid)
      : sim.currentSortieTarget(this.x, this.z, this.sortieMode);
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
      if (this.carrying > 0) sim.gainFood(this.carrying, true, { sourceDistance: this.carryingSourceDistance });
      this.carrying = 0;
      this.foodSourceId = null;
      this.carryingSourceDistance = null;
      this.carryingSourceTier = null;
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

    if (this.variant !== "medic" && ((this.role === "guard" && this.isSortieSoldier) || this.traits.persistence > 0.72)) {
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
    if (this.carrying > 0 || (this.state === "explore" && this.role !== "guard" && this.variantConfig.forageEfficiency > 0)) {
      const forageSpeedMultiplier = sim.derived?.forageSpeedMultiplier ?? sim.computeDerived().forageSpeedMultiplier ?? 1;
      speed *= forageSpeedMultiplier;
    }
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
    sim.resolveWaterCollision?.(this, 0.92 + this.bodyScale * this.variantConfig.bodyScale * 0.22);
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
      y: 0.2 + (sim.wallTopElevationAt?.(this.x, this.z) ?? 0) + Math.sin(this.gaitPhase + this.animationSeed * 0.000001) * 0.012,
      scale: (this.state === "stunned" ? 0.82 : this.state === "clash" ? 1.06 : 1) * this.bodyScale * this.variantConfig.bodyScale,
      state: this.state,
      carrying: this.carrying,
      carryingSoil: this.carryingSoil,
      variant: this.variant,
      variantConfig: this.variantConfig,
      acidPose: this.variant === "acidShooter" ? clamp(this.acidSprayTimer / ACID_SPRAY_DURATION_SECONDS, 0, 1) : 0,
      acidTargetId: this.acidTargetId,
      shieldPose: this.variant === "shieldHead" ? clamp(this.braceIntent, 0, 1) : 0,
      scoutPose: this.variant === "scout" ? clamp(this.scoutSignal, 0, 1) : 0,
      scoutTargetId: this.scoutTargetId,
      medicPose: this.variant === "medic" ? clamp(Math.max(this.medicSignal, this.medicAidTimer / MEDIC_AID_SECONDS), 0, 1) : 0,
      medicTargetId: this.medicTargetId,
      commandPose: this.variant === "captain" ? clamp(this.commandPulse, 0, 1) : 0,
      squadId: this.squadId,
      squadTargetId: this.squadTargetId,
      squadCohesion: this.squadCohesion,
      squadColorHex: this.squadColorHex,
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
    this.isRivalNestDefender = Boolean(options.nestDefense);
    this.rivalKind = options.kind === "worker" && !this.isRivalNestDefender ? "worker" : "soldier";
    this.isRivalWorker = this.rivalKind === "worker";
    this.isRaidRival = Boolean(options.raid);
    this.raidWave = options.raid?.wave ?? 0;
    this.raidIndex = options.raid?.index ?? 0;
    this.raidCount = options.raid?.count ?? 1;
    this.rivalWorkerIndex = options.index ?? 0;
    this.rivalWorkerCount = options.count ?? RIVAL_NEST_WORKER_COUNT;
    this.rivalDefenseIndex = options.index ?? 0;
    this.rivalDefenseCount = options.count ?? RIVAL_NEST_DEFENDER_MIN_COUNT;
    this.raidTargetX = sim.nest.x;
    this.raidTargetZ = sim.nest.z;
    this.leftRaid = false;
    this.defeated = false;
    this.variant = this.isRivalNestDefender ? "soldier" : "worker";
    this.variantConfig = getAntVariantConfig(this.variant);
    this.role = this.isRivalWorker ? "worker" : "guard";
    this.scale = this.isRivalWorker ? rand(0.82, 0.98) : rand(1.22, 1.42);
    this.baseSpeed = this.isRivalWorker ? rand(3.2, 4.9) : rand(4.6, 7.2);
    this.aggression = this.isRivalWorker ? rand(0.06, 0.24) : rand(0.42, 1);
    this.stubbornness = this.isRivalWorker ? rand(0.18, 0.46) : rand(0.36, 1);
    this.state = "rival";
    this.wander = rand(0, Math.PI * 2);
    this.angle = rand(0, Math.PI * 2);
    this.prevAngle = this.angle;
    this.prevX = 0;
    this.prevZ = 0;
    this.disrupt = 0;
    this.combatDamage = 0;
    this.combatDamageFlash = 0;
    this.acidDebuff = 0;
    this.acidFlash = 0;
    this.scoutMarkTimer = 0;
    this.scoutMarkStrength = 0;
    this.scoutMarkedById = null;
    this.retreat = 0;
    this.retreatFromX = 0;
    this.retreatFromZ = 0;
    this.victoryFlash = 0;
    this.fightCooldown = rand(0, 0.8);
    this.lastFightWinner = null;
    this.clash = null;
    this.gaitPhase = rand(0, Math.PI * 2);
    this.steering = { x: 0, z: 0 };
    this.workerTaskTimer = rand(0.2, 2.4);
    this.workerCarryTimer = rand(0.8, 6.4);
    this.workerTargetX = 0;
    this.workerTargetZ = 0;
    this.workerTargetFoodId = null;
    this.peelTargetRivalId = null;
    this.carrying = 0;
    this.renderInstanceIndex = null;
    if (this.isRivalWorker) this.placeAtRivalNestWorkerSpawn(sim);
    else if (this.isRivalNestDefender) this.placeAtRivalNestDefenderSpawn(sim);
    else if (this.isRaidRival) this.placeAtRaidSpawn(sim, options.raid);
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
    const lane = this.raidIndex - (count - 1) * 0.5;
    const row = Math.floor(this.raidIndex / 3);
    const nest = sim.rivalNest ?? { x: sim.worldRadius * 0.84, z: -sim.worldRadius * 0.42, radius: 10 };
    let approachX = sim.nest.x - nest.x;
    let approachZ = sim.nest.z - nest.z;
    let approachDistance = Math.hypot(approachX, approachZ);
    if (approachDistance <= 0.001) {
      const baseAngle = raid.approachAngle ?? rand(0, Math.PI * 2);
      approachX = -Math.cos(baseAngle);
      approachZ = -Math.sin(baseAngle);
      approachDistance = 1;
    }
    approachX /= approachDistance;
    approachZ /= approachDistance;
    const flankX = -approachZ;
    const flankZ = approachX;
    const depth = nest.radius + 3.4 + (this.raidIndex % 4) * 1.7 + row * 1.15 + rand(-0.5, 0.5);
    const sideOffset = lane * 1.65 + (this.raidIndex % 2 === 0 ? -0.8 : 0.8) + rand(-1.0, 1.0);
    const spawn = sim.clampPointToWorld({
      x: nest.x + approachX * depth + flankX * sideOffset,
      z: nest.z + approachZ * depth + flankZ * sideOffset,
    }, 4);
    this.x = spawn.x;
    this.z = spawn.z;
    this.prevX = this.x;
    this.prevZ = this.z;
    this.homeX = nest.x + flankX * clamp(sideOffset * 0.42, -4, 4);
    this.homeZ = nest.z + flankZ * clamp(sideOffset * 0.42, -4, 4);

    const targetDistance = sim.nest.radius + 15 + (this.raidIndex % 3) * 4.5 + row * 1.8;
    const targetFlank = -lane * 2.8 + (this.raidIndex % 2 === 0 ? -1.3 : 1.3);
    this.raidTargetX = sim.nest.x + approachX * -targetDistance + flankX * targetFlank;
    this.raidTargetZ = sim.nest.z + approachZ * -targetDistance + flankZ * targetFlank;
    this.angle = Math.atan2(approachX, approachZ);
    this.prevAngle = this.angle;
  }

  placeAtRivalNestWorkerSpawn(sim) {
    const nest = sim.rivalNest ?? { x: sim.worldRadius * 0.68, z: sim.worldRadius * 0.62, radius: 9 };
    const count = Math.max(1, this.rivalWorkerCount);
    const index = this.rivalWorkerIndex % count;
    const angle = (index / count) * Math.PI * 2 + rand(-0.28, 0.28);
    const radius = rand(RIVAL_NEST_WORKER_MIN_RADIUS, RIVAL_NEST_WORKER_MAX_RADIUS);
    const point = sim.clampPointToWorld({
      x: nest.x + Math.cos(angle) * radius,
      z: nest.z + Math.sin(angle) * radius,
    }, 4);
    this.x = point.x;
    this.z = point.z;
    this.prevX = this.x;
    this.prevZ = this.z;
    this.homeX = nest.x + Math.cos(angle) * rand(nest.radius * 0.35, nest.radius + 2.5);
    this.homeZ = nest.z + Math.sin(angle) * rand(nest.radius * 0.35, nest.radius + 2.5);
    this.workerTargetX = this.x;
    this.workerTargetZ = this.z;
    this.angle = angle + Math.PI * 0.5;
    this.prevAngle = this.angle;
  }

  placeAtRivalNestDefenderSpawn(sim) {
    const nest = sim.rivalNest ?? { x: sim.worldRadius * 0.68, z: sim.worldRadius * 0.62, radius: 9 };
    const count = Math.max(1, this.rivalDefenseCount);
    const index = this.rivalDefenseIndex % count;
    const lane = index - (count - 1) * 0.5;
    let forwardX = sim.nest.x - nest.x;
    let forwardZ = sim.nest.z - nest.z;
    const forwardDistance = Math.hypot(forwardX, forwardZ) || 1;
    forwardX /= forwardDistance;
    forwardZ /= forwardDistance;
    const flankX = -forwardZ;
    const flankZ = forwardX;
    const row = Math.floor(index / 4);
    const depth = nest.radius + 2.8 + row * 1.2;
    const sideOffset = lane * 1.7;
    const point = sim.clampPointToWorld({
      x: nest.x + forwardX * depth + flankX * sideOffset,
      z: nest.z + forwardZ * depth + flankZ * sideOffset,
    }, 4);
    this.x = point.x;
    this.z = point.z;
    this.prevX = this.x;
    this.prevZ = this.z;
    this.homeX = nest.x + forwardX * (nest.radius + 1.2) + flankX * clamp(sideOffset * 0.42, -3.5, 3.5);
    this.homeZ = nest.z + forwardZ * (nest.radius + 1.2) + flankZ * clamp(sideOffset * 0.42, -3.5, 3.5);
    this.angle = Math.atan2(forwardX, forwardZ);
    this.prevAngle = this.angle;
  }

  update(dt, sim) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevAngle = this.angle;
    this.fightCooldown = Math.max(0, this.fightCooldown - dt);
    this.disrupt = Math.max(0, this.disrupt - dt * 0.72);
    this.combatDamageFlash = Math.max(0, this.combatDamageFlash - dt * 1.6);
    this.acidDebuff = Math.max(0, this.acidDebuff - dt / ACID_DEBUFF_SECONDS);
    this.acidFlash = Math.max(0, this.acidFlash - dt * 2.6);
    this.scoutMarkTimer = Math.max(0, this.scoutMarkTimer - dt);
    if (this.scoutMarkTimer <= 0) {
      this.scoutMarkStrength = 0;
      this.scoutMarkedById = null;
    }
    this.retreat = Math.max(0, this.retreat - dt);
    this.victoryFlash = Math.max(0, this.victoryFlash - dt * 1.4);

    if (this.clash) {
      this.updateClash(dt, sim);
      return;
    }

    if (this.isRivalWorker) {
      this.updateRivalWorker(dt, sim);
      return;
    }

    if (this.isRivalNestDefender) {
      this.updateRivalNestDefender(dt, sim);
      return;
    }

    const steering = this.steering;
    steering.x = 0;
    steering.z = 0;
    if (this.retreat > 0) {
      this.addRetreatHome(steering, sim);
    } else {
      const peelTarget = this.findCrowdedClashApproach(sim, RIVAL_COMBAT_PEEL_TRIGGER_RADIUS);
      if (peelTarget) this.addClashPeelApproach(steering, peelTarget);
      else {
        const targetAnt = this.findHarassmentTarget(sim);
        if (targetAnt) this.addAntHarassment(steering, targetAnt);
        else {
          this.addFoodCompetition(steering, sim);
          if (this.isRaidRival) this.addRaidPressure(steering, sim);
        }
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

  updateRivalWorker(dt, sim) {
    const steering = this.steering;
    steering.x = 0;
    steering.z = 0;
    const nest = sim.rivalNest ?? { x: this.homeX, z: this.homeZ, radius: 9 };
    const forageRadius = sim.rivalWorkerForageRadius?.() ?? RIVAL_NEST_WORKER_RETURN_RADIUS;
    const targetFood = sim.getFoodSource?.(this.workerTargetFoodId);
    if (!targetFood?.rivalForage) this.workerTargetFoodId = null;
    const peelTarget = this.findCrowdedClashApproach(sim);
    const contactTarget = peelTarget ? null : this.findRivalWorkerContactTarget(sim);
    const nestDistance = distance2(this.x, this.z, nest.x, nest.z) || 1;

    this.workerTaskTimer -= dt;
    this.workerCarryTimer -= dt;
    if (this.workerCarryTimer <= 0) {
      this.carrying = this.carrying > 0 ? 0 : 1;
      this.workerCarryTimer = rand(3.2, 8.5);
    }

    if (peelTarget) {
      const d = distance2(this.x, this.z, peelTarget.x, peelTarget.z) || 1;
      steering.x += ((peelTarget.x - this.x) / d) * 1.42;
      steering.z += ((peelTarget.z - this.z) / d) * 1.42;
      this.carrying = 0;
      this.state = "rival";
    } else if (contactTarget) {
      const target = contactTarget.ant;
      const d = distance2(this.x, this.z, target.x, target.z) || 1;
      const pressure = contactTarget.kind === "attacker" ? 1.65 : 1.18;
      steering.x += ((target.x - this.x) / d) * pressure;
      steering.z += ((target.z - this.z) / d) * pressure;
      const contactForageRadius = sim.isRivalForageZone?.(this.x, this.z, 12) || sim.isRivalForageZone?.(target.x, target.z, 12)
        ? forageRadius
        : RIVAL_NEST_WORKER_RETURN_RADIUS;
      if (nestDistance > contactForageRadius * 0.82) {
        steering.x += ((nest.x - this.x) / nestDistance) * 0.55;
        steering.z += ((nest.z - this.z) / nestDistance) * 0.55;
      }
      this.carrying = 0;
      this.state = "rival";
    } else {
      if (this.workerTaskTimer <= 0 || distance2(this.x, this.z, this.workerTargetX, this.workerTargetZ) < 2.6) {
        this.pickRivalWorkerTarget(sim);
      }
      const targetDistance = distance2(this.x, this.z, this.workerTargetX, this.workerTargetZ) || 1;
      steering.x += ((this.workerTargetX - this.x) / targetDistance) * 1.05;
      steering.z += ((this.workerTargetZ - this.z) / targetDistance) * 1.05;
      const workerRange = this.workerTargetFoodId != null ? forageRadius : RIVAL_NEST_WORKER_RETURN_RADIUS;
      if (nestDistance > workerRange) {
        steering.x += ((nest.x - this.x) / nestDistance) * 1.8;
        steering.z += ((nest.z - this.z) / nestDistance) * 1.8;
      }
      this.state = this.carrying > 0 ? "return" : "rival";
    }

    this.addRivalSeparation(steering, sim);
    this.wander += (Math.random() - 0.5) * dt * 1.4;
    steering.x += Math.sin(this.wander) * 0.24;
    steering.z += Math.cos(this.wander) * 0.24;
    this.move(dt, sim, steering);
    this.resolveAntContacts(sim);
  }

  pickRivalWorkerTarget(sim) {
    const nest = sim.rivalNest ?? { x: this.homeX, z: this.homeZ, radius: 9 };
    const forageRadius = sim.rivalWorkerForageRadius?.() ?? RIVAL_NEST_WORKER_RETURN_RADIUS;
    const forageFoods = (sim.food ?? []).filter((food) =>
      food.rivalForage &&
      food.amount > 0 &&
      distance2(food.x, food.z, nest.x, nest.z) <= forageRadius,
    );
    if (forageFoods.length > 0 && chance(0.76)) {
      const food = forageFoods
        .slice()
        .sort((a, b) => distance2(b.x, b.z, nest.x, nest.z) - distance2(a.x, a.z, nest.x, nest.z))[0];
      const angle = rand(0, Math.PI * 2);
      const point = sim.clampPointToWorld({
        x: food.x + Math.cos(angle) * rand(0, Math.max(0.6, food.radius * 0.5)),
        z: food.z + Math.sin(angle) * rand(0, Math.max(0.6, food.radius * 0.5)),
      }, 4);
      this.workerTargetX = point.x;
      this.workerTargetZ = point.z;
      this.workerTargetFoodId = food.id;
      this.workerTaskTimer = rand(18, 30);
      return;
    }
    this.workerTargetFoodId = null;
    const base = Math.atan2(this.z - nest.z, this.x - nest.x);
    const angle = base + rand(-1.15, 1.15) + (chance(0.28) ? Math.PI : 0);
    const radius = rand(RIVAL_NEST_WORKER_MIN_RADIUS, RIVAL_NEST_WORKER_MAX_RADIUS);
    const point = sim.clampPointToWorld({
      x: nest.x + Math.cos(angle) * radius,
      z: nest.z + Math.sin(angle) * radius,
    }, 4);
    this.workerTargetX = point.x;
    this.workerTargetZ = point.z;
    this.workerTaskTimer = rand(1.4, 4.4);
  }

  findRivalWorkerContactTarget(sim) {
    let best = null;
    let bestScore = Infinity;
    const nest = sim.rivalNest ?? { x: this.homeX, z: this.homeZ, radius: 9 };
    for (const ant of sim.ants) {
      if (!sim.shouldRenderAnt(ant)) continue;
      if (ant.state === "return" || ant.state === "flee" || ant.state === "clash" || ant.clashRival || ant.stun > 0) continue;
      const nestDistance = distance2(ant.x, ant.z, nest.x, nest.z);
      const isAttacker = ant.isSortieSoldier || ant.role === "guard" || ant.lastTacticalAction === "rivalNestAssault";
      const isWorkerContact = ant.variant === "worker" && ant.role === "worker" && (
        nestDistance <= RIVAL_NEST_WORKER_RETURN_RADIUS + 8 ||
        sim.isRivalForageZone?.(ant.x, ant.z, RIVAL_NEST_WORKER_WORKER_CONTACT_RADIUS + 4)
      );
      if (!isAttacker && !isWorkerContact) continue;
      const d = distance2(this.x, this.z, ant.x, ant.z);
      const range = isAttacker ? RIVAL_NEST_WORKER_ATTACKER_RADIUS : RIVAL_NEST_WORKER_WORKER_CONTACT_RADIUS;
      if (d > range) continue;
      const score = d - (isAttacker ? 6 : 0);
      if (score < bestScore) {
        best = { ant, kind: isAttacker ? "attacker" : "worker" };
        bestScore = score;
      }
    }
    return best;
  }

  updateRivalNestDefender(dt, sim) {
    const steering = this.steering;
    steering.x = 0;
    steering.z = 0;
    const nest = sim.rivalNest ?? { x: this.homeX, z: this.homeZ, radius: 9 };
    const nestDistance = distance2(this.x, this.z, nest.x, nest.z) || 1;

    if (this.retreat > 0) {
      this.addRetreatHome(steering, sim);
    } else {
      const target = this.findRivalNestDefenseTarget(sim);
      if (target) {
        const d = distance2(this.x, this.z, target.x, target.z) || 1;
        const pressure = target.lastTacticalAction === "rivalNestAssault" ? 2.15 : 1.82;
        steering.x += ((target.x - this.x) / d) * pressure;
        steering.z += ((target.z - this.z) / d) * pressure;
      } else {
        const homeDistance = distance2(this.x, this.z, this.homeX, this.homeZ) || 1;
        const returnPressure = homeDistance > 3.2 ? 1.45 : 0.42;
        steering.x += ((this.homeX - this.x) / homeDistance) * returnPressure;
        steering.z += ((this.homeZ - this.z) / homeDistance) * returnPressure;
      }
      if (nestDistance > RIVAL_NEST_DEFENSE_ALERT_RADIUS + 14) {
        steering.x += ((nest.x - this.x) / nestDistance) * 2.1;
        steering.z += ((nest.z - this.z) / nestDistance) * 2.1;
      }
    }

    this.state = "rival";
    this.addRivalSeparation(steering, sim);
    this.wander += (Math.random() - 0.5) * dt * (1.4 + this.aggression * 0.8);
    steering.x += Math.sin(this.wander) * 0.2;
    steering.z += Math.cos(this.wander) * 0.2;
    this.move(dt, sim, steering);
    this.resolveAntContacts(sim);
  }

  findRivalNestDefenseTarget(sim) {
    const nest = sim.rivalNest ?? { x: this.homeX, z: this.homeZ, radius: 9 };
    let best = null;
    let bestScore = Infinity;
    for (const ant of sim.deployedSoldiers()) {
      if (ant.sortieMode !== "expedition" || !sim.shouldRenderAnt(ant)) continue;
      if (ant.state === "return" || ant.state === "flee" || ant.state === "clash" || ant.clashRival || ant.stun > 0) continue;
      const nestDistance = distance2(ant.x, ant.z, nest.x, nest.z);
      if (nestDistance > RIVAL_NEST_DEFENSE_ALERT_RADIUS + 22) continue;
      const d = distance2(this.x, this.z, ant.x, ant.z);
      const assaultBonus = ant.lastTacticalAction === "rivalNestAssault" ? 18 : 0;
      const score = d - assaultBonus;
      if (score < bestScore) {
        best = ant;
        bestScore = score;
      }
    }
    return best;
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
      const pressureRadius = Math.max(MAP_RAID_FOOD_PRESSURE_RADIUS, (sim.mapVisionRadiusValue ?? MAP_BASE_VISION_RADIUS) + 34);
      if (this.isRaidRival && distanceFromNest > pressureRadius) continue;
      const foodSizeScore = Math.sqrt(Math.max(0, food.amount)) * 5.2;
      const remoteFoodPenalty = food.distanceTier === "far" ? 8 : food.distanceTier === "mid" ? 2.5 : 0;
      const score = foodSizeScore - distanceFromSelf * 0.04 - distanceFromNest * 0.016 - remoteFoodPenalty;
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
      const farExposure = clamp((nestDistance - FOOD_NEAR_DISTANCE) / Math.max(1, FOOD_FAR_DISTANCE - FOOD_NEAR_DISTANCE), 0, 1);
      const exposedBonus = ant.role === "worker" && nestDistance > sim.nest.radius + 18 ? (this.isRaidRival ? 12 + farExposure * 4 : 4 + farExposure * 2) : 0;
      const builderBonus = ant.variant === "builder" ? (this.isRaidRival ? 9 : 5) : 0;
      const supportPenalty = ant.variant === "medic" ? (this.isRaidRival ? -10 : -7) : 0;
      const guardPenalty = ant.variant === "shieldHead" ? (this.isRaidRival ? -12 : -8) : ant.variant === "heavySoldier" || ant.role === "guard" ? (this.isRaidRival ? -8 : -5) : 0;
      const shieldCoverPenalty = ant.variant === "shieldHead" ? 0 : sim.shieldCoverStrengthAt(ant.x, ant.z) * (this.isRaidRival ? 18 : 12);
      const score = baseScore - d + carryingBonus + workerBonus + returnBonus + foodBonus + exposedBonus + builderBonus + supportPenalty + guardPenalty - shieldCoverPenalty;
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

  findCrowdedClashApproach(sim, approachRadius = RIVAL_COMBAT_PEEL_APPROACH_RADIUS) {
    this.peelTargetRivalId = null;
    if (this.defeated || this.leftRaid || this.retreat > 0 || this.clash) return null;
    let best = null;
    let bestScore = Infinity;
    for (const rival of sim.rivalAnts) {
      const clash = rival === this ? null : rival.clash;
      if (!clash || clash.ants.length <= 1) continue;
      const primaryAnt = clash.ants[0];
      if (!primaryAnt || !this.canEngageAnt(primaryAnt, sim)) continue;
      const d = distance2(this.x, this.z, clash.anchorX, clash.anchorZ);
      if (d > approachRadius) continue;
      const score = d - Math.min(5, clash.ants.length * 1.8);
      if (score < bestScore) {
        best = { rival, x: clash.anchorX, z: clash.anchorZ };
        bestScore = score;
      }
    }
    if (best) this.peelTargetRivalId = best.rival.id;
    return best;
  }

  addClashPeelApproach(steering, target) {
    const d = distance2(this.x, this.z, target.x, target.z) || 1;
    const pressure = 1.18 + this.aggression * 0.82;
    steering.x += ((target.x - this.x) / d) * pressure;
    steering.z += ((target.z - this.z) / d) * pressure;
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

  isUnsupportedLargeRaidSortieAnt(ant, sim = null) {
    if (!sim || !this.isRaidRival || !ant?.isSortieSoldier || ant.variant !== "soldier") return false;
    const raidSize = Math.floor(sim.ensureRaidState?.().activeCount ?? 0);
    return raidSize >= UNSUPPORTED_SORTIE_LARGE_RAID_MIN_SIZE && !sim.hasSortieSupportVariants?.();
  }

  unsupportedSortieDamagePressureScale(ants, sim = null) {
    if (!sim || !this.isRaidRival) return 1;
    if (!ants.length || !ants.every((ant) => this.isUnsupportedLargeRaidSortieAnt(ant, sim))) return 1;
    return UNSUPPORTED_SORTIE_DAMAGE_PRESSURE_SCALE;
  }

  isUnsupportedCaptain(ant, sim = null) {
    if (!sim || !ant?.isSortieSoldier || ant.variant !== "captain") return false;
    const squad = sim.squadForLeader?.(ant);
    return !squad || (squad.memberIds?.length ?? 0) <= 0;
  }

  rivalCombatPowerScale() {
    return this.isRivalWorker ? RIVAL_NEST_WORKER_COMBAT_POWER_SCALE : 1;
  }

  combatPowers(ant, sim = null) {
    const threatPressure = this.isRaidRival && sim ? clamp(sim.colony.enemyThreat / 22, 0, 0.58) : 0;
    const defenseBonus = sim ? Math.max(0, (sim.computeDerived().defensePower ?? 1) - 1) : 0;
    const variant = ant.variantConfig ?? getAntVariantConfig(ant.variant);
    const acidPenalty = 1 - Math.min(0.26, this.acidDebuff * 0.13);
    const scoutMarkPenalty = this.scoutMarkTimer > 0 ? 1 - Math.min(0.18, Math.max(0.35, this.scoutMarkStrength ?? 0) * 0.18) : 1;
    const rivalPower = (0.74 + this.aggression * 0.86 + this.stubbornness * 0.48 + this.scale * 0.28 + threatPressure) * this.rivalCombatPowerScale() * acidPenalty * scoutMarkPenalty * this.combatDamagePowerScale();
    const rolePower = ant.role === "guard" ? 1.0 : ant.role === "worker" ? 0.22 : ant.role === "scout" ? 0.24 : 0.1;
    const carriedPenalty = ant.carrying > 0 ? -0.18 : 0;
    const braceBonus = ant.braceIntent > 0 ? variant.brace * 0.34 + (sim?.braceBonusAt(ant.x, ant.z) ?? 0) : 0;
    const wallAttackBonus = sim?.wallAttackBonusAt?.(ant.x, ant.z) ?? 0;
    const nestDefense = defenseBonus * (ant.variant === "shieldHead" ? 0.78 : ant.role === "guard" || ant.variant === "heavySoldier" ? 0.62 : 0.26);
    const squadSupportBonus = this.squadSupportPowerBonus(ant, sim);
    const unsupportedSortieScale = this.isUnsupportedLargeRaidSortieAnt(ant, sim) ? UNSUPPORTED_SORTIE_POWER_SCALE : 1;
    const unsupportedCaptainScale = this.isUnsupportedCaptain(ant, sim) ? CAPTAIN_UNSUPPORTED_POWER_SCALE : 1;
    const baseAntPower =
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
      wallAttackBonus +
      squadSupportBonus +
      carriedPenalty;
    const antPower = baseAntPower * unsupportedSortieScale * unsupportedCaptainScale;
    return { rivalPower, antPower };
  }

  squadSupportPowerBonus(ant, sim = null) {
    if (!sim || !ant.isSortieSoldier || ant.squadId == null) return 0;
    const squad = sim.squadForAnt?.(ant);
    if (!squad || (squad.memberIds?.length ?? 0) < 1) return 0;
    const cohesion = clamp(Math.max(ant.squadCohesion ?? 0, squad.cohesion ?? 0), 0, 1);
    const variantCounts = squad.memberVariantCounts ?? {};
    const supportVariety = Object.entries(variantCounts).filter(([variant, count]) =>
      variant !== "soldier" && variant !== "builder" && (count ?? 0) > 0
    ).length;
    const roleBonus =
      ant.variant === "captain" ? 0.16 :
      ant.variant === "heavySoldier" ? 0.14 :
      ant.variant === "soldier" ? 0.12 :
      0.08;
    return clamp(roleBonus + cohesion * 0.18 + Math.min(0.14, supportVariety * 0.035), 0, 0.42);
  }

  squadCoordinationPressure(ants, sim = null) {
    if (!sim || !ants.length) return 0;
    const support = ants.reduce((sum, ant) => sum + this.squadSupportPowerBonus(ant, sim), 0);
    return clamp(support / Math.max(0.42, ants.length * 0.34), 0, 1);
  }

  combatDamagePowerScale() {
    return 1 - Math.min(RIVAL_COMBAT_DAMAGE_POWER_PENALTY, this.combatDamage * RIVAL_COMBAT_DAMAGE_POWER_PENALTY);
  }

  applyCombatDamage(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return this.combatDamage;
    this.combatDamage = clamp(this.combatDamage + amount, 0, RIVAL_COMBAT_DAMAGE_DEFEAT_THRESHOLD);
    this.combatDamageFlash = 1;
    this.disrupt = Math.max(this.disrupt, 0.52 + this.combatDamage * 0.42);
    return this.combatDamage;
  }

  combatDamageWeight(ant, sim = null) {
    if (ant.isSortieSoldier) {
      if (ant.variant === "heavySoldier") return 1.18;
      if (ant.variant === "captain") return this.isUnsupportedCaptain(ant, sim) ? CAPTAIN_UNSUPPORTED_DAMAGE_WEIGHT_SCALE : 1;
      if (ant.variant === "soldier") return 1;
      if (ant.variant === "acidShooter") return 0.64;
      return 0.42;
    }
    if (ant.variant === "heavySoldier") return 0.9;
    if (ant.variant === "soldier" || ant.variant === "captain" || ant.role === "guard") return 0.74;
    if (ant.variant === "builder") return 0.1;
    if (ant.variant === "worker") return 0.08;
    return 0.03;
  }

  combatDamagePressure(ants, sim = null) {
    return clamp(ants.reduce((sum, ant) => sum + this.combatDamageWeight(ant, sim), 0), 0, 1.35);
  }

  combatSupportPressure(sim, grapplers = []) {
    if (!sim) return 0;
    const grapplerIds = new Set(grapplers.map((ant) => ant.id));
    let pressure = 0;
    for (const ant of sim.ants) {
      if (!ant.isSortieSoldier || grapplerIds.has(ant.id)) continue;
      if (ant.state === "return" || ant.state === "flee" || ant.stun > 0) continue;
      const range =
        ant.variant === "acidShooter" ? ACID_SPRAY_RANGE + 4 :
        ant.variant === "scout" ? SCOUT_MARK_RANGE + 4 :
        ant.variant === "captain" ? CAPTAIN_COHESION_RADIUS + 5 :
        ant.variant === "medic" ? 15 :
        11;
      const d = distance2(ant.x, ant.z, this.x, this.z);
      if (d > range) continue;
      const proximity = clamp(1 - d / Math.max(1, range), 0, 1);
      const rolePressure =
        ant.variant === "acidShooter" ? 0.34 :
        ant.variant === "scout" ? 0.3 :
        ant.variant === "captain" ? 0.28 :
        ant.variant === "medic" ? 0.18 :
        ant.variant === "shieldHead" ? 0.16 :
        0.08;
      const cohesion = ant.squadLeaderId != null ? 0.72 + clamp(ant.squadCohesion ?? 0, 0, 1) * 0.28 : 1;
      pressure += rolePressure * proximity * cohesion;
    }
    return clamp(pressure, 0, 0.72);
  }

  canEngageAnt(ant, sim, eligibleDefenseTargets = null) {
    if (!this.isRivalNestDefender) return true;
    if (eligibleDefenseTargets) return eligibleDefenseTargets.has(ant);
    return sim.activeExpeditionAttackers().includes(ant);
  }

  nearbyCombatRivals(sim, ant, radius = RIVAL_COMBAT_PEEL_TRIGGER_RADIUS) {
    const clash = this.clash;
    const originX = clash?.anchorX ?? this.x;
    const originZ = clash?.anchorZ ?? this.z;
    return sim.rivalAnts.filter((other) => {
      if (other === this || other.defeated || other.leftRaid || other.retreat > 0 || other.fightCooldown > 0) return false;
      if (!other.canEngageAnt(ant, sim)) return false;
      const enteringCrowd = other.peelTargetRivalId === this.id;
      if (!enteringCrowd && !other.clash) return false;
      const otherX = other.clash?.anchorX ?? other.x;
      const otherZ = other.clash?.anchorZ ?? other.z;
      return distance2(originX, originZ, otherX, otherZ) <= radius;
    });
  }

  startClash(ant, anchorX, anchorZ, sim) {
    const duration = RIVAL_CLASH_DURATION + (this.isRaidRival ? 0.45 : 0);
    if (this.defeated || this.leftRaid || this.clash || this.retreat > 0 || !this.canEngageAnt(ant, sim) || !ant.startRivalClash(this, anchorX, anchorZ, duration)) return false;
    const dx = ant.x - this.x;
    const dz = ant.z - this.z;
    const length = Math.hypot(dx, dz);
    const lineX = length > 0.0001 ? dx / length : Math.sin(this.angle);
    const lineZ = length > 0.0001 ? dz / length : Math.cos(this.angle);
    const wallInfo = sim.findEarthWallAt(anchorX, anchorZ, 1.4) ?? sim.findEarthWallAt(ant.x, ant.z, 1.0);
    const wallSide = wallInfo ? (sim.earthWallLocal(wallInfo.earthwork, this.x, this.z).across < 0 ? -1 : 1) : 1;
    if (wallInfo) sim.positionAntOnEarthWallTop(ant, wallInfo.earthwork, wallInfo.local.along, 0);
    this.clash = {
      ants: [ant],
      elapsed: 0,
      duration: duration + (wallInfo ? 0.65 : 0),
      anchorX,
      anchorZ,
      phase: rand(0, Math.PI * 2),
      lineX,
      lineZ,
      wallId: wallInfo?.earthwork.id ?? null,
      wallSide,
      nextTrail: 0.24,
      nextRecruit: 0.16,
      nextEffect: 0.06,
    };
    this.state = "clash";
    this.peelTargetRivalId = null;
    this.disrupt = Math.max(this.disrupt, 0.55);
    this.recruitGrapplers(sim);
    sim.addCombatEffect(anchorX, anchorZ, 0.85, 1, Math.atan2(lineZ, lineX));
    return true;
  }

  maxGrapplers(sim) {
    const primaryAnt = this.clash?.ants?.[0];
    if (primaryAnt && this.nearbyCombatRivals(sim, primaryAnt).length > 0) return 1;
    const defense = sim.computeDerived().defensePower ?? 1;
    const guardBonus = defense >= 1.45 ? 1 : 0;
    const raidGroupBonus = this.isRaidRival ? 1 : 0;
    return Math.min(3, 2 + Math.max(guardBonus, raidGroupBonus));
  }

  trySplitNearbyClash(sim) {
    const clash = this.clash;
    if (!clash || clash.ants.length <= 1) return false;
    const primaryAnt = clash.ants[0];
    const nearbyRivals = this.nearbyCombatRivals(sim, primaryAnt);
    if (!nearbyRivals.length) return false;
    const entrants = nearbyRivals.filter((rival) => !rival.clash);

    const extras = clash.ants.slice(1);
    clash.ants = [primaryAnt];
    for (const ant of extras) {
      ant.clashRival = null;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      if (ant.state === "clash") ant.setState(ant.carrying > 0 ? "return" : "explore");
    }

    let paired = 0;
    for (const rival of entrants) {
      const ant = extras.shift();
      if (!ant) break;
      const offsetX = rival.x - clash.anchorX;
      const offsetZ = rival.z - clash.anchorZ;
      const offsetLength = Math.hypot(offsetX, offsetZ);
      const directionX = offsetLength > 0.001 ? offsetX / offsetLength : clash.lineX;
      const directionZ = offsetLength > 0.001 ? offsetZ / offsetLength : clash.lineZ;
      const splitDistance = clamp(offsetLength * 0.55, 3.4, RIVAL_COMBAT_PEEL_RELEASE_DISTANCE);
      const anchorX = clash.anchorX + directionX * splitDistance;
      const anchorZ = clash.anchorZ + directionZ * splitDistance;
      if (rival.startClash(ant, anchorX, anchorZ, sim)) {
        paired += 1;
      }
    }
    extras.forEach((ant, index) => {
      const angle = Math.atan2(ant.z - this.z, ant.x - this.x) + (index % 2 ? 0.7 : -0.7);
      ant.x = this.x + Math.cos(angle) * RIVAL_COMBAT_PEEL_RELEASE_DISTANCE;
      ant.z = this.z + Math.sin(angle) * RIVAL_COMBAT_PEEL_RELEASE_DISTANCE;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.keepInWorld(sim);
    });
    this.disrupt = Math.max(this.disrupt, 0.82);
    sim.addCombatEffect(clash.anchorX, clash.anchorZ, 1.04, Math.max(1, paired + 1), Math.atan2(clash.lineZ, clash.lineX));
    return true;
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
    const eligibleDefenseTargets = this.isRivalNestDefender ? new Set(sim.activeExpeditionAttackers()) : null;
    const candidates = sim.ants
      .filter((ant) =>
        this.canEngageAnt(ant, sim, eligibleDefenseTargets) &&
        !clash.ants.includes(ant) &&
        ant.variant !== "shieldHead" &&
        ant.variant !== "scout" &&
        ant.variant !== "medic" &&
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

    this.trySplitNearbyClash(sim);

    clash.elapsed += dt;
    const progress = clamp(clash.elapsed / clash.duration, 0, 1);
    if (clash.elapsed >= clash.nextRecruit) {
      this.recruitGrapplers(sim);
      clash.nextRecruit += 0.38;
    }

    const lineAngle = Math.atan2(clash.lineZ, clash.lineX);
    const wall = clash.wallId != null ? sim.earthworks.find((item) => item.id === clash.wallId && item.kind === "earthWall") : null;
    const wallMetrics = wall ? sim.earthWallMetrics(wall) : null;
    const wallAnchor = wall ? sim.earthWallLocal(wall, clash.anchorX, clash.anchorZ) : null;
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
      let antTargetX = clash.anchorX + biteX + Math.cos(orbit + Math.PI / 2) * scrape;
      let antTargetZ = clash.anchorZ + biteZ + Math.sin(orbit + Math.PI / 2) * scrape;
      if (wall && wallMetrics && wallAnchor) {
        const slotAlong = clamp(wallAnchor.along + (index - (count - 1) / 2) * 1.32, -wallMetrics.halfLength * 0.86, wallMetrics.halfLength * 0.86);
        const top = sim.earthWallWorldPoint(wall, slotAlong, 0);
        antTargetX = top.x;
        antTargetZ = top.z;
      }
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
    let rivalTargetX = clash.anchorX - averagePullX * (0.28 + count * 0.05) + Math.cos(lineAngle + Math.PI / 2) * brace;
    let rivalTargetZ = clash.anchorZ - averagePullZ * (0.28 + count * 0.05) + Math.sin(lineAngle + Math.PI / 2) * brace;
    if (wall && wallMetrics && wallAnchor) {
      const along = clamp(wallAnchor.along, -wallMetrics.halfLength * 0.86, wallMetrics.halfLength * 0.86);
      const foot = sim.earthWallWorldPoint(wall, along, (clash.wallSide || 1) * (wallMetrics.footHalfWidth + 0.62));
      rivalTargetX = foot.x + Math.cos(lineAngle + Math.PI / 2) * brace * 0.55;
      rivalTargetZ = foot.z + Math.sin(lineAngle + Math.PI / 2) * brace * 0.55;
    }
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
    const supportPressure = this.combatSupportPressure(sim, ants);
    const squadCoordination = this.squadCoordinationPressure(ants, sim);
    const unsupportedDamageScale = this.unsupportedSortieDamagePressureScale(ants, sim);
    const damagePressure = clamp(
      (this.combatDamagePressure(ants, sim) + supportPressure * 0.42 + squadCoordination * 0.12) * unsupportedDamageScale,
      0,
      1.55,
    );
    const combatReadiness = ants.some((ant) => ant.isSortieSoldier) ? 1 : clamp(0.42 + damagePressure * 0.5, 0.42, 0.95);
    const colonyPower = groupPower * groupBonus * combatReadiness * (1 + supportPressure * 0.18 + squadCoordination * 0.08);
    const threatPressure = this.isRaidRival ? clamp(sim.colony.enemyThreat / 14, 0, 0.95) : 0;
    const baseRivalPower = 1.35 + this.aggression * 1.04 + this.stubbornness * 0.64 + this.scale * 0.36 + threatPressure;
    const acidPenalty = 1 - Math.min(0.26, this.acidDebuff * 0.13);
    const scoutMarkPenalty = this.scoutMarkTimer > 0 ? 1 - Math.min(0.18, Math.max(0.35, this.scoutMarkStrength ?? 0) * 0.18) : 1;
    const supportPenalty = 1 - supportPressure * 0.12;
    const rivalPower = baseRivalPower * this.rivalCombatPowerScale() * this.combatDamagePowerScale() * acidPenalty * scoutMarkPenalty * supportPenalty;
    const dx = primaryAnt.x - this.x;
    const dz = primaryAnt.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;

    if (rivalPower >= colonyPower * 0.94) {
      const lossDamage = clamp(((colonyPower / Math.max(rivalPower, 0.001)) * RIVAL_COMBAT_DAMAGE_LOSS_SCALE + Math.max(0, ants.length - 1) * 0.03 + squadCoordination * 0.04) * damagePressure, 0.015, 0.32);
      this.applyCombatDamage(lossDamage);
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
      const raidSize = this.isRaidRival ? Math.floor(sim.ensureRaidState().activeCount ?? 0) : 0;
      const unsupportedSoloSortie = raidSize >= 8 && ants.length === 1 && victim.variant === "soldier" && victim.squadId == null;
      const sortieEscapeThreshold = unsupportedSoloSortie ? RIVAL_COMBAT_DAMAGE_UNSUPPORTED_SORTIE_ESCAPE_THRESHOLD : RIVAL_COMBAT_DAMAGE_SORTIE_ESCAPE_THRESHOLD;
      const sortieCanEscape = victim.isSortieSoldier && damagePressure >= 1 && this.combatDamage >= sortieEscapeThreshold;
      if (this.isRaidRival && sim.canLoseAnt() && !sortieCanEscape) {
        sim.killAnt(victim, this);
      } else {
        victim.startFleeHome(this.x, this.z, 4.8 + this.aggression * 1.5);
      }
      this.victoryFlash = 1;
      this.lastFightWinner = "rival";
      sim.registerRivalFight("rival", victim, this, { grapplers: ants.length, casualty: this.isRaidRival });
    } else {
      const winDamage = clamp(((colonyPower / Math.max(rivalPower, 0.001) - 0.84) * RIVAL_COMBAT_DAMAGE_WIN_SCALE + 0.1 + Math.max(0, ants.length - 1) * 0.08 + squadCoordination * 0.12) * damagePressure, 0.04, 0.72);
      const defenderDamageScale = this.isRivalNestDefender ? RIVAL_NEST_DEFENDER_DAMAGE_TAKEN_SCALE : 1;
      this.applyCombatDamage(winDamage * defenderDamageScale);
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
      const damageDefeatThreshold = RIVAL_COMBAT_DAMAGE_DEFEAT_THRESHOLD * (1 - squadCoordination * 0.22);
      if (
        (this.isRaidRival && (colonyPower > rivalPower * 1.24 || this.combatDamage >= damageDefeatThreshold)) ||
        (this.isRivalNestDefender && this.combatDamage >= damageDefeatThreshold) ||
        (this.isRivalWorker && (
          colonyPower > rivalPower * RIVAL_NEST_WORKER_OVERWHELM_POWER_RATIO ||
          this.combatDamage >= damageDefeatThreshold * RIVAL_NEST_WORKER_DAMAGE_DEFEAT_THRESHOLD_SCALE
        ))
      ) {
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

  applyAcidDebuff(strength = 1) {
    this.acidDebuff = clamp(Math.max(this.acidDebuff, strength), 0, ACID_DEBUFF_MAX);
    this.acidFlash = 1;
    this.disrupt = Math.max(this.disrupt, 0.42 + strength * 0.24);
    this.fightCooldown = Math.max(this.fightCooldown, ACID_SPRAY_COOLDOWN_SECONDS + 0.3);
  }

  move(dt, sim, steering) {
    const length = Math.hypot(steering.x, steering.z);
    if (length > 0.001) {
      const targetAngle = Math.atan2(steering.x, steering.z);
      this.angle += clamp(normAngle(targetAngle - this.angle), -3.8 * dt, 3.8 * dt);
    } else {
      this.angle += (Math.random() - 0.5) * dt * 0.4;
    }
    const acidSlow = 1 - Math.min(0.46, this.acidDebuff * 0.2);
    const forageSpeed = this.isRivalWorker && this.workerTargetFoodId != null ? RIVAL_NEST_WORKER_FORAGE_SPEED_SCALE : 1;
    const speed = this.baseSpeed * forageSpeed * acidSlow * (1 - this.disrupt * 0.28) * (this.retreat > 0 ? 1.28 : 1) * sim.terrainSpeedAt(this.x, this.z) * sim.rivalSpeedAt(this.x, this.z) * sim.timeScale;
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
    const eligibleDefenseTargets = this.isRivalNestDefender ? new Set(sim.activeExpeditionAttackers()) : null;
    let resolved = false;
    for (const ant of sim.ants) {
      if (!sim.shouldRenderAnt(ant)) continue;
      if (!this.canEngageAnt(ant, sim, eligibleDefenseTargets)) continue;
      if (ant.state === "clash" || ant.state === "flee" || ant.fleeTimer > 0 || ant.stun > 0) continue;
      const contact = RIVAL_CONTACT_RADIUS + this.scale * 0.52;
      const dx = ant.x - this.x;
      const dz = ant.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d >= contact) continue;

      const nx = d > 0.0001 ? dx / d : Math.sin(this.angle);
      const nz = d > 0.0001 ? dz / d : Math.cos(this.angle);
      const overlap = contact - d;

      if (ant.variant === "shieldHead") {
        sim.resolveShieldHeadContact(ant, this, overlap, nx, nz);
        resolved = true;
        continue;
      }

      if (ant.variant === "scout" || ant.variant === "medic") {
        const shove = Math.min(0.62, overlap * 0.34 + 0.16);
        ant.x += nx * shove;
        ant.z += nz * shove;
        this.x -= nx * shove * 0.18;
        this.z -= nz * shove * 0.18;
        if (ant.variant === "scout") ant.scoutSignal = Math.max(ant.scoutSignal, 0.45);
        if (ant.variant === "medic") ant.medicSignal = Math.max(ant.medicSignal, 0.55);
        ant.lastTacticalAction = ant.variant === "medic" ? "medicEvade" : "scoutEvade";
        ant.startFleeHome(this.x, this.z, 1.2 + this.aggression * 0.5);
        this.fightCooldown = Math.max(this.fightCooldown, 0.42);
        ant.keepInWorld(sim);
        this.keepInWorld(sim);
        resolved = true;
        continue;
      }

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
    sim.resolveWaterCollision?.(this, 1.1 + this.scale * 0.28);
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
    const jitter = this.disrupt > 0 || this.victoryFlash > 0 || this.acidFlash > 0 || this.combatDamageFlash > 0 || this.scoutMarkTimer > 0 || this.clash ? Math.sin(sim.renderTime * 0.018 + this.id) * 0.045 : 0;
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      z: this.prevZ + (this.z - this.prevZ) * alpha,
      angle: this.prevAngle + normAngle(this.angle - this.prevAngle) * alpha,
      y: 0.24 + Math.sin(sim.renderTime * 0.004 + this.id) * 0.01,
      scale: this.scale + jitter + this.victoryFlash * 0.08,
      state: this.state,
      variant: this.variant,
      variantConfig: this.variantConfig,
      carrying: this.isRivalWorker ? this.carrying : 0,
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
const SCOUT_SEGMENTS = [
  { kind: "scoutAntenna", side: -1, phase: 0.2, radius: 0.022, from: [-0.13, 0.02, 1.44], to: [-0.34, 0.28, 1.9] },
  { kind: "scoutAntenna", side: -1, phase: 1.3, radius: 0.017, from: [-0.34, 0.28, 1.9], to: [-0.62, 0.48, 2.34] },
  { kind: "scoutAntenna", side: 1, phase: 2.0, radius: 0.022, from: [0.13, 0.02, 1.44], to: [0.34, 0.28, 1.9] },
  { kind: "scoutAntenna", side: 1, phase: 3.1, radius: 0.017, from: [0.34, 0.28, 1.9], to: [0.62, 0.48, 2.34] },
];
const CAPTAIN_SEGMENTS = [
  { kind: "captainCrest", side: 0, phase: 0.4, radius: 0.028, from: [0, 0.14, 1.2], to: [0, 0.72, 1.32] },
  { kind: "captainCrest", side: -1, phase: 1.1, radius: 0.02, from: [-0.06, 0.4, 1.3], to: [-0.34, 0.62, 1.44] },
  { kind: "captainCrest", side: 1, phase: 2.2, radius: 0.02, from: [0.06, 0.4, 1.3], to: [0.34, 0.62, 1.44] },
];
const ANT_VARIANT_APPENDAGE_CAP = Math.max(HEAVY_SOLDIER_SEGMENTS.length, SCOUT_SEGMENTS.length, CAPTAIN_SEGMENTS.length);
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
  shieldHead: {
    text: "盾頭",
    asset: "assets/generated/ant-role-heavy-soldier-20260627.png",
    accent: "#d1b56a",
    band: "#6c5c2f",
    bg: "rgba(35, 31, 20, 0.86)",
    iconBg: "rgba(153, 130, 62, 0.38)",
  },
  builder: {
    text: "土木",
    asset: "assets/generated/ant-role-builder-20260627.png",
    accent: "#71804c",
    band: "#4d5a36",
    bg: "rgba(28, 33, 24, 0.84)",
    iconBg: "rgba(99, 112, 67, 0.36)",
  },
  acidShooter: {
    text: "酸射",
    asset: "assets/generated/ant-role-soldier-20260627.png",
    accent: "#93b84f",
    band: "#536b2f",
    bg: "rgba(25, 33, 21, 0.86)",
    iconBg: "rgba(119, 151, 62, 0.34)",
  },
  scout: {
    text: "斥候",
    asset: "assets/generated/ant-role-soldier-20260627.png",
    accent: "#69d7c5",
    band: "#2f665e",
    bg: "rgba(20, 34, 33, 0.86)",
    iconBg: "rgba(81, 183, 166, 0.34)",
  },
  medic: {
    text: "救護",
    asset: "assets/generated/ant-role-builder-20260627.png",
    accent: "#aee9c9",
    band: "#4f8064",
    bg: "rgba(22, 34, 28, 0.86)",
    iconBg: "rgba(111, 197, 151, 0.34)",
  },
  captain: {
    text: "小隊長",
    asset: "assets/generated/ant-role-heavy-soldier-20260627.png",
    accent: "#f0c65a",
    band: "#72561f",
    bg: "rgba(39, 31, 18, 0.86)",
    iconBg: "rgba(171, 128, 39, 0.36)",
  },
};

const BARRACKS_VARIANT_UI = {
  worker: {
    asset: UI_ICON_ASSETS.antPopulation,
    tag: "バランス",
  },
  builder: {
    asset: generatedAssetUrl("ant-role-builder-20260627.png"),
    tag: "工事効率↑",
  },
  soldier: {
    asset: generatedAssetUrl("ant-role-soldier-20260627.png"),
    tag: "防衛力↑",
  },
  heavySoldier: {
    asset: generatedAssetUrl("ant-role-heavy-soldier-20260627.png"),
    tag: "前線維持",
  },
  shieldHead: {
    asset: generatedAssetUrl("ant-role-heavy-soldier-20260627.png"),
    tag: "押し返し",
  },
  acidShooter: {
    asset: generatedAssetUrl("ant-role-soldier-20260627.png"),
    tag: "足止め",
  },
  scout: {
    asset: UI_ICON_ASSETS.scoutFlag,
    tag: "標識",
  },
  medic: {
    asset: UI_ICON_ASSETS.queenCare,
    tag: "退避支援",
  },
  captain: {
    asset: generatedAssetUrl("ant-role-heavy-soldier-20260627.png"),
    tag: "集中指揮",
  },
};
const BARRACKS_ALWAYS_VISIBLE_VARIANTS = BARRACKS_TRAINING_VARIANTS;

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

    this.shieldPlateGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.shieldPlateMesh = new THREE.InstancedMesh(this.shieldPlateGeometry, sim.materials.antAppendage, capacity);
    this.shieldPlateMesh.count = 0;
    this.shieldPlateMesh.castShadow = sim.quality.shadowQuality !== "off";
    this.shieldPlateMesh.frustumCulled = false;
    sim.scene.add(this.shieldPlateMesh);

    this.medicPouchGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.medicPouchMesh = new THREE.InstancedMesh(this.medicPouchGeometry, sim.materials.medicPouch, capacity * 2);
    this.medicPouchMesh.count = 0;
    this.medicPouchMesh.castShadow = sim.quality.shadowQuality !== "off";
    this.medicPouchMesh.frustumCulled = false;
    sim.scene.add(this.medicPouchMesh);

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
    for (let i = 0; i < limit; i += 1) this.shieldPlateMesh.setMatrixAt(i, this.hiddenMatrix);
    for (let i = 0; i < limit * 2; i += 1) this.medicPouchMesh.setMatrixAt(i, this.hiddenMatrix);
    for (let i = 0; i < limit; i += 1) this.foodMesh.setMatrixAt(i, this.hiddenMatrix);
    for (let i = 0; i < limit; i += 1) this.soilMesh.setMatrixAt(i, this.hiddenMatrix);
    this.appendageMesh.count = limit * this.appendageSlotCount;
    this.shieldPlateMesh.count = limit;
    this.medicPouchMesh.count = limit * 2;
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
    this.shieldPlateMesh.setMatrixAt(index, this.hiddenMatrix);
    this.medicPouchMesh.setMatrixAt(index * 2, this.hiddenMatrix);
    this.medicPouchMesh.setMatrixAt(index * 2 + 1, this.hiddenMatrix);
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
      const pose = renderState.variant === "acidShooter" ? clamp(renderState.acidPose ?? 0, 0, 1) : 0;
      const localX = part.x;
      const localY = part.name === "gaster" ? part.y + pose * 0.58 : part.y;
      const localZ = part.name === "gaster" ? part.z - pose * 0.16 : part.z;
      this.composeLocalMatrix(renderState, localX, localY, localZ, part.sx * scale.x, part.sy * scale.y, part.sz * scale.z);
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
    if (renderState.variant === "scout") {
      for (const segment of SCOUT_SEGMENTS) {
        this.composeSegmentMatrix(renderState, segment);
        this.appendageMesh.setMatrixAt(segmentIndex, this.dummy.matrix);
        segmentIndex += 1;
      }
    }
    if (renderState.variant === "captain") {
      for (const segment of CAPTAIN_SEGMENTS) {
        this.composeSegmentMatrix(renderState, segment);
        this.appendageMesh.setMatrixAt(segmentIndex, this.dummy.matrix);
        segmentIndex += 1;
      }
    }
    if (renderState.variant === "shieldHead") {
      const pose = clamp(renderState.shieldPose ?? 0, 0, 1);
      this.composeLocalMatrix(renderState, 0, -0.005 + pose * 0.018, 1.56, 1.32, 0.045, 0.56);
      this.shieldPlateMesh.setMatrixAt(index, this.dummy.matrix);
    }
    if (renderState.variant === "medic") {
      const pose = clamp(renderState.medicPose ?? 0, 0, 1);
      const start = index * 2;
      this.composeLocalMatrix(renderState, -0.42, 0.12 + pose * 0.025, -0.08, 0.18, 0.14, 0.36);
      this.medicPouchMesh.setMatrixAt(start, this.dummy.matrix);
      this.composeLocalMatrix(renderState, 0.42, 0.12 + pose * 0.025, -0.08, 0.18, 0.14, 0.36);
      this.medicPouchMesh.setMatrixAt(start + 1, this.dummy.matrix);
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
      if (renderState.variant === "shieldHead") {
        scale.x *= 1.62;
        scale.y *= 0.32;
        scale.z *= 0.88;
      } else if (renderState.variant === "captain") {
        scale.x *= 1.12;
        scale.y *= 1.08;
        scale.z *= 1.08;
      } else if (renderState.variant === "medic") {
        scale.x *= 0.92;
        scale.y *= 0.96;
        scale.z *= 0.95;
      }
    } else if (partName === "gaster") {
      scale.x *= config.abdomenScale;
      scale.y *= config.abdomenScale * (1 + (renderState.acidPose ?? 0) * 0.16);
      scale.z *= config.abdomenScale * (1 - (renderState.acidPose ?? 0) * 0.04);
    } else if (renderState.variant === "shieldHead" && partName === "mesosoma") {
      scale.x *= 1.1;
      scale.y *= 1.02;
      scale.z *= 1.04;
    } else if (renderState.variant === "heavySoldier" && partName === "mesosoma") {
      scale.x *= 1.16;
      scale.y *= 1.18;
      scale.z *= 1.08;
    } else if (renderState.variant === "builder" && partName === "mesosoma") {
      scale.x *= 1.08;
      scale.y *= 1.06;
      scale.z *= 1.02;
    } else if (renderState.variant === "scout" && partName === "mesosoma") {
      scale.x *= 0.92;
      scale.y *= 0.9;
      scale.z *= 1.08;
    } else if (renderState.variant === "captain" && partName === "mesosoma") {
      scale.x *= 1.08;
      scale.y *= 1.1;
      scale.z *= 1.04;
    } else if (renderState.variant === "medic" && partName === "mesosoma") {
      scale.x *= 0.96;
      scale.y *= 0.96;
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
    } else if (segment?.kind === "scoutAntenna") {
      const pose = clamp(renderState.scoutPose ?? 0, 0, 1);
      const wave = Math.sin(phase * 0.86 + segment.phase);
      px += segment.side * wave * (0.025 + endpoint * 0.05);
      py += pose * (0.06 + endpoint * 0.18);
      pz += Math.cos(phase * 0.6 + segment.phase) * endpoint * 0.035;
    } else if (segment?.kind === "captainCrest") {
      const pose = clamp(renderState.commandPose ?? 0, 0, 1);
      const pulse = Math.sin(phase * 1.2 + segment.phase) * pose;
      px += (segment.side || 0) * pulse * endpoint * 0.05;
      py += pose * endpoint * 0.12;
      pz += Math.cos(phase * 0.7 + segment.phase) * endpoint * 0.018;
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
    this.shieldPlateMesh.count = limit;
    this.shieldPlateMesh.instanceMatrix.needsUpdate = true;
    this.medicPouchMesh.count = limit * 2;
    this.medicPouchMesh.instanceMatrix.needsUpdate = true;
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
    this.sim.scene.remove(this.shieldPlateMesh);
    this.sim.scene.remove(this.medicPouchMesh);
    this.sim.scene.remove(this.foodMesh);
    this.sim.scene.remove(this.soilMesh);
    this.appendageGeometry.dispose();
    this.shieldPlateGeometry.dispose();
    this.medicPouchGeometry.dispose();
  }
}

class SquadRingSystem {
  constructor(sim, capacity) {
    this.sim = sim;
    this.capacity = capacity;
    this.dummy = new THREE.Object3D();
    this.geometry = new THREE.RingGeometry(0.86, 1, 96);
    this.colorToIndex = new Map(SQUAD_COLORS.map((color, index) => [color, index]));
    this.materials = SQUAD_COLORS.map((color) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }));
    this.material = this.materials[0];
    this.meshes = this.materials.map((material, index) => {
      const mesh = new THREE.InstancedMesh(this.geometry, material, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 38 + index * 0.01;
      sim.scene.add(mesh);
      return mesh;
    });
    this.lastVisibleCount = 0;
    this.lastColors = [];
  }

  render(ants, sim, alpha) {
    const counts = new Array(this.meshes.length).fill(0);
    this.lastColors.length = 0;
    const pulse = 1 + Math.sin(sim.renderTime * 0.007) * 0.055;
    for (const ant of ants) {
      if (ant.isRival || !ant.squadId || !ant.squadColorHex) continue;
      const colorIndex = this.colorToIndex.get(ant.squadColorHex) ?? 0;
      const index = counts[colorIndex];
      if (index >= this.capacity) continue;
      const state = ant.renderState(sim, alpha);
      const isLeader = ant.variant === "captain" && ant.id === ant.squadLeaderId;
      const baseScale = isLeader ? 5.3 : 3.55;
      const cohesionBoost = clamp(ant.squadCohesion ?? 0, 0, 1) * 0.5;
      this.dummy.position.set(state.x, 0.22 + (isLeader ? 0.026 : 0), state.z);
      this.dummy.rotation.set(Math.PI / 2, 0, state.angle + sim.renderTime * 0.0005);
      this.dummy.scale.setScalar((baseScale + cohesionBoost) * pulse);
      this.dummy.updateMatrix();
      this.meshes[colorIndex].setMatrixAt(index, this.dummy.matrix);
      this.lastColors.push(ant.squadColorHex);
      counts[colorIndex] += 1;
    }
    let total = 0;
    for (const [index, mesh] of this.meshes.entries()) {
      mesh.count = counts[index];
      total += counts[index];
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.lastVisibleCount = total;
  }

  destroy() {
    for (const mesh of this.meshes) this.sim.scene.remove(mesh);
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
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
    this.scene.fog = new THREE.Fog(0x181a18, 300, 760);
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 860);
    this.renderer = this.createRenderer();
    if (!this.renderer) return;
    ui.world.appendChild(this.renderer.domElement);

    this.frameAccumulator = 0;
    this.lastFrameTime = 0;
    this.renderTime = 0;
    this.simTime = 0;
    this.isRunning = false;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.groundHit = new THREE.Vector3();
    this.pointerMap = new Map();
    this.pointerStart = null;
    this.activePointerId = null;
    this.multiPointerGesture = false;
    this.touchButtonTap = null;
    this.suppressedTouchClick = null;
    this.branchDraft = null;
    this.branchPreview = null;
    this.pinchStart = null;
    this.pinchLastCenter = null;
    this.cameraPanKeys = new Set();
    this.dragMoved = false;
    this.pendingConstructionKind = null;
    this.wallPlacementDraft = null;
    this.wallPlacementPreview = null;
    this.wallPlacementGuide = null;

    this.tool = "inspect";
    this.paused = false;
    this.timeScale = 1;
    this.raidSoonMode = IS_RAID_SOON;
    document.body.classList.toggle("is-raid-soon", this.raidSoonMode);
    this.worldRadius = WORLD_RADIUS;
    this.groundTextureSource = "generated-soil-texture";
    this.nest = { x: -164, z: -154, radius: 8 };
    this.rivalNest = {
      x: 188,
      z: 170,
      radius: 9,
      discovered: false,
      defeated: false,
      integrity: 1,
      underAttackTimer: 0,
      attackPulseTimer: 0,
      defenseWaveArmed: true,
      defenseClearTimer: 0,
      group: null,
    };
    this.mapVisionRadiusValue = MAP_BASE_VISION_RADIUS;
    this.mapActivityRadiusValue = MAP_BASE_VISION_RADIUS;
    this.nestVisionRadiusValue = MAP_BASE_VISION_RADIUS;
    this.manualMapVisionRadius = this.readManualMapVisionRadius();
    this.fogOfWar = null;
    this.fogOfWarMaterial = null;
    this.visionEdge = null;
    this.exploredMaskData = null;
    this.exploredMaskTexture = null;
    this.exploredPatchClock = 0;
    this.mapIntelLogState = { rivalNestDiscovered: false, rivalNestDefeated: false };
    this.colony = readColonyState();
    this.derived = {};
    this.saveTimer = 0;
    this.activeTab = "growth";
    {
      const savedPanelCompact = readStorage("ant3d.panelCompact");
      this.panelCompact = savedPanelCompact == null ? window.innerWidth < 680 : savedPanelCompact === "1";
    }
    {
      const savedPanelHidden = readStorage("ant3d.panelHidden");
      this.panelHidden = savedPanelHidden === "1";
    }
    this.panelDrag = null;
    this.selectedAnt = null;
    this.collectedFood = 0;
    this.recentForagingSamples = [];
    this.recentForagingTotal = 0;
    this.foragingTerritoryProgress = 0;
    this.nextFoodId = 1;
    this.nextAntId = 1;
    this.nextRivalId = 1;
    this.reconSweepIndex = 0;
    this.ants = [];
    this.water = [];
    this.stones = [];
    this.food = [];
    this.foodSpawnSites = [];
    this.branches = [];
    this.trails = [];
    this.buildTasks = [];
    this.earthworks = [];
    this.combatEffects = [];
    this.terrain = [];
    this.terrainBumps = [];
    this.naturalDetails = [];
    this.naturalDetailStats = { grassClumps: 0, microPebbles: 0, wetEdgeDecals: 0, crackDecals: 0, mossDecals: 0, gravelDecals: 0 };
    this.nestEntrances = [];
    this.nestSpoils = [];
    this.predators = [];
    this.rivalAnts = [];
    this.rivalCorpses = [];
    this.colonyCorpses = [];
    this.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };
    this.raidNotice = { message: "", kind: "warning", timer: 0 };
    this.raidNestBreachEvents = 0;
    this.constructionMessage = "待機";
    this.renderAntBuffer = [];
    this.soldierSortieCooldown = 0;
    this.sortieRetireQueue = [];
    this.squads = [];
    this.nextSquadId = 1;
    this.selectedSortieMode = "defense";
    this.manualSortiePlan = null;
    this.lastUiUpdate = 0;
    this.resizeWidth = 0;
    this.resizeHeight = 0;

    this.cameraTarget = new THREE.Vector3(this.nest.x, 0, this.nest.z);
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
    this.createExplorationMask();

    this.assetService.preloadAssets();
    this.applyOfflineProgress(Date.now());
    this.createSharedAssets();
    this.voxelBuildingRenderer = new VoxelBuildingRenderer({
      geometries: this.geometries,
      materials: this.materials,
      shadowsEnabled: this.quality.shadowQuality !== "off",
    });
    this.antRenderer = new AntRenderSystem(this, DISPLAY_ANT_CAP + RAID_RIVAL_CAP + RIVAL_NEST_WORKER_MAX_COUNT + RIVAL_NEST_DEFENDER_MAX_COUNT);
    this.squadRingSystem = new SquadRingSystem(this, DISPLAY_ANT_CAP);
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
      trailCircle: new THREE.CircleGeometry(1, 18),
      wallPlacementLine: new THREE.BoxGeometry(1, 1, 1),
      wallPlacementMarker: new THREE.SphereGeometry(1, 14, 8),
      impactRing: new THREE.TorusGeometry(1, 0.035, 8, 72),
      combatDust: new THREE.SphereGeometry(1, 8, 6),
      combatSlash: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
      nestRim: new THREE.TorusGeometry(1, 0.11, 8, 36),
      soilPebble: new THREE.DodecahedronGeometry(1, 0),
      earthworkVoxel: new THREE.BoxGeometry(1, 1, 1),
      terrainBump: new THREE.SphereGeometry(1, 12, 8),
      stoneRock: new THREE.DodecahedronGeometry(1, 0),
      detailPlane: new THREE.PlaneGeometry(1, 1),
    };

    this.materials = {
      ground: new THREE.MeshBasicMaterial({
        map: this.assetService.get("groundTexture") ?? makeGroundTexture(),
        color: 0xffffff,
        toneMapped: false,
      }),
      nest: new THREE.MeshStandardMaterial({ color: 0x6d4e2a, roughness: 0.95 }),
      nestLoose: new THREE.MeshStandardMaterial({ color: 0x8a6335, roughness: 0.96 }),
      nestRim: new THREE.MeshStandardMaterial({ color: 0x5a3a1f, roughness: 0.98 }),
      nestDark: new THREE.MeshBasicMaterial({ color: 0x1d140e, side: THREE.DoubleSide }),
      rivalNestSoil: new THREE.MeshStandardMaterial({ color: 0x6b3526, roughness: 0.96 }),
      rivalNestRim: new THREE.MeshStandardMaterial({ color: 0x8a4a2f, roughness: 0.9 }),
      rivalNestDark: new THREE.MeshBasicMaterial({ color: 0x21100c, side: THREE.DoubleSide }),
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
      stone: new THREE.MeshStandardMaterial({ color: 0x9ea49d, map: this.assetService.get("stoneTexture"), roughness: 0.88 }),
      stoneSurface: new THREE.MeshBasicMaterial({
        color: 0xc7cbc3,
        map: this.assetService.get("stoneTexture"),
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        toneMapped: false,
      }),
      branch: new THREE.MeshStandardMaterial({ color: 0x8a6232, roughness: 0.9 }),
      terrainMoss: new THREE.MeshBasicMaterial({ color: 0x6c8f56, map: this.assetService.get("terrainMossTexture"), transparent: true, opacity: 0.18, depthWrite: false }),
      terrainLeaf: new THREE.MeshBasicMaterial({ color: 0x8a6b3b, map: this.assetService.get("terrainMossTexture"), transparent: true, opacity: 0.14, depthWrite: false }),
      terrainSand: new THREE.MeshBasicMaterial({ color: 0xf3ce84, map: this.assetService.get("terrainSandTexture"), transparent: true, opacity: 0.18, depthWrite: false }),
      terrainDamp: new THREE.MeshBasicMaterial({ color: 0x4f7662, map: this.assetService.get("mossWetlandTexture"), transparent: true, opacity: 0.2, depthWrite: false }),
      terrainGravel: new THREE.MeshBasicMaterial({ color: 0xb0aaa0, map: this.assetService.get("microGravelTexture") ?? this.assetService.get("terrainGravelTexture"), transparent: true, opacity: 0.18, depthWrite: false }),
      terrainDryClay: new THREE.MeshBasicMaterial({ color: 0xc68e55, map: this.assetService.get("groundTexture"), transparent: true, opacity: 0.18, depthWrite: false }),
      terrainEnemySoil: new THREE.MeshBasicMaterial({ color: 0x9b5236, map: this.assetService.get("groundTexture"), transparent: true, opacity: 0.22, depthWrite: false }),
      terrainMossWetland: new THREE.MeshBasicMaterial({ color: 0x607447, map: this.assetService.get("mossWetlandTexture"), transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }),
      terrainMicroGravel: new THREE.MeshBasicMaterial({ color: 0xb7b0a1, map: this.assetService.get("microGravelTexture"), transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false }),
      terrainCrackedMud: new THREE.MeshBasicMaterial({ color: 0xd1a866, map: this.assetService.get("crackedMudTexture"), transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
      terrainWetEdge: new THREE.MeshBasicMaterial({ color: 0x6f8f72, map: this.assetService.get("shorelineWetEdgeTexture"), transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false }),
      terrainRise: new THREE.MeshStandardMaterial({ color: 0x9a7440, roughness: 0.96 }),
      grassTuft: new THREE.MeshBasicMaterial({
        color: 0xd8e8a8,
        map: this.assetService.get("grassTuftTexture"),
        transparent: true,
        alphaTest: 0.06,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      microPebble: new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.96 }),
      palePebble: new THREE.MeshStandardMaterial({ color: 0xc2b58f, roughness: 0.9 }),
      wetPebble: new THREE.MeshStandardMaterial({ color: 0x4a5651, roughness: 0.78 }),
      predatorBody: new THREE.MeshStandardMaterial({ color: 0x2b211c, roughness: 0.78 }),
      predatorAccent: new THREE.MeshBasicMaterial({ color: 0xb44a36, transparent: true, opacity: 0.58 }),
      water: new THREE.MeshBasicMaterial({
        color: 0x4aa6b7,
        map: this.assetService.get("waterTexture"),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        toneMapped: false,
      }),
      waterRing: new THREE.MeshBasicMaterial({ color: 0x9ce7ff, transparent: true, opacity: 0.48 }),
      impact: new THREE.MeshBasicMaterial({ color: 0xe47f63, transparent: true, opacity: 0.42 }),
      combatDust: new THREE.MeshBasicMaterial({ color: 0xb88a55, transparent: true, opacity: 0.32, depthWrite: false }),
      combatFlash: new THREE.MeshBasicMaterial({ color: 0xffa15c, transparent: true, opacity: 0.5, depthWrite: false }),
      combatRing: new THREE.MeshBasicMaterial({ color: 0xd96f58, transparent: true, opacity: 0.34, depthWrite: false }),
      acidSpray: new THREE.MeshBasicMaterial({ color: 0xff5a47, transparent: true, opacity: 0.72, depthWrite: false }),
      acidSplash: new THREE.MeshBasicMaterial({ color: 0xff2f5d, transparent: true, opacity: 0.5, depthWrite: false }),
      scoutMark: new THREE.MeshBasicMaterial({ color: 0x69d7c5, transparent: true, opacity: 0.48, depthWrite: false }),
      medicAid: new THREE.MeshBasicMaterial({ color: 0xaee9c9, transparent: true, opacity: 0.56, depthWrite: false }),
      medicPouch: new THREE.MeshStandardMaterial({ color: 0xb9f2d1, roughness: 0.72, emissive: 0x12351f, emissiveIntensity: 0.18 }),
      captainCommand: new THREE.MeshBasicMaterial({ color: 0xf0c65a, transparent: true, opacity: 0.68, depthWrite: false }),
      trailFood: new THREE.MeshBasicMaterial({ color: 0xd9a63f, transparent: true, opacity: 0.2, depthWrite: false }),
      trailAlarm: new THREE.MeshBasicMaterial({ color: 0xd96f58, transparent: true, opacity: 0.24, depthWrite: false }),
      corpseMark: new THREE.MeshBasicMaterial({ color: 0x5b271f, transparent: true, opacity: 0.34, depthWrite: false }),
      trailRescue: new THREE.MeshBasicMaterial({ color: 0x51b7a6, transparent: true, opacity: 0.22, depthWrite: false }),
      trailWater: new THREE.MeshBasicMaterial({ color: 0x55aee0, transparent: true, opacity: 0.18, depthWrite: false }),
      earthworkTrail: new THREE.MeshBasicMaterial({ color: 0x6e7948, transparent: true, opacity: 0.3, depthWrite: false }),
      earthworkBarricade: new THREE.MeshBasicMaterial({ color: 0x5d4933, transparent: true, opacity: 0.3, depthWrite: false }),
      earthworkWall: new THREE.MeshBasicMaterial({ color: 0x7a543a, transparent: true, opacity: 0.34, depthWrite: false }),
      earthworkSentry: new THREE.MeshBasicMaterial({ color: 0x596a5c, transparent: true, opacity: 0.32, depthWrite: false }),
      earthworkVoxel: new THREE.MeshStandardMaterial({ color: 0x7c6440, roughness: 0.94 }),
      earthworkVoxelTrail: new THREE.MeshStandardMaterial({ color: 0xa89b63, roughness: 0.92 }),
      earthworkVoxelBarricade: new THREE.MeshStandardMaterial({ color: 0x765336, roughness: 0.92 }),
      earthworkVoxelWall: new THREE.MeshStandardMaterial({ color: 0x946848, roughness: 0.94 }),
      earthworkVoxelSentry: new THREE.MeshStandardMaterial({ color: 0x7b8068, roughness: 0.94 }),
      wallPlacementLine: new THREE.MeshBasicMaterial({ color: 0xf0c857, transparent: true, opacity: 0.9, depthWrite: false }),
      wallPlacementMarker: new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.92, depthWrite: false }),
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
      const shadowRange = this.worldRadius + 28;
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.camera.left = -shadowRange;
      sun.shadow.camera.right = shadowRange;
      sun.shadow.camera.top = shadowRange;
      sun.shadow.camera.bottom = -shadowRange;
      sun.shadow.camera.near = 20;
      sun.shadow.camera.far = 560;
      sun.shadow.bias = -0.00015;
    }
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(this.worldRadius + 12, 144), this.materials.ground);
    ground.name = "procedural-soil-ground";
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
    this.createRivalNest();
    this.createFogOfWar();
    this.updateMapVisibility();
  }

  seedTerrain() {
    const patches = [
      { kind: "dryClay", x: -178, z: -158, rx: 82, rz: 58, rotation: -0.28, speed: 0.96, material: this.materials.terrainDryClay },
      { kind: "dryClay", x: -232, z: -118, rx: 48, rz: 28, rotation: 0.38, speed: 0.97, material: this.materials.terrainDryClay },
      { kind: "damp", x: 118, z: -82, rx: 104, rz: 72, rotation: -0.22, speed: 0.72, material: this.materials.terrainDamp },
      { kind: "damp", x: 76, z: -38, rx: 58, rz: 38, rotation: 0.24, speed: 0.78, material: this.materials.terrainDamp },
      { kind: "damp", x: 164, z: -134, rx: 50, rz: 32, rotation: -0.64, speed: 0.77, material: this.materials.terrainDamp },
      { kind: "damp", x: -198, z: 128, rx: 42, rz: 34, rotation: 0.12, speed: 0.72, material: this.materials.terrainDamp },
      { kind: "damp", x: -172, z: 48, rx: 38, rz: 30, rotation: -0.2, speed: 0.72, material: this.materials.terrainDamp },
      { kind: "moss", x: -116, z: 120, rx: 96, rz: 58, rotation: 0.12, speed: 0.87, material: this.materials.terrainMoss },
      { kind: "moss", x: -42, z: -78, rx: 74, rz: 46, rotation: -0.36, speed: 0.88, material: this.materials.terrainMoss },
      { kind: "moss", x: 40, z: 22, rx: 92, rz: 54, rotation: 0.28, speed: 0.88, material: this.materials.terrainMoss },
      { kind: "moss", x: 138, z: 34, rx: 62, rz: 36, rotation: -0.54, speed: 0.89, material: this.materials.terrainMoss },
      { kind: "sand", x: -28, z: 134, rx: 58, rz: 34, rotation: 0.08, speed: 1.04, material: this.materials.terrainSand },
      { kind: "sand", x: 58, z: -160, rx: 64, rz: 34, rotation: -0.18, speed: 1.03, material: this.materials.terrainSand },
      { kind: "sand", x: -84, z: 184, rx: 70, rz: 32, rotation: -0.28, speed: 1.03, material: this.materials.terrainSand },
      { kind: "gravel", x: 28, z: 104, rx: 78, rz: 40, rotation: -0.04, speed: 0.9, material: this.materials.terrainGravel },
      { kind: "gravel", x: 136, z: 104, rx: 58, rz: 32, rotation: 0.5, speed: 0.91, material: this.materials.terrainGravel },
      { kind: "gravel", x: -84, z: 28, rx: 52, rz: 34, rotation: -0.18, speed: 0.92, material: this.materials.terrainGravel },
      { kind: "enemySoil", x: 188, z: 170, rx: 72, rz: 52, rotation: 0.18, speed: 0.9, material: this.materials.terrainEnemySoil },
      { kind: "leaf", x: 206, z: -28, rx: 70, rz: 42, rotation: -0.28, speed: 0.86, material: this.materials.terrainLeaf },
      { kind: "leaf", x: -216, z: 54, rx: 42, rz: 30, rotation: 0.4, speed: 0.89, material: this.materials.terrainLeaf },
    ];

    for (const patch of patches) this.createTerrainPatch(patch);
    this.seedTerrainBumps();
  }

  createTerrainPatch(patch) {
    const blob = createIrregularBlobGeometry(`terrain-${patch.kind}-${patch.x}-${patch.z}`, 72, {
      roughness: 0.23,
      minRadius: 0.72,
      maxRadius: 1.28,
      uvScale: 2.65,
    });
    const mesh = new THREE.Mesh(blob.geometry, patch.material);
    mesh.name = `natural-terrain-${patch.kind}`;
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
      boundaryProfile: blob.profile,
      speed: patch.speed,
      mesh,
    });
  }

  seedPermanentWater() {
    this.addWater(122, -78, 1, { permanent: true, radius: 52, rx: 82, rz: 62, rotation: -0.22, power: 0.86, ring: false });
    this.addWater(82, -36, 1, { permanent: true, radius: 20, rx: 28, rz: 20, rotation: 0.34, power: 0.48, ring: false });
    this.addWater(-200, 132, 1, { permanent: true, radius: 24, rx: 35, rz: 27, rotation: 0.16, power: 0.5, ring: false });
    this.addWater(-170, 48, 1, { permanent: true, radius: 22, rx: 34, rz: 27, rotation: -0.32, power: 0.46, ring: false });
  }

  seedTerrainBumps() {
    const bumps = [
      { x: -220, z: -122, rx: 4.6, rz: 1.8, h: 0.3, rotation: -0.3 },
      { x: -138, z: -188, rx: 5.2, rz: 2.0, h: 0.34, rotation: 0.2 },
      { x: -98, z: -68, rx: 6.0, rz: 2.4, h: 0.38, rotation: 0.54 },
      { x: -214, z: 108, rx: 4.6, rz: 1.8, h: 0.3, rotation: -0.7 },
      { x: -138, z: 146, rx: 4.2, rz: 1.8, h: 0.28, rotation: 0.58 },
      { x: -42, z: 102, rx: 5.2, rz: 2.1, h: 0.34, rotation: -0.1 },
      { x: 8, z: 138, rx: 6.6, rz: 2.4, h: 0.4, rotation: 0.28 },
      { x: 74, z: 104, rx: 4.6, rz: 2.0, h: 0.34, rotation: -0.54 },
      { x: 130, z: 74, rx: 4.0, rz: 1.8, h: 0.3, rotation: 0.72 },
      { x: 210, z: 126, rx: 5.8, rz: 2.3, h: 0.4, rotation: -0.18 },
      { x: 74, z: -142, rx: 5.0, rz: 2.0, h: 0.3, rotation: 0.66 },
      { x: 150, z: -158, rx: 5.8, rz: 2.2, h: 0.36, rotation: -0.44 },
      { x: 210, z: -48, rx: 4.6, rz: 1.8, h: 0.3, rotation: 0.36 },
      { x: -34, z: -156, rx: 4.8, rz: 1.8, h: 0.32, rotation: -0.62 },
      { x: 34, z: 24, rx: 5.2, rz: 2.0, h: 0.34, rotation: 0.42 },
      { x: 118, z: 12, rx: 4.6, rz: 2.0, h: 0.3, rotation: -0.24 },
      { x: 54, z: -26, rx: 4.4, rz: 1.7, h: 0.26, rotation: 0.48 },
      { x: 190, z: -114, rx: 5.0, rz: 2.0, h: 0.32, rotation: -0.38 },
      { x: 102, z: -38, rx: 4.8, rz: 1.9, h: 0.28, rotation: 0.82 },
      { x: -92, z: 180, rx: 5.4, rz: 2.2, h: 0.34, rotation: -0.42 },
      { x: 164, z: 176, rx: 5.2, rz: 2.2, h: 0.34, rotation: 0.18 },
      { x: 232, z: 166, rx: 4.6, rz: 1.9, h: 0.28, rotation: -0.58 },
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
      const baseDistance = Math.hypot(localX / patch.rx, localZ / patch.rz);
      const boundary = sampleIrregularProfile(patch.boundaryProfile, Math.atan2(localZ / patch.rz, localX / patch.rx));
      const normalized = baseDistance / boundary;
      if (normalized >= 1) continue;
      const influence = (1 - normalized * normalized) * 0.75;
      multiplier *= 1 + (patch.speed - 1) * influence;
    }
    return clamp(multiplier, 0.64, 1.12);
  }

  waterDistanceAt(x, z, clearance = 0) {
    let closest = Infinity;
    for (const patch of this.water ?? []) closest = Math.min(closest, naturalPatchDistance(patch, x, z, clearance));
    return closest;
  }

  resolveWaterCollision(entity, clearance = 1.1) {
    if (!entity || !this.water?.length) return false;
    let resolved = false;
    for (let pass = 0; pass < 3; pass += 1) {
      let passResolved = false;
      for (const patch of this.water) {
        if (naturalPatchDistance(patch, entity.x, entity.z, clearance) >= 1) continue;
        const boundary = naturalPatchBoundaryPoint(patch, entity.x, entity.z, clearance + 0.18);
        const headingX = Math.sin(entity.angle ?? 0);
        const headingZ = Math.cos(entity.angle ?? 0);
        const dot = headingX * boundary.nx + headingZ * boundary.nz;
        entity.x = boundary.x;
        entity.z = boundary.z;
        if (dot < 0) {
          const nextHeadingX = headingX - dot * 2 * boundary.nx;
          const nextHeadingZ = headingZ - dot * 2 * boundary.nz;
          if (Number.isFinite(nextHeadingX) && Number.isFinite(nextHeadingZ)) {
            entity.angle = Math.atan2(nextHeadingX, nextHeadingZ);
          }
        }
        passResolved = true;
        resolved = true;
      }
      if (!passResolved) break;
    }
    return resolved;
  }

  earthworkProductionBonus() {
    let bonus = 0;
    for (const earthwork of this.earthworks ?? []) {
      if (earthwork.kind === "trailReinforce" && earthwork.strength > 0.95) bonus += 0.012;
    }
    return clamp(bonus, 0, 0.08);
  }

  completedEarthworks(kind) {
    return (this.earthworks ?? []).filter((earthwork) => earthwork.kind === kind && earthwork.strength > 0.95);
  }

  sentryMoundCount() {
    return this.completedEarthworks("sentryMound").length;
  }

  raidWarningBonusSeconds() {
    const def = getConstructionDef("sentryMound");
    const count = this.sentryMoundCount();
    if (count <= 0) return 0;
    return Math.min(8, def.raidWarningBonus + Math.max(0, count - 1) * 3);
  }

  hasRaidDirectionIntel() {
    return this.sentryMoundCount() > 0 || this.hasScoutIntel() || this.isRivalNestKnown();
  }

  shouldRevealRaidDirection(raid = this.ensureRaidState()) {
    return raid.phase !== "warning" || this.hasRaidDirectionIntel();
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

  earthWallMetrics(earthwork) {
    const radius = earthwork?.radius ?? 14;
    return {
      halfLength: radius * 1.16,
      topHalfWidth: Math.max(0.85, radius * 0.07),
      slowHalfWidth: Math.max(3.4, radius * 0.34),
      footHalfWidth: Math.max(1.9, radius * 0.15),
      topHeight: getConstructionDef("earthWall").wallTopHeight * clamp(earthwork?.strength ?? 0, 0, 1),
    };
  }

  earthWallAxes(earthwork) {
    const rotation = earthwork?.rotation ?? 0;
    const axisX = Math.cos(rotation);
    const axisZ = Math.sin(rotation);
    return {
      axisX,
      axisZ,
      normalX: -axisZ,
      normalZ: axisX,
    };
  }

  earthWallLocal(earthwork, x, z) {
    const axes = this.earthWallAxes(earthwork);
    const dx = x - earthwork.x;
    const dz = z - earthwork.z;
    return {
      along: dx * axes.axisX + dz * axes.axisZ,
      across: dx * axes.normalX + dz * axes.normalZ,
      axes,
    };
  }

  earthWallWorldPoint(earthwork, along, across = 0) {
    const axes = this.earthWallAxes(earthwork);
    return {
      x: earthwork.x + axes.axisX * along + axes.normalX * across,
      z: earthwork.z + axes.axisZ * along + axes.normalZ * across,
    };
  }

  findEarthWallAt(x, z, extraWidth = 0) {
    let best = null;
    let bestScore = -Infinity;
    for (const earthwork of this.earthworks ?? []) {
      if (earthwork.kind !== "earthWall" || earthwork.strength <= 0.08) continue;
      const metrics = this.earthWallMetrics(earthwork);
      const local = this.earthWallLocal(earthwork, x, z);
      if (Math.abs(local.along) > metrics.halfLength + 1.2) continue;
      const width = metrics.slowHalfWidth + extraWidth;
      if (Math.abs(local.across) > width) continue;
      const score = (1 - Math.abs(local.across) / Math.max(width, 0.001)) * earthwork.strength;
      if (score > bestScore) {
        best = { earthwork, metrics, local, score };
        bestScore = score;
      }
    }
    return best;
  }

  wallTopElevationAt(x, z) {
    let elevation = 0;
    for (const earthwork of this.earthworks ?? []) {
      if (earthwork.kind !== "earthWall" || earthwork.strength <= 0.08) continue;
      const metrics = this.earthWallMetrics(earthwork);
      const local = this.earthWallLocal(earthwork, x, z);
      if (Math.abs(local.along) > metrics.halfLength || Math.abs(local.across) > metrics.topHalfWidth) continue;
      const crest = 1 - Math.abs(local.across) / Math.max(metrics.topHalfWidth, 0.001);
      elevation = Math.max(elevation, metrics.topHeight * (0.72 + crest * 0.28));
    }
    return elevation;
  }

  wallAttackBonusAt(x, z) {
    let bonus = 0;
    for (const earthwork of this.earthworks ?? []) {
      if (earthwork.kind !== "earthWall" || earthwork.strength <= 0.82) continue;
      const def = getConstructionDef(earthwork.kind);
      const metrics = this.earthWallMetrics(earthwork);
      const local = this.earthWallLocal(earthwork, x, z);
      if (Math.abs(local.along) > metrics.halfLength || Math.abs(local.across) > metrics.topHalfWidth + 0.42) continue;
      const crest = 1 - Math.min(1, Math.abs(local.across) / Math.max(metrics.topHalfWidth + 0.42, 0.001));
      bonus = Math.max(bonus, def.wallAttackBonus * earthwork.strength * (0.82 + crest * 0.18));
    }
    return bonus;
  }

  positionAntOnEarthWallTop(ant, earthwork, along, slotOffset = 0) {
    if (!ant || !earthwork) return;
    const metrics = this.earthWallMetrics(earthwork);
    const clampedAlong = clamp(along + slotOffset, -metrics.halfLength * 0.88, metrics.halfLength * 0.88);
    const point = this.earthWallWorldPoint(earthwork, clampedAlong, 0);
    ant.x = point.x;
    ant.z = point.z;
    ant.prevX = point.x;
    ant.prevZ = point.z;
  }

  rivalSpeedAt(x, z) {
    let multiplier = 1;
    let hasWallInfluence = false;
    for (const earthwork of this.earthworks ?? []) {
      const def = getConstructionDef(earthwork.kind);
      if (def.enemySlowStrength <= 0 || earthwork.strength <= 0) continue;
      if (earthwork.kind === "earthWall") {
        const metrics = this.earthWallMetrics(earthwork);
        const local = this.earthWallLocal(earthwork, x, z);
        if (Math.abs(local.along) > metrics.halfLength || Math.abs(local.across) > metrics.slowHalfWidth) continue;
        const crossing = 1 - Math.abs(local.across) / Math.max(metrics.slowHalfWidth, 0.001);
        hasWallInfluence = true;
        multiplier *= 1 - def.enemySlowStrength * crossing * earthwork.strength;
        continue;
      }
      const d = distance2(x, z, earthwork.x, earthwork.z);
      if (d >= earthwork.radius) continue;
      multiplier *= 1 - def.enemySlowStrength * (1 - d / earthwork.radius) * earthwork.strength;
    }
    const shieldBlock = this.shieldBlockStrengthAt(x, z);
    if (shieldBlock > 0) multiplier *= 1 - 0.34 * shieldBlock;
    return clamp(multiplier, hasWallInfluence ? 0.32 : 0.54, 1);
  }

  braceBonusAt(x, z) {
    let bonus = 0;
    let hasWallInfluence = false;
    for (const earthwork of this.earthworks ?? []) {
      const def = getConstructionDef(earthwork.kind);
      if (def.braceBonus <= 0 || earthwork.strength <= 0) continue;
      if (earthwork.kind === "earthWall") {
        const metrics = this.earthWallMetrics(earthwork);
        const local = this.earthWallLocal(earthwork, x, z);
        if (Math.abs(local.along) > metrics.halfLength || Math.abs(local.across) > metrics.footHalfWidth) continue;
        hasWallInfluence = true;
        const crest = 1 - Math.abs(local.across) / Math.max(metrics.footHalfWidth, 0.001);
        bonus += def.braceBonus * crest * earthwork.strength;
        continue;
      }
      const d = distance2(x, z, earthwork.x, earthwork.z);
      if (d < earthwork.radius) {
        bonus += def.braceBonus * (1 - d / earthwork.radius) * earthwork.strength;
      }
    }
    bonus += this.shieldBlockStrengthAt(x, z) * 0.38;
    return clamp(bonus, 0, hasWallInfluence ? 0.62 : 0.45);
  }

  shieldHeadBlockPoint(ant = null) {
    const raid = this.ensureRaidState();
    let target = this.currentSortieTarget(ant?.x ?? this.nest.x, ant?.z ?? this.nest.z, ant?.sortieMode);
    if (!target && ant?.sortieTargetX != null && ant?.sortieTargetZ != null) target = { x: ant.sortieTargetX, z: ant.sortieTargetZ };
    if (!target && (raid.phase === "active" || raid.phase === "retreating" || (raid.phase === "warning" && this.hasRaidDirectionIntel()))) {
      target = this.raidSignalPoint(raid, 0.78);
    }

    let dx = target ? target.x - this.nest.x : 0;
    let dz = target ? target.z - this.nest.z : 0;
    const fallbackAngle = ant?.nestExitAngle ?? ((ant?.id ?? 1) * 2.399 + this.colony.nestLevel * 0.31);
    let length = Math.hypot(dx, dz);
    if (length <= 0.001) {
      dx = Math.cos(fallbackAngle);
      dz = Math.sin(fallbackAngle);
      length = 1;
    }
    const ux = dx / length;
    const uz = dz / length;
    const flankX = -uz;
    const flankZ = ux;
    const lane = (((ant?.sortieIndex ?? ant?.id ?? 0) % 3) - 1) * 2.2;
    const standoff = target?.kind === "rival" ? 4.8 : 9.2;
    const radius = clamp(length - standoff, this.nest.radius + 5.2, this.worldRadius * 0.92);
    return {
      x: this.nest.x + ux * radius + flankX * lane,
      z: this.nest.z + uz * radius + flankZ * lane,
      angle: Math.atan2(ux, uz),
    };
  }

  shieldBlockStrengthAt(x, z) {
    let strength = 0;
    for (const ant of this.ants ?? []) {
      if (ant.variant !== "shieldHead" || !ant.isSortieSoldier || !this.shouldRenderAnt(ant)) continue;
      if (ant.state === "return" || ant.state === "flee" || ant.fleeTimer > 0 || ant.stun > 0) continue;
      const d = distance2(x, z, ant.x, ant.z);
      if (d >= 18) continue;
      const blockPose = ant.lastTacticalAction === "shieldBlock" || ant.braceIntent > 0.72 ? 1 : 0.58;
      const nestDistance = distance2(ant.x, ant.z, this.nest.x, this.nest.z);
      const chokeBonus = nestDistance < this.nest.radius + 18 ? 1 : 0.7;
      strength += (1 - d / 18) * blockPose * chokeBonus;
    }
    return clamp(strength, 0, 1.3);
  }

  shieldCoverStrengthAt(x, z) {
    let strength = 0;
    for (const ant of this.ants ?? []) {
      if (ant.variant !== "shieldHead" || !ant.isSortieSoldier || !this.shouldRenderAnt(ant)) continue;
      if (ant.state === "return" || ant.state === "flee" || ant.fleeTimer > 0 || ant.stun > 0) continue;
      const d = distance2(x, z, ant.x, ant.z);
      if (d >= 16) continue;
      const pose = ant.lastTacticalAction === "shieldBlock" || ant.lastTacticalAction === "shieldPush" || ant.braceIntent > 0.72 ? 1 : 0.5;
      const shieldNestDistance = distance2(ant.x, ant.z, this.nest.x, this.nest.z);
      const targetNestDistance = distance2(x, z, this.nest.x, this.nest.z);
      const behindShield = targetNestDistance <= shieldNestDistance + 3 ? 1 : 0.55;
      strength += (1 - d / 16) * pose * behindShield;
    }
    return clamp(strength, 0, 1.2);
  }

  resolveShieldHeadContact(shield, rival, overlap = 0, nx = null, nz = null) {
    if (!shield || !rival || shield.variant !== "shieldHead") return false;
    if (shield.state === "return" || shield.state === "flee" || shield.fleeTimer > 0 || shield.stun > 0) return false;
    const awayShieldX = rival.x - shield.x;
    const awayShieldZ = rival.z - shield.z;
    const awayShieldDistance = Math.hypot(awayShieldX, awayShieldZ) || 1;
    const shieldPushX = awayShieldX / awayShieldDistance;
    const shieldPushZ = awayShieldZ / awayShieldDistance;
    const nestDistance = distance2(rival.x, rival.z, this.nest.x, this.nest.z) || 1;
    const outwardX = (rival.x - this.nest.x) / nestDistance;
    const outwardZ = (rival.z - this.nest.z) / nestDistance;
    const fallbackX = nx == null ? shieldPushX : -nx;
    const fallbackZ = nz == null ? shieldPushZ : -nz;
    let pushX = shieldPushX * 0.72 + outwardX * 0.68 + fallbackX * 0.32;
    let pushZ = shieldPushZ * 0.72 + outwardZ * 0.68 + fallbackZ * 0.32;
    const pushLength = Math.hypot(pushX, pushZ) || 1;
    pushX /= pushLength;
    pushZ /= pushLength;
    const shove = clamp(0.5 + overlap * 0.7 + shield.variantConfig.pushMass * 0.16, 0.5, 1.65);
    rival.x += pushX * shove;
    rival.z += pushZ * shove;
    rival.disrupt = Math.max(rival.disrupt, 0.92);
    rival.fightCooldown = Math.max(rival.fightCooldown, 0.82);
    rival.angle = Math.atan2(shield.x - rival.x, shield.z - rival.z);
    shield.angle = Math.atan2(rival.x - shield.x, rival.z - shield.z);
    shield.braceIntent = 1;
    shield.energy = clamp(shield.energy - 0.006, 0, 1);
    shield.lastTacticalAction = "shieldPush";
    shield.skipMoveThisFrame = true;
    if (shield.lastTrail > 0.2) {
      this.addTrail(shield.x, shield.z, "alarm", 0.5);
      shield.lastTrail = 0;
    }
    rival.keepInWorld(this);
    shield.keepInWorld(this);
    return true;
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
    const reservedTargets = activeTasks.reduce((sum, task) => sum + this.normalizeBuildTaskAssigneeTarget(task), 0);
    return Math.max(0, builders - reservedTargets);
  }

  canStartConstruction(kind) {
    if (this.isGameEnded()) return { ok: false, reason: "ゲーム終了" };
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
    if (this.constructionUsesPlacement(kind)) return this.beginConstructionPlacement(kind);
    this.pendingConstructionKind = null;
    this.wallPlacementDraft = null;
    this.clearWallPlacementPreview();
    return this.commitConstruction(kind, this.constructionTarget(kind));
  }

  constructionUsesPlacement(kind) {
    return kind === "earthWall" || kind === "lowBarricade" || kind === "sentryMound";
  }

  isPointPlacementConstruction(kind) {
    return kind === "lowBarricade" || kind === "sentryMound";
  }

  beginConstructionPlacement(kind) {
    const def = getConstructionDef(kind);
    const checked = this.canStartConstruction(kind);
    if (!checked.ok) {
      this.constructionMessage = checked.reason;
      this.updateStats();
      return false;
    }
    this.pendingConstructionKind = normalizeConstructionKind(kind);
    this.wallPlacementDraft = kind === "earthWall" ? { points: [], hover: null } : null;
    this.clearWallPlacementPreview();
    this.constructionMessage = kind === "earthWall" ? `${def.label}の一筆線指定中` : `${def.label}の場所指定中 / 地面をクリック`;
    this.updateStats();
    return true;
  }

  cancelConstructionPlacement() {
    if (!this.pendingConstructionKind) return false;
    this.pendingConstructionKind = null;
    this.wallPlacementDraft = null;
    this.clearWallPlacementPreview();
    this.constructionMessage = "待機";
    this.updateStats();
    return true;
  }

  confirmConstructionPlacement(start, end = null, kind = this.pendingConstructionKind) {
    if (!start || !isConstructionKind(kind)) return false;
    if (kind === "earthWall") {
      if (end) {
        this.wallPlacementDraft = { points: [this.snapWallPlacementPoint(start), this.snapWallPlacementPoint(end)], hover: null };
        return this.confirmWallPlacementDraft(kind);
      }
      this.wallPlacementDraft = { points: [this.snapWallPlacementPoint(start)], hover: null };
      this.updateWallPlacementPreview();
      return false;
    }
    const target = this.constructionTarget(kind, end ? { start, end } : start);
    this.wallPlacementDraft = null;
    this.clearWallPlacementPreview();
    if (!target) return false;
    return this.commitConstruction(kind, target);
  }

  confirmWallPlacementDraft(kind = this.pendingConstructionKind) {
    if (kind !== "earthWall") return false;
    const targets = this.wallPlacementTargetsFromDraft(false);
    if (targets.length <= 0) {
      this.constructionMessage = "土壁の頂点を2つ以上指定してください";
      this.updateStats();
      return false;
    }
    const checked = this.canStartConstruction(kind);
    if (!checked.ok) {
      this.constructionMessage = checked.reason;
      this.updateStats();
      return false;
    }
    const def = getConstructionDef(kind);
    const tasks = [];
    for (const target of targets) {
      const task = this.createBuildTask(kind, target.x, target.z, target);
      if (task) tasks.push(task);
    }
    this.pendingConstructionKind = null;
    this.wallPlacementDraft = null;
    this.clearWallPlacementPreview();
    const metrics = this.wallPlacementMetrics(targets, this.wallPlacementPoints(false));
    const strokeLabel = `一筆線 / 頂点${fmt(metrics.vertexCount, 0)} / 全長${fmt(metrics.totalLength, 0)}`;
    this.constructionMessage = `${def.startMessage} / ${strokeLabel}`;
    this.pushLog(`${def.startLog} / ${strokeLabel}`);
    this.syncEarthworksToColony();
    this.updateStats();
    this.saveColony();
    return tasks.length > 0;
  }

  commitConstruction(kind, target) {
    const def = getConstructionDef(kind);
    const checked = this.canStartConstruction(kind);
    if (!checked.ok) {
      this.constructionMessage = checked.reason;
      this.updateStats();
      return false;
    }
    const task = this.createBuildTask(kind, target.x, target.z, target);
    if (this.pendingConstructionKind === kind) this.pendingConstructionKind = null;
    this.constructionMessage = def.startMessage;
    this.pushLog(def.startLog);
    this.syncEarthworksToColony();
    this.updateStats();
    this.saveColony();
    return Boolean(task);
  }

  constructionTarget(kind, placementPoint = null) {
    if (kind === "trailReinforce") {
      const def = getConstructionDef(kind);
      const foodTrail = this.findStrongestTrail("food", this.nest.x, this.nest.z, 96);
      const x = foodTrail ? foodTrail.x : this.nest.x + this.nest.radius + 17;
      const z = foodTrail ? foodTrail.z : this.nest.z + 7;
      const angle = Math.atan2(z - this.nest.z, x - this.nest.x);
      return { x, z, radius: def.targetRadius, maxProgress: def.buildCost, rotation: angle };
    }
    const def = getConstructionDef(kind);
    if (kind === "earthWall" && placementPoint) {
      const start = placementPoint.start ?? placementPoint;
      const end = placementPoint.end ?? placementPoint;
      return this.wallTargetFromLine(start, end);
    }
    if ((kind === "lowBarricade" || kind === "sentryMound") && placementPoint) {
      return this.pointConstructionTarget(kind, placementPoint);
    }
    if (kind === "sentryMound") {
      const completed = this.earthworks.filter((earthwork) => earthwork.kind === "sentryMound" && earthwork.strength > 0.82).length;
      const angle = -0.74 + completed * Math.PI * 0.92 + this.colony.nestLevel * 0.08;
      return {
        x: this.nest.x + Math.cos(angle) * (this.nest.radius + 12.5),
        z: this.nest.z + Math.sin(angle) * (this.nest.radius + 12.5),
        radius: def.targetRadius,
        maxProgress: def.buildCost,
        rotation: angle,
      };
    }
    const raid = this.ensureRaidState();
    let point;
    if ((raid.phase === "active" || raid.phase === "retreating") || (raid.phase === "warning" && this.hasRaidDirectionIntel())) {
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
      assigneeTarget: 1,
      claimedBy: null,
      claimedByIds: [],
    };
    this.buildTasks.push(task);
    this.syncEarthworksToColony();
    return task;
  }

  addEarthwork(config) {
    const voxelView = this.voxelBuildingRenderer.createEarthwork(config);
    const { group, footprint: mesh } = voxelView;
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
      voxelView,
    };
    this.voxelBuildingRenderer.update(earthwork.voxelView, earthwork.kind, earthwork.radius, earthwork.strength);
    this.earthworks.push(earthwork);
    return earthwork;
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
    return Math.max(1, Math.min(BUILD_TASK_ASSIGNEE_CAP, Math.max(1, builders)));
  }

  normalizeBuildTaskAssigneeTarget(task) {
    if (!task) return 1;
    const limit = this.buildTaskAssigneeLimit();
    task.assigneeTarget = Math.floor(clamp(Number(task.assigneeTarget) || 1, 1, limit));
    return task.assigneeTarget;
  }

  trimBuildTaskClaimsToTarget(task) {
    const target = this.normalizeBuildTaskAssigneeTarget(task);
    const ids = this.normalizeBuildTaskClaims(task);
    if (ids.length <= target) return ids;
    const kept = ids.slice(0, target);
    const released = new Set(ids.slice(target));
    task.claimedByIds = kept;
    task.claimedBy = kept[0] ?? null;
    for (const ant of this.ants) {
      if (released.has(ant.id) && ant.buildTaskId === task.id) {
        ant.buildTaskId = null;
        ant.carryingSoil = false;
      }
    }
    return task.claimedByIds;
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
      this.trimBuildTaskClaimsToTarget(task);
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
    let task = this.buildTasks.find((item) => item.id === ant.buildTaskId && item.progress < item.maxProgress);
    if (task) {
      const ids = this.normalizeBuildTaskClaims(task);
      const target = this.normalizeBuildTaskAssigneeTarget(task);
      if (!ids.includes(ant.id) && ids.length < target) {
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
        const target = this.normalizeBuildTaskAssigneeTarget(item);
        return ids.includes(ant.id) || ids.length < target;
      })
      .sort((a, b) => {
        const aIds = this.normalizeBuildTaskClaims(a);
        const bIds = this.normalizeBuildTaskClaims(b);
        const aTarget = this.normalizeBuildTaskAssigneeTarget(a);
        const bTarget = this.normalizeBuildTaskAssigneeTarget(b);
        const assigneeDelta = (aIds.length / aTarget) - (bIds.length / bTarget);
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

  assignBuilderToBuildTask(ant, task) {
    if (!ant || !task || ant.variant !== "builder" || task.progress >= task.maxProgress) return false;
    const ids = this.normalizeBuildTaskClaims(task);
    const target = this.normalizeBuildTaskAssigneeTarget(task);
    if (ids.includes(ant.id)) return true;
    if (ids.length >= target) return false;
    if (ant.buildTaskId != null) this.releaseBuildTask(ant);
    ids.push(ant.id);
    task.claimedBy = ids[0] ?? null;
    ant.buildTaskId = task.id;
    ant.carryingSoil = false;
    return true;
  }

  fillBuildTaskAssigneeTarget(task) {
    if (!task || task.progress >= task.maxProgress) return;
    this.cleanupBuildTaskAssignments();
    for (const ant of this.ants) {
      if (this.normalizeBuildTaskClaims(task).length >= this.normalizeBuildTaskAssigneeTarget(task)) break;
      if (ant.variant === "builder" && ant.buildTaskId == null) this.assignBuilderToBuildTask(ant, task);
    }
  }

  adjustBuildTaskAssigneeTarget(taskId, delta) {
    const task = this.buildTasks.find((item) => item.id === Number(taskId) && item.progress < item.maxProgress);
    if (!task || !Number.isFinite(Number(delta))) return false;
    const current = this.normalizeBuildTaskAssigneeTarget(task);
    const next = Math.floor(clamp(current + Number(delta), 1, this.buildTaskAssigneeLimit()));
    if (next === current) return false;
    task.assigneeTarget = next;
    this.trimBuildTaskClaimsToTarget(task);
    this.fillBuildTaskAssigneeTarget(task);
    this.updateStats();
    this.saveColony();
    return true;
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
      earthwork.strength = clamp(earthwork.progress / Math.max(earthwork.maxProgress, 0.001), 0, 1);
      if (earthwork.voxelView) this.voxelBuildingRenderer.update(earthwork.voxelView, earthwork.kind, earthwork.radius, earthwork.strength);
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
          assigneeTarget: 1,
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

  createRivalNest() {
    const nest = this.rivalNest;
    const group = new THREE.Group();
    group.name = "rival-ant-nest";
    group.position.set(nest.x, 0.04, nest.z);

    const shadow = new THREE.Mesh(this.geometries.trailCircle, this.materials.rivalNestDark);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(nest.radius * 0.92, nest.radius * 0.58, 1);
    shadow.position.y = 0.012;
    group.add(shadow);

    const rim = new THREE.Mesh(this.geometries.nestRim, this.materials.rivalNestRim);
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(nest.radius * 0.9, nest.radius * 0.58, 1);
    rim.position.y = 0.08;
    rim.castShadow = this.quality.shadowQuality !== "off";
    rim.receiveShadow = this.quality.shadowQuality !== "off";
    group.add(rim);

    const spoilCount = 18;
    for (let i = 0; i < spoilCount; i += 1) {
      const angle = i * 2.399 + 0.34;
      const radius = nest.radius * rand(0.62, 1.42);
      const pebble = new THREE.Mesh(this.geometries.soilPebble, this.materials.rivalNestSoil);
      pebble.position.set(Math.cos(angle) * radius, 0.18 + (i % 4) * 0.018, Math.sin(angle) * radius);
      pebble.scale.setScalar(rand(0.16, 0.3));
      pebble.rotation.set(rand(-0.4, 0.4), rand(0, Math.PI), rand(-0.3, 0.3));
      pebble.castShadow = this.quality.shadowQuality !== "off";
      pebble.receiveShadow = this.quality.shadowQuality !== "off";
      group.add(pebble);
    }

    this.scene.add(group);
    nest.group = group;
    this.updateRivalNestVisual();
  }

  createExplorationMask() {
    const data = new Uint8Array(EXPLORED_MASK_SIZE * EXPLORED_MASK_SIZE);
    const texture = new THREE.DataTexture(
      data,
      EXPLORED_MASK_SIZE,
      EXPLORED_MASK_SIZE,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    texture.name = "runtime-exploration-mask";
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.exploredMaskData = data;
    this.exploredMaskTexture = texture;
  }

  clearExplorationMask() {
    this.exploredMaskData?.fill(0);
    if (this.exploredMaskTexture) this.exploredMaskTexture.needsUpdate = true;
  }

  explorationMaskCellSize() {
    return (this.worldRadius * 2) / (EXPLORED_MASK_SIZE - 1);
  }

  explorationMaskCoordinates(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const scale = (EXPLORED_MASK_SIZE - 1) / (this.worldRadius * 2);
    return {
      x: (x + this.worldRadius) * scale,
      z: (z + this.worldRadius) * scale,
    };
  }

  explorationMaskValueAt(x, z) {
    const point = this.explorationMaskCoordinates(x, z);
    if (!point || !this.exploredMaskData) return 0;
    if (point.x < 0 || point.z < 0 || point.x > EXPLORED_MASK_SIZE - 1 || point.z > EXPLORED_MASK_SIZE - 1) return 0;
    const column = clamp(Math.round(point.x), 0, EXPLORED_MASK_SIZE - 1);
    const row = clamp(Math.round(point.z), 0, EXPLORED_MASK_SIZE - 1);
    return this.exploredMaskData[row * EXPLORED_MASK_SIZE + column] / 255;
  }

  isPointInExplorationMask(x, z, padding = 0) {
    const point = this.explorationMaskCoordinates(x, z);
    if (!point || !this.exploredMaskData) return false;
    const cellSize = this.explorationMaskCellSize();
    const pixelRadius = Math.max(0, Math.ceil(Math.max(0, padding) / cellSize));
    const centerColumn = Math.round(point.x);
    const centerRow = Math.round(point.z);
    for (let row = centerRow - pixelRadius; row <= centerRow + pixelRadius; row += 1) {
      if (row < 0 || row >= EXPLORED_MASK_SIZE) continue;
      for (let column = centerColumn - pixelRadius; column <= centerColumn + pixelRadius; column += 1) {
        if (column < 0 || column >= EXPLORED_MASK_SIZE) continue;
        if (pixelRadius > 0) {
          const dx = (column - point.x) * cellSize;
          const dz = (row - point.z) * cellSize;
          if (Math.hypot(dx, dz) > Math.max(0, padding) + cellSize * 0.75) continue;
        }
        const value = this.exploredMaskData[row * EXPLORED_MASK_SIZE + column] / 255;
        if (value >= EXPLORED_MASK_VISIBLE_THRESHOLD) return true;
      }
    }
    return false;
  }

  paintExplorationMask(x, z, radius) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || !this.exploredMaskData) return false;
    const clamped = this.clampPointToWorld({ x, z }, 0);
    const sightRadius = clamp(radius, 2, this.worldRadius + MAP_VISION_FADE_WIDTH);
    const feather = MAP_VISION_FADE_WIDTH;
    const outerRadius = sightRadius + feather;
    const cellSize = this.explorationMaskCellSize();
    const center = this.explorationMaskCoordinates(clamped.x, clamped.z);
    if (!center) return false;
    const pixelRadius = Math.ceil(outerRadius / cellSize);
    const minRow = Math.max(0, Math.floor(center.z) - pixelRadius);
    const maxRow = Math.min(EXPLORED_MASK_SIZE - 1, Math.ceil(center.z) + pixelRadius);
    const minColumn = Math.max(0, Math.floor(center.x) - pixelRadius);
    const maxColumn = Math.min(EXPLORED_MASK_SIZE - 1, Math.ceil(center.x) + pixelRadius);
    let changed = false;
    for (let row = minRow; row <= maxRow; row += 1) {
      const worldZ = (row / (EXPLORED_MASK_SIZE - 1)) * this.worldRadius * 2 - this.worldRadius;
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const worldX = (column / (EXPLORED_MASK_SIZE - 1)) * this.worldRadius * 2 - this.worldRadius;
        const distance = Math.hypot(worldX - clamped.x, worldZ - clamped.z);
        if (distance > outerRadius) continue;
        let visibility = 1;
        if (distance > sightRadius) {
          const t = clamp((distance - sightRadius) / feather, 0, 1);
          visibility = 1 - t * t * (3 - 2 * t);
        }
        const value = Math.round(visibility * 255);
        const index = row * EXPLORED_MASK_SIZE + column;
        if (value <= this.exploredMaskData[index]) continue;
        this.exploredMaskData[index] = value;
        changed = true;
      }
    }
    return changed;
  }

  recordExploredPatch(x, z, radius = EXPLORED_PATCH_BASE_RADIUS) {
    const changed = this.paintExplorationMask(x, z, radius);
    if (changed && this.exploredMaskTexture) this.exploredMaskTexture.needsUpdate = true;
    return changed;
  }

  createFogOfWar() {
    const uniforms = {
      visionCenter: { value: new THREE.Vector2(this.nest.x, this.nest.z) },
      revealRadius: { value: this.nestVisionRadiusValue || this.mapVisionRadius() },
      fadeWidth: { value: MAP_VISION_FADE_WIDTH },
      maxAlpha: { value: MAP_UNEXPLORED_MAX_ALPHA },
      rememberedAlpha: { value: MAP_REMEMBERED_FOG_ALPHA },
      fogColor: { value: new THREE.Color(MAP_UNEXPLORED_COLOR) },
      rememberedFogColor: { value: new THREE.Color(MAP_REMEMBERED_FOG_COLOR) },
      exploredMask: { value: this.exploredMaskTexture },
      exploredMaskWorldRadius: { value: this.worldRadius },
      activeSightCount: { value: 0 },
      activeSightPatches: { value: Array.from({ length: ACTIVE_SIGHT_PATCH_LIMIT }, () => new THREE.Vector3(0, 0, 0)) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec2 visionCenter;
        uniform float revealRadius;
        uniform float fadeWidth;
        uniform float maxAlpha;
        uniform float rememberedAlpha;
        uniform vec3 fogColor;
        uniform vec3 rememberedFogColor;
        uniform sampler2D exploredMask;
        uniform float exploredMaskWorldRadius;
        uniform int activeSightCount;
        uniform vec3 activeSightPatches[${ACTIVE_SIGHT_PATCH_LIMIT}];
        varying vec3 vWorldPosition;
        void main() {
          vec2 point = vWorldPosition.xz;
          float d = distance(point, visionCenter);
          float currentVisibility = 1.0 - smoothstep(revealRadius - fadeWidth, revealRadius + fadeWidth, d);
          vec2 exploredUv = point / (exploredMaskWorldRadius * 2.0) + 0.5;
          float insideMask = step(0.0, exploredUv.x) * step(0.0, exploredUv.y) * step(exploredUv.x, 1.0) * step(exploredUv.y, 1.0);
          float rememberedVisibility = max(currentVisibility, texture2D(exploredMask, exploredUv).r * insideMask);
          for (int i = 0; i < ${ACTIVE_SIGHT_PATCH_LIMIT}; i++) {
            if (i >= activeSightCount) break;
            vec3 activePatch = activeSightPatches[i];
            float pd = distance(point, activePatch.xy);
            currentVisibility = max(currentVisibility, 1.0 - smoothstep(activePatch.z - fadeWidth, activePatch.z + fadeWidth, pd));
          }
          rememberedVisibility = max(rememberedVisibility, currentVisibility);
          float rememberedBlend = clamp(rememberedVisibility, 0.0, 1.0);
          vec3 color = mix(fogColor, rememberedFogColor, rememberedBlend);
          float layerAlpha = mix(maxAlpha, rememberedAlpha, rememberedBlend);
          float alpha = layerAlpha * (1.0 - clamp(currentVisibility, 0.0, 1.0));
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const geometry = new THREE.CircleGeometry(this.worldRadius + 18, 192);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "fog-of-war";
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.42;
    mesh.renderOrder = MAP_FOG_RENDER_ORDER;
    this.scene.add(mesh);
    this.sharedGeometries.add(geometry);
    this.sharedMaterials.add(material);
    this.fogOfWar = mesh;
    this.fogOfWarMaterial = material;

    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x79c9b5, transparent: true, opacity: 0.18, depthWrite: false });
    const edge = new THREE.Mesh(this.geometries.impactRing, edgeMaterial);
    edge.name = "vision-edge";
    edge.rotation.x = Math.PI / 2;
    edge.position.set(this.nest.x, 0.46, this.nest.z);
    edge.renderOrder = MAP_FOG_RENDER_ORDER + 1;
    this.scene.add(edge);
    this.sharedMaterials.add(edgeMaterial);
    this.visionEdge = edge;
  }

  mapActivityRadius() {
    const radius =
      MAP_BASE_VISION_RADIUS +
      Math.max(0, this.colony.territory) * MAP_TERRITORY_ACTIVITY_BONUS +
      Math.max(0, this.colony.nestLevel - 1) * MAP_NEST_LEVEL_ACTIVITY_BONUS;
    return clamp(radius, MAP_BASE_VISION_RADIUS, this.worldRadius + 24);
  }

  mapVisionRadius() {
    return clamp(MAP_BASE_VISION_RADIUS, MAP_BASE_VISION_RADIUS, this.worldRadius + 24);
  }

  manualMapVisionRadiusMin() {
    return Math.max(MAP_MANUAL_VISION_MIN_RADIUS, this.nest.radius + 18);
  }

  manualMapVisionRadiusMax() {
    return this.worldRadius + 7;
  }

  normalizeManualMapVisionRadius(radius) {
    const value = Number(radius);
    return clamp(Number.isFinite(value) ? value : MAP_BASE_VISION_RADIUS, this.manualMapVisionRadiusMin(), this.manualMapVisionRadiusMax());
  }

  currentMapVisionRadius(derived = this.derived) {
    const automaticRadius = this.mapActivityRadius(derived);
    if (this.manualMapVisionRadius == null) return automaticRadius;
    this.manualMapVisionRadius = this.normalizeManualMapVisionRadius(this.manualMapVisionRadius);
    return this.manualMapVisionRadius;
  }

  currentNestVisionRadius(derived = this.derived) {
    const radius = this.nestVisionRadiusValue || this.mapVisionRadius(derived);
    return clamp(radius, MAP_BASE_VISION_RADIUS, this.worldRadius + 24);
  }

  workerActivityRadius(derived = this.derived) {
    return this.mapVisionRadiusValue || this.currentMapVisionRadius(derived);
  }

  readManualMapVisionRadius() {
    const raw = readStorage(MAP_MANUAL_VISION_STORAGE_KEY);
    if (raw == null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? this.normalizeManualMapVisionRadius(value) : null;
  }

  persistManualMapVisionRadius() {
    if (this.manualMapVisionRadius == null) return;
    writeStorage(MAP_MANUAL_VISION_STORAGE_KEY, String(Math.round(this.manualMapVisionRadius * 10) / 10));
  }

  clearManualMapVisionRadiusStorage() {
    try {
      localStorage.removeItem(MAP_MANUAL_VISION_STORAGE_KEY);
    } catch {
      // Non-critical UI persistence can fail in private or locked-down contexts.
    }
  }

  setManualMapVisionRadius(radius, { persist = false, refresh = true } = {}) {
    this.manualMapVisionRadius = this.normalizeManualMapVisionRadius(radius);
    this.mapVisionRadiusValue = this.manualMapVisionRadius;
    this.mapActivityRadiusValue = this.manualMapVisionRadius;
    if (persist) this.persistManualMapVisionRadius();
    if (refresh) {
      this.updateMapIntel();
      this.updateStats();
    }
    return this.manualMapVisionRadius;
  }

  clearManualMapVisionRadius({ persist = true, refresh = true } = {}) {
    this.manualMapVisionRadius = null;
    if (persist) this.clearManualMapVisionRadiusStorage();
    if (refresh) {
      this.updateMapIntel();
      this.updateStats();
    }
  }

  hasScoutIntel(derived = this.derived) {
    const d = derived && Number.isFinite(Number(derived.activeAnts)) ? derived : this.computeDerived();
    return Math.max(0, Math.floor(d.scouts ?? 0)) > 0;
  }

  rivalNestDistanceFromColony() {
    return distance2(this.nest.x, this.nest.z, this.rivalNest.x, this.rivalNest.z);
  }

  isRivalNestKnown() {
    return Boolean(this.rivalNest?.discovered || this.rivalNest?.defeated);
  }

  currentSightRadiusForAnt(ant) {
    if (!ant) return EXPLORED_PATCH_BASE_RADIUS + 6;
    return clamp(this.explorationRadiusForAnt(ant) + 8, 16, 42);
  }

  buildingSightRadiusForEarthwork(earthwork) {
    if (!earthwork || earthwork.owner !== "colony") return 0;
    if ((earthwork.strength ?? 0) < BUILDING_SIGHT_COMPLETED_STRENGTH) return 0;
    if (earthwork.kind === "sentryMound") return SENTRY_MOUND_CURRENT_SIGHT_RADIUS;
    if (earthwork.kind === "lowBarricade") return LOW_BARRICADE_CURRENT_SIGHT_RADIUS;
    if (earthwork.kind === "earthWall") return EARTH_WALL_CURRENT_SIGHT_RADIUS;
    return 0;
  }

  sightPatchesForEarthwork(earthwork) {
    const sightRadius = this.buildingSightRadiusForEarthwork(earthwork);
    if (sightRadius <= 0) return [];
    if (earthwork.kind !== "earthWall") {
      return [{ x: earthwork.x, z: earthwork.z, radius: sightRadius, kind: earthwork.kind }];
    }

    const metrics = this.earthWallMetrics(earthwork);
    const span = Math.max(0, metrics.halfLength * 2);
    const patchCount = span <= sightRadius * 0.75
      ? 1
      : Math.min(4, Math.max(2, Math.ceil(span / (sightRadius * 1.35)) + 1));
    const patches = [];
    for (let index = 0; index < patchCount; index += 1) {
      const along = patchCount === 1 ? 0 : -metrics.halfLength + (span * index) / (patchCount - 1);
      const point = this.earthWallWorldPoint(earthwork, along, 0);
      patches.push({ x: point.x, z: point.z, radius: sightRadius, kind: earthwork.kind });
    }
    return patches;
  }

  isPointInBuildingSight(x, z, padding = 0) {
    for (const earthwork of this.earthworks ?? []) {
      const sightRadius = this.buildingSightRadiusForEarthwork(earthwork);
      if (sightRadius <= 0) continue;
      if (earthwork.kind === "earthWall") {
        const metrics = this.earthWallMetrics(earthwork);
        const local = this.earthWallLocal(earthwork, x, z);
        const nearest = this.earthWallWorldPoint(earthwork, clamp(local.along, -metrics.halfLength, metrics.halfLength), 0);
        if (distance2(x, z, nearest.x, nearest.z) <= sightRadius + padding) return true;
      } else if (distance2(x, z, earthwork.x, earthwork.z) <= sightRadius + padding) {
        return true;
      }
    }
    return false;
  }

  isPointInActiveAntSight(x, z, padding = 0) {
    for (const ant of this.ants ?? []) {
      if (!this.shouldRenderAnt(ant)) continue;
      if (distance2(x, z, ant.x, ant.z) <= this.currentSightRadiusForAnt(ant) + padding) return true;
    }
    return false;
  }

  isPointVisible(x, z, padding = 0) {
    const radius = this.currentNestVisionRadius();
    if (distance2(x, z, this.nest.x, this.nest.z) <= radius + padding) return true;
    if (this.isPointInActiveAntSight(x, z, padding)) return true;
    if (this.isPointInBuildingSight(x, z, padding)) return true;
    return false;
  }

  isPointExplored(x, z, padding = 0) {
    if (this.isPointVisible(x, z, padding)) return true;
    return this.isPointInExplorationMask(x, z, padding);
  }

  rivalNestSpottingReconScout() {
    const nest = this.rivalNest;
    if (!nest || nest.defeated) return null;
    return (this.ants ?? []).find((ant) =>
      ant?.isSortieSoldier &&
      ant.sortieMode === "recon" &&
      ant.variant === "scout" &&
      this.shouldRenderAnt(ant) &&
      distance2(ant.x, ant.z, nest.x, nest.z) <= this.currentSightRadiusForAnt(ant) + 4,
    ) ?? null;
  }

  shouldRenderRival(rival) {
    if (!rival || rival.defeated || rival.leftRaid) return false;
    return this.isPointVisible(rival.x, rival.z, 9) || rival.scoutMarkTimer > 0;
  }

  updateMapIntel() {
    const derived = this.computeDerived();
    this.mapVisionRadiusValue = this.currentMapVisionRadius(derived);
    this.mapActivityRadiusValue = this.mapVisionRadiusValue;
    this.nestVisionRadiusValue = this.mapVisionRadius(derived);
    const discoveredByVision = this.isPointVisible(this.rivalNest.x, this.rivalNest.z, 0);
    const discoveredByRecon = Boolean(this.rivalNestSpottingReconScout());
    if (!this.rivalNest.discovered && (discoveredByVision || discoveredByRecon)) {
      this.rivalNest.discovered = true;
      const reason = discoveredByRecon ? "偵察中の斥候が敵巣の匂いを捕捉" : "探索範囲が敵巣へ到達";
      if (!this.mapIntelLogState.rivalNestDiscovered) {
        this.pushLog(`${reason}: 遠方に敵アリの巣`);
        this.showRaidNotice("敵巣発見: 軍事出撃で敵巣を攻撃できます", "warning");
        this.mapIntelLogState.rivalNestDiscovered = true;
      }
    }
    this.updateMapVisibility();
  }

  activeSightPatchesForShader() {
    const baseRadius = this.currentNestVisionRadius();
    const buildingPatches = [];
    for (const earthwork of this.earthworks ?? []) {
      for (const patch of this.sightPatchesForEarthwork(earthwork)) {
        const distanceFromNest = distance2(patch.x, patch.z, this.nest.x, this.nest.z);
        if (distanceFromNest + patch.radius <= baseRadius + MAP_VISION_FADE_WIDTH) continue;
        const kindPriority =
          patch.kind === "sentryMound" ? 220 :
          patch.kind === "earthWall" ? 120 :
          80;
        buildingPatches.push({
          x: patch.x,
          z: patch.z,
          radius: patch.radius,
          priority: kindPriority + Math.max(0, distanceFromNest - baseRadius) + patch.radius,
        });
      }
    }
    const antPatches = (this.ants ?? [])
      .filter((ant) => this.shouldRenderAnt(ant))
      .map((ant) => ({
        x: ant.x,
        z: ant.z,
        radius: this.currentSightRadiusForAnt(ant),
        priority: Math.max(0, distance2(ant.x, ant.z, this.nest.x, this.nest.z) - baseRadius),
      }))
      .filter((patch) => patch.priority > 0 || distance2(patch.x, patch.z, this.nest.x, this.nest.z) > baseRadius * 0.68);
    return buildingPatches
      .concat(antPatches)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, ACTIVE_SIGHT_PATCH_LIMIT);
  }

  updateMapVisibility() {
    if (this.fogOfWarMaterial) {
      this.fogOfWarMaterial.uniforms.revealRadius.value = this.currentNestVisionRadius();
      this.fogOfWarMaterial.uniforms.visionCenter.value.set(this.nest.x, this.nest.z);
      const activeSightPatches = this.fogOfWarMaterial.uniforms.activeSightPatches.value;
      const activeSight = this.activeSightPatchesForShader();
      this.fogOfWarMaterial.uniforms.activeSightCount.value = activeSight.length;
      for (let i = 0; i < activeSight.length; i += 1) {
        const patch = activeSight[i];
        activeSightPatches[i].set(patch.x, patch.z, patch.radius);
      }
    }
    if (this.visionEdge) {
      const radius = this.mapVisionRadiusValue || this.mapVisionRadius();
      this.visionEdge.position.set(this.nest.x, 0.46, this.nest.z);
      this.visionEdge.scale.setScalar(radius);
      this.visionEdge.visible = radius < this.worldRadius + 12;
      if (this.visionEdge.material) {
        const isDraggingVisionEdge = this.pointerStart?.mode === "vision-resize";
        this.visionEdge.material.opacity = isDraggingVisionEdge ? 0.36 : this.manualMapVisionRadius == null ? 0.18 : 0.26;
      }
    }
    this.updateObservedObjectVisibility();
    this.updateRivalNestVisual();
  }

  updateObservedObjectVisibility() {
    for (const food of this.food ?? []) {
      if (food.group) food.group.visible = this.isPointVisible(food.x, food.z, food.radius + 5);
    }
  }

  explorationRadiusForAnt(ant) {
    if (!ant) return EXPLORED_PATCH_BASE_RADIUS;
    const variantBonus =
      ant.variant === "scout" ? 8 :
      ant.isSortieSoldier ? 5 :
      ant.variant === "builder" ? 3 :
      0;
    return EXPLORED_PATCH_BASE_RADIUS + variantBonus;
  }

  updateExploredPatches(dt, force = false) {
    this.exploredPatchClock += Math.max(0, dt);
    if (!force && this.exploredPatchClock < EXPLORED_PATCH_UPDATE_SECONDS) return;
    this.exploredPatchClock = 0;
    let changed = this.paintExplorationMask(this.nest.x, this.nest.z, this.currentNestVisionRadius());
    for (const earthwork of this.earthworks ?? []) {
      for (const patch of this.sightPatchesForEarthwork(earthwork)) {
        changed = this.paintExplorationMask(patch.x, patch.z, patch.radius) || changed;
      }
    }
    for (const ant of this.ants ?? []) {
      if (!this.shouldRenderAnt(ant)) continue;
      changed = this.paintExplorationMask(ant.x, ant.z, this.currentSightRadiusForAnt(ant)) || changed;
    }
    if (changed) {
      if (this.exploredMaskTexture) this.exploredMaskTexture.needsUpdate = true;
      this.updateMapIntel();
    }
  }

  updateRivalNestVisual() {
    const nest = this.rivalNest;
    if (!nest?.group) return;
    nest.group.visible = this.isRivalNestKnown() && (this.hasScoutIntel() || this.isPointVisible(nest.x, nest.z, RIVAL_NEST_REVEAL_RADIUS));
    const defeatedScale = nest.defeated ? 0.76 : 1;
    const strain = 1 - clamp(nest.integrity ?? 1, 0, 1);
    nest.group.scale.setScalar(defeatedScale * (1 - strain * 0.08));
    nest.group.position.y = nest.defeated ? 0.02 : 0.04 + Math.sin(this.renderTime * 0.004) * 0.01 * (1 - strain);
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

  iconImage(src, className = "generated-ui-icon", fallback = "") {
    if (!src) return fallback;
    return `<img class="${className}" src="${src}" alt="" aria-hidden="true" loading="lazy">`;
  }

  barracksVariantUi(variant) {
    const def = getBarracksTrainingDef(variant);
    return BARRACKS_VARIANT_UI[def.variant] ?? BARRACKS_VARIANT_UI.worker;
  }

  attachButtonIcon(button, src, className) {
    if (!button || !src || button.querySelector(`.${className}`)) return;
    const image = document.createElement("img");
    image.className = className;
    image.src = src;
    image.alt = "";
    image.loading = "lazy";
    image.setAttribute("aria-hidden", "true");
    button.prepend(image);
  }

  decorateGeneratedUiAssets() {
    document.querySelector(".title-mark")?.classList.add("uses-generated-mark");
    const tabIcons = {
      growth: UI_ICON_ASSETS.growthLeaf,
      construction: UI_ICON_ASSETS.constructionShovel,
      barracks: UI_ICON_ASSETS.nurseryEggs,
      soldiers: UI_ICON_ASSETS.militaryMandibles,
    };
    for (const button of ui.buttons) {
      this.attachButtonIcon(button, tabIcons[button.dataset.tab], "tab-icon");
    }
    const statIcons = [UI_ICON_ASSETS.foodSeed, UI_ICON_ASSETS.antPopulation, UI_ICON_ASSETS.defenseShield, UI_ICON_ASSETS.growthLeaf];
    document.querySelectorAll(".stats-strip div").forEach((card, index) => {
      if (statIcons[index]) this.attachButtonIcon(card, statIcons[index], "stat-card-icon");
    });
  }

  buttonFeedbackText(button) {
    if (!button) return "操作しました";
    if (button.dataset.feedback) return button.dataset.feedback;
    if (button.dataset.nextAction === "primary") {
      const kind = button.dataset.actionKind ?? "";
      const value = button.dataset.actionValue ?? "";
      if (kind === "reset") return "新しい巣で再開";
      if (kind === "train") return `${getBarracksTrainingDef(value).label}を育成キューへ`;
      if (kind === "upgrade") return `${UPGRADE_UI[value]?.name ?? upgradeName(value)}を強化`;
      if (kind === "recon") return "偵察出動";
      if (kind === "sortie") return value === "expedition" ? "遠征出動" : "防衛出動";
      if (kind === "tab") return value === "barracks" ? "育房を表示" : "成長を表示";
      return "主要アクションを実行";
    }
    if (button.dataset.nextAction === "status") return "状況パネルを表示";
    if (button.dataset.nextAction === "growth") return "成長を表示";
    if (button.dataset.nextAction === "barracks") return "育房を表示";
    if (button.dataset.nextAction === "soldiers") return "軍事を表示";
    if (button.dataset.tab) {
      const labels = { growth: "成長", construction: "土木", barracks: "育房", soldiers: "軍事" };
      return `${labels[button.dataset.tab] ?? "タブ"}を表示`;
    }
    if (button.dataset.upgrade) {
      return `${UPGRADE_UI[button.dataset.upgrade]?.name ?? upgradeName(button.dataset.upgrade)}を強化`;
    }
    if (button.dataset.trainVariant) {
      return `${getBarracksTrainingDef(button.dataset.trainVariant).label}を育成キューへ`;
    }
    if (button.dataset.buildTask && button.dataset.crewDelta) return "担当数を変更";
    if (button.id === "homeViewBtn") return "巣へ戻る";
    if (button.id === "pauseBtn") return "一時停止を切り替え";
    if (button.id === "resetBtn") return "リセット";
    if (button.id === "panelToggleBtn") return this.panelHidden ? "Panel show" : "Panel hide";
    if (button.id === "panelGrip") return "パネルを開閉";
    if (button.id === "soldierSortieBtn") return "防衛出動";
    if (button.id === "reconSortieBtn") return "偵察出動";
    if (button.id === "expeditionSortieBtn") return "遠征出動";
    if (button.id === "constructionTrailBtn") return "採餌道を整える";
    if (button.id === "constructionBarricadeBtn") return "低い土塁を置く";
    if (button.id === "constructionWallBtn") return "土壁を指定";
    if (button.id === "constructionSentryBtn") return "見張り塚を置く";
    if (button.id === "constructionWallConfirmBtn") return "土壁の指定を確定";
    const label = button.querySelector(".button-main")?.textContent?.trim() || button.textContent?.trim();
    return label ? `${label}を操作` : "操作しました";
  }

  showActionFeedback(message, button = null) {
    if (!ui.actionFeedback) return;
    const text = message || "操作しました";
    ui.actionFeedback.textContent = text;
    ui.actionFeedback.hidden = false;
    ui.actionFeedback.classList.remove("is-visible");
    window.clearTimeout(this.actionFeedbackTimer);
    window.requestAnimationFrame(() => ui.actionFeedback?.classList.add("is-visible"));
    this.actionFeedbackTimer = window.setTimeout(() => {
      ui.actionFeedback?.classList.remove("is-visible");
      if (ui.actionFeedback) ui.actionFeedback.hidden = true;
    }, 1300);
    if (button) {
      button.classList.remove("is-pressed-feedback");
      window.requestAnimationFrame(() => button.classList.add("is-pressed-feedback"));
      window.setTimeout(() => button.classList.remove("is-pressed-feedback"), 260);
    }
  }

  handleButtonFeedback(event) {
    const button = event.target?.closest?.("button");
    if (!button || button.disabled) return;
    this.showActionFeedback(this.buttonFeedbackText(button), button);
  }

  touchButtonActionKey(button) {
    if (!button) return "";
    if (button.id) return `id:${button.id}`;
    const data = button.dataset ?? {};
    if (data.tab) return `tab:${data.tab}`;
    if (data.nextAction) return `next:${data.nextAction}`;
    if (data.upgrade) return `upgrade:${data.upgrade}`;
    if (data.trainVariant) return `train:${data.trainVariant}`;
    if (data.buildTask && data.crewDelta) return `build:${data.buildTask}:${data.crewDelta}`;
    return "";
  }

  shouldSuppressTouchClick(event) {
    const suppressed = this.suppressedTouchClick;
    if (!suppressed) return false;
    if (performance.now() > suppressed.expiresAt) {
      this.suppressedTouchClick = null;
      return false;
    }
    const button = event.target?.closest?.("button");
    if (button === suppressed.button) return true;
    const actionKey = this.touchButtonActionKey(button);
    if (actionKey && actionKey === suppressed.actionKey) return true;
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const dx = event.clientX - suppressed.x;
      const dy = event.clientY - suppressed.y;
      return Math.hypot(dx, dy) <= DOM_BUTTON_TOUCH_TAP_SLOP;
    }
    return false;
  }

  handleButtonClickSuppression(event) {
    if (!this.shouldSuppressTouchClick(event)) return;
    this.suppressedTouchClick = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  touchFallbackButtonFromTarget(target) {
    const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    const button = element?.closest?.("button");
    if (!button || button.disabled || button.id === "panelGrip") return null;
    return button;
  }

  shouldPreserveTouchedButton(container) {
    const button = this.touchButtonTap?.button;
    return Boolean(button?.isConnected && container?.contains(button));
  }

  pointInsideExpandedRect(x, y, rect, padding = 0) {
    if (!rect) return false;
    return x >= rect.left - padding && x <= rect.right + padding && y >= rect.top - padding && y <= rect.bottom + padding;
  }

  touchEndedOnButton(tap) {
    const top = document.elementFromPoint(tap.lastX, tap.lastY);
    if (top === tap.button || tap.button.contains(top)) return true;
    return (
      this.pointInsideExpandedRect(tap.lastX, tap.lastY, tap.button.getBoundingClientRect(), DOM_BUTTON_TOUCH_TARGET_PADDING) ||
      this.pointInsideExpandedRect(tap.lastX, tap.lastY, tap.startRect, DOM_BUTTON_TOUCH_TARGET_PADDING)
    );
  }

  touchFromList(list, identifier) {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].identifier === identifier) return list[i];
    }
    return null;
  }

  updateTouchButtonTap(touch) {
    if (!this.touchButtonTap || !touch) return;
    const dx = touch.clientX - this.touchButtonTap.startX;
    const dy = touch.clientY - this.touchButtonTap.startY;
    this.touchButtonTap.lastX = touch.clientX;
    this.touchButtonTap.lastY = touch.clientY;
    this.touchButtonTap.maxDistance = Math.max(this.touchButtonTap.maxDistance, Math.hypot(dx, dy));
  }

  handleButtonTouchStart(event) {
    this.suppressedTouchClick = null;
    if (event.touches.length !== 1 || event.changedTouches.length !== 1) {
      this.touchButtonTap = null;
      return;
    }
    const button = this.touchFallbackButtonFromTarget(event.target);
    if (!button) {
      this.touchButtonTap = null;
      return;
    }
    const touch = event.changedTouches[0];
    this.touchButtonTap = {
      identifier: touch.identifier,
      button,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      startRect: button.getBoundingClientRect(),
      maxDistance: 0,
      pointerCanceled: false,
      startedAt: performance.now(),
    };
  }

  handleButtonTouchMove(event) {
    const tap = this.touchButtonTap;
    if (!tap) return;
    const touch = this.touchFromList(event.changedTouches, tap.identifier)
      ?? this.touchFromList(event.touches, tap.identifier);
    this.updateTouchButtonTap(touch);
  }

  handleButtonPointerCancel(event) {
    const tap = this.touchButtonTap;
    if (!tap || event.pointerType !== "touch") return;
    const button = this.touchFallbackButtonFromTarget(event.target);
    if (button && button !== tap.button) return;
    tap.pointerCanceled = true;
  }

  finishButtonTouchTap(event) {
    const tap = this.touchButtonTap;
    if (!tap) return;
    const touch = this.touchFromList(event.changedTouches, tap.identifier)
      ?? this.touchFromList(event.touches ?? [], tap.identifier);
    if (touch) this.updateTouchButtonTap(touch);
    this.touchButtonTap = null;
    if (tap.button.disabled || !tap.button.isConnected) return;
    const elapsed = performance.now() - tap.startedAt;
    const endedOnButton = this.touchEndedOnButton(tap);
    if (!endedOnButton || tap.maxDistance > DOM_BUTTON_TOUCH_TAP_SLOP || elapsed > DOM_BUTTON_TOUCH_TAP_MAX_MS) return;
    if (event.cancelable) event.preventDefault();
    this.suppressedTouchClick = null;
    tap.button.click();
    this.suppressedTouchClick = {
      button: tap.button,
      actionKey: this.touchButtonActionKey(tap.button),
      x: tap.lastX,
      y: tap.lastY,
      expiresAt: performance.now() + DOM_BUTTON_SUPPRESS_CLICK_MS,
    };
  }

  handleButtonTouchEnd(event) {
    this.finishButtonTouchTap(event);
  }

  handleButtonTouchCancel(event) {
    const tap = this.touchButtonTap;
    if (!tap) return;
    this.finishButtonTouchTap(event);
  }

  bindButtonTouchFallback() {
    this.boundButtonTouchStart = (event) => this.handleButtonTouchStart(event);
    this.boundButtonTouchMove = (event) => this.handleButtonTouchMove(event);
    this.boundButtonTouchEnd = (event) => this.handleButtonTouchEnd(event);
    this.boundButtonTouchCancel = (event) => this.handleButtonTouchCancel(event);
    this.boundButtonPointerCancel = (event) => this.handleButtonPointerCancel(event);
    this.boundButtonClickSuppression = (event) => this.handleButtonClickSuppression(event);
    document.addEventListener("touchstart", this.boundButtonTouchStart, true);
    document.addEventListener("touchmove", this.boundButtonTouchMove, true);
    document.addEventListener("touchend", this.boundButtonTouchEnd, { capture: true, passive: false });
    document.addEventListener("touchcancel", this.boundButtonTouchCancel, true);
    document.addEventListener("pointercancel", this.boundButtonPointerCancel, true);
    document.addEventListener("click", this.boundButtonClickSuppression, true);
  }

  bindEvents() {
    this.boundResize = () => this.resize();
    this.boundPageHide = () => {
      this.saveColony();
      this.dispose();
    };
    this.boundKeyDown = (event) => this.onKeyDown(event);
    this.boundKeyUp = (event) => this.onKeyUp(event);
    window.addEventListener("resize", this.boundResize);
    window.visualViewport?.addEventListener("resize", this.boundResize);
    window.visualViewport?.addEventListener("scroll", this.boundResize);
    window.addEventListener("pagehide", this.boundPageHide, { once: true });
    window.addEventListener("keydown", this.boundKeyDown, { passive: false });
    window.addEventListener("keyup", this.boundKeyUp, { passive: false });
    this.setPanelCompact(this.panelCompact, false);
    this.setPanelHidden(this.panelHidden, false);
    this.decorateGeneratedUiAssets();
    this.bindPanelGestures();
    this.bindButtonTouchFallback();
    this.boundButtonFeedback = (event) => this.handleButtonFeedback(event);
    document.addEventListener("click", this.boundButtonFeedback, true);
    this.boundPanelToggle = () => this.setPanelHidden(!this.panelHidden);
    ui.panelToggle?.addEventListener("click", this.boundPanelToggle);

    ui.buttons.forEach((button) => {
      button.addEventListener("click", () => {
        this.setPanelCompact(false);
        this.setActiveTab(button.dataset.tab);
      });
    });

    ui.homeView?.addEventListener("click", () => this.focusCameraOnNest());

    ui.pause.addEventListener("click", () => {
      this.paused = !this.paused;
      ui.pause.classList.toggle("is-paused", this.paused);
      ui.pause.title = this.paused ? "再開" : "一時停止";
      ui.pause.setAttribute("aria-label", ui.pause.title);
    });

    ui.reset.addEventListener("click", () => this.reset(true));
    ui.gameEndReset?.addEventListener("click", () => this.reset(true));
    ui.upgradeList.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-next-action]");
      if (actionButton) {
        event.preventDefault();
        this.performNextAction(actionButton.dataset.nextAction, actionButton);
        return;
      }
      const button = event.target.closest("[data-upgrade]");
      if (!button) return;
      event.preventDefault();
      this.buyUpgrade(button.dataset.upgrade);
    });
    ui.barracksTrainingList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-train-variant]");
      if (!button) return;
      event.preventDefault();
      this.startBarracksTraining(button.dataset.trainVariant);
    });
    ui.soldierSortieBtn.addEventListener("click", () => this.startSoldierSortie("defense"));
    ui.reconSortieBtn?.addEventListener("click", () => this.startReconSortie());
    ui.expeditionSortieBtn?.addEventListener("click", () => this.startSoldierSortie("expedition"));
    ui.constructionTrailBtn?.addEventListener("click", () => this.startConstruction("trailReinforce"));
    ui.constructionBarricadeBtn?.addEventListener("click", () => this.startConstruction("lowBarricade"));
    ui.constructionWallBtn?.addEventListener("click", () => this.startConstruction("earthWall"));
    ui.constructionCancelBtn?.addEventListener("click", () => this.cancelConstructionPlacement());
    ui.constructionWallConfirmBtn?.addEventListener("click", () => this.confirmWallPlacementDraft());
    ui.constructionSentryBtn?.addEventListener("click", () => this.startConstruction("sentryMound"));
    ui.constructionProgressList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-build-task][data-crew-delta]");
      if (!button) return;
      event.preventDefault();
      this.adjustBuildTaskAssigneeTarget(button.dataset.buildTask, Number(button.dataset.crewDelta));
    });

    const canvas = this.renderer.domElement;
    this.input = new InputManager(this, canvas);
  }

  setActiveTab(tab) {
    this.activeTab = tab === "soldiers" || tab === "construction" || tab === "barracks" ? tab : "growth";
    ui.empirePanel?.classList.toggle("is-military-tab", this.activeTab === "soldiers");
    ui.empirePanel?.classList.toggle("is-barracks-tab", this.activeTab === "barracks");
    ui.panelToggle?.classList.toggle("is-construction-tab-toggle", this.activeTab === "construction");
    ui.buttons.forEach((item) => item.classList.toggle("active", item.dataset.tab === this.activeTab));
    ui.growthTab.classList.toggle("active", this.activeTab === "growth");
    ui.constructionTab?.classList.toggle("active", this.activeTab === "construction");
    ui.barracksTab?.classList.toggle("active", this.activeTab === "barracks");
    ui.soldierTab.classList.toggle("active", this.activeTab === "soldiers");
    ui.empirePanel?.classList.toggle("is-construction-tab", this.activeTab === "construction");
    this.updateStats();
  }

  performNextAction(action, button = null) {
    const kind = button?.dataset?.actionKind ?? "";
    const value = button?.dataset?.actionValue ?? "";
    if (action === "primary") {
      if (kind === "reset") {
        this.reset(true);
        return true;
      }
      if (kind === "train" && this.startBarracksTraining(value)) return true;
      if (kind === "upgrade" && this.buyUpgrade(value)) return true;
      if (kind === "recon" && this.startReconSortie()) return true;
      if (kind === "sortie" && this.startSoldierSortie(value || "defense")) return true;
      if (kind === "tab") {
        this.setPanelCompact(false);
        this.setActiveTab(value || "growth");
        return true;
      }
    }
    if (action === "status") {
      this.setPanelCompact(false);
      return true;
    }
    if (action === "growth") {
      this.setPanelCompact(false);
      this.setActiveTab("growth");
      return true;
    }
    if (action === "barracks") {
      this.setPanelCompact(false);
      this.setActiveTab("barracks");
      return true;
    }
    if (action === "soldiers") {
      this.setPanelCompact(false);
      this.setActiveTab("soldiers");
      return true;
    }
    return false;
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

  setPanelHidden(hidden, persist = true) {
    this.panelHidden = Boolean(hidden);
    document.body.classList.toggle("is-panel-hidden", this.panelHidden);
    ui.empirePanel?.classList.toggle("is-hidden", this.panelHidden);
    ui.panelToggle?.classList.toggle("is-panel-hidden", this.panelHidden);
    ui.panelToggle?.setAttribute("aria-pressed", String(!this.panelHidden));
    if (ui.panelToggle) {
      ui.panelToggle.title = this.panelHidden ? "Panel show" : "Panel hide";
      ui.panelToggle.setAttribute("aria-label", ui.panelToggle.title);
    }
    if (ui.empirePanel) {
      if (this.panelHidden) ui.empirePanel.setAttribute("aria-hidden", "true");
      else ui.empirePanel.removeAttribute("aria-hidden");
      ui.empirePanel.inert = this.panelHidden;
    }
    if (persist) writeStorage("ant3d.panelHidden", this.panelHidden ? "1" : "0");
  }

  reset(newGame = true) {
    for (const list of [this.water, this.stones, this.food, this.branches, this.trails, this.buildTasks, this.earthworks, this.combatEffects, this.predators, this.rivalCorpses, this.colonyCorpses, this.naturalDetails]) {
      for (const item of list) this.disposeDynamicItem(item);
    }
    this.dynamicObjects.clear();
    this.ants = [];
    this.water = [];
    this.stones = [];
    this.food = [];
    this.foodSpawnSites = [];
    this.branches = [];
    this.trails = [];
    this.buildTasks = [];
    this.earthworks = [];
    this.combatEffects = [];
    this.naturalDetails = [];
    this.naturalDetailStats = { grassClumps: 0, microPebbles: 0, wetEdgeDecals: 0, crackDecals: 0, mossDecals: 0, gravelDecals: 0 };
    this.predators = [];
    this.rivalCorpses = [];
    this.colonyCorpses = [];
    for (const rival of this.rivalAnts) this.antRenderer?.releaseRenderObject(rival);
    this.rivalAnts = [];
    this.nextRivalId = 1;
    this.reconSweepIndex = 0;
    this.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };
    this.raidNestBreachEvents = 0;
    this.rivalNest.discovered = false;
    this.rivalNest.defeated = false;
    this.rivalNest.integrity = 1;
    this.rivalNest.underAttackTimer = 0;
    this.rivalNest.attackPulseTimer = 0;
    this.rivalNest.defenseWaveArmed = true;
    this.rivalNest.defenseClearTimer = 0;
    if (newGame) {
      this.manualMapVisionRadius = null;
      this.clearManualMapVisionRadiusStorage();
    }
    this.mapVisionRadiusValue = MAP_BASE_VISION_RADIUS;
    this.mapActivityRadiusValue = MAP_BASE_VISION_RADIUS;
    this.nestVisionRadiusValue = MAP_BASE_VISION_RADIUS;
    this.clearExplorationMask();
    this.exploredPatchClock = 0;
    this.mapIntelLogState = { rivalNestDiscovered: false, rivalNestDefeated: false };
    this.constructionMessage = "待機";
    this.pendingConstructionKind = null;
    this.wallPlacementDraft = null;
    this.clearWallPlacementPreview();
    this.renderAntBuffer.length = 0;
    this.soldierSortieCooldown = 0;
    this.sortieRetireQueue = [];
    this.squads = [];
    this.nextSquadId = 1;
    this.antRenderer?.beginFrame();
    this.antRenderer?.endFrame();
    this.collectedFood = 0;
    this.recentForagingSamples = [];
    this.recentForagingTotal = 0;
    this.simTime = 0;
    this.foragingTerritoryProgress = 0;
    this.nextFoodId = 1;
    this.nextAntId = 1;
    this.selectedAnt = null;
    if (newGame) {
      this.colony = createDefaultColony();
      this.saveColony();
    }
    this.ensureRaidState();
    this.applyGameStatusRuntimeState();
    this.seedNaturalEnvironment();
    this.restoreEarthworksFromState();
    this.syncAntPopulation();
    this.spawnRivalNestWorkers();
    this.updateExploredPatches(0, true);
    this.updateMapIntel();
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
    this.colony.shieldHeadAnts = derived.shieldHeads;
    this.colony.acidShooterAnts = derived.acidShooters;
    this.colony.scoutAnts = derived.scouts;
    this.colony.medicAnts = derived.medics;
    this.colony.captainAnts = derived.captains;
    this.colony.builderAnts = derived.builders;
    this.colony.attackPower = derived.attackPower;
    this.colony.defensePower = derived.defensePower;
    this.derived = derived;
    return this.derived;
  }

  updateColony(dt) {
    if (this.isGameEnded()) return;
    this.computeDerived();
    this.colony.hatchProgress = 0;
    this.updateBarracksTraining(dt);

    const nextDerived = this.computeDerived();
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
    this.spawnRivalNestWorkers();

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
      this.colony.lifetimeFood >= 80 + this.colony.nestLevel * 120 &&
      this.colony.territory >= this.nestExpansionTerritoryRequirement(this.colony.nestLevel)
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

  nestExpansionTerritoryRequirement(currentNestLevel = this.colony.nestLevel) {
    return Math.max(0, Math.floor(currentNestLevel) - 1);
  }

  syncAntPopulation() {
    const d = this.computeDerived();
    const deployed = this.deployedSoldierCount();
    const homeTarget = Math.floor(clamp(d.workers + d.builders, 1, Math.max(1, DISPLAY_ANT_CAP - deployed)));
    const target = Math.floor(clamp(homeTarget + deployed, 1, DISPLAY_ANT_CAP));
    for (const ant of this.ants) {
      if (
        ant.role === "guard" &&
        !ant.isSortieSoldier &&
        ant.variant !== "soldier" &&
        ant.variant !== "heavySoldier" &&
            ant.variant !== "shieldHead" &&
            ant.variant !== "acidShooter" &&
            ant.variant !== "scout" &&
            ant.variant !== "medic" &&
            ant.variant !== "captain"
      ) ant.role = "worker";
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
      shieldHead: 0,
      acidShooter: 0,
      scout: 0,
      medic: 0,
      captain: 0,
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
    if (index < counts.heavySoldier + counts.shieldHead) return "shieldHead";
    if (index < counts.heavySoldier + counts.shieldHead + counts.acidShooter) return "acidShooter";
    if (index < counts.heavySoldier + counts.shieldHead + counts.acidShooter + counts.scout) return "scout";
    if (index < counts.heavySoldier + counts.shieldHead + counts.acidShooter + counts.scout + counts.medic) return "medic";
    if (index < counts.heavySoldier + counts.shieldHead + counts.acidShooter + counts.scout + counts.medic + counts.captain) return "captain";
    if (index < counts.heavySoldier + counts.shieldHead + counts.acidShooter + counts.scout + counts.medic + counts.captain + counts.soldier) return "soldier";
    if (index < counts.heavySoldier + counts.shieldHead + counts.acidShooter + counts.scout + counts.medic + counts.captain + counts.soldier + counts.builder) return "builder";
    return "worker";
  }

  barracksQueue() {
    if (!Array.isArray(this.colony.barracksQueue)) this.colony.barracksQueue = [];
    return this.colony.barracksQueue;
  }

  barracksTrainingSpeedMultiplier(variant = null) {
    const upgrades = this.colony.upgrades;
    const broodNursery = upgradeLevel(upgrades, "broodNursery");
    const broodClimate = upgradeLevel(upgrades, "broodClimate");
    const foodDistribution = upgradeLevel(upgrades, "foodDistribution");
    const queenCare = upgradeLevel(upgrades, "queenCare");
    const ventilationShafts = upgradeLevel(upgrades, "ventilationShafts");
    const base = 0.017;
    const improved =
      (base + queenCare * 0.0058 + broodNursery * 0.0038 + broodClimate * 0.003 + foodDistribution * 0.0012) *
      (1 + ventilationShafts * 0.008);
    const def = isBarracksTrainingVariant(variant) ? getBarracksTrainingDef(variant) : null;
    const broodLevel = def?.requiresUpgrade ? upgradeLevel(upgrades, def.requiresUpgrade) : 0;
    const broodSpeed = broodLevel > 1 ? 1 + (broodLevel - 1) * 0.08 : 1;
    return clamp((improved / base) * broodSpeed, 1, 8);
  }

  barracksVariantField(variant) {
    if (variant === "builder") return "builderAnts";
    if (variant === "heavySoldier") return "heavySoldierAnts";
    if (variant === "shieldHead") return "shieldHeadAnts";
    if (variant === "acidShooter") return "acidShooterAnts";
    if (variant === "scout") return "scoutAnts";
    if (variant === "medic") return "medicAnts";
    if (variant === "captain") return "captainAnts";
    return null;
  }

  barracksCurrentCount(variant, derived = this.computeDerived()) {
    if (variant === "worker") return Math.max(0, Math.floor(derived.workers ?? 0));
    if (variant === "builder") return Math.max(0, Math.floor(derived.builders ?? 0));
    if (variant === "soldier") return Math.max(0, Math.floor(derived.normalSoldiers ?? 0));
    if (variant === "heavySoldier") return Math.max(0, Math.floor(derived.heavySoldiers ?? 0));
    if (variant === "shieldHead") return Math.max(0, Math.floor(derived.shieldHeads ?? 0));
    if (variant === "acidShooter") return Math.max(0, Math.floor(derived.acidShooters ?? 0));
    if (variant === "scout") return Math.max(0, Math.floor(derived.scouts ?? 0));
    if (variant === "medic") return Math.max(0, Math.floor(derived.medics ?? 0));
    if (variant === "captain") return Math.max(0, Math.floor(derived.captains ?? 0));
    return 0;
  }

  barracksPendingCount(variant) {
    return this.barracksQueue().filter((item) => item.variant === variant).length;
  }

  barracksPendingPopulationCount() {
    return this.barracksQueue().length;
  }

  barracksPendingCombatCount() {
    return this.barracksQueue().filter((item) => this.isBarracksCombatVariant(item.variant)).length;
  }

  isBarracksCombatVariant(variant) {
    return (
      variant === "soldier" ||
      variant === "heavySoldier" ||
      variant === "shieldHead" ||
      variant === "acidShooter" ||
      variant === "scout" ||
      variant === "medic" ||
      variant === "captain"
    );
  }

  barracksSoldierCapacity(derived = this.computeDerived()) {
    const activeCap = Math.max(0, Math.floor((derived.activeAnts ?? 0) - 1));
    if (activeCap <= 0) return 0;
    const soldierTraining = upgradeLevel(this.colony.upgrades, "soldierTraining");
    const sentinelPosts = upgradeLevel(this.colony.upgrades, "sentinelPosts");
    const ratio = clamp(0.18 + soldierTraining * 0.05 + sentinelPosts * 0.015 + this.colony.nestLevel * 0.005, 0.16, 0.62);
    return Math.min(activeCap, Math.max(1, Math.floor((derived.activeAnts ?? 0) * ratio)));
  }

  barracksVariantCapacity(variant, derived = this.computeDerived()) {
    return Math.max(0, Math.floor(derived.capacity ?? 0));
  }

  canCompleteBarracksTraining(variant) {
    if (!isBarracksTrainingVariant(variant)) return false;
    const d = this.computeDerived();
    if (this.colony.antPopulation >= d.capacity) return false;
    return true;
  }

  canStartBarracksTraining(variant) {
    if (this.isGameEnded()) return { ok: false, reason: "ゲーム終了" };
    if (!isBarracksTrainingVariant(variant)) return { ok: false, reason: "不明な種別" };
    const def = getBarracksTrainingDef(variant);
    const queue = this.barracksQueue();
    if (queue.length >= BARRACKS_QUEUE_CAP) return { ok: false, reason: "キュー満杯" };
    if (def.requiresUpgrade && upgradeLevel(this.colony.upgrades, def.requiresUpgrade) <= 0) return { ok: false, reason: `${upgradeName(def.requiresUpgrade)}で解禁` };
    const d = this.computeDerived();
    if (this.colony.antPopulation + this.barracksPendingPopulationCount() >= d.capacity) return { ok: false, reason: "収容上限" };
    if (this.colony.food < def.foodCost) return { ok: false, reason: `食料 ${fmt(def.foodCost - this.colony.food, 0)}不足` };
    return { ok: true, reason: "育成可能" };
  }

  startBarracksTraining(variant) {
    if (!isBarracksTrainingVariant(variant)) return false;
    const state = this.canStartBarracksTraining(variant);
    if (!state.ok) {
      this.pushLog(`育成: ${state.reason}`);
      this.updateStats();
      return false;
    }
    const def = getBarracksTrainingDef(variant);
    this.colony.nextBarracksOrderId = Math.max(1, Math.floor(Number(this.colony.nextBarracksOrderId) || 1));
    this.colony.food = Math.max(0, this.colony.food - def.foodCost);
    this.barracksQueue().push({
      id: this.colony.nextBarracksOrderId++,
      variant: def.variant,
      foodCost: def.foodCost,
      totalSeconds: def.trainingSeconds,
      remainingSeconds: def.trainingSeconds,
    });
    this.pushLog(`育成: ${def.label}をキューへ追加`);
    this.updateStats();
    this.saveColony();
    return true;
  }

  completeBarracksTraining(variant) {
    if (!this.canCompleteBarracksTraining(variant)) return false;
    const def = getBarracksTrainingDef(variant);
    const capacity = Math.max(0, Math.floor(this.computeDerived().capacity ?? 0));
    this.colony.antPopulation = Math.min(capacity, Math.floor(this.colony.antPopulation) + 1);
    if (variant === "builder") {
      this.colony.builderAnts = Math.floor(this.colony.builderAnts ?? 0) + 1;
    } else if (this.isBarracksCombatVariant(variant)) {
      const activeCap = Math.max(0, Math.floor(this.computeDerived().activeAnts ?? 0));
      this.colony.soldierAnts = Math.min(activeCap, Math.floor(this.colony.soldierAnts) + 1);
      const field = this.barracksVariantField(variant);
      if (field) {
        this.colony[field] = Math.floor(this.colony[field] ?? 0) + 1;
      }
    }
    this.pushLog(`育成完了: ${def.label}が1匹増えた`);
    this.computeDerived();
    this.syncAntPopulation();
    return true;
  }

  updateBarracksTraining(dt) {
    const queue = this.barracksQueue();
    if (queue.length <= 0 || dt <= 0) return;
    let remaining = dt;
    while (queue.length > 0 && remaining >= 0) {
      const order = queue[0];
      if (order.remainingSeconds <= 0) {
        if (!this.completeBarracksTraining(order.variant)) break;
        queue.shift();
        continue;
      }
      const speed = this.barracksTrainingSpeedMultiplier(order.variant);
      const spent = Math.min(order.remainingSeconds / speed, remaining);
      order.remainingSeconds = Math.max(0, order.remainingSeconds - spent * speed);
      remaining -= spent;
      if (order.remainingSeconds > 0) break;
      if (!this.completeBarracksTraining(order.variant)) break;
      queue.shift();
      if (remaining <= 0) break;
    }
  }

  getAntVariantConfig(variant) {
    return getAntVariantConfig(variant);
  }

  foodDistanceFromNest(food) {
    if (!food) return 0;
    return food.distanceFromNest ?? distance2(food.x, food.z, this.nest.x, this.nest.z);
  }

  foodDistanceTier(distance) {
    if (!Number.isFinite(Number(distance))) return "near";
    if (distance <= FOOD_NEAR_DISTANCE) return "near";
    if (distance <= FOOD_MID_DISTANCE) return "mid";
    return "far";
  }

  foragingDistanceEfficiency(distance) {
    if (!Number.isFinite(Number(distance)) || distance <= FOOD_NEAR_DISTANCE) return 1;
    if (distance <= FOOD_MID_DISTANCE) {
      const t = (distance - FOOD_NEAR_DISTANCE) / Math.max(1, FOOD_MID_DISTANCE - FOOD_NEAR_DISTANCE);
      return 1 - t * 0.14;
    }
    const t = clamp((distance - FOOD_MID_DISTANCE) / Math.max(1, FOOD_FAR_DISTANCE - FOOD_MID_DISTANCE), 0, 1);
    const beyondPenalty = Math.max(0, distance - FOOD_FAR_DISTANCE) * 0.0008;
    return clamp(0.86 - t * 0.14 - beyondPenalty, FORAGING_FAR_MIN_EFFICIENCY, 0.86);
  }

  foodRespawnScaleForDistance(distance) {
    const tier = this.foodDistanceTier(distance);
    if (tier === "near") return 0.82;
    if (tier === "mid") return 1.02;
    return 1.22;
  }

  findContestedFoodForWorker(ant) {
    if (!ant || ant.isSortieSoldier || ant.role !== "worker" || ant.carrying > 0) return null;
    if (ant.id % WORKER_CONTESTED_FOOD_STRIDE !== 0) return null;
    const activityRadius = this.workerActivityRadius();
    if (activityRadius < FOOD_TERRITORY_DISTANCE) return null;
    let best = null;
    let bestScore = Infinity;
    for (const food of this.food) {
      if (!food.rivalForage || food.amount <= 0) continue;
      const sourceDistance = this.foodDistanceFromNest(food);
      if (sourceDistance > activityRadius - 6) continue;
      const score = sourceDistance + distance2(ant.x, ant.z, food.x, food.z) * 0.14;
      if (score < bestScore) {
        best = food;
        bestScore = score;
      }
    }
    return best;
  }

  rivalWorkerForageRadius(derived = this.derived) {
    const d = derived && Number.isFinite(Number(derived.activeAnts)) ? derived : this.computeDerived();
    const territory = Math.max(0, Number(this.colony.territory) || 0);
    const nestLevel = Math.max(1, Number(this.colony.nestLevel) || 1);
    const activeAnts = Math.max(0, Number(d.activeAnts ?? this.colony.antPopulation) || 0);
    return clamp(
      RIVAL_NEST_WORKER_FORAGE_BASE_RADIUS +
        territory * RIVAL_NEST_WORKER_FORAGE_TERRITORY_RADIUS +
        Math.max(0, activeAnts - 30) * RIVAL_NEST_WORKER_FORAGE_ACTIVITY_RADIUS +
        Math.max(0, nestLevel - 1) * RIVAL_NEST_WORKER_FORAGE_NEST_LEVEL_RADIUS,
      RIVAL_NEST_WORKER_FORAGE_BASE_RADIUS,
      RIVAL_NEST_WORKER_FORAGE_MAX_RADIUS,
    );
  }

  isRivalForageZone(x, z, padding = 0) {
    for (const food of this.food) {
      if (!food.rivalForage || food.amount <= 0) continue;
      if (distance2(x, z, food.x, food.z) <= food.radius + padding) return true;
    }
    return false;
  }

  foragingTerritoryCost() {
    return FORAGING_TERRITORY_BASE_COST + Math.max(0, Math.floor(this.colony.territory)) * FORAGING_TERRITORY_COST_STEP;
  }

  foragingTerritoryCreditForDelivery(sourceDistance, gained) {
    if (!Number.isFinite(Number(sourceDistance)) || sourceDistance < FOOD_TERRITORY_DISTANCE || gained <= 0) return 0;
    const reach = clamp((sourceDistance - FOOD_TERRITORY_DISTANCE) / Math.max(1, FOOD_FAR_DISTANCE - FOOD_TERRITORY_DISTANCE), 0, 1.4);
    return gained * (0.14 + reach * 0.16);
  }

  addForagingTerritoryProgress(sourceDistance, gained) {
    const credit = this.foragingTerritoryCreditForDelivery(sourceDistance, gained);
    if (credit <= 0) return;
    this.foragingTerritoryProgress += credit;
    let expanded = false;
    while (this.foragingTerritoryProgress >= this.foragingTerritoryCost()) {
      this.foragingTerritoryProgress -= this.foragingTerritoryCost();
      this.colony.territory = Math.floor(this.colony.territory) + 1;
      expanded = true;
    }
    if (!expanded) return;
    this.pushLog("遠方採餌で探索範囲が少し広がった");
    this.updateMapIntel();
    this.updateStats();
  }

  gainFood(amount, fromAnt = false, options = {}) {
    const sourceDistance = typeof options === "number" ? options : options?.sourceDistance;
    const distanceEfficiency = fromAnt ? this.foragingDistanceEfficiency(sourceDistance) : 1;
    const gained = fromAnt ? amount * (this.computeDerived().foragedFoodMultiplier ?? 1) * distanceEfficiency : amount;
    this.colony.food += gained;
    this.colony.lifetimeFood += gained;
    if (fromAnt) {
      this.collectedFood += gained;
      this.recordRecentForaging(gained);
      this.addForagingTerritoryProgress(sourceDistance, gained);
    }
  }

  recordRecentForaging(amount) {
    if (!Number.isFinite(Number(amount)) || amount <= 0) return;
    const time = this.simTime ?? 0;
    this.recentForagingSamples.push({ time, amount });
    this.recentForagingTotal += amount;
    this.trimRecentForaging(time);
  }

  trimRecentForaging(now = this.simTime ?? 0) {
    const cutoff = now - RECENT_FORAGING_WINDOW_SECONDS;
    while (this.recentForagingSamples.length > 0 && this.recentForagingSamples[0].time < cutoff) {
      const sample = this.recentForagingSamples.shift();
      this.recentForagingTotal -= sample?.amount ?? 0;
    }
    if (this.recentForagingTotal < 0.000001) this.recentForagingTotal = 0;
  }

  recentForagingPerMinute() {
    this.trimRecentForaging();
    return this.recentForagingTotal * (60 / RECENT_FORAGING_WINDOW_SECONDS);
  }

  saveColony() {
    if (!this.colony || this.raidSoonMode) return;
    this.syncEarthworksToColony();
    this.colony.lastSavedAt = Date.now();
    writeStorage(SAVE_KEY, serializeColonyState(this.colony));
  }

  applyOfflineProgress(now) {
    if (this.isGameEnded()) return;
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

  isGameEnded() {
    return this.colony?.gameStatus === "victory" || this.colony?.gameStatus === "defeat";
  }

  gameEndCopy(status = this.colony?.gameStatus) {
    if (status === "victory") {
      return {
        title: "勝利",
        detail: "敵巣を陥落させ、襲撃拠点を制圧しました。",
      };
    }
    if (status === "defeat") {
      return {
        title: "敗北",
        detail: "巣の耐久が尽き、女王が倒されました。",
      };
    }
    return { title: "", detail: "" };
  }

  applyGameStatusRuntimeState() {
    if (this.colony.gameStatus === "victory") {
      this.rivalNest.discovered = true;
      this.rivalNest.defeated = true;
      this.rivalNest.integrity = 0;
      this.mapIntelLogState.rivalNestDefeated = true;
      this.clearRaidRivals();
      this.clearRivalNestWorkers();
      this.clearRivalNestDefenders();
    } else if (this.colony.gameStatus === "defeat") {
      this.colony.nestDurability = 0;
    }
  }

  endGame(status) {
    if (status !== "victory" && status !== "defeat") return false;
    if (this.colony.gameStatus === status) return false;
    if (this.isGameEnded()) return false;
    this.colony.gameStatus = status;
    this.pendingConstructionKind = null;
    this.wallPlacementDraft = null;
    this.clearWallPlacementPreview();
    if (status === "victory") {
      this.rivalNest.discovered = true;
      this.rivalNest.defeated = true;
      this.rivalNest.integrity = 0;
      this.clearRaidRivals();
      this.clearRivalNestWorkers();
      this.clearRivalNestDefenders();
      this.recallSortieSoldiers("game-victory");
      this.pushLog("勝利: 敵巣を陥落させた");
      this.showRaidNotice("勝利: 敵巣を制圧しました", "repelled", 999999);
    } else {
      this.colony.nestDurability = 0;
      this.pushLog("敗北: 女王が倒された");
      this.showRaidNotice("敗北: 巣の耐久が尽き、女王が倒されました", "warning", 999999);
    }
    this.updateStats();
    this.saveColony();
    return true;
  }

  damagePlayerNest(amount) {
    if (this.isGameEnded()) return 0;
    const rawDurability = Number(this.colony.nestDurability);
    const before = clamp(Number.isFinite(rawDurability) ? rawDurability : PLAYER_NEST_MAX_DURABILITY, 0, PLAYER_NEST_MAX_DURABILITY);
    const damage = clamp(Number(amount) || 0, 0, before);
    this.colony.nestDurability = clamp(before - damage, 0, PLAYER_NEST_MAX_DURABILITY);
    return damage;
  }

  playerNestDurabilityRatio() {
    return clamp((Number(this.colony.nestDurability) || 0) / PLAYER_NEST_MAX_DURABILITY, 0, 1);
  }

  missingRequirements(upgrade, cost) {
    const missing = [];
    if (this.colony.food < cost) missing.push(`食料 ${fmt(cost - this.colony.food, 0)}`);
    if (upgrade.requires.ants && this.colony.antPopulation < upgrade.requires.ants) missing.push(`アリ ${upgrade.requires.ants}`);
    if (upgrade.requires.lifetimeFood && this.colony.lifetimeFood < upgrade.requires.lifetimeFood) missing.push(`累計食料 ${upgrade.requires.lifetimeFood}`);
    if (upgrade.requires.territory && this.colony.territory < upgrade.requires.territory) missing.push(`遠方採餌到達 ${upgrade.requires.territory}`);
    if (upgrade.requires.nestLevel && this.colony.nestLevel < upgrade.requires.nestLevel) missing.push(`巣Lv ${upgrade.requires.nestLevel}`);
    for (const [id, requiredLevel] of Object.entries(upgrade.requires.upgrades ?? {})) {
      if (upgradeLevel(this.colony.upgrades, id) < requiredLevel) missing.push(`${upgradeName(id)} Lv${requiredLevel}`);
    }
    return missing;
  }

  buyUpgrade(id) {
    if (this.isGameEnded()) return false;
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

  hasSortieSupportVariants() {
    return this.deployedSoldiers().some((ant) => ant.variant !== "soldier");
  }

  clearSquadAssignment(ant) {
    if (!ant) return;
    ant.squadId = null;
    ant.squadLeaderId = null;
    ant.squadSlot = -1;
    ant.squadAnchorX = null;
    ant.squadAnchorZ = null;
    ant.squadTargetId = null;
    ant.squadCohesion = 0;
    ant.squadColorHex = null;
  }

  assignBalancedSquadMembers(members, squadEntries) {
    const capacity = Math.max(0, CAPTAIN_SQUAD_SIZE - 1);
    const sortedMembers = [...members].sort((a, b) => (a.sortieIndex ?? a.id ?? 0) - (b.sortieIndex ?? b.id ?? 0));
    const orderedMembers = [];
    const used = new Set();
    for (const variant of SQUAD_MEMBER_VARIANT_ORDER) {
      for (const ant of sortedMembers) {
        if (used.has(ant) || ant.variant !== variant) continue;
        orderedMembers.push(ant);
        used.add(ant);
      }
    }
    for (const ant of sortedMembers) {
      if (!used.has(ant)) orderedMembers.push(ant);
    }

    for (const ant of orderedMembers) {
      const entry = squadEntries
        .filter((candidate) => candidate.members.length < capacity)
        .sort((a, b) => {
          const av = a.variantCounts.get(ant.variant) ?? 0;
          const bv = b.variantCounts.get(ant.variant) ?? 0;
          return av - bv || a.members.length - b.members.length || Math.abs(a.laneOffset) - Math.abs(b.laneOffset) || a.index - b.index;
        })[0];
      if (!entry) break;
      entry.members.push(ant);
      entry.variantCounts.set(ant.variant, (entry.variantCounts.get(ant.variant) ?? 0) + 1);
      entry.squad.memberVariantCounts[ant.variant] = (entry.squad.memberVariantCounts[ant.variant] ?? 0) + 1;
    }
  }

  formSortieSquads(sortieAnts, sortieTarget = null) {
    const captains = sortieAnts.filter((ant) => ant.variant === "captain");
    if (!captains.length) return [];
    const members = sortieAnts.filter((ant) => ant.variant !== "captain");
    const created = [];
    const squadEntries = [];
    for (const [leaderIndex, leader] of captains.entries()) {
      const squadId = this.nextSquadId++;
      const squadColorHex = squadColorForId(squadId);
      const laneOffset = leaderIndex - (captains.length - 1) / 2;
      const squad = {
        id: squadId,
        leaderId: leader.id,
        memberIds: [],
        objective: "intercept",
        targetRivalId: null,
        rallyX: sortieTarget?.x ?? leader.x,
        rallyZ: sortieTarget?.z ?? leader.z,
        cohesion: 0,
        colorHex: squadColorHex,
        laneOffset,
        memberVariantCounts: {},
      };
      leader.squadId = squad.id;
      leader.squadLeaderId = leader.id;
      leader.squadSlot = 0;
      leader.squadTargetId = null;
      leader.squadCohesion = 1;
      leader.squadColorHex = squadColorHex;
      this.squads.push(squad);
      created.push(squad);
      squadEntries.push({
        index: leaderIndex,
        laneOffset,
        leader,
        squad,
        members: [],
        variantCounts: new Map(),
      });
    }

    this.assignBalancedSquadMembers(members, squadEntries);

    for (const entry of squadEntries) {
      entry.squad.memberIds = entry.members.map((ant) => ant.id);
      for (const [index, ant] of entry.members.entries()) {
        const squad = entry.squad;
        ant.squadId = squad.id;
        ant.squadLeaderId = entry.leader.id;
        ant.squadSlot = index + 1;
        ant.squadTargetId = null;
        ant.squadCohesion = 0;
        ant.squadColorHex = squad.colorHex;
      }
    }
    return created;
  }

  squadForLeader(leader) {
    return this.squads.find((squad) => squad.leaderId === leader?.id) ?? null;
  }

  squadForAnt(ant) {
    if (!ant?.squadId) return null;
    return this.squads.find((squad) => squad.id === ant.squadId) ?? null;
  }

  getAntById(id) {
    return this.ants.find((ant) => ant.id === id) ?? null;
  }

  liveSquadTarget(squad) {
    if (!squad?.targetRivalId) return null;
    return this.rivalAnts.find((rival) =>
      rival.id === squad.targetRivalId &&
      !rival.defeated &&
      !rival.leftRaid &&
      rival.retreat <= 0 &&
      !rival.clash
    ) ?? null;
  }

  squadTargetCounts(exceptSquadId = null) {
    const counts = new Map();
    for (const squad of this.squads) {
      if (!squad?.targetRivalId || squad.id === exceptSquadId) continue;
      if (!this.liveSquadTarget(squad)) continue;
      counts.set(squad.targetRivalId, (counts.get(squad.targetRivalId) ?? 0) + 1);
    }
    return counts;
  }

  findSquadThreat(squad, leader, radius = SOLDIER_SORTIE_SEEK_RANGE) {
    if (!leader) return null;
    const assignedTargets = this.squadTargetCounts(squad?.id ?? null);
    const preferredRivalId = squad?.targetRivalId ?? leader.squadTargetId ?? null;
    let best = null;
    let bestScore = radius;
    for (const rival of this.rivalAnts) {
      if (rival.defeated || rival.leftRaid || rival.retreat > 0 || rival.clash) continue;
      const d = distance2(leader.x, leader.z, rival.x, rival.z);
      if (d >= radius) continue;
      const scoutBonus = rival.scoutMarkTimer > 0 ? clamp(rival.scoutMarkStrength ?? 0, 0, 1) * 28 : 0;
      const preferredBonus = preferredRivalId != null && rival.id === preferredRivalId ? SQUAD_TARGET_STICKINESS_BONUS : 0;
      const assignedPenalty = (assignedTargets.get(rival.id) ?? 0) * SQUAD_TARGET_ASSIGNMENT_PENALTY;
      const score = d - scoutBonus - preferredBonus + assignedPenalty;
      if (score < bestScore) {
        best = rival;
        bestScore = score;
      }
    }
    return best;
  }

  spreadSquadTarget(squad, leader, target, threat = null) {
    if (!squad || !target) return target;
    const laneOffset = squad.laneOffset ?? 0;
    if (!laneOffset) return target;
    let baseX = target.x - this.nest.x;
    let baseZ = target.z - this.nest.z;
    if (Math.hypot(baseX, baseZ) < 0.001) {
      baseX = leader?.x - this.nest.x || 1;
      baseZ = leader?.z - this.nest.z || 0;
    }
    const len = Math.hypot(baseX, baseZ) || 1;
    const sideX = baseZ / len;
    const sideZ = -baseX / len;
    const spacing = threat ? SQUAD_THREAT_SPACING : SQUAD_RALLY_SPACING;
    return {
      ...target,
      x: target.x + sideX * laneOffset * spacing,
      z: target.z + sideZ * laneOffset * spacing,
      exactX: target.x,
      exactZ: target.z,
    };
  }

  commandSquad(leader, target, threat = null) {
    const squad = this.squadForLeader(leader);
    if (!squad || !leader || !target) return;
    const rallyTarget = this.spreadSquadTarget(squad, leader, target, threat);
    squad.targetRivalId = threat?.id ?? squad.targetRivalId ?? null;
    squad.rallyX = rallyTarget.x;
    squad.rallyZ = rallyTarget.z;
    squad.objective = threat ? "markedTarget" : "intercept";
    leader.squadTargetId = squad.targetRivalId;
    leader.squadColorHex = squad.colorHex;
    leader.commandPulse = 1;
    if (leader.commandEffectCooldown <= 0) {
      this.addCaptainCommandEffect(leader.x, leader.z, squad.memberIds.length + 1, squad.cohesion, squad.colorHex);
      leader.commandEffectCooldown = 0.5;
    }
  }

  updateSquads(dt) {
    if (!this.squads.length) return;
    const nextSquads = [];
    for (const squad of this.squads) {
      const leader = this.getAntById(squad.leaderId);
      if (!leader || !leader.isSortieSoldier || leader.variant !== "captain" || leader.state === "return" || leader.state === "flee") {
        for (const id of [squad.leaderId, ...squad.memberIds]) this.clearSquadAssignment(this.getAntById(id));
        continue;
      }

      const previousMemberIds = [...squad.memberIds];
      const members = squad.memberIds
        .map((id) => this.getAntById(id))
        .filter((ant) => ant && ant.isSortieSoldier && ant.state !== "return" && ant.state !== "flee");
      squad.memberIds = members.map((ant) => ant.id);
      const activeMemberIds = new Set(squad.memberIds);
      for (const id of previousMemberIds) {
        if (!activeMemberIds.has(id)) this.clearSquadAssignment(this.getAntById(id));
      }
      leader.squadColorHex = squad.colorHex;
      const threat = this.findSquadThreat(squad, leader, SOLDIER_SORTIE_SEEK_RANGE);
      const target = threat ?? this.currentSortieTarget(leader.x, leader.z, leader.sortieMode) ?? { x: squad.rallyX, z: squad.rallyZ, kind: "rally" };
      const rallyTarget = this.spreadSquadTarget(squad, leader, target, threat);
      squad.targetRivalId = threat?.id ?? null;
      squad.rallyX = rallyTarget.x;
      squad.rallyZ = rallyTarget.z;

      const tx = rallyTarget.x - leader.x;
      const tz = rallyTarget.z - leader.z;
      const len = Math.hypot(tx, tz) || 1;
      const fx = tx / len;
      const fz = tz / len;
      const sx = fz;
      const sz = -fx;
      let cohesionTotal = 1;
      let cohesionCount = 1;
      for (const [index, ant] of members.entries()) {
        const lane = Math.floor(index / 2);
        const side = index % 2 === 0 ? -1 : 1;
        const sideOffset = side * (1.85 + lane * 0.82);
        const roleOffset =
          ant.variant === "shieldHead" ? 4.25 :
          ant.variant === "heavySoldier" ? 2.45 :
          ant.variant === "acidShooter" ? -3.65 :
          ant.variant === "scout" ? 1.65 :
          ant.variant === "medic" ? -5.2 :
          lane % 2 === 0 ? 0.75 : -1.35;
        ant.squadAnchorX = leader.x + fx * roleOffset + sx * sideOffset;
        ant.squadAnchorZ = leader.z + fz * roleOffset + sz * sideOffset;
        ant.squadTargetId = squad.targetRivalId;
        ant.squadColorHex = squad.colorHex;
        ant.sortieTargetX = rallyTarget.x;
        ant.sortieTargetZ = rallyTarget.z;
        const d = distance2(ant.x, ant.z, ant.squadAnchorX, ant.squadAnchorZ);
        ant.squadCohesion = clamp(1 - d / Math.max(1, CAPTAIN_COHESION_RADIUS), 0, 1);
        cohesionTotal += ant.squadCohesion;
        cohesionCount += 1;
      }
      squad.cohesion = clamp(cohesionTotal / Math.max(1, cohesionCount), 0, 1);
      leader.squadCohesion = squad.cohesion;
      leader.squadTargetId = squad.targetRivalId;
      nextSquads.push(squad);
    }
    this.squads = nextSquads;
  }

  applySquadSteering(ant, steering) {
    if (!ant?.isSortieSoldier || !ant.squadId || ant.squadAnchorX == null || ant.squadAnchorZ == null) return false;
    if (ant.state === "clash" || ant.state === "return" || ant.state === "flee") return false;
    const d = distance2(ant.x, ant.z, ant.squadAnchorX, ant.squadAnchorZ) || 1;
    if (d <= 1.35) return false;
    const roleFactor =
      ant.variant === "shieldHead" ? 0.84 :
      ant.variant === "acidShooter" ? 1.04 :
      ant.variant === "scout" ? 1.46 :
      ant.variant === "medic" ? 1.18 :
      ant.variant === "heavySoldier" ? 1.08 :
      1.14;
    const pressure = clamp((d - 1.35) / Math.max(1, CAPTAIN_COHESION_RADIUS * 0.72), 0.34, 2.35) * roleFactor;
    steering.x += ((ant.squadAnchorX - ant.x) / d) * pressure;
    steering.z += ((ant.squadAnchorZ - ant.z) / d) * pressure;
    if (d > CAPTAIN_COHESION_RADIUS && !ant.lastTacticalAction?.startsWith?.("acid") && !ant.lastTacticalAction?.startsWith?.("scout") && !ant.lastTacticalAction?.startsWith?.("medic")) {
      ant.lastTacticalAction = "squadRally";
    }
    return true;
  }

  sortieSoldierPool(derived = this.computeDerived()) {
    return Math.max(0, Math.floor((derived.normalSoldiers ?? 0) + (derived.heavySoldiers ?? 0) + (derived.shieldHeads ?? 0) + (derived.acidShooters ?? 0) + (derived.scouts ?? 0) + (derived.medics ?? 0) + (derived.captains ?? 0)));
  }

  sortieSoldierLimit(derived = this.computeDerived()) {
    const total = this.sortieSoldierPool(derived);
    return total > 0 ? Math.max(1, Math.ceil(total / 2)) : 0;
  }

  availableSortieSoldiers() {
    if (this.isGameEnded()) return 0;
    const d = this.computeDerived();
    const deployed = this.deployedSoldierCount();
    const healthyCombatSoldiers = Math.floor(Math.min(this.sortieSoldierPool(d), Math.max(0, d.activeAnts - 1)));
    const remainingInNest = Math.max(0, healthyCombatSoldiers - deployed);
    return Math.max(0, Math.min(remainingInNest, this.sortieSoldierLimit(d)));
  }

  sortiePlanCapacities(derived = this.computeDerived()) {
    return {
      heavy: Math.max(0, Math.floor((derived.heavySoldiers ?? 0) - this.deployedSoldierCountByVariant("heavySoldier"))),
      shield: Math.max(0, Math.floor((derived.shieldHeads ?? 0) - this.deployedSoldierCountByVariant("shieldHead"))),
      acid: Math.max(0, Math.floor((derived.acidShooters ?? 0) - this.deployedSoldierCountByVariant("acidShooter"))),
      scout: Math.max(0, Math.floor((derived.scouts ?? 0) - this.deployedSoldierCountByVariant("scout"))),
      medic: Math.max(0, Math.floor((derived.medics ?? 0) - this.deployedSoldierCountByVariant("medic"))),
      captain: Math.max(0, Math.floor((derived.captains ?? 0) - this.deployedSoldierCountByVariant("captain"))),
      normal: Math.max(0, Math.floor((derived.normalSoldiers ?? 0) - this.deployedSoldierCountByVariant("soldier"))),
    };
  }

  emptySortieComposition() {
    return { heavy: 0, shield: 0, captain: 0, acid: 0, scout: 0, medic: 0, normal: 0, total: 0 };
  }

  sortieComposition(count = this.availableSortieSoldiers()) {
    const desired = Math.max(0, Math.floor(count));
    const capacities = this.sortiePlanCapacities();
    const composition = this.emptySortieComposition();
    let remaining = desired;
    while (remaining > 0) {
      let assignedThisRound = false;
      for (const key of SORTIE_BALANCED_PLAN_KEYS) {
        if (remaining <= 0) break;
        if ((composition[key] ?? 0) >= (capacities[key] ?? 0)) continue;
        composition[key] += 1;
        composition.total += 1;
        remaining -= 1;
        assignedThisRound = true;
      }
      if (!assignedThisRound) break;
    }
    return composition;
  }

  sortieVariantSequence(composition) {
    const remaining = {};
    for (const key of SORTIE_PLAN_KEYS) remaining[key] = Math.max(0, Math.floor(composition[key] ?? 0));
    const variants = [];
    const targetCount = Math.max(0, Math.floor(composition.total ?? 0));
    while (variants.length < targetCount) {
      let assignedThisRound = false;
      for (const key of SORTIE_BALANCED_PLAN_KEYS) {
        if (variants.length >= targetCount) break;
        if ((remaining[key] ?? 0) <= 0) continue;
        variants.push(SORTIE_VARIANT_BY_PLAN_KEY[key] ?? "soldier");
        remaining[key] -= 1;
        assignedThisRound = true;
      }
      if (!assignedThisRound) break;
    }
    return variants;
  }

  normalizeSortiePlan(plan = this.manualSortiePlan) {
    if (!plan) return this.emptySortieComposition();
    const capacities = this.sortiePlanCapacities();
    const normalized = this.emptySortieComposition();
    let total = 0;
    for (const key of SORTIE_PLAN_KEYS) {
      const value = Math.max(0, Math.min(Math.floor(plan[key] ?? 0), capacities[key] ?? 0));
      normalized[key] = value;
      total += value;
    }
    const limit = this.availableSortieSoldiers();
    let overflow = Math.max(0, total - limit);
    for (const key of [...SORTIE_PLAN_KEYS].reverse()) {
      if (overflow <= 0) break;
      const removed = Math.min(normalized[key] ?? 0, overflow);
      normalized[key] -= removed;
      overflow -= removed;
      total -= removed;
    }
    normalized.total = total;
    return normalized;
  }

  plannedSortieComposition() {
    if (this.manualSortiePlan) return this.normalizeSortiePlan(this.manualSortiePlan);
    return this.sortieComposition(this.availableSortieSoldiers());
  }

  plannedSortieCount() {
    return Math.max(0, Math.floor(this.plannedSortieComposition().total));
  }

  changeSortiePlan(compositionKey, delta) {
    if (this.isGameEnded()) return false;
    if (!SORTIE_PLAN_KEYS.includes(compositionKey)) return false;
    const current = this.manualSortiePlan ? this.normalizeSortiePlan(this.manualSortiePlan) : this.plannedSortieComposition();
    const next = {};
    for (const key of SORTIE_PLAN_KEYS) next[key] = Math.max(0, Math.floor(current[key] ?? 0));
    const capacities = this.sortiePlanCapacities();
    const total = SORTIE_PLAN_KEYS.reduce((sum, key) => sum + (next[key] ?? 0), 0);
    const limit = this.availableSortieSoldiers();
    if (delta > 0) {
      if (total >= limit || next[compositionKey] >= (capacities[compositionKey] ?? 0)) return false;
      next[compositionKey] += 1;
    } else if (delta < 0) {
      if ((next[compositionKey] ?? 0) <= 0) return false;
      next[compositionKey] -= 1;
    } else {
      return false;
    }
    this.manualSortiePlan = next;
    this.updateStats();
    return true;
  }

  normalizeSortieMode(mode = this.selectedSortieMode) {
    return mode === "recon" ? "recon" : mode === "expedition" ? "expedition" : mode === "defense" ? "defense" : "auto";
  }

  canStartExpeditionSortie() {
    return !this.isGameEnded() && this.isRivalNestKnown() && !this.rivalNest.defeated;
  }

  reconScouts() {
    return this.deployedSoldiers().filter((ant) => ant.variant === "scout" && ant.sortieMode === "recon");
  }

  availableReconScouts(derived = this.computeDerived()) {
    const scouts = Math.max(0, Math.floor(derived.scouts ?? 0));
    return Math.max(0, scouts - this.deployedSoldierCountByVariant("scout"));
  }

  plannedReconScoutCount(derived = this.computeDerived()) {
    const available = this.availableReconScouts(derived);
    if (available <= 0) return 0;
    const waveLimit = this.sortieSoldierLimit(derived);
    return Math.max(0, Math.min(available, RECON_SORTIE_MAX_SCOUTS, waveLimit));
  }

  canStartReconSortie(derived = this.computeDerived()) {
    if (this.isGameEnded()) return false;
    if (!this.rivalNest || this.rivalNest.defeated || this.isRivalNestKnown()) return false;
    if (this.soldierSortieCooldown > 0) return false;
    return this.plannedReconScoutCount(derived) > 0;
  }

  reconSearchTargetForAnt(ant) {
    if (!ant) return null;
    if (this.isRivalNestKnown() || this.rivalNest?.defeated) return null;
    const activityRadius = this.workerActivityRadius();
    const currentTargetValid =
      ant.reconTargetX != null &&
      ant.reconTargetZ != null &&
      distance2(ant.x, ant.z, ant.reconTargetX, ant.reconTargetZ) > RECON_SEARCH_REACHED_RADIUS &&
      distance2(ant.reconTargetX, ant.reconTargetZ, this.nest.x, this.nest.z) > activityRadius + RECON_SEARCH_REACHED_RADIUS &&
      !this.isPointExplored(ant.reconTargetX, ant.reconTargetZ, 4);
    if (currentTargetValid) return { x: ant.reconTargetX, z: ant.reconTargetZ, kind: "recon-search" };

    const nestDistance = this.rivalNestDistanceFromColony();
    const baseRadius = Math.max(activityRadius, this.currentNestVisionRadius());
    const scoutSlot = ((ant.sortieIndex ?? 0) - (this.reconScouts().length - 1) / 2) * 0.26;
    let best = null;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const index = (ant.reconWaypointIndex ?? 0) + attempt + this.reconSweepIndex;
      const searchAngle = Math.atan2(this.rivalNest.z - this.nest.z, this.rivalNest.x - this.nest.x);
      const sweep = Math.sin(index * 1.73 + (ant.id ?? 1) * 0.41) * 0.88;
      const angle = searchAngle + sweep + scoutSlot;
      const radius = clamp(
        baseRadius + RECON_SEARCH_MIN_STEP + index * RECON_SEARCH_STEP,
        Math.min(this.worldRadius - 18, baseRadius + RECON_SEARCH_MIN_STEP),
        Math.min(this.worldRadius - 12, Math.max(baseRadius + RECON_SEARCH_MIN_STEP, nestDistance + 18)),
      );
      const point = this.clampPointToWorld({
        x: this.nest.x + Math.cos(angle) * radius,
        z: this.nest.z + Math.sin(angle) * radius,
      }, 8);
      const explored = this.isPointExplored(point.x, point.z, 6);
      const distanceFromNest = distance2(point.x, point.z, this.nest.x, this.nest.z);
      const beyondActivity = distanceFromNest > activityRadius + 8;
      const score =
        (beyondActivity ? 90 : -120) +
        (explored ? -80 : 40) +
        Math.max(0, distanceFromNest - baseRadius) * 0.12 -
        Math.abs(distanceFromNest - Math.min(nestDistance, radius)) * 0.04 -
        distance2(point.x, point.z, ant.x, ant.z) * 0.006;
      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }
    ant.reconWaypointIndex = (ant.reconWaypointIndex ?? 0) + 1;
    this.reconSweepIndex = (this.reconSweepIndex + 1) % 97;
    if (!best) return null;
    ant.reconTargetX = best.x;
    ant.reconTargetZ = best.z;
    return { x: best.x, z: best.z, kind: "recon-search" };
  }

  currentSortieTarget(x = this.nest.x, z = this.nest.z, mode = "auto") {
    if (this.isGameEnded()) return null;
    const sortieMode = this.normalizeSortieMode(mode);
    const threat = this.findRivalThreat(x, z, SOLDIER_SORTIE_SEEK_RANGE, null, { localSightRange: 0 });
    if (threat) return { x: threat.x, z: threat.z, kind: "rival" };
    if (sortieMode === "recon") return null;
    if (sortieMode === "expedition") {
      return this.canStartExpeditionSortie() ? { x: this.rivalNest.x, z: this.rivalNest.z, kind: "rival-nest" } : null;
    }
    const raid = this.ensureRaidState();
    if (raid.phase === "warning" && !this.hasRaidDirectionIntel()) return null;
    if (raid.phase === "warning" || raid.phase === "active" || raid.phase === "retreating") {
      return { ...this.raidSignalPoint(raid, 0.78), kind: "raid-signal" };
    }
    if (sortieMode === "defense") return null;
    if (this.isRivalNestKnown() && !this.rivalNest.defeated) {
      return { x: this.rivalNest.x, z: this.rivalNest.z, kind: "rival-nest" };
    }
    return null;
  }

  updateRivalNestAssault(dt) {
    const nest = this.rivalNest;
    if (this.isGameEnded()) return;
    if (!nest || !this.isRivalNestKnown() || nest.defeated || dt <= 0) return;
    const attackers = this.deployedSoldiers().filter((ant) =>
      this.shouldRenderAnt(ant) &&
      ant.state !== "return" &&
      ant.state !== "flee" &&
      ant.state !== "clash" &&
      !ant.clashRival &&
      ant.stun <= 0 &&
      distance2(ant.x, ant.z, nest.x, nest.z) <= nest.radius + RIVAL_NEST_ASSAULT_RADIUS,
    );
    if (attackers.length <= 0) {
      nest.underAttackTimer = Math.max(0, (nest.underAttackTimer ?? 0) - dt * 0.6);
      return;
    }

    const pressure = attackers.reduce((sum, ant) => {
      const config = ant.variantConfig ?? getAntVariantConfig(ant.variant);
      const rolePressure =
        ant.variant === "heavySoldier" ? 1.55 :
        ant.variant === "acidShooter" ? 1.35 :
        ant.variant === "captain" ? 1.2 :
        ant.variant === "shieldHead" ? 0.85 :
        ant.variant === "scout" ? 0.48 :
        1;
      return sum + rolePressure + (config.attack ?? 0) * 0.42 + (config.contact ?? 0) * 0.24;
    }, 0);
    nest.underAttackTimer = (nest.underAttackTimer ?? 0) + dt * pressure;
    nest.integrity = clamp((nest.integrity ?? 1) - dt * pressure * 0.0048, 0, 1);
    nest.attackPulseTimer = Math.max(0, (nest.attackPulseTimer ?? 0) - dt);
    if (nest.attackPulseTimer <= 0) {
      this.addTrail(nest.x, nest.z, "alarm", 0.65);
      this.addCombatEffect(nest.x, nest.z, 1.0 + Math.min(1, pressure * 0.12), Math.min(3, attackers.length), this.raidApproachAngle());
      nest.attackPulseTimer = 1.1;
    }
    for (const ant of attackers) {
      ant.sortieTimer = Math.max(ant.sortieTimer, 4);
      ant.energy = clamp(ant.energy - dt * 0.012, 0, 1);
      ant.lastTacticalAction = "rivalNestAssault";
      ant.angle = Math.atan2(nest.x - ant.x, nest.z - ant.z);
    }
    this.updateRivalNestVisual();
    if (nest.integrity > 0) return;

    nest.defeated = true;
    nest.discovered = true;
    this.colony.enemyThreat = Math.max(0, this.colony.enemyThreat - 8);
    this.clearRaidRivals();
    this.clearRivalNestWorkers();
    this.clearRivalNestDefenders();
    this.recallSortieSoldiers("rival-nest-defeated");
    if (!this.mapIntelLogState.rivalNestDefeated) {
      this.pushLog("敵巣陥落: 敵アリの襲撃拠点を崩した");
      this.showRaidNotice("敵巣陥落: 襲撃拠点を制圧", "repelled");
      this.mapIntelLogState.rivalNestDefeated = true;
    }
    this.endGame("victory");
    this.updateStats();
  }

  raidFormationPointForAnt(ant, raid = this.ensureRaidState()) {
    const angle = raid.approachAngle ?? 0;
    const forwardX = Math.cos(angle);
    const forwardZ = Math.sin(angle);
    const flankX = -forwardZ;
    const flankZ = forwardX;
    const soldiers = this.deployedSoldiers().sort((a, b) => (a.sortieIndex ?? 0) - (b.sortieIndex ?? 0));
    const count = Math.max(1, soldiers.length || this.plannedSortieCount());
    const index = Math.max(0, soldiers.indexOf(ant));
    const centered = index - (count - 1) / 2;
    const spacing = ant?.variant === "heavySoldier" ? 3.8 : 4.8;
    const maxOffset = Math.min(18, 3.2 + count * 2.6);
    const offset = clamp(centered * spacing, -maxOffset, maxOffset);
    const depth = this.nest.radius + (ant?.variant === "heavySoldier" ? 18.5 : 22.5);
    return {
      x: this.nest.x + forwardX * depth + flankX * offset,
      z: this.nest.z + forwardZ * depth + flankZ * offset,
      kind: "raid-formation",
    };
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

  startReconSortie() {
    if (this.isGameEnded()) return false;
    const derived = this.computeDerived();
    const count = this.plannedReconScoutCount(derived);
    this.selectedSortieMode = "recon";
    if (this.rivalNest?.defeated) {
      this.pushLog("偵察不要: 敵巣は陥落済み");
      this.updateStats();
      return false;
    }
    if (this.isRivalNestKnown()) {
      this.pushLog("偵察不要: 敵巣は発見済み");
      this.updateStats();
      return false;
    }
    if (this.soldierSortieCooldown > 0 || count < 1) {
      this.pushLog(count < 1 ? "偵察不可: 巣内に斥候アリがいない" : "偵察不可: 再出撃の準備中");
      this.updateStats();
      return false;
    }

    this.makeRoomForSortie(count);
    const sortieAnts = [];
    for (let i = 0; i < count; i += 1) {
      const ant = new Ant3D(this.nextAntId++, this);
      const entrance = this.nestEntrances?.[i % Math.max(1, this.nestEntrances.length)];
      const baseAngle = entrance?.userData?.angle ?? ((i / count) * Math.PI * 2);
      const radius = this.nest.radius * 0.58 + (i % 3) * 0.55;
      ant.role = "guard";
      ant.setVariant("scout");
      ant.isSortieSoldier = true;
      ant.sortieMode = "recon";
      ant.sortieTimer = RECON_SORTIE_SECONDS;
      ant.sortieIndex = i;
      ant.reconTargetX = null;
      ant.reconTargetZ = null;
      ant.reconWaypointIndex = i;
      ant.traits.curiosity = clamp(Math.max(ant.traits.curiosity, 0.9) + 0.04, 0, 1);
      ant.traits.caution = clamp(Math.max(ant.traits.caution, 0.78) + 0.06, 0, 1);
      ant.traits.persistence = clamp(Math.max(ant.traits.persistence, 0.66) + 0.06, 0, 1);
      ant.energy = 1;
      ant.stamina = 1;
      ant.carrying = 0;
      ant.foodSourceId = null;
      ant.state = "explore";
      ant.currentTask = "sortie";
      ant.lastTacticalAction = "reconDepart";
      ant.x = this.nest.x + Math.cos(baseAngle) * radius;
      ant.z = this.nest.z + Math.sin(baseAngle) * radius;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.angle = baseAngle;
      this.ants.push(ant);
      sortieAnts.push(ant);
      this.antRenderer?.assignRenderIndex(ant);
    }
    for (const ant of sortieAnts) {
      const target = this.reconSearchTargetForAnt(ant);
      if (target) {
        ant.sortieTargetX = target.x;
        ant.sortieTargetZ = target.z;
        ant.angle = Math.atan2(target.x - ant.x, target.z - ant.z);
        ant.prevAngle = ant.angle;
      }
    }

    this.soldierSortieCooldown = SOLDIER_SORTIE_COOLDOWN_SECONDS;
    this.pushLog(`偵察出動: 斥候${count}匹が未発見エリアへ`);
    this.updateStats();
    this.saveColony();
    return true;
  }

  startSoldierSortie(mode = this.selectedSortieMode) {
    if (this.isGameEnded()) return false;
    const sortieMode = this.normalizeSortieMode(mode) === "expedition" ? "expedition" : "defense";
    this.selectedSortieMode = sortieMode;
    if (this.soldierSortieCooldown > 0) return false;
    if (sortieMode === "expedition" && !this.canStartExpeditionSortie()) {
      this.pushLog(this.rivalNest.defeated ? "遠征出動不可: 敵巣は陥落済み" : "遠征出動不可: 敵巣が未発見");
      this.updateStats();
      return false;
    }
    const composition = this.plannedSortieComposition();
    const count = composition.total;
    if (count < 1) {
      this.pushLog("出撃できる兵隊がいない");
      this.updateStats();
      return false;
    }

    this.makeRoomForSortie(count);
    const sortieTarget = this.currentSortieTarget(this.nest.x, this.nest.z, sortieMode);
    const targetAngle = sortieTarget ? Math.atan2(sortieTarget.z - this.nest.z, sortieTarget.x - this.nest.x) : null;
    const variants = this.sortieVariantSequence(composition);
    const sortieAnts = [];
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
      ant.sortieMode = sortieMode;
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
      sortieAnts.push(ant);
      this.antRenderer?.assignRenderIndex(ant);
    }
    this.formSortieSquads(sortieAnts, sortieTarget);

    this.soldierSortieCooldown = SOLDIER_SORTIE_COOLDOWN_SECONDS;
    const heavyText = composition.heavy > 0 ? ` / 重兵装${composition.heavy}匹` : "";
    const raid = this.ensureRaidState();
    const formationText = sortieMode === "expedition"
      ? " / 敵巣攻撃"
      : raid.phase === "warning" && this.hasRaidDirectionIntel()
      ? ` / ${this.sentryMoundCount() > 0 ? "見張り塚" : "偵察情報"}の方角へ布陣`
      : "";
    const shieldText = composition.shield > 0 ? ` / 盾頭${composition.shield}匹` : "";
    const captainText = composition.captain > 0 ? ` / 小隊長${composition.captain}匹` : "";
    const acidText = composition.acid > 0 ? ` / 酸射${composition.acid}匹` : "";
    const scoutText = composition.scout > 0 ? ` / 斥候${composition.scout}匹` : "";
    const medicText = composition.medic > 0 ? ` / 救護${composition.medic}匹` : "";
    const sortiePurpose = sortieMode === "expedition" ? "敵巣へ遠征" : "巣口から防衛へ";
    this.pushLog(`兵隊出撃: ${count}匹${heavyText}${shieldText}${captainText}${acidText}${scoutText}${medicText}が${sortiePurpose}${formationText}`);
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

  upgradeUi(upgrade) {
    const branch = UPGRADE_BRANCH_UI[upgrade.branch] ?? { label: upgrade.branch, icon: "枝", summary: "" };
    const branchIconAsset = BRANCH_ICON_ASSETS[upgrade.branch] ?? UI_ICON_ASSETS.growthLeaf;
    return {
      branch: { ...branch, iconAsset: branchIconAsset },
      name: UPGRADE_UI[upgrade.id]?.name ?? upgrade.name,
      effect: UPGRADE_UI[upgrade.id]?.effect ?? upgrade.effect,
      reason: UPGRADE_UI[upgrade.id]?.reason ?? upgrade.desc,
      icon: UPGRADE_UI[upgrade.id]?.icon ?? branch.icon,
      iconAsset: UPGRADE_ICON_ASSETS[upgrade.id] ?? branchIconAsset,
      priority: UPGRADE_UI[upgrade.id]?.priority ?? 0,
    };
  }

  readableMissingRequirements(upgrade, cost) {
    const missing = [];
    if (this.colony.food < cost) missing.push(`食料 ${fmt(cost - this.colony.food, 0)}不足`);
    if (upgrade.requires.ants && this.colony.antPopulation < upgrade.requires.ants) missing.push(`アリ ${fmt(upgrade.requires.ants, 0)}匹`);
    if (upgrade.requires.lifetimeFood && this.colony.lifetimeFood < upgrade.requires.lifetimeFood) missing.push(`累計食料 ${fmt(upgrade.requires.lifetimeFood, 0)}`);
    if (upgrade.requires.territory && this.colony.territory < upgrade.requires.territory) missing.push(`遠方採餌到達 ${fmt(upgrade.requires.territory, 0)}`);
    if (upgrade.requires.nestLevel && this.colony.nestLevel < upgrade.requires.nestLevel) missing.push(`巣Lv ${fmt(upgrade.requires.nestLevel, 0)}`);
    for (const [id, requiredLevel] of Object.entries(upgrade.requires.upgrades ?? {})) {
      const required = UPGRADE_UI[id]?.name ?? upgradeName(id);
      if (upgradeLevel(this.colony.upgrades, id) < requiredLevel) missing.push(`${required} Lv${requiredLevel}`);
    }
    return missing;
  }

  growthBranchStats() {
    return UPGRADE_BRANCHES.map((branch) => {
      const upgrades = UPGRADE_DEFS.filter((upgrade) => upgrade.branch === branch.id);
      const levels = upgrades.reduce((sum, upgrade) => sum + upgradeLevel(this.colony.upgrades, upgrade.id), 0);
      const max = upgrades.reduce((sum, upgrade) => sum + upgrade.max, 0);
      const available = upgrades.filter((upgrade) => {
        const level = upgradeLevel(this.colony.upgrades, upgrade.id);
        if (level >= upgrade.max) return false;
        const cost = upgradeCost(upgrade, level);
        return this.readableMissingRequirements(upgrade, cost).length === 0;
      }).length;
      return {
        id: branch.id,
        label: UPGRADE_BRANCH_UI[branch.id]?.label ?? branch.name,
        summary: UPGRADE_BRANCH_UI[branch.id]?.summary ?? "",
        iconAsset: BRANCH_ICON_ASSETS[branch.id] ?? UI_ICON_ASSETS.growthLeaf,
        levels,
        max,
        available,
      };
    });
  }

  growthRecommendations(limit = 3) {
    return UPGRADE_DEFS.map((upgrade) => {
      const level = upgradeLevel(this.colony.upgrades, upgrade.id);
      const complete = level >= upgrade.max;
      const cost = complete ? 0 : upgradeCost(upgrade, level);
      const missing = complete ? [] : this.readableMissingRequirements(upgrade, cost);
      const uiDef = this.upgradeUi(upgrade);
      const score =
        (missing.length === 0 ? 1000 : 0) +
        uiDef.priority * 20 +
        (upgrade.max - level) * 4 -
        Math.min(180, cost * 0.04) -
        missing.length * 24;
      return { upgrade, uiDef, level, complete, cost, missing, available: !complete && missing.length === 0, score };
    })
      .filter((item) => !item.complete)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  renderLevelPips(level, max) {
    return Array.from({ length: max }, (_, index) => `<span class="${index < level ? "is-filled" : ""}"></span>`).join("");
  }

  renderGrowthFocus() {
    const gameEnded = this.isGameEnded();
    const recommendations = this.growthRecommendations(3);
    const branchStats = this.growthBranchStats();
    const activeBranch = recommendations[0]?.upgrade.branch ?? branchStats[0]?.id;
    const chips = branchStats.map((branch) => {
      const progress = branch.max > 0 ? Math.round((branch.levels / branch.max) * 100) : 0;
      const available = branch.available > 0 ? ` / 強化可 ${fmt(branch.available, 0)}` : "";
      return `
        <div class="growth-branch-chip ${branch.id === activeBranch ? "is-active" : ""}">
          ${this.iconImage(branch.iconAsset, "branch-chip-icon")}
          <strong>${branch.label}</strong>
          <span>${fmt(progress, 0)}%${available}</span>
        </div>
      `;
    }).join("");
    const cards = recommendations.map((item) => {
      const buttonText = item.available ? "強化" : "条件";
      const disabled = item.available && !gameEnded ? "" : "disabled";
      const meta = item.available ? `食料 ${fmt(item.cost, 0)}` : item.missing.slice(0, 2).join(" / ");
      return `
        <article class="growth-recommend-card">
          <div class="growth-recommend-icon">${this.iconImage(item.uiDef.iconAsset, "generated-ui-icon", item.uiDef.icon)}</div>
          <div class="growth-recommend-body">
            <div class="growth-recommend-heading">
              <strong>${item.uiDef.name} Lv${item.level}/${item.upgrade.max}</strong>
              <span class="growth-recommend-badge">${item.uiDef.branch.label}</span>
            </div>
            <p>${item.uiDef.effect}</p>
            <p>${item.available ? item.uiDef.reason : `不足: ${meta}`}</p>
          </div>
          <div class="growth-recommend-action">
            <span class="growth-recommend-cost">${meta || "最大"}</span>
            <button type="button" data-upgrade="${item.upgrade.id}" ${disabled}>${buttonText}</button>
          </div>
        </article>
      `;
    }).join("");

    return `
      <section class="growth-focus" aria-label="次に効く成長">
        <div class="growth-focus-header">
          <div class="growth-focus-title">
            <span class="growth-focus-mark">${this.iconImage(UI_ICON_ASSETS.growthLeaf, "generated-ui-icon", "成長")}</span>
            <div>
              <strong>次に効く成長</strong>
              <span>条件を満たした強化から優先表示</span>
            </div>
          </div>
        </div>
        <div class="growth-branch-progress">${chips}</div>
        <div class="growth-recommend-title">おすすめ3件</div>
        <div class="growth-recommend-list">${cards}</div>
        <button class="growth-full-link" type="button" data-next-action="growth">全ツリーを見る</button>
      </section>
      <div class="upgrade-tree-label">全ツリー</div>
    `;
  }

  renderUpgrades() {
    if (this.shouldPreserveTouchedButton(ui.upgradeList)) return;
    const gameEnded = this.isGameEnded();
    const focus = this.renderGrowthFocus();
    const tree = UPGRADE_BRANCHES.map((branch) => {
      const branchUi = UPGRADE_BRANCH_UI[branch.id] ?? { label: branch.name, summary: "" };
      const cards = UPGRADE_DEFS.filter((upgrade) => upgrade.branch === branch.id).map((upgrade) => {
        const uiDef = this.upgradeUi(upgrade);
        const level = upgradeLevel(this.colony.upgrades, upgrade.id);
        const complete = level >= upgrade.max;
        const cost = complete ? 0 : upgradeCost(upgrade, level);
        const missing = complete ? [] : this.readableMissingRequirements(upgrade, cost);
        const disabled = complete || missing.length > 0 || gameEnded ? "disabled" : "";
        const locked = missing.length > 0 ? "is-locked" : "";
        const meta = complete ? "最大Lv" : missing.length ? `不足: ${missing.slice(0, 2).join(" / ")}` : `食料 ${fmt(cost, 0)}`;
        const buttonText = complete ? "最大" : missing.length ? "条件" : "強化";
        return `
          <article class="upgrade-card ${locked}" data-branch="${branch.id}">
            <div class="upgrade-card-head">
              <span class="upgrade-card-icon">${this.iconImage(uiDef.iconAsset, "generated-ui-icon", uiDef.icon)}</span>
              <strong>${uiDef.name} Lv${level}/${upgrade.max}</strong>
            </div>
            <div class="upgrade-level-pips">${this.renderLevelPips(level, upgrade.max)}</div>
            <p>${uiDef.reason}</p>
            <div class="upgrade-effect">${uiDef.effect}</div>
            <div class="upgrade-meta">${meta}</div>
            <button type="button" data-upgrade="${upgrade.id}" ${disabled}>${buttonText}</button>
          </article>
        `;
      }).join("");
      return `<div class="upgrade-branch"><strong>${branchUi.label}</strong><span>${branchUi.summary}</span></div>${cards}`;
    }).join("");
    ui.upgradeList.innerHTML = focus + tree;
  }

  renderLegacyUpgrades() {
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

  getViewportSize() {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width ?? window.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight));
    const left = Math.round(viewport?.offsetLeft ?? 0);
    const top = Math.round(viewport?.offsetTop ?? 0);
    document.documentElement.style.setProperty("--app-viewport-width", `${width}px`);
    document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);
    document.documentElement.style.setProperty("--app-viewport-left", `${left}px`);
    document.documentElement.style.setProperty("--app-viewport-top", `${top}px`);
    return { width, height };
  }

  resize() {
    const { width, height } = this.getViewportSize();
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

  clampCameraTarget(x = this.cameraTarget.x, z = this.cameraTarget.z) {
    const limit = Math.max(24, this.worldRadius - CAMERA_TARGET_PADDING);
    const distance = Math.hypot(x, z);
    if (distance > limit) {
      const scale = limit / distance;
      x *= scale;
      z *= scale;
    }
    return { x, z };
  }

  setCameraTarget(x, z, immediate = false) {
    const target = this.clampCameraTarget(x, z);
    this.cameraTarget.set(target.x, 0, target.z);
    if (immediate) this.cameraRenderTarget.copy(this.cameraTarget);
  }

  moveCameraTarget(dx, dz) {
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
    if (Math.abs(dx) + Math.abs(dz) <= 0.001) return false;
    this.setCameraTarget(this.cameraTarget.x + dx, this.cameraTarget.z + dz);
    return true;
  }

  focusCameraOnNest() {
    this.cameraTarget.set(this.nest.x, 0, this.nest.z);
  }

  panCameraBetweenScreenPoints(fromX, fromY, toX, toY) {
    const from = this.screenToGround(fromX, fromY);
    const to = this.screenToGround(toX, toY);
    if (!from || !to) return false;
    return this.moveCameraTarget(from.x - to.x, from.z - to.z);
  }

  isCameraPanPointer(event) {
    return event.button === 1 || event.button === 2 || event.shiftKey || (event.buttons & 2) !== 0 || (event.buttons & 4) !== 0;
  }

  isCameraKey(event) {
    return event.code === "KeyW" || event.code === "KeyA" || event.code === "KeyS" || event.code === "KeyD" ||
      event.code === "ArrowUp" || event.code === "ArrowLeft" || event.code === "ArrowDown" || event.code === "ArrowRight";
  }

  shouldIgnoreCameraKey(event) {
    const target = event.target;
    return target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLButtonElement ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey;
  }

  onKeyDown(event) {
    if (!this.isCameraKey(event) || this.shouldIgnoreCameraKey(event)) return;
    event.preventDefault();
    this.cameraPanKeys.add(event.code);
  }

  onKeyUp(event) {
    if (!this.isCameraKey(event)) return;
    event.preventDefault();
    this.cameraPanKeys.delete(event.code);
  }

  updateCameraKeyboardPan(dt) {
    if (!this.cameraPanKeys.size || dt <= 0) return;
    const right =
      (this.cameraPanKeys.has("KeyD") || this.cameraPanKeys.has("ArrowRight") ? 1 : 0) -
      (this.cameraPanKeys.has("KeyA") || this.cameraPanKeys.has("ArrowLeft") ? 1 : 0);
    const forward =
      (this.cameraPanKeys.has("KeyW") || this.cameraPanKeys.has("ArrowUp") ? 1 : 0) -
      (this.cameraPanKeys.has("KeyS") || this.cameraPanKeys.has("ArrowDown") ? 1 : 0);
    if (right === 0 && forward === 0) return;
    const length = Math.hypot(right, forward) || 1;
    const yaw = this.cameraYaw;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const speed = CAMERA_KEY_PAN_SPEED * (this.cameraDistance / CAMERA_DISTANCE_DESKTOP) * dt / length;
    this.moveCameraTarget((rightX * right + forwardX * forward) * speed, (rightZ * right + forwardZ * forward) * speed);
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

    this.updateCameraKeyboardPan(frameDelta);
    const alpha = this.paused ? 1 : clamp(this.frameAccumulator / FIXED_DT, 0, 1);
    this.renderGame(alpha);
  }

  updateGame(dt) {
    if (this.isGameEnded()) {
      this.raidNotice.timer = Math.max(this.raidNotice.timer, 1);
      this.lastUiUpdate += dt;
      if (this.lastUiUpdate > 0.15) {
        this.updateStats();
        this.lastUiUpdate = 0;
      }
      return;
    }
    this.simTime += dt;
    this.trimRecentForaging();
    this.updateColony(dt);
    this.updateMapIntel();
    this.updateRaid(dt);
    this.updateSoldierSorties(dt);
    this.updateSquads(dt);
    this.raidNotice.timer = Math.max(0, this.raidNotice.timer - dt);
    this.updateFoodRespawns(dt);

    for (const patch of this.water) {
      patch.age += dt;
      if (!patch.permanent) patch.power = Math.max(0.08, patch.power - dt * 0.014);
      patch.group.scale.setScalar(1 + Math.sin(patch.age * 2.5) * 0.015);
      if (patch.ring) {
        patch.ring.material.opacity = Math.max(0.1, patch.power * 0.44);
        patch.ring.scale.setScalar(1 + (patch.age % 1) * 0.05);
      }
    }
    this.water = this.water.filter((patch) => {
      if (patch.permanent) return true;
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
    this.updateRivalNestDefense(dt);
    for (const rival of this.rivalAnts) rival.update(dt, this);
    this.updateExploredPatches(dt);
    this.updateRivalNestAssault(dt);
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
    this.updateMapVisibility();
    const renderAnts = this.renderAntBuffer;
    renderAnts.length = 0;
    for (const ant of this.ants) {
      if (this.shouldRenderAnt(ant)) renderAnts.push(ant);
    }
    for (const rival of this.rivalAnts) {
      if (this.shouldRenderRival(rival)) renderAnts.push(rival);
    }
    this.antRenderer.render(renderAnts, this, alpha);
    this.squadRingSystem.render(renderAnts, this, alpha);
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
    window.visualViewport?.removeEventListener("resize", this.boundResize);
    window.visualViewport?.removeEventListener("scroll", this.boundResize);
    window.removeEventListener("pagehide", this.boundPageHide);
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    if (this.boundPanelToggle) ui.panelToggle?.removeEventListener("click", this.boundPanelToggle);
    if (this.boundButtonFeedback) document.removeEventListener("click", this.boundButtonFeedback, true);
    if (this.boundButtonTouchStart) document.removeEventListener("touchstart", this.boundButtonTouchStart, true);
    if (this.boundButtonTouchMove) document.removeEventListener("touchmove", this.boundButtonTouchMove, true);
    if (this.boundButtonTouchEnd) document.removeEventListener("touchend", this.boundButtonTouchEnd, true);
    if (this.boundButtonTouchCancel) document.removeEventListener("touchcancel", this.boundButtonTouchCancel, true);
    if (this.boundButtonPointerCancel) document.removeEventListener("pointercancel", this.boundButtonPointerCancel, true);
    if (this.boundButtonClickSuppression) document.removeEventListener("click", this.boundButtonClickSuppression, true);
    this.clearBranchPreview();
    this.clearWallPlacementPreview();
    this.antRenderer?.destroy();
    this.squadRingSystem?.destroy();
    this.roleLabelSystem?.destroy();
    for (const list of [this.water, this.stones, this.food, this.branches, this.trails, this.buildTasks, this.earthworks, this.combatEffects, this.predators, this.rivalCorpses, this.colonyCorpses]) {
      for (const item of list) this.disposeDynamicItem(item);
    }
    this.exploredMaskTexture?.dispose();
    this.assetService.dispose();
    for (const geometry of this.sharedGeometries) geometry.dispose();
    for (const material of this.sharedMaterials) disposeMaterial(material);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.renderer = null;
    if (window.__ANT_SIM === this) window.__ANT_SIM = null;
  }

  pointerTapSlop(pointerType) {
    return POINTER_TAP_SLOP_BY_TYPE[pointerType] ?? POINTER_TAP_SLOP_BY_TYPE.mouse;
  }

  pointerMovedPastTapSlop(event) {
    if (!this.pointerStart) return this.dragMoved;
    const dx = event.clientX - this.pointerStart.screenX;
    const dy = event.clientY - this.pointerStart.screenY;
    return Math.hypot(dx, dy) > (this.pointerStart.tapSlop ?? this.pointerTapSlop(event.pointerType));
  }

  releasePointerCapture(pointerId) {
    try {
      if (this.renderer.domElement.hasPointerCapture?.(pointerId)) this.renderer.domElement.releasePointerCapture(pointerId);
    } catch {
      // Synthetic events in tests may not own a real pointer capture.
    }
  }

  clearPointerGestureIfIdle() {
    if (this.pointerMap.size < 2) {
      this.pinchStart = null;
      this.pinchLastCenter = null;
    }
    if (this.pointerMap.size === 0) {
      this.pointerStart = null;
      this.activePointerId = null;
      this.multiPointerGesture = false;
      this.dragMoved = false;
    }
  }

  visionEdgeHitSlop(pointerType = "mouse") {
    return pointerType === "touch" ? MAP_VISION_EDGE_TOUCH_SLOP : MAP_VISION_EDGE_MOUSE_SLOP;
  }

  isVisionEdgeDragHit(point, pointerType = "mouse") {
    if (!point || this.pendingConstructionKind || this.isGameEnded()) return false;
    const radius = this.mapVisionRadiusValue || this.currentMapVisionRadius();
    const d = distance2(point.x, point.z, this.nest.x, this.nest.z);
    return Math.abs(d - radius) <= this.visionEdgeHitSlop(pointerType);
  }

  setManualMapVisionRadiusFromPoint(point, options = {}) {
    if (!point) return this.mapVisionRadiusValue;
    const radius = distance2(point.x, point.z, this.nest.x, this.nest.z);
    return this.setManualMapVisionRadius(radius, options);
  }

  onPointerDown(event) {
    event.preventDefault();
    try {
      this.renderer.domElement.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events in tests may not own a real pointer capture.
    }
    const pointerType = event.pointerType || "mouse";
    this.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType });
    if (this.pointerMap.size >= 2) {
      this.multiPointerGesture = true;
      this.dragMoved = true;
      const points = [...this.pointerMap.values()].slice(0, 2);
      const center = {
        x: (points[0].x + points[1].x) * 0.5,
        y: (points[0].y + points[1].y) * 0.5,
      };
      this.pinchStart = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        cameraDistance: this.targetCameraDistance,
      };
      this.pinchLastCenter = center;
      return;
    }

    this.activePointerId = event.pointerId;
    this.multiPointerGesture = false;
    this.dragMoved = false;
    const point = this.screenToGround(event.clientX, event.clientY);
    if (!point) return;
    const isVisionResize = !this.isCameraPanPointer(event) && this.isVisionEdgeDragHit(point, pointerType);
    this.pointerStart = {
      screenX: event.clientX,
      screenY: event.clientY,
      mode: isVisionResize ? "vision-resize" : this.isCameraPanPointer(event) ? "pan" : "rotate",
      pointerType,
      tapSlop: this.pointerTapSlop(pointerType),
      ...point,
    };
    if (this.pendingConstructionKind === "earthWall" && !this.wallPlacementDraft) this.wallPlacementDraft = { points: [], hover: null };
  }

  onPointerMove(event) {
    const previous = this.pointerMap.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    this.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: previous.pointerType ?? event.pointerType ?? "mouse" });

    if (this.pointerMap.size >= 2 && this.pinchStart) {
      this.multiPointerGesture = true;
      this.dragMoved = true;
      const points = [...this.pointerMap.values()].slice(0, 2);
      const current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      this.targetCameraDistance = clamp(this.pinchStart.cameraDistance * (this.pinchStart.distance / (current || 1)), CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
      const center = {
        x: (points[0].x + points[1].x) * 0.5,
        y: (points[0].y + points[1].y) * 0.5,
      };
      if (this.pinchLastCenter) this.panCameraBetweenScreenPoints(this.pinchLastCenter.x, this.pinchLastCenter.y, center.x, center.y);
      this.pinchLastCenter = center;
      return;
    }

    if (this.multiPointerGesture || event.pointerId !== this.activePointerId || !this.pointerStart) return;

    const movedPastTapSlop = this.pointerMovedPastTapSlop(event);
    if (!this.dragMoved && movedPastTapSlop) this.dragMoved = true;
    if (!this.dragMoved) return;

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;

    if (this.pointerStart.mode === "pan") {
      this.panCameraBetweenScreenPoints(previous.x, previous.y, event.clientX, event.clientY);
      return;
    }

    if (this.pointerStart.mode === "vision-resize") {
      const point = this.screenToGround(event.clientX, event.clientY);
      if (point) this.setManualMapVisionRadiusFromPoint(point, { persist: false, refresh: true });
      return;
    }

    if (this.pendingConstructionKind === "earthWall") {
      const point = this.screenToGround(event.clientX, event.clientY);
      if (point) {
        if (!this.wallPlacementDraft) this.wallPlacementDraft = { points: [], hover: null };
        this.wallPlacementDraft.hover = this.snapWallPlacementPoint(point);
        this.updateWallPlacementPreview();
      }
      return;
    }
    if (this.isPointPlacementConstruction(this.pendingConstructionKind)) {
      const point = this.screenToGround(event.clientX, event.clientY);
      if (point) this.updateConstructionPlacementPreview(point);
      return;
    }

    this.targetCameraYaw -= dx * 0.006;
    this.targetCameraPitch = clamp(this.targetCameraPitch + dy * 0.004, 0.62, 1.28);
  }

  onPointerUp(event) {
    event.preventDefault();
    const isActivePointer = event.pointerId === this.activePointerId;
    const wasMultiPointerGesture = this.multiPointerGesture || this.pointerMap.size > 1;
    const movedPastTapSlop = isActivePointer ? this.pointerMovedPastTapSlop(event) : true;
    const wasVisionResize = isActivePointer && this.pointerStart?.mode === "vision-resize";
    if (wasVisionResize && (this.dragMoved || movedPastTapSlop)) {
      const resizePoint = this.screenToGround(event.clientX, event.clientY);
      if (resizePoint) this.setManualMapVisionRadiusFromPoint(resizePoint, { persist: true, refresh: true });
      else this.persistManualMapVisionRadius();
    }
    const shouldHandleTap = isActivePointer && !wasVisionResize && !wasMultiPointerGesture && !this.dragMoved && !movedPastTapSlop;
    const point = shouldHandleTap ? this.screenToGround(event.clientX, event.clientY) : null;
    if (point && this.pendingConstructionKind === "earthWall") {
      this.addWallPlacementVertex(point);
    } else if (point && this.pendingConstructionKind) {
      this.confirmConstructionPlacement(point, null, this.pendingConstructionKind);
    } else if (point) {
      this.selectNearestAnt(point.x, point.z);
    }
    this.pointerMap.delete(event.pointerId);
    this.releasePointerCapture(event.pointerId);
    this.clearPointerGestureIfIdle();
  }

  onPointerCancel(event) {
    event.preventDefault();
    this.pointerMap.delete(event.pointerId);
    if (event.pointerId === this.activePointerId) {
      if (this.pointerStart?.mode === "vision-resize") this.persistManualMapVisionRadius();
      this.pointerStart = null;
      this.activePointerId = null;
    }
    this.releasePointerCapture(event.pointerId);
    this.clearPointerGestureIfIdle();
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
    this.seedPermanentWater();
    const naturalFoods = [
      { x: -238, z: -104, amount: 10, radius: 3.1, crumbs: 10, material: this.materials.foodFruit, kind: "fruit" },
      { x: -178, z: -184, amount: 12, radius: 3.6, crumbs: 12, material: this.materials.foodSeed, kind: "seed" },
      { x: -210, z: -82, amount: 9, radius: 2.9, crumbs: 9, material: this.materials.foodLeaf, kind: "leaf" },
      { x: -92, z: -134, amount: 14, radius: 3.8, crumbs: 12, material: this.materials.foodSeed, kind: "seed" },
      { x: -24, z: -220, amount: 15, radius: 4.1, crumbs: 14, material: this.materials.foodFruit, kind: "fruit" },
      { x: -74, z: -52, amount: 14, radius: 4.0, crumbs: 14, material: this.materials.foodLeaf, kind: "leaf" },
      { x: -20, z: -18, amount: 16, radius: 4.3, crumbs: 15, material: this.materials.foodSeed, kind: "seed" },
      { x: 12, z: 8, amount: 18, radius: 4.5, crumbs: 16, material: this.materials.foodFruit, kind: "fruit", rivalForage: true },
      { x: -8, z: 66, amount: 17, radius: 4.4, crumbs: 15, material: this.materials.foodLeaf, kind: "leaf", rivalForage: true },
      { x: 92, z: 132, amount: 22, radius: 4.8, crumbs: 17, material: this.materials.foodFruit, kind: "fruit", rivalForage: true },
      { x: 206, z: 78, amount: 22, radius: 4.9, crumbs: 17, material: this.materials.foodSeed, kind: "seed", rivalForage: true },
      { x: 218, z: -154, amount: 19, radius: 4.6, crumbs: 16, material: this.materials.foodLeaf, kind: "leaf" },
    ];
    this.foodSpawnSites = naturalFoods.map((food, index) => ({
      ...food,
      id: `natural-food-${index + 1}`,
      homeX: food.x,
      homeZ: food.z,
      distanceFromNest: distance2(food.x, food.z, this.nest.x, this.nest.z),
      distanceTier: this.foodDistanceTier(distance2(food.x, food.z, this.nest.x, this.nest.z)),
      activeFoodId: null,
      respawnTimer: 0,
      lastX: food.x,
      lastZ: food.z,
    }));
    for (const site of this.foodSpawnSites) this.respawnFoodAtSite(site, true);
    this.seedNaturalObstacles();
    this.seedReferenceNaturalDetails();
  }

  seedNaturalObstacles() {
    const stones = [
      { x: -236, z: -86, radius: 2.6, scaleY: 0.42, rotation: -0.3, pebbles: 2 },
      { x: -212, z: -132, radius: 1.8, scaleY: 0.4, rotation: 0.7, pebbles: 1 },
      { x: -192, z: -186, radius: 3.2, scaleY: 0.46, rotation: 1.1, scaleX: 1.18, pebbles: 3 },
      { x: -122, z: -206, radius: 2.2, scaleY: 0.42, rotation: -1.7, pebbles: 1 },
      { x: -150, z: 104, radius: 2.8, scaleY: 0.44, rotation: -1.2, pebbles: 2 },
      { x: -186, z: 122, radius: 3.1, scaleY: 0.48, rotation: 0.6, scaleZ: 0.72, pebbles: 3 },
      { x: -220, z: 90, radius: 2.4, scaleY: 0.42, rotation: 2.2, pebbles: 2 },
      { x: -226, z: 152, radius: 2.1, scaleY: 0.4, rotation: -0.8, pebbles: 1 },
      { x: -174, z: 62, radius: 2.2, scaleY: 0.4, rotation: 1.6, pebbles: 2 },
      { x: -115, z: -18, radius: 3.4, scaleY: 0.5, rotation: 1.7, pebbles: 3 },
      { x: -74, z: -48, radius: 2.5, scaleY: 0.44, rotation: -0.8, pebbles: 1 },
      { x: -42, z: 18, radius: 1.9, scaleY: 0.38, rotation: 1.3, pebbles: 1 },
      { x: 36, z: 18, radius: 2.8, scaleY: 0.46, rotation: 0.2, pebbles: 2 },
      { x: 52, z: -64, radius: 3.0, scaleY: 0.46, rotation: -0.4, pebbles: 3 },
      { x: 78, z: -16, radius: 2.1, scaleY: 0.4, rotation: 2.1, pebbles: 2 },
      { x: 118, z: -10, radius: 3.7, scaleY: 0.5, rotation: 1.3, scaleX: 0.96, scaleZ: 1.08, pebbles: 4 },
      { x: 134, z: -82, radius: 2.7, scaleY: 0.44, rotation: 2.5, pebbles: 2 },
      { x: 72, z: -118, radius: 2.5, scaleY: 0.42, rotation: -1.9, pebbles: 2 },
      { x: 42, z: -126, radius: 2.2, scaleY: 0.39, rotation: 0.2, pebbles: 2 },
      { x: 178, z: -116, radius: 2.8, scaleY: 0.43, rotation: 1.1, pebbles: 2 },
      { x: 205, z: -80, radius: 2.6, scaleY: 0.44, rotation: -2.2, pebbles: 2 },
      { x: 198, z: -36, radius: 2.4, scaleY: 0.41, rotation: -0.4, pebbles: 1 },
      { x: 142, z: 40, radius: 2.9, scaleY: 0.42, rotation: -1.0, pebbles: 2 },
      { x: 156, z: -168, radius: 3.4, scaleY: 0.5, rotation: 0.4, pebbles: 3 },
      { x: 192, z: -72, radius: 2.6, scaleY: 0.45, rotation: -1.6, pebbles: 2 },
      { x: 218, z: -32, radius: 3.1, scaleY: 0.46, rotation: 0.8, pebbles: 3 },
      { x: 104, z: -196, radius: 3.8, scaleY: 0.52, rotation: -0.2, scaleX: 1.2, pebbles: 4 },
      { x: 146, z: -214, radius: 2.2, scaleY: 0.4, rotation: 1.8, pebbles: 1 },
      { x: 148, z: 84, radius: 2.7, scaleY: 0.44, rotation: 1.8, pebbles: 2 },
      { x: 174, z: 132, radius: 3.2, scaleY: 0.48, rotation: -0.5, pebbles: 3 },
      { x: 208, z: 92, radius: 2.5, scaleY: 0.44, rotation: 2.7, pebbles: 2 },
      { x: 222, z: 118, radius: 3.0, scaleY: 0.45, rotation: -2.0, pebbles: 3 },
      { x: 206, z: 176, radius: 2.4, scaleY: 0.42, rotation: 0.4, pebbles: 2 },
      { x: 244, z: 154, radius: 2.0, scaleY: 0.38, rotation: -1.2, pebbles: 1 },
      { x: -48, z: 148, radius: 2.9, scaleY: 0.43, rotation: 0.9, pebbles: 2 },
      { x: 26, z: 138, radius: 2.5, scaleY: 0.42, rotation: -0.7, pebbles: 2 },
      { x: 62, z: 106, radius: 2.2, scaleY: 0.4, rotation: 1.4, pebbles: 1 },
      { x: -98, z: 168, radius: 2.6, scaleY: 0.44, rotation: -2.4, pebbles: 2 },
    ];
    for (const stone of stones) this.addNaturalStone(stone);
  }

  addGroundDetailDecal(config) {
    const blob = createIrregularBlobGeometry(`detail-${config.kind}-${config.x}-${config.z}-${config.rx}-${config.rz}`, config.segments ?? 48, {
      roughness: config.roughness ?? 0.26,
      minRadius: config.minRadius ?? 0.64,
      maxRadius: config.maxRadius ?? 1.32,
      uvScale: config.uvScale ?? 2.45,
    });
    const mesh = new THREE.Mesh(blob.geometry, config.material);
    mesh.name = `natural-detail-${config.kind}`;
    mesh.rotation.set(-Math.PI / 2, 0, config.rotation ?? 0);
    mesh.position.set(config.x, config.y ?? 0.012, config.z);
    mesh.scale.set(config.rx, config.rz, 1);
    mesh.renderOrder = config.renderOrder ?? 3;
    this.scene.add(mesh);
    this.dynamicObjects.add(mesh);
    this.naturalDetails.push({ kind: config.kind, mesh });
    if (config.statsKey) this.naturalDetailStats[config.statsKey] = (this.naturalDetailStats[config.statsKey] ?? 0) + 1;
    return mesh;
  }

  addInstancedNaturalDetail(kind, geometry, material, placements) {
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = `natural-detail-${kind}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = kind === "grass" ? 12 : 8;
    const dummy = new THREE.Object3D();
    placements.forEach((item, index) => {
      dummy.position.set(item.x, item.y ?? 0.08, item.z);
      dummy.rotation.set(item.rotationX ?? -Math.PI / 2, item.rotationY ?? 0, item.rotationZ ?? 0);
      dummy.scale.set(item.scaleX ?? item.scale ?? 1, item.scaleY ?? item.scale ?? 1, item.scaleZ ?? item.scale ?? 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this.dynamicObjects.add(mesh);
    this.naturalDetails.push({ kind, mesh });
    return mesh;
  }

  scatterClusteredPlacements(seedKey, clusters, mapper) {
    const rng = seededRandom(hashSeed(seedKey));
    const placements = [];
    for (const cluster of clusters) {
      for (let i = 0; i < cluster.count; i += 1) {
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng());
        const localX = Math.cos(angle) * radius * cluster.rx;
        const localZ = Math.sin(angle) * radius * cluster.rz;
        const rotation = cluster.rotation ?? 0;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const x = cluster.x + localX * cos - localZ * sin;
        const z = cluster.z + localX * sin + localZ * cos;
        if (Math.hypot(x, z) > this.worldRadius - 8) continue;
        placements.push(mapper({ x, z, rng, cluster, index: i }));
      }
    }
    return placements;
  }

  seedReferenceNaturalDetails() {
    const wetEdges = [
      { kind: "wetEdge", statsKey: "wetEdgeDecals", x: 118, z: -78, rx: 108, rz: 78, rotation: -0.24, material: this.materials.terrainWetEdge, y: 0.018, renderOrder: 6 },
      { kind: "wetEdge", statsKey: "wetEdgeDecals", x: 86, z: -34, rx: 42, rz: 30, rotation: 0.34, material: this.materials.terrainWetEdge, y: 0.019, renderOrder: 6 },
      { kind: "wetEdge", statsKey: "wetEdgeDecals", x: -200, z: 132, rx: 48, rz: 35, rotation: 0.12, material: this.materials.terrainWetEdge, y: 0.019, renderOrder: 6 },
      { kind: "wetEdge", statsKey: "wetEdgeDecals", x: -170, z: 50, rx: 46, rz: 34, rotation: -0.28, material: this.materials.terrainWetEdge, y: 0.019, renderOrder: 6 },
      { kind: "wetEdge", statsKey: "wetEdgeDecals", x: -238, z: -42, rx: 34, rz: 22, rotation: -0.48, material: this.materials.terrainWetEdge, y: 0.016, renderOrder: 6 },
      { kind: "wetEdge", statsKey: "wetEdgeDecals", x: -92, z: 92, rx: 36, rz: 24, rotation: 0.42, material: this.materials.terrainWetEdge, y: 0.016, renderOrder: 6 },
      { kind: "wetEdge", statsKey: "wetEdgeDecals", x: 18, z: -16, rx: 42, rz: 26, rotation: -0.16, material: this.materials.terrainWetEdge, y: 0.016, renderOrder: 6 },
      { kind: "wetEdge", statsKey: "wetEdgeDecals", x: 204, z: 64, rx: 36, rz: 23, rotation: 0.58, material: this.materials.terrainWetEdge, y: 0.016, renderOrder: 6 },
    ];
    const mossDecals = [
      { kind: "mossMat", statsKey: "mossDecals", x: -150, z: -76, rx: 76, rz: 48, rotation: -0.2, material: this.materials.terrainMossWetland, y: 0.014 },
      { kind: "mossMat", statsKey: "mossDecals", x: -42, z: -54, rx: 78, rz: 44, rotation: -0.36, material: this.materials.terrainMossWetland, y: 0.014 },
      { kind: "mossMat", statsKey: "mossDecals", x: 42, z: 30, rx: 86, rz: 48, rotation: 0.26, material: this.materials.terrainMossWetland, y: 0.014 },
      { kind: "mossMat", statsKey: "mossDecals", x: 154, z: 30, rx: 74, rz: 42, rotation: -0.52, material: this.materials.terrainMossWetland, y: 0.014 },
      { kind: "mossMat", statsKey: "mossDecals", x: -120, z: 124, rx: 88, rz: 54, rotation: 0.18, material: this.materials.terrainMossWetland, y: 0.014 },
      { kind: "mossMat", statsKey: "mossDecals", x: -218, z: 42, rx: 48, rz: 32, rotation: 0.4, material: this.materials.terrainMossWetland, y: 0.014 },
    ];
    const crackDecals = [
      { kind: "crackedMud", statsKey: "crackDecals", x: -218, z: -132, rx: 66, rz: 48, rotation: 0.18, material: this.materials.terrainCrackedMud, y: 0.017, renderOrder: 5 },
      { kind: "crackedMud", statsKey: "crackDecals", x: -118, z: -172, rx: 58, rz: 38, rotation: -0.28, material: this.materials.terrainCrackedMud, y: 0.017, renderOrder: 5 },
      { kind: "crackedMud", statsKey: "crackDecals", x: -44, z: 160, rx: 66, rz: 36, rotation: -0.12, material: this.materials.terrainCrackedMud, y: 0.017, renderOrder: 5 },
      { kind: "crackedMud", statsKey: "crackDecals", x: 36, z: -168, rx: 56, rz: 34, rotation: -0.18, material: this.materials.terrainCrackedMud, y: 0.017, renderOrder: 5 },
      { kind: "crackedMud", statsKey: "crackDecals", x: 210, z: 166, rx: 52, rz: 36, rotation: 0.22, material: this.materials.terrainCrackedMud, y: 0.017, renderOrder: 5 },
    ];
    const gravelDecals = [
      { kind: "gravelFan", statsKey: "gravelDecals", x: 172, z: 112, rx: 72, rz: 40, rotation: 0.4, material: this.materials.terrainMicroGravel, y: 0.015 },
      { kind: "gravelFan", statsKey: "gravelDecals", x: 214, z: 144, rx: 62, rz: 34, rotation: -0.4, material: this.materials.terrainMicroGravel, y: 0.015 },
      { kind: "gravelFan", statsKey: "gravelDecals", x: 106, z: 88, rx: 64, rz: 32, rotation: 0.08, material: this.materials.terrainMicroGravel, y: 0.015 },
      { kind: "gravelFan", statsKey: "gravelDecals", x: -86, z: 24, rx: 58, rz: 32, rotation: -0.18, material: this.materials.terrainMicroGravel, y: 0.015 },
      { kind: "gravelFan", statsKey: "gravelDecals", x: 168, z: -116, rx: 74, rz: 36, rotation: -0.28, material: this.materials.terrainMicroGravel, y: 0.015 },
      { kind: "gravelFan", statsKey: "gravelDecals", x: -224, z: 82, rx: 44, rz: 28, rotation: 0.52, material: this.materials.terrainMicroGravel, y: 0.015 },
    ];
    for (const decal of [...wetEdges, ...mossDecals, ...crackDecals, ...gravelDecals]) this.addGroundDetailDecal(decal);

    const grassPlacements = this.scatterClusteredPlacements("reference-grass-clumps", [
      { x: -226, z: -56, rx: 34, rz: 26, count: 8, rotation: -0.4 },
      { x: -166, z: 52, rx: 52, rz: 32, count: 10, rotation: -0.1 },
      { x: -118, z: 128, rx: 70, rz: 34, count: 12, rotation: 0.18 },
      { x: 18, z: 28, rx: 64, rz: 34, count: 10, rotation: 0.28 },
      { x: 112, z: -40, rx: 88, rz: 40, count: 14, rotation: -0.22 },
      { x: 174, z: 68, rx: 70, rz: 34, count: 10, rotation: 0.3 },
      { x: 214, z: 144, rx: 48, rz: 30, count: 7, rotation: -0.36 },
      { x: -46, z: -104, rx: 58, rz: 30, count: 8, rotation: -0.42 },
    ], ({ x, z, rng }) => {
      const scale = 4.2 + rng() * 4.8;
      return { x, z, y: 0.075 + rng() * 0.02, rotationZ: rng() * Math.PI * 2, scaleX: scale * (0.8 + rng() * 0.45), scaleY: scale * (0.72 + rng() * 0.38), scaleZ: 1 };
    });
    this.addInstancedNaturalDetail("grass", this.geometries.detailPlane, this.materials.grassTuft, grassPlacements);
    this.naturalDetailStats.grassClumps = grassPlacements.length;

    const pebblePlacements = this.scatterClusteredPlacements("reference-micro-pebbles", [
      { x: 170, z: 114, rx: 78, rz: 44, count: 82, rotation: 0.42 },
      { x: 218, z: 152, rx: 54, rz: 32, count: 48, rotation: -0.24 },
      { x: 104, z: 84, rx: 82, rz: 34, count: 54, rotation: -0.08 },
      { x: 122, z: -78, rx: 98, rz: 64, count: 54, rotation: -0.22 },
      { x: -84, z: 28, rx: 58, rz: 34, count: 32, rotation: -0.18 },
      { x: -210, z: 122, rx: 56, rz: 36, count: 28, rotation: 0.2 },
      { x: -210, z: -118, rx: 66, rz: 42, count: 32, rotation: 0.34 },
    ], ({ x, z, rng }) => {
      const radius = 0.16 + rng() * 0.48;
      return {
        x,
        z,
        y: radius * 0.16,
        rotationX: rng() * 0.5,
        rotationY: rng() * Math.PI * 2,
        rotationZ: rng() * 0.5,
        scaleX: radius * (0.85 + rng() * 0.6),
        scaleY: radius * (0.24 + rng() * 0.22),
        scaleZ: radius * (0.78 + rng() * 0.46),
      };
    });
    this.addInstancedNaturalDetail("microPebble", this.geometries.soilPebble, this.materials.microPebble, pebblePlacements);
    this.naturalDetailStats.microPebbles = pebblePlacements.length;
  }

  ensureRaidState() {
    this.colony.raidState = normalizeRaidState(this.colony.raidState);
    return this.colony.raidState;
  }

  raidRivals() {
    return this.rivalAnts.filter((rival) => rival.isRaidRival);
  }

  rivalNestWorkers() {
    return this.rivalAnts.filter((rival) => rival.isRivalWorker);
  }

  rivalNestDefenders() {
    return this.rivalAnts.filter((rival) => rival.isRivalNestDefender);
  }

  activeExpeditionAttackers() {
    return this.deployedSoldiers().filter((ant) =>
      ant.sortieMode === "expedition" &&
      this.shouldRenderAnt(ant) &&
      ant.state !== "return" &&
      ant.state !== "flee",
    );
  }

  expeditionSortiePresence() {
    return this.deployedSoldiers().filter((ant) =>
      ant.sortieMode === "expedition" &&
      this.shouldRenderAnt(ant) &&
      ant.state !== "return",
    );
  }

  rivalNestDefenseApproachers(attackers = this.activeExpeditionAttackers()) {
    const nest = this.rivalNest;
    if (!nest || nest.defeated) return [];
    return attackers.filter((ant) => distance2(ant.x, ant.z, nest.x, nest.z) <= RIVAL_NEST_DEFENSE_ALERT_RADIUS);
  }

  rivalNestDefenderTargetCount(attackers = this.activeExpeditionAttackers()) {
    if (!this.rivalNest || this.rivalNest.defeated || attackers.length <= 0) return 0;
    return Math.floor(clamp(
      Math.ceil(attackers.length / RIVAL_NEST_DEFENSE_ATTACKERS_PER_DEFENDER),
      RIVAL_NEST_DEFENDER_MIN_COUNT,
      RIVAL_NEST_DEFENDER_MAX_COUNT,
    ));
  }

  spawnRivalNestDefenders(targetCount = this.rivalNestDefenderTargetCount()) {
    if (!this.rivalNest || this.rivalNest.defeated || targetCount <= 0) return 0;
    const liveDefenders = this.rivalNestDefenders().filter((rival) => !rival.defeated && !rival.leftRaid);
    let spawned = 0;
    for (let i = liveDefenders.length; i < targetCount; i += 1) {
      const defender = new RivalAnt3D(this.nextRivalId++, this, {
        kind: "soldier",
        nestDefense: true,
        index: i,
        count: targetCount,
      });
      this.rivalAnts.push(defender);
      spawned += 1;
    }
    return spawned;
  }

  updateRivalNestDefense(dt) {
    const nest = this.rivalNest;
    if (!nest || nest.defeated || this.isGameEnded() || dt <= 0) return;
    const expeditionPresence = this.expeditionSortiePresence();
    const attackers = this.activeExpeditionAttackers();
    if (expeditionPresence.length <= 0) {
      const defenders = this.rivalNestDefenders();
      if (defenders.length <= 0) {
        nest.defenseClearTimer = 0;
        nest.defenseWaveArmed = true;
        return;
      }
      nest.defenseClearTimer = (nest.defenseClearTimer ?? 0) + dt;
      const defendersHome = defenders.every((rival) =>
        distance2(rival.x, rival.z, nest.x, nest.z) <= nest.radius + 5,
      );
      const returnTimedOut = nest.defenseClearTimer >= RIVAL_NEST_DEFENSE_FORCE_RETURN_SECONDS;
      if (nest.defenseClearTimer >= RIVAL_NEST_DEFENSE_REARM_SECONDS && (defendersHome || returnTimedOut)) {
        this.clearRivalNestDefenders();
        nest.defenseClearTimer = 0;
        nest.defenseWaveArmed = true;
      }
      return;
    }
    nest.defenseClearTimer = 0;
    if (attackers.length <= 0) return;
    if (this.rivalNestDefenseApproachers(attackers).length <= 0 || nest.defenseWaveArmed === false) return;
    nest.defenseWaveArmed = false;
    const targetCount = this.rivalNestDefenderTargetCount(attackers);
    const spawned = this.spawnRivalNestDefenders(targetCount);
    if (spawned <= 0) return;
    this.pushLog(`敵巣防衛出動: 守備兵${spawned}匹が遠征隊を迎撃`);
    if (this.ensureRaidState().phase === "calm") {
      this.showRaidNotice(`敵巣防衛出動: 守備兵${spawned}匹が接近`, "warning");
    }
  }

  rivalNestWorkerTargetCount(derived = this.derived) {
    if (!this.rivalNest || this.rivalNest.defeated) return 0;
    const d = derived && Number.isFinite(Number(derived.activeAnts)) ? derived : this.computeDerived();
    const threat = Math.max(0, Number(this.colony.enemyThreat) || 0);
    const nestLevel = Math.max(1, Number(this.colony.nestLevel) || 1);
    const territory = Math.max(0, Number(this.colony.territory) || 0);
    const activeAnts = Math.max(0, Number(d.activeAnts ?? this.colony.antPopulation) || 0);
    const scale =
      Math.max(0, threat - 6) * 0.22 +
      Math.max(0, nestLevel - 1) * 0.65 +
      territory * 0.28 +
      Math.max(0, activeAnts - 16) * 0.035;
    return Math.floor(clamp(RIVAL_NEST_WORKER_COUNT + scale, RIVAL_NEST_WORKER_COUNT, RIVAL_NEST_WORKER_MAX_COUNT));
  }

  spawnRivalNestWorkers() {
    if (!this.rivalNest || this.rivalNest.defeated) return;
    const targetCount = this.rivalNestWorkerTargetCount();
    const liveWorkers = this.rivalNestWorkers().filter((rival) => !rival.defeated && !rival.leftRaid);
    for (let i = liveWorkers.length; i < targetCount; i += 1) {
      const worker = new RivalAnt3D(this.nextRivalId++, this, {
        kind: "worker",
        index: i,
        count: targetCount,
      });
      this.rivalAnts.push(worker);
    }
  }

  clearRivalNestWorkers() {
    for (const rival of this.rivalNestWorkers()) {
      this.removeRivalAnt(rival);
    }
  }

  clearRivalNestDefenders() {
    for (const rival of this.rivalNestDefenders()) {
      this.removeRivalAnt(rival);
    }
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
    const base = this.raidSoonMode ? RAID_SOON_WARNING_SECONDS : RAID_WARNING_SECONDS;
    return base + this.raidWarningBonusSeconds();
  }

  raidEnemyCount() {
    const d = this.computeDerived();
    const colonyScalePressure =
      Math.max(0, d.activeAnts - 24) * 0.055 +
      Math.max(0, this.colony.nestLevel - 2) * 0.8 +
      this.colony.territory * 0.35 +
      (d.normalSoldiers ?? 0) * 0.025 +
      (d.heavySoldiers ?? 0) * 0.06 +
      (d.shieldHeads ?? 0) * 0.05 +
      (d.acidShooters ?? 0) * 0.045 +
      (d.scouts ?? 0) * 0.035 +
      (d.medics ?? 0) * 0.025 +
      (d.captains ?? 0) * 0.04;
    const pressure = this.colony.enemyThreat * 0.34 + this.colony.territory * 0.14 + colonyScalePressure - (d.defensePower - 1) * 0.9;
    return Math.floor(clamp(4 + pressure, 4, RAID_RIVAL_CAP));
  }

  raidApproachAngle() {
    return Math.atan2(this.rivalNest.z - this.nest.z, this.rivalNest.x - this.nest.x);
  }

  clampPointToWorld(point, margin = 5) {
    const d = Math.hypot(point.x, point.z);
    const limit = this.worldRadius - margin;
    if (d <= limit || d <= 0.001) return point;
    return { x: (point.x / d) * limit, z: (point.z / d) * limit };
  }

  raidSignalPoint(raid = this.ensureRaidState(), radiusFactor = 0.86) {
    const angle = raid.approachAngle ?? 0;
    const radius = this.worldRadius * radiusFactor;
    return this.clampPointToWorld({
      x: this.nest.x + Math.cos(angle) * radius,
      z: this.nest.z + Math.sin(angle) * radius,
    });
  }

  emitRaidSignal(raid = this.ensureRaidState(), strength = 0.72) {
    if (!this.shouldRevealRaidDirection(raid)) return false;
    const point = this.raidSignalPoint(raid);
    this.addTrail(point.x, point.z, "alarm", strength);
    return true;
  }

  enterRaidWarning() {
    if (this.isGameEnded()) return;
    const raid = this.ensureRaidState();
    raid.phase = "warning";
    raid.timer = this.raidWarningSeconds();
    raid.wave += 1;
    raid.activeCount = this.raidEnemyCount();
    raid.approachAngle = this.raidApproachAngle();
    raid.signalTimer = 0;
    raid.breachTimer = 0;
    raid.casualties = 0;
    raid.enemyCasualties = 0;
    raid.startFallenAnts = Math.floor(this.colony.fallenAnts ?? 0);
    raid.lastOutcome = "warning";
    this.raidNestBreachEvents = 0;
    const hasIntel = this.hasRaidDirectionIntel();
    this.emitRaidSignal(raid, 0.88);
    if (hasIntel) {
      const source = this.sentryMoundCount() > 0 ? "見張り塚" : this.hasScoutIntel() ? "斥候" : "敵巣位置";
      this.pushLog(`${source}が敵アリの接近方角を捕捉: 敵巣方面から${raid.activeCount}匹`);
      this.showRaidNotice(`敵アリ接近: ${source}が方角を捕捉。兵隊を前方布陣できます`, "warning");
    } else {
      this.pushLog(`敵アリの気配: 未確認の敵巣方面から${raid.activeCount}匹。方角不明`);
      this.showRaidNotice(`敵アリ接近: 方角不明。兵隊を出撃できます`, "warning");
    }
  }

  beginRaid() {
    if (this.isGameEnded()) return;
    const raid = this.ensureRaidState();
    this.clearRaidRivals();
    this.raidNestBreachEvents = 0;
    const count = Math.floor(clamp(raid.activeCount || this.raidEnemyCount(), 1, RAID_RIVAL_CAP));
    for (let i = 0; i < count; i += 1) {
      const rival = new RivalAnt3D(this.nextRivalId++, this, {
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
    this.pushLog(`敵襲開始: 敵巣方面から${count}匹が巣と餌場へ侵入`);
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
    for (const ant of rival?.clash?.ants ?? []) {
      if (ant.clashRival !== rival) continue;
      ant.clashRival = null;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      if (ant.state === "clash") ant.setState(ant.carrying > 0 ? "return" : "explore");
    }
    if (rival) rival.clash = null;
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
    if (this.isGameEnded()) return;
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
      const nestWasBreached = (this.raidNestBreachEvents ?? 0) > 0;
      const loss = nestWasBreached
        ? Math.min(this.colony.food, Math.max(2, count * 4.8 + this.colony.enemyThreat * 0.32) / defense)
        : 0;
      const wounded = nestWasBreached
        ? defense >= 1.65 ? Math.min(1, count) : Math.min(this.colony.antPopulation - 1, Math.ceil(count * 0.45))
        : 0;
      if (loss > 0) this.colony.food = Math.max(0, this.colony.food - loss);
      this.colony.woundedAnts = Math.min(this.colony.antPopulation - 1, this.colony.woundedAnts + wounded);
      if (nestWasBreached) this.applyRaidCasualties(Math.max(0, Math.ceil(count * 0.16) - raid.casualties), "breach");
      const deaths = this.raidDeathCount(raid);
      raid.casualties = deaths;
      this.colony.enemyThreat += 0.65 + count * 0.12;
      const damageLabel = nestWasBreached ? "襲撃被害" : "餌場被害";
      const foodDamageText = loss > 0 ? `食料-${fmt(loss, 0)}` : "貯蔵食料への被害なし";
      this.pushLog(`${damageLabel}: ${foodDamageText} / 負傷${wounded} / 死亡${deaths}`);
      this.showRaidNotice(`${damageLabel}: ${foodDamageText} / 死亡${deaths}`, "warning");
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
    this.clearSquadAssignment(ant);
    if (ant.isSortieSoldier) {
      if (ant.variant === "heavySoldier") this.colony.heavySoldierAnts = Math.max(0, Math.floor(this.colony.heavySoldierAnts) - 1);
      if (ant.variant === "shieldHead") this.colony.shieldHeadAnts = Math.max(0, Math.floor(this.colony.shieldHeadAnts) - 1);
      if (ant.variant === "acidShooter") this.colony.acidShooterAnts = Math.max(0, Math.floor(this.colony.acidShooterAnts) - 1);
      if (ant.variant === "scout") this.colony.scoutAnts = Math.max(0, Math.floor(this.colony.scoutAnts) - 1);
      if (ant.variant === "medic") this.colony.medicAnts = Math.max(0, Math.floor(this.colony.medicAnts) - 1);
      if (ant.variant === "captain") this.colony.captainAnts = Math.max(0, Math.floor(this.colony.captainAnts) - 1);
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
        .filter((ant) => ant && this.shouldRenderAnt(ant))
        .sort((a, b) => {
          const roleRank = (a.role === "guard" ? 2 : a.role === "worker" ? 0 : 1) - (b.role === "guard" ? 2 : b.role === "worker" ? 0 : 1);
          if (roleRank) return roleRank;
          return a.energy - b.energy;
        });
      if (candidates.length <= 0) break;
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
    if (this.isGameEnded()) return;
    if (raid.phase !== "active") return;
    let nestPressure = 0;
    let foodPressure = 0;
    for (const rival of this.raidRivals()) {
      if (rival.defeated || rival.leftRaid || rival.retreat > 0) continue;
      const nearNest = distance2(rival.x, rival.z, this.nest.x, this.nest.z) < this.nest.radius + 24;
      const nearFood = this.isNearFood(rival.x, rival.z, 7);
      if (!nearNest && !nearFood) continue;
      const shieldRelief = this.shieldBlockStrengthAt(rival.x, rival.z);
      const rivalPressure = Math.max(0.28, 1 - shieldRelief * 0.42);
      if (nearNest) nestPressure += rivalPressure;
      else foodPressure += rivalPressure;
    }
    const pressure = nestPressure + foodPressure;
    if (pressure <= 0) {
      raid.breachTimer = Math.max(0, raid.breachTimer - dt * 0.6);
      return;
    }
    raid.breachTimer += dt * pressure;
    if (raid.breachTimer < 7.2) return;
    raid.breachTimer = 0;
    if (nestPressure > 0) this.raidNestBreachEvents = Math.floor((this.raidNestBreachEvents ?? 0) + 1);
    const defense = this.computeDerived().defensePower;
    const loss = nestPressure > 0
      ? Math.min(this.colony.food, (1.8 + pressure * RAID_NEST_PRESSURE_LOSS_SCALE + this.colony.enemyThreat * RAID_NEST_THREAT_LOSS_SCALE) / defense)
      : 0;
    if (loss > 0) this.colony.food = Math.max(0, this.colony.food - loss);
    const nestDamage = nestPressure > 0
      ? this.damagePlayerNest(
          (PLAYER_NEST_BREACH_BASE_DAMAGE + nestPressure * PLAYER_NEST_BREACH_PRESSURE_DAMAGE + this.colony.enemyThreat * 0.12) /
            Math.max(0.72, Math.sqrt(defense)),
        )
      : 0;
    const casualtyChance = nestPressure > 0
      ? clamp((nestPressure - 1) * 0.18 + this.colony.enemyThreat * 0.012 - (defense - 1) * 0.18, 0, 0.62)
      : 0;
    let casualties = 0;
    if (Math.random() < casualtyChance) casualties = this.applyRaidCasualties(1, "breach");
    const pressureArea = nestPressure > 0 ? "巣周辺" : "餌場";
    const nestDamageText = nestDamage > 0 ? `巣耐久-${fmt(nestDamage, 0)} / ` : "";
    const foodDamageText = loss > 0 ? `食料-${fmt(loss, 0)}` : "貯蔵食料への被害なし";
    this.pushLog(`敵が${pressureArea}を荒らした: ${nestDamageText}${foodDamageText}${casualties ? ` / 死亡${casualties}` : ""}`);
    if (nestPressure > 0 && this.colony.nestDurability <= 0) this.endGame("defeat");
  }

  updateRaid(dt) {
    const raid = this.ensureRaidState();
    if (this.isGameEnded()) return;

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
      if (this.isGameEnded()) return;
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

  findRivalThreat(x, z, radius, preferredRivalId = null, options = {}) {
    let best = null;
    let bestScore = radius;
    const requireVisible = options.requireVisible ?? radius > 24;
    for (const rival of this.rivalAnts) {
      if (rival.defeated || rival.leftRaid || rival.retreat > 0 || rival.clash) continue;
      const d = distance2(x, z, rival.x, rival.z);
      const locallyVisible = d <= (options.localSightRange ?? LOCAL_RIVAL_THREAT_SIGHT_RANGE);
      if (requireVisible && !locallyVisible && !this.isPointVisible(rival.x, rival.z, 12) && rival.scoutMarkTimer <= 0) continue;
      if (d >= radius) continue;
      const scoutBonus = rival.scoutMarkTimer > 0 ? clamp(rival.scoutMarkStrength ?? 0, 0, 1) * 28 : 0;
      const squadBonus = preferredRivalId != null && rival.id === preferredRivalId ? 34 : 0;
      const score = d - scoutBonus - squadBonus;
      if (score < bestScore) {
        best = rival;
        bestScore = score;
      }
    }
    return best;
  }

  findMedicPatient(medic) {
    if (!medic || medic.variant !== "medic") return null;
    let best = null;
    let bestScore = Infinity;
    const range = MEDIC_AID_RANGE;
    for (const ant of this.deployedSoldiers()) {
      if (ant === medic || ant.variant === "medic") continue;
      if (!this.shouldRenderAnt(ant)) continue;
      if (ant.state === "return" || ant.inNest || ant.nestStayTimer > 0) continue;
      const d = distance2(medic.x, medic.z, ant.x, ant.z);
      if (d > range) continue;
      const lowEnergy = 1 - Math.min(ant.energy ?? 1, ant.stamina ?? 1);
      const nearestThreat = this.findRivalThreat(ant.x, ant.z, 10, ant.squadTargetId);
      const urgency =
        lowEnergy * 18 +
        (ant.state === "clash" || ant.clashTimer > 0 ? 14 : 0) +
        (ant.fleeTimer > 0 || ant.state === "flee" ? 7 : 0) +
        (ant.stun > 0 ? 12 : 0) +
        ((ant.wet ?? 0) > 0.35 ? 5 : 0) +
        (nearestThreat ? 8 : 0);
      if (urgency < 5 && d > 5) continue;
      const sameSquadBonus = medic.squadId && ant.squadId === medic.squadId ? 6 : 0;
      const score = d - urgency - sameSquadBonus;
      if (score < bestScore) {
        best = ant;
        bestScore = score;
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

  addWater(x, z, scale = 1, options = {}) {
    const intensity = ui.intensity ? Number(ui.intensity.value) : 3;
    const radius = options.radius ?? 5.5 + intensity * 1.6 * scale + rand(-0.4, 0.8);
    const rx = options.rx ?? radius * 1.18;
    const rz = options.rz ?? radius * 0.82;
    const group = new THREE.Group();
    const rotation = options.rotation ?? 0;
    const blob = createIrregularBlobGeometry(options.seed ?? `water-${Math.round(x * 10)}-${Math.round(z * 10)}-${Math.round(radius * 10)}`, 96, {
      roughness: options.permanent ? 0.24 : 0.18,
      minRadius: 0.7,
      maxRadius: 1.3,
      uvScale: 2.75,
    });
    const pool = new THREE.Mesh(blob.geometry, this.materials.water.clone());
    pool.name = "natural-water-pool";
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(rx, rz, 1);
    pool.position.y = 0.035;
    group.add(pool);
    let ring = null;
    if (options.ring !== false) {
      ring = new THREE.Mesh(this.geometries.impactRing, this.materials.waterRing.clone());
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(radius * 0.85, radius * 0.85, radius * 0.85);
      ring.position.y = 0.08;
      group.add(ring);
    }
    group.rotation.y = rotation;
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.water.push({
      x,
      z,
      radius,
      rx,
      rz,
      rotation,
      cos: Math.cos(rotation),
      sin: Math.sin(rotation),
      boundaryProfile: blob.profile,
      power: options.power ?? clamp(0.45 + intensity * 0.13 * scale, 0.35, 1.08),
      age: 0,
      group,
      ring,
      permanent: Boolean(options.permanent),
    });
  }

  addNaturalStone(config) {
    const group = new THREE.Group();
    const stone = new THREE.Mesh(this.geometries.stoneRock, this.materials.stone);
    stone.position.y = config.radius * 0.42;
    stone.scale.set(config.radius * (config.scaleX ?? 1.05), config.radius * config.scaleY, config.radius * (config.scaleZ ?? 0.86));
    stone.rotation.set(config.tiltX ?? 0.14, config.rotation, config.tiltZ ?? -0.08);
    stone.castShadow = this.quality.shadowQuality !== "off";
    stone.receiveShadow = this.quality.shadowQuality !== "off";
    group.add(stone);
    const surfaceBlob = createIrregularBlobGeometry(`stone-surface-${config.x}-${config.z}-${config.radius}`, 32, {
      roughness: 0.28,
      minRadius: 0.68,
      maxRadius: 1.26,
      uvScale: 2.35,
    });
    const surface = new THREE.Mesh(surfaceBlob.geometry, this.materials.stoneSurface);
    surface.name = "natural-stone-surface";
    surface.rotation.set(-Math.PI / 2, 0, config.rotation);
    surface.position.y = config.radius * (0.48 + config.scaleY * 0.62);
    surface.scale.set(config.radius * (config.scaleX ?? 0.9), config.radius * (config.scaleZ ?? 0.72), 1);
    group.add(surface);
    const pebbleCount = Math.max(0, Math.floor(config.pebbles ?? 0));
    for (let i = 0; i < pebbleCount; i += 1) {
      const angle = config.rotation + i * 2.16 + config.radius * 0.31;
      const distance = config.radius * (0.66 + (i % 3) * 0.24);
      const pebbleRadius = config.radius * (0.18 + (i % 2) * 0.06);
      const pebble = new THREE.Mesh(this.geometries.soilPebble, this.materials.stone);
      pebble.position.set(Math.cos(angle) * distance, pebbleRadius * 0.34, Math.sin(angle) * distance);
      pebble.scale.set(pebbleRadius * 1.1, pebbleRadius * 0.38, pebbleRadius * 0.9);
      pebble.rotation.set(0.18, angle, -0.1);
      pebble.castShadow = this.quality.shadowQuality !== "off";
      pebble.receiveShadow = this.quality.shadowQuality !== "off";
      group.add(pebble);
    }
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
    const distanceFromNest = options.distanceFromNest ?? distance2(x, z, this.nest.x, this.nest.z);
    const item = {
      id: this.nextFoodId,
      x,
      z,
      radius,
      amount,
      initialAmount: amount,
      group,
      crumbs: [],
      kind: options.kind ?? "placed",
      spawnSiteId: options.spawnSiteId ?? null,
      rivalForage: Boolean(options.rivalForage),
      distanceFromNest,
      distanceTier: options.distanceTier ?? this.foodDistanceTier(distanceFromNest),
    };
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
    return item;
  }

  getFoodSource(sourceId) {
    if (sourceId == null) return null;
    return this.food.find((item) => item.id === sourceId && item.amount > 0.05) ?? null;
  }

  foodRespawnDelayForSite(site) {
    const distanceFromNest = site.distanceFromNest ?? distance2(site.homeX ?? site.x, site.homeZ ?? site.z, this.nest.x, this.nest.z);
    return this.foodRespawnScaleForDistance(distanceFromNest) * (
      FOOD_RESPAWN_MIN_SECONDS +
      rand(0, FOOD_RESPAWN_RANDOM_SECONDS) +
      Math.min(38, distanceFromNest * FOOD_RESPAWN_DISTANCE_SECONDS)
    );
  }

  respawnFoodAtSite(site, initial = false) {
    if (!site) return null;
    const activeFood = site.activeFoodId == null ? null : this.getFoodSource(site.activeFoodId);
    if (activeFood) return activeFood;
    const jitterAngle = rand(0, Math.PI * 2);
    const jitterRadius = initial ? 0 : rand(0.6, FOOD_RESPAWN_JITTER_RADIUS);
    const point = this.clampPointToWorld(
      {
        x: (site.homeX ?? site.x) + Math.cos(jitterAngle) * jitterRadius,
        z: (site.homeZ ?? site.z) + Math.sin(jitterAngle) * jitterRadius,
      },
      8,
    );
    const amount = initial ? site.amount : Math.max(3, site.amount * rand(0.88, 1.18));
    const food = this.addFood(point.x, point.z, {
      amount,
      radius: site.radius,
      crumbs: site.crumbs,
      material: site.material,
      kind: site.kind,
      minScale: site.minScale,
      maxScale: site.maxScale,
      spawnSiteId: site.id,
      rivalForage: site.rivalForage,
      distanceFromNest: site.distanceFromNest,
      distanceTier: site.distanceTier,
    });
    site.activeFoodId = food.id;
    site.respawnTimer = 0;
    site.lastX = point.x;
    site.lastZ = point.z;
    return food;
  }

  scheduleFoodRespawn(food) {
    const site = this.foodSpawnSites.find((candidate) => candidate.id === food.spawnSiteId);
    if (!site) return;
    site.activeFoodId = null;
    site.respawnTimer = this.foodRespawnDelayForSite(site);
  }

  updateFoodRespawns(dt) {
    if (!this.foodSpawnSites.length) return;
    for (const site of this.foodSpawnSites) {
      const activeFood = site.activeFoodId == null ? null : this.getFoodSource(site.activeFoodId);
      if (activeFood) continue;
      if (site.activeFoodId != null) {
        site.activeFoodId = null;
        if (!(site.respawnTimer > 0)) site.respawnTimer = this.foodRespawnDelayForSite(site);
      }
      site.respawnTimer = Math.max(0, (site.respawnTimer ?? 0) - Math.max(0, dt));
      if (site.respawnTimer <= 0) this.respawnFoodAtSite(site);
    }
  }

  refreshFoodMesh(food) {
    const ratio = clamp(food.amount / food.initialAmount, 0, 1);
    food.crumbs.forEach((crumb, index) => {
      crumb.visible = index / food.crumbs.length < ratio;
    });
    if (food.amount <= 0.05) {
      this.fadeFoodTrails(food.id);
      this.scheduleFoodRespawn(food);
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

  earthWallLineLimits() {
    const def = getConstructionDef("earthWall");
    return {
      minLength: def.targetRadius * 0.9,
      defaultLength: def.targetRadius * 2.32,
      maxLength: def.targetRadius * 3.42,
    };
  }

  earthWallBuildCostForLength(length) {
    const def = getConstructionDef("earthWall");
    const limits = this.earthWallLineLimits();
    const normalizedLength = clamp(length, limits.minLength, limits.maxLength);
    return def.buildCost * (normalizedLength / limits.defaultLength);
  }

  wallTargetFromLine(start, end) {
    if (!start || !end) return null;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const rawLength = Math.hypot(dx, dz);
    if (rawLength < 1.6) return null;
    const fallbackAngle = Math.atan2(start.z - this.nest.z, start.x - this.nest.x) + Math.PI / 2;
    const angle = rawLength > 0.001 ? Math.atan2(dz, dx) : fallbackAngle;
    const length = rawLength;
    const x = (start.x + end.x) / 2;
    const z = (start.z + end.z) / 2;
    const radius = length / 2.32;
    return {
      x,
      z,
      radius,
      maxProgress: this.earthWallBuildCostForLength(length),
      rotation: angle,
      length,
    };
  }

  pointConstructionTarget(kind, placementPoint) {
    const def = getConstructionDef(kind);
    const point = placementPoint.start ?? placementPoint;
    const x = point.x;
    const z = point.z;
    const rotation = Math.atan2(z - this.nest.z, x - this.nest.x);
    return { x, z, radius: def.targetRadius, maxProgress: def.buildCost, rotation };
  }

  wallPlacementPoints(includeHover = false) {
    const draft = this.wallPlacementDraft;
    if (!draft) return [];
    if (Array.isArray(draft.points)) {
      const points = draft.points.filter(Boolean).map((point) => ({ x: point.x, z: point.z }));
      if (includeHover && draft.hover && points.length > 0 && distance2(points[points.length - 1].x, points[points.length - 1].z, draft.hover.x, draft.hover.z) > 0.6) {
        points.push({ x: draft.hover.x, z: draft.hover.z });
      }
      return points;
    }
    const points = [];
    if (draft.start) points.push({ x: draft.start.x, z: draft.start.z });
    if (draft.end && (!draft.start || distance2(draft.start.x, draft.start.z, draft.end.x, draft.end.z) > 0.6)) points.push({ x: draft.end.x, z: draft.end.z });
    return points;
  }

  wallPlacementTargetsFromDraft(includeHover = false) {
    return this.wallTargetsFromPoints(this.wallPlacementPoints(includeHover));
  }

  wallTargetsFromPoints(points) {
    const targets = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      targets.push(...this.wallTargetsFromSegment(start, end));
    }
    return targets;
  }

  wallTargetsFromSegment(start, end) {
    if (!start || !end) return [];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const rawLength = Math.hypot(dx, dz);
    if (rawLength < 1.6) return [];
    const limits = this.earthWallLineLimits();
    const chunkCount = Math.max(1, Math.ceil(rawLength / limits.maxLength));
    const targets = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const from = index / chunkCount;
      const to = (index + 1) / chunkCount;
      const chunkStart = { x: start.x + dx * from, z: start.z + dz * from };
      const chunkEnd = { x: start.x + dx * to, z: start.z + dz * to };
      const target = this.wallTargetFromLine(chunkStart, chunkEnd);
      if (target) targets.push(target);
    }
    return targets;
  }

  wallPlacementTotalCost(targets = this.wallPlacementTargetsFromDraft(false)) {
    return targets.reduce((sum, target) => sum + (target?.maxProgress ?? 0), 0);
  }

  wallPlacementTotalLength(targets = this.wallPlacementTargetsFromDraft(false)) {
    return targets.reduce((sum, target) => sum + (target?.length ?? 0), 0);
  }

  wallPlacementMetrics(targets = this.wallPlacementTargetsFromDraft(false), points = this.wallPlacementPoints(false)) {
    return {
      vertexCount: points.length,
      targetCount: targets.length,
      totalLength: this.wallPlacementTotalLength(targets),
      cost: this.wallPlacementTotalCost(targets),
    };
  }

  addWallPlacementVertex(point) {
    if (this.pendingConstructionKind !== "earthWall" || !point) return false;
    if (!this.wallPlacementDraft || !Array.isArray(this.wallPlacementDraft.points)) {
      this.wallPlacementDraft = { points: [], hover: null };
    }
    const snapped = this.snapWallPlacementPoint(point);
    const points = this.wallPlacementDraft.points;
    const last = points[points.length - 1];
    if (!last || distance2(last.x, last.z, snapped.x, snapped.z) > 0.9) {
      points.push(snapped);
    } else {
      points[points.length - 1] = snapped;
    }
    this.wallPlacementDraft.hover = snapped;
    this.updateWallPlacementPreview();
    return true;
  }

  snapWallPlacementPoint(point) {
    if (!point) return point;
    const snapDistance = Math.max(2.8, getConstructionDef("earthWall").targetRadius * 0.22);
    let best = { point: { x: point.x, z: point.z }, distance: snapDistance };
    const consider = (candidate) => {
      if (!candidate) return;
      const d = distance2(point.x, point.z, candidate.x, candidate.z);
      if (d < best.distance) best = { point: { x: candidate.x, z: candidate.z }, distance: d };
    };

    for (const draftPoint of this.wallPlacementPoints(false)) consider(draftPoint);

    for (const earthwork of this.earthworks ?? []) {
      if (earthwork.kind !== "earthWall") continue;
      const metrics = this.earthWallMetrics(earthwork);
      const local = this.earthWallLocal(earthwork, point.x, point.z);
      const along = clamp(local.along, -metrics.halfLength, metrics.halfLength);
      if (Math.abs(local.across) <= snapDistance && Math.abs(local.along) <= metrics.halfLength + snapDistance) {
        consider(this.earthWallWorldPoint(earthwork, along, 0));
      }
      consider(this.earthWallWorldPoint(earthwork, -metrics.halfLength, 0));
      consider(this.earthWallWorldPoint(earthwork, metrics.halfLength, 0));
    }

    return best.point;
  }

  constructionPreviewMaterial(kind, opacity = 0.52) {
    const source =
      kind === "earthWall" ? this.materials.earthworkWall :
      kind === "sentryMound" ? this.materials.earthworkSentry :
      kind === "lowBarricade" ? this.materials.earthworkBarricade :
      this.materials.earthworkTrail;
    const material = source.clone();
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
    return material;
  }

  createConstructionPlacementFootprint(kind, target, opacity = 0.52) {
    const mesh = new THREE.Mesh(this.geometries.trailCircle, this.constructionPreviewMaterial(kind, opacity));
    mesh.name = `${kind}-placement-footprint`;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(target.x, 0.32, target.z);
    mesh.rotation.y = kind === "earthWall" ? -target.rotation : target.rotation;
    if (kind === "earthWall") mesh.scale.set(target.radius * 1.16, target.radius * 0.14, 1);
    else if (kind === "sentryMound") mesh.scale.set(target.radius * 0.72, target.radius * 0.5, 1);
    else if (kind === "lowBarricade") mesh.scale.set(target.radius * 0.95, target.radius * 0.28, 1);
    else mesh.scale.set(target.radius * 1.35, target.radius * 0.36, 1);
    return mesh;
  }

  updateConstructionPlacementPreview(point) {
    const kind = this.pendingConstructionKind;
    if (!this.isPointPlacementConstruction(kind) || !point) return;
    this.clearWallPlacementPreview();
    const target = this.constructionTarget(kind, point);
    if (!target) return;
    const group = new THREE.Group();
    group.name = "construction-placement-preview";
    group.add(this.createConstructionPlacementFootprint(kind, target, 0.5));

    const marker = new THREE.Mesh(this.geometries.wallPlacementMarker, this.materials.wallPlacementMarker.clone());
    marker.name = `${kind}-placement-point`;
    marker.position.set(target.x, 0.76, target.z);
    marker.scale.set(0.9, 0.22, 0.9);
    marker.renderOrder = 21;
    group.add(marker);

    this.scene.add(group);
    this.wallPlacementPreview = group;
    const def = getConstructionDef(kind);
    this.constructionMessage = `${def.label}の場所指定中 / クリックで発注 / 工数 ${fmt(def.buildCost, 1)}`;
    this.updateStats();
  }

  updateWallPlacementPreview() {
    this.clearWallPlacementPreview();
    const targets = this.wallPlacementTargetsFromDraft(true);
    const fixedTargets = this.wallPlacementTargetsFromDraft(false);
    const points = this.wallPlacementPoints(true);
    if (points.length <= 0) {
      this.constructionMessage = "土壁の開始点をクリック";
      this.updateStats();
      return;
    }

    const previewGroup = new THREE.Group();
    previewGroup.name = "earth-wall-placement-preview";
    for (const target of targets) {
      const mesh = this.createConstructionPlacementFootprint("earthWall", target, 0.52);
      mesh.name = "earth-wall-placement-footprint";
      previewGroup.add(mesh);
    }
    this.scene.add(previewGroup);
    this.wallPlacementPreview = previewGroup;

    this.wallPlacementGuide = this.createWallPlacementGuide(points);
    this.scene.add(this.wallPlacementGuide);
    const fixedPoints = this.wallPlacementPoints(false);
    const metrics = this.wallPlacementMetrics(fixedTargets, fixedPoints);
    this.constructionMessage = metrics.targetCount > 0
      ? `土壁の一筆線を作成中 / 頂点 ${fmt(metrics.vertexCount, 0)} / 全長 ${fmt(metrics.totalLength, 0)} / 工数 ${fmt(metrics.cost, 1)}`
      : "土壁の開始点を指定中 / 次のクリックで一筆線を伸ばす";
    this.updateStats();
  }

  createWallPlacementGuide(points = []) {
    const group = new THREE.Group();
    group.name = "earth-wall-placement-guide";
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (distance2(start.x, start.z, end.x, end.z) < 1.6) continue;
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      const line = new THREE.Mesh(this.geometries.wallPlacementLine, this.materials.wallPlacementLine.clone());
      line.name = "earth-wall-placement-line";
      line.position.set((start.x + end.x) / 2, 0.68 + index * 0.006, (start.z + end.z) / 2);
      line.rotation.y = -Math.atan2(dz, dx);
      line.scale.set(length, 0.08, 0.42);
      line.renderOrder = 20;
      group.add(line);
    }

    points.forEach((point, index) => {
      const marker = new THREE.Mesh(this.geometries.wallPlacementMarker, this.materials.wallPlacementMarker.clone());
      marker.name = index === 0 ? "earth-wall-placement-start" : index === points.length - 1 ? "earth-wall-placement-end" : "earth-wall-placement-vertex";
      marker.position.set(point.x, 0.76, point.z);
      marker.scale.set(index === 0 ? 1.02 : 0.86, 0.22, index === 0 ? 1.02 : 0.86);
      marker.renderOrder = 21;
      group.add(marker);
    });

    return group;
  }

  clearWallPlacementPreview() {
    if (this.wallPlacementGuide) {
      disposeObject3D(this.wallPlacementGuide, {
        skipGeometries: this.sharedGeometries,
        skipMaterials: this.sharedMaterials,
      });
      this.wallPlacementGuide = null;
    }
    if (this.wallPlacementPreview) {
      disposeObject3D(this.wallPlacementPreview, {
        skipGeometries: this.sharedGeometries,
        skipMaterials: this.sharedMaterials,
      });
      this.wallPlacementPreview = null;
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

  markRivalByScout(scout, rival, distance = null) {
    if (!scout || !rival || rival.defeated || rival.leftRaid || rival.retreat > 0) return false;
    const d = distance ?? distance2(scout.x, scout.z, rival.x, rival.z);
    const strength = clamp(1 - d / Math.max(1, SCOUT_MARK_RANGE), 0.32, 1);
    rival.scoutMarkTimer = SCOUT_MARK_SECONDS;
    rival.scoutMarkStrength = Math.max(rival.scoutMarkStrength ?? 0, strength);
    rival.scoutMarkedById = scout.id;
    scout.scoutTargetId = rival.id;
    scout.scoutSignal = 1;
    if (scout.scoutMarkCooldown <= 0) {
      this.addScoutMarkEffect(rival.x, rival.z, strength);
      scout.scoutMarkCooldown = 0.36;
    }
    if (scout.lastTrail > 0.42) {
      this.addTrail(rival.x, rival.z, "alarm", 0.32);
      scout.lastTrail = 0;
    }
    return true;
  }

  addScoutMarkEffect(x, z, strength = 1) {
    const quality = this.quality.effectsQuality ?? 1;
    if (quality <= 0) return;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const markMaterial = this.materials.scoutMark.clone();
    const ring = new THREE.Mesh(this.geometries.impactRing, markMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    ring.scale.setScalar(1.2 + strength * 0.78);
    group.add(ring);

    const pingMaterial = this.materials.scoutMark.clone();
    const ping = new THREE.Mesh(this.geometries.combatSlash, pingMaterial);
    ping.position.set(0, 0.52, 0);
    ping.scale.set(0.035 + strength * 0.012, 0.68 + strength * 0.22, 0.035 + strength * 0.012);
    group.add(ping);

    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.combatEffects.push({
      type: "scoutMark",
      age: 0,
      life: 0.62,
      strength,
      radius: 1.25 + strength * 1.05,
      group,
      ring,
      ping,
      markMaterial,
      pingMaterial,
    });
    while (this.combatEffects.length > COMBAT_EFFECT_CAP) {
      const old = this.combatEffects.shift();
      this.disposeDynamicItem(old);
    }
  }

  applyMedicAid(medic, patient) {
    if (!medic || !patient || patient === medic || patient.variant === "medic") return false;
    if (!this.ants.includes(patient) || !this.shouldRenderAnt(patient)) return false;
    const d = distance2(medic.x, medic.z, patient.x, patient.z);
    if (d > MEDIC_AID_RANGE) return false;
    const urgency = clamp((1 - Math.min(patient.energy ?? 1, patient.stamina ?? 1)) + (patient.stun > 0 ? 0.45 : 0) + (patient.wet > 0.35 ? 0.22 : 0), 0.28, 1);
    patient.energy = clamp((patient.energy ?? 1) + 0.16 + urgency * 0.09, 0, 1);
    patient.stamina = clamp(Math.max(patient.stamina ?? 0, patient.energy), 0, 1);
    patient.wet = Math.max(0, (patient.wet ?? 0) - 0.18 * urgency);
    if (patient.stun > 0) patient.stun = Math.max(0, patient.stun - 0.42 * urgency);
    if (patient.state !== "clash" && patient.clashTimer <= 0 && (patient.energy <= MEDIC_EVACUATE_ENERGY || patient.stun > 0 || patient.wet > 0.44)) {
      patient.startFleeHome(medic.x, medic.z, 2.4 + urgency * 1.4);
      patient.lastTacticalAction = "medicEvacuated";
    } else if (patient.lastTacticalAction !== "medicEvacuated") {
      patient.lastTacticalAction = "medicSupported";
    }
    medic.medicSignal = 1;
    medic.medicTargetId = patient.id;
    this.addTrail(patient.x, patient.z, "rescue", 0.74);
    this.addMedicAidEffect(patient.x, patient.z, urgency);
    return true;
  }

  addMedicAidEffect(x, z, strength = 1) {
    const quality = this.quality.effectsQuality ?? 1;
    if (quality <= 0) return;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const aidMaterial = this.materials.medicAid.clone();
    const ring = new THREE.Mesh(this.geometries.impactRing, aidMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.13;
    ring.scale.setScalar(0.86 + strength * 0.58);
    group.add(ring);

    const crossMaterial = this.materials.medicAid.clone();
    const bars = [];
    for (let i = 0; i < 2; i += 1) {
      const bar = new THREE.Mesh(this.geometries.combatSlash, crossMaterial);
      bar.rotation.set(0, i === 0 ? Math.PI / 2 : 0, Math.PI / 2);
      bar.position.set(0, 0.48, 0);
      bar.scale.set(0.035, 0.58 + strength * 0.2, 0.035);
      group.add(bar);
      bars.push(bar);
    }

    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.combatEffects.push({
      type: "medicAid",
      age: 0,
      life: 0.82,
      strength,
      radius: 1 + strength * 0.62,
      group,
      ring,
      aidMaterial,
      crossMaterial,
      bars,
    });
    while (this.combatEffects.length > COMBAT_EFFECT_CAP) {
      const old = this.combatEffects.shift();
      this.disposeDynamicItem(old);
    }
  }

  addCaptainCommandEffect(x, z, members = 1, cohesion = 0, colorHex = 0xf0c65a) {
    const quality = this.quality.effectsQuality ?? 1;
    if (quality <= 0) return;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const commandMaterial = this.materials.captainCommand.clone();
    commandMaterial.color.setHex(colorHex);
    const ring = new THREE.Mesh(this.geometries.impactRing, commandMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.135;
    ring.scale.setScalar(2.15 + Math.min(6, members) * 0.36);
    group.add(ring);

    const spokeMaterial = this.materials.captainCommand.clone();
    spokeMaterial.color.setHex(colorHex);
    const spokes = [];
    const spokeCount = Math.floor(clamp(3 + members, 4, 9) * quality);
    for (let i = 0; i < spokeCount; i += 1) {
      const spoke = new THREE.Mesh(this.geometries.combatSlash, spokeMaterial);
      const angle = (i / Math.max(1, spokeCount)) * Math.PI * 2;
      const direction = new THREE.Vector3(Math.sin(angle), 0.08, Math.cos(angle)).normalize();
      spoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      spoke.position.set(Math.sin(angle) * 0.9, 0.2, Math.cos(angle) * 0.9);
      spoke.scale.set(0.04, 1.3 + cohesion * 0.55, 0.04);
      group.add(spoke);
      spokes.push({ mesh: spoke, angle });
    }

    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.combatEffects.push({
      type: "captainCommand",
      age: 0,
      life: 1.05,
      strength: clamp(0.72 + cohesion * 0.45, 0.72, 1.12),
      radius: 2.35 + Math.min(6, members) * 0.42,
      group,
      ring,
      commandMaterial,
      spokeMaterial,
      spokes,
    });
    while (this.combatEffects.length > COMBAT_EFFECT_CAP) {
      const old = this.combatEffects.shift();
      this.disposeDynamicItem(old);
    }
  }

  sprayAcid(attacker, rival) {
    if (!attacker || !rival || rival.defeated || rival.leftRaid) return false;
    const reach = ACID_SPRAY_RANGE + rival.scale * 1.8;
    const d = distance2(attacker.x, attacker.z, rival.x, rival.z);
    if (d > reach) return false;
    const strength = clamp(1 - d / reach, 0.28, 1);
    rival.applyAcidDebuff(0.85 + strength * 0.65);
    this.addAcidSprayEffect(attacker.x, attacker.z, rival.x, rival.z, strength);
    this.addTrail(rival.x, rival.z, "alarm", 0.38);
    return true;
  }

  addAcidSprayEffect(fromX, fromZ, toX, toZ, strength = 1) {
    const quality = this.quality.effectsQuality ?? 1;
    if (quality <= 0) return;
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const length = Math.hypot(dx, dz) || 1;
    const group = new THREE.Group();
    group.position.set(fromX, 0, fromZ);

    const sprayMaterial = this.materials.acidSpray.clone();
    const beam = new THREE.Mesh(this.geometries.combatSlash, sprayMaterial);
    const direction = new THREE.Vector3(dx, length * 0.035, dz).normalize();
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    beam.position.set(dx * 0.5, 0.56, dz * 0.5);
    beam.scale.set(0.055 + strength * 0.026, length, 0.055 + strength * 0.026);
    group.add(beam);

    const splashMaterial = this.materials.acidSplash.clone();
    const splash = new THREE.Mesh(this.geometries.impactRing, splashMaterial);
    splash.rotation.x = Math.PI / 2;
    splash.position.set(dx, 0.16, dz);
    splash.scale.setScalar(0.55 + strength * 0.65);
    group.add(splash);

    const droplets = [];
    const dropletCount = Math.floor(clamp(4 + strength * 5, 4, 9) * quality);
    const pathAngle = Math.atan2(dx, dz);
    const sideX = Math.cos(pathAngle);
    const sideZ = -Math.sin(pathAngle);
    for (let i = 0; i < dropletCount; i += 1) {
      const t = (i + 0.5) / Math.max(1, dropletCount);
      const wobble = rand(-0.18, 0.18) * (1 + strength * 0.35);
      const droplet = new THREE.Mesh(this.geometries.combatDust, sprayMaterial);
      const baseScale = rand(0.065, 0.12) * (1 + strength * 0.35) * (1 - t * 0.22);
      droplet.position.set(dx * t + sideX * wobble, 0.42 + Math.sin(t * Math.PI) * (0.22 + strength * 0.12), dz * t + sideZ * wobble);
      droplet.scale.setScalar(baseScale);
      group.add(droplet);
      droplets.push({ mesh: droplet, baseScale, phase: rand(0, Math.PI * 2), sideX, sideZ });
    }

    const puffs = [];
    const puffCount = Math.floor(clamp(2 + strength * 3, 2, 5) * quality);
    for (let i = 0; i < puffCount; i += 1) {
      const puff = new THREE.Mesh(this.geometries.combatDust, splashMaterial);
      const spread = pathAngle + rand(-0.7, 0.7);
      const baseScale = rand(0.1, 0.18) * (1 + strength * 0.28);
      puff.position.set(dx + Math.sin(spread) * rand(0.08, 0.35), 0.18 + rand(0, 0.12), dz + Math.cos(spread) * rand(0.08, 0.35));
      puff.scale.setScalar(baseScale);
      group.add(puff);
      puffs.push({ mesh: puff, angle: spread, baseScale, lift: rand(0.12, 0.3), speed: rand(0.35, 1.1) });
    }

    this.scene.add(group);
    this.dynamicObjects.add(group);
    this.combatEffects.push({
      type: "acid",
      age: 0,
      life: 0.62,
      strength,
      radius: 0.7 + strength * 0.9,
      group,
      beam,
      splash,
      sprayMaterial,
      splashMaterial,
      droplets,
      puffs,
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
      if (effect.type === "acid") {
        effect.group.position.y = Math.sin(t * Math.PI) * 0.05;
        effect.sprayMaterial.opacity = 0.74 * effect.strength * Math.max(0, 1 - t * 1.85);
        effect.splashMaterial.opacity = 0.52 * effect.strength * fade;
        effect.splash.scale.setScalar(effect.radius * (0.62 + t * 1.25));
        effect.beam.visible = t < 0.62;
        for (const droplet of effect.droplets ?? []) {
          const pulse = 1 + Math.sin(t * 18 + droplet.phase) * 0.18;
          droplet.mesh.position.x += droplet.sideX * Math.sin(t * Math.PI) * 0.34 * dt;
          droplet.mesh.position.z += droplet.sideZ * Math.sin(t * Math.PI) * 0.34 * dt;
          droplet.mesh.position.y += 0.08 * Math.cos(t * Math.PI * 1.2 + droplet.phase) * dt;
          droplet.mesh.scale.setScalar(droplet.baseScale * pulse * (1 + t * 0.7));
          droplet.mesh.visible = t < 0.82;
        }
        for (const puff of effect.puffs) {
          const outward = puff.speed * t;
          puff.mesh.position.x += Math.sin(puff.angle) * outward * dt;
          puff.mesh.position.z += Math.cos(puff.angle) * outward * dt;
          puff.mesh.position.y += puff.lift * Math.sin(t * Math.PI) * dt;
          puff.mesh.scale.setScalar(puff.baseScale * (1 + t * 1.6));
        }
        continue;
      }
      if (effect.type === "scoutMark") {
        effect.group.position.y = Math.sin(t * Math.PI) * 0.035;
        effect.ring.scale.setScalar(effect.radius * (0.7 + t * 0.62));
        effect.ring.rotation.z = t * Math.PI * 1.2;
        effect.markMaterial.opacity = 0.52 * effect.strength * fade;
        effect.ping.scale.y = 0.72 + effect.strength * 0.24 + Math.sin(t * Math.PI) * 0.24;
        effect.pingMaterial.opacity = 0.42 * effect.strength * Math.max(0, 1 - t * 1.6);
        continue;
      }
      if (effect.type === "medicAid") {
        effect.group.position.y = Math.sin(t * Math.PI) * 0.04;
        effect.ring.scale.setScalar(effect.radius * (0.62 + t * 0.78));
        effect.ring.rotation.z = -t * Math.PI * 0.8;
        effect.aidMaterial.opacity = 0.58 * effect.strength * fade;
        effect.crossMaterial.opacity = 0.68 * effect.strength * Math.max(0, 1 - t * 1.4);
        for (const [index, bar] of (effect.bars ?? []).entries()) {
          bar.rotation.z = Math.PI / 2 + index * Math.PI / 2 + Math.sin(t * Math.PI) * 0.12;
          bar.scale.y = 0.58 + effect.strength * 0.2 + Math.sin(t * Math.PI) * 0.22;
        }
        continue;
      }
      if (effect.type === "captainCommand") {
        effect.group.position.y = Math.sin(t * Math.PI) * 0.028;
        effect.ring.scale.setScalar(effect.radius * (0.55 + t * 0.8));
        effect.ring.rotation.z = -t * Math.PI * 0.9;
        effect.commandMaterial.opacity = 0.46 * effect.strength * fade;
        effect.spokeMaterial.opacity = 0.36 * effect.strength * Math.max(0, 1 - t * 1.45);
        for (const spoke of effect.spokes ?? []) {
          spoke.mesh.position.x += Math.sin(spoke.angle) * t * 0.45 * dt;
          spoke.mesh.position.z += Math.cos(spoke.angle) * t * 0.45 * dt;
          spoke.mesh.visible = t < 0.78;
        }
        continue;
      }
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

  constructionShortLabel(kind) {
    if (kind === "earthWall") return "土壁";
    if (kind === "trailReinforce") return "採餌道";
    return this.constructionLabel(kind);
  }

  constructionIconAsset(kind) {
    if (kind === "trailReinforce") return UI_ICON_ASSETS.forageTrail;
    if (kind === "sentryMound") return UI_ICON_ASSETS.scoutFlag;
    if (kind === "earthWall") return UI_ICON_ASSETS.constructionShovel;
    return UI_ICON_ASSETS.soilMound;
  }

  constructionTaskDisplayLabel(task) {
    const label = this.constructionLabel(task.kind);
    const dx = Number(task.x) - Number(this.nest?.x ?? 0);
    const dz = Number(task.z) - Number(this.nest?.z ?? 0);
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 8) return label;
    const direction = Math.abs(dx) >= Math.abs(dz)
      ? dx >= 0 ? "東" : "西"
      : dz >= 0 ? "南" : "北";
    return `${label} ${direction}エリア`;
  }

  constructionButtonTitle(kind, commandState) {
    if (!isConstructionKind(kind)) return commandState?.reason ?? "";
    const detail = getConstructionDef(kind);
    const costLabel = kind === "earthWall" ? `基準工数 ${fmt(detail.buildCost, 1)} / 長さで変動` : `工数 ${fmt(detail.buildCost, 1)}`;
    return `${detail.command}: ${costLabel} / 目安 ${detail.timeHint} / ${detail.timeNote} / 採土・往復あり / ${detail.effect}${commandState?.reason ? ` / ${commandState.reason}` : ""}`;
  }

  updateConstructionCommandButton(button, kind, commandState) {
    if (!button || !isConstructionKind(kind)) return;
    const detail = getConstructionDef(kind);
    const isPending = this.pendingConstructionKind === kind;
    button.disabled = !commandState.ok && !isPending;
    button.classList.toggle("active", isPending);
    const draftTargets = isPending && kind === "earthWall" ? this.wallPlacementTargetsFromDraft(false) : [];
    const draftMetrics = isPending && kind === "earthWall" ? this.wallPlacementMetrics(draftTargets, this.wallPlacementPoints(false)) : null;
    const draftCost = draftMetrics && draftMetrics.targetCount > 0 ? draftMetrics.cost : detail.buildCost;
    button.title = isPending && kind === "earthWall"
      ? `${detail.command}: 一筆書きで土壁を指定 / クリックで頂点追加 / 全長 ${fmt(draftMetrics?.totalLength ?? 0, 0)} / 工数 ${fmt(draftCost, 1)}`
      : isPending
        ? `${detail.command}: 地面をクリックして設置場所を指定 / 工数 ${fmt(detail.buildCost, 1)}`
        : this.constructionButtonTitle(kind, commandState);
    const main = button.querySelector(".button-main");
    const sub = button.querySelector(".button-sub");
    const cost = button.querySelector(".construction-cost");
    if (main) main.textContent = this.constructionShortLabel(kind);
    if (sub) {
      const costLabel = kind === "earthWall" ? `基準工数${fmt(detail.buildCost, 1)} / 長さで変動` : `工数${fmt(detail.buildCost, 1)}`;
      sub.textContent = isPending && kind === "earthWall"
        ? `一筆線指定中 / ${fmt(draftMetrics?.vertexCount ?? 0, 0)}点 / 工数${fmt(draftCost, 1)}`
        : isPending
          ? `場所指定中 / 工数${fmt(detail.buildCost, 1)} / クリックで発注`
          : `${costLabel} / ${detail.timeHint} / ${detail.buttonSummary}`;
    }
    if (cost) {
      cost.innerHTML = kind === "earthWall"
        ? `基準工数 ${fmt(draftCost, 1)}<br>長さで変動`
        : `工数 ${fmt(detail.buildCost, 1)}`;
    }
  }

  updateSortieCommandButton(button, mode, plannedSortie, cooldownLeft) {
    if (!button) return;
    const normalized = mode === "expedition" ? "expedition" : "defense";
    const gameEnded = this.isGameEnded();
    const hasSoldiers = plannedSortie > 0;
    const expeditionReady = normalized !== "expedition" || this.canStartExpeditionSortie();
    button.disabled = gameEnded || cooldownLeft > 0 || !hasSoldiers || !expeditionReady;
    button.classList.toggle("active", this.selectedSortieMode === normalized);
    const main = button.querySelector(".button-main");
    const sub = button.querySelector(".button-sub");
    const action = normalized === "expedition" ? "遠征出動" : "防衛出動";
    const reason = gameEnded
      ? "ゲーム終了"
      : cooldownLeft > 0
      ? `再出撃まで ${cooldownLeft}s`
      : !hasSoldiers
        ? "兵隊不足"
        : normalized === "expedition" && this.rivalNest.defeated
          ? "敵巣陥落済み"
          : normalized === "expedition" && !this.isRivalNestKnown()
            ? "敵巣未発見"
            : normalized === "expedition"
              ? `敵巣耐久 ${fmt((this.rivalNest.integrity ?? 1) * 100, 0)}%`
              : "敵襲・見えている敵へ";
    if (main) main.textContent = cooldownLeft > 0 ? `再出撃まで ${cooldownLeft}s` : `${action} ${fmt(plannedSortie, 0)}`;
    if (sub) sub.textContent = reason;
    button.title = `${action}: ${reason}`;
  }

  updateReconCommandButton(button, plannedRecon, cooldownLeft) {
    if (!button) return;
    const gameEnded = this.isGameEnded();
    const known = this.isRivalNestKnown();
    const defeated = Boolean(this.rivalNest?.defeated);
    const hasScouts = plannedRecon > 0;
    const disabled = gameEnded || cooldownLeft > 0 || defeated || known || !hasScouts;
    button.disabled = disabled;
    button.classList.toggle("active", this.selectedSortieMode === "recon" && !disabled);
    const main = button.querySelector(".button-main");
    const sub = button.querySelector(".button-sub");
    const reason = gameEnded
      ? "ゲーム終了"
      : cooldownLeft > 0
      ? `再出撃まで ${cooldownLeft}s`
      : defeated
        ? "敵巣陥落済み"
        : known
          ? "敵巣発見済み"
          : !hasScouts
            ? "斥候アリ不足"
            : "未発見エリアを巡回";
    if (main) main.textContent = cooldownLeft > 0 ? `再出撃まで ${cooldownLeft}s` : `偵察 ${fmt(plannedRecon, 0)}`;
    if (sub) sub.textContent = reason;
    button.title = `偵察: ${reason}`;
  }

  renderMilitaryPanel(d, plannedSortie, deployedSoldiers, sortiePool, cooldownLeft) {
    const gameEnded = this.isGameEnded();
    const composition = this.plannedSortieComposition();
    const waveCap = this.sortieSoldierLimit(d);
    const capacities = this.sortiePlanCapacities(d);
    const planLimit = this.availableSortieSoldiers();
    if (ui.soldierTotal) ui.soldierTotal.textContent = fmt(sortiePool, 0);
    if (ui.soldierWaveCap) ui.soldierWaveCap.textContent = fmt(waveCap, 0);
    if (ui.soldierCooldown) ui.soldierCooldown.textContent = cooldownLeft > 0 ? `${fmt(cooldownLeft, 0)}s` : "--";
    if (ui.sortiePlanTotal) ui.sortiePlanTotal.textContent = `${fmt(composition.total, 0)} / ${fmt(waveCap, 0)}`;

    if (ui.sortiePlanList && !this.shouldPreserveTouchedButton(ui.sortiePlanList)) {
      ui.sortiePlanList.replaceChildren();
      const totalPlanned = Math.max(1, composition.total);
      for (const item of SORTIE_PLAN_VARIANTS) {
        const owned = Math.max(0, Math.floor(d[item.derivedKey] ?? 0));
        const available = capacities[item.compositionKey] ?? 0;
        const planned = Math.max(0, Math.floor(composition[item.compositionKey] ?? 0));
        const share = composition.total > 0 ? Math.round((planned / totalPlanned) * 100) : 0;
        const row = document.createElement("div");
        row.className = "sortie-plan-row";
        row.dataset.variant = item.variant;

        const kind = document.createElement("strong");
        kind.className = "sortie-plan-kind";
        kind.innerHTML = `${this.iconImage(item.icon)}<span>${item.label}</span>`;

        const role = document.createElement("span");
        role.className = "sortie-plan-role";
        role.textContent = item.role;

        const count = document.createElement("strong");
        count.className = "sortie-plan-owned";
        count.textContent = fmt(owned, 0);

        const control = document.createElement("div");
        control.className = "sortie-count-control";
        control.title = `巣内 ${fmt(available, 0)} / 一波上限 ${fmt(planLimit, 0)}`;
        const minus = document.createElement("button");
        minus.type = "button";
        minus.disabled = gameEnded || planned <= 0;
        minus.textContent = "-";
        minus.setAttribute("aria-label", `${item.label}を減らす`);
        minus.addEventListener("click", () => this.changeSortiePlan(item.compositionKey, -1));
        const plannedText = document.createElement("strong");
        plannedText.textContent = fmt(planned, 0);
        const plus = document.createElement("button");
        plus.type = "button";
        plus.disabled = gameEnded || planned >= available || composition.total >= planLimit;
        plus.textContent = "+";
        plus.setAttribute("aria-label", `${item.label}を増やす`);
        plus.addEventListener("click", () => this.changeSortiePlan(item.compositionKey, 1));
        control.append(minus, plannedText, plus);

        const track = document.createElement("div");
        track.className = "sortie-share-track";
        const fill = document.createElement("span");
        fill.style.width = `${share}%`;
        track.append(fill);

        row.append(kind, role, count, control, track);
        ui.sortiePlanList.append(row);
      }
    }

    const known = this.isRivalNestKnown();
    const defeated = Boolean(this.rivalNest.defeated);
    const integrity = clamp(this.rivalNest.integrity ?? 1, 0, 1);
    const distance = this.rivalNestDistanceFromColony();
    const riskScore = clamp(this.colony.enemyThreat * 0.08 + (known ? 0.38 : 0.22) + (1 - integrity) * 0.2 + distance / Math.max(this.worldRadius * 3.2, 1), 0, 1);
    const riskLabel = defeated ? "制圧済み" : !known ? "不明" : riskScore > 0.62 ? "高" : riskScore > 0.36 ? "中" : "低";
    if (ui.soldierTargetTitle) {
      ui.soldierTargetTitle.textContent = defeated ? "敵巣陥落済み" : known ? "発見済み敵巣" : "敵巣未発見";
    }
    if (ui.soldierTargetDistance) ui.soldierTargetDistance.textContent = known || defeated ? `${fmt(distance, 0)} m` : "--";
    if (ui.soldierTargetRisk) {
      ui.soldierTargetRisk.textContent = riskLabel;
      ui.soldierTargetRisk.closest(".target-card-row")?.classList.toggle("target-card-risk-high", riskLabel === "高");
    }
    if (ui.soldierTargetIntegrityText) ui.soldierTargetIntegrityText.textContent = known || defeated ? `${fmt(integrity * 3600, 0)} / 3,600` : "--";
    if (ui.soldierTargetIntegrityFill) ui.soldierTargetIntegrityFill.style.width = `${Math.round(integrity * 100)}%`;
    if (ui.soldierTargetHint) {
      ui.soldierTargetHint.textContent = defeated
        ? "襲撃拠点は制圧済みです。防衛出動を優先できます。"
        : known
          ? "耐久を0にすると陥落。残存兵力が多いほど守備が強化される。"
          : "偵察または探索で敵巣を発見すると遠征出動できます。";
    }
  }

  updateWallPlacementConfirmButton() {
    const button = ui.constructionWallConfirmBtn;
    if (!button) return;
    const isPending = this.pendingConstructionKind === "earthWall";
    const targets = isPending ? this.wallPlacementTargetsFromDraft(false) : [];
    const metrics = this.wallPlacementMetrics(targets, this.wallPlacementPoints(false));
    const placementPanel = ui.constructionPlacementPanel;
    const pendingDef = this.pendingConstructionKind ? getConstructionDef(this.pendingConstructionKind) : null;
    if (placementPanel) placementPanel.hidden = !this.pendingConstructionKind;
    if (ui.constructionPlacementKind) ui.constructionPlacementKind.textContent = pendingDef ? this.constructionShortLabel(this.pendingConstructionKind) : "土木";
    if (ui.constructionPlacementMode) {
      ui.constructionPlacementMode.textContent = this.pendingConstructionKind === "earthWall"
        ? metrics.targetCount > 0 ? `${fmt(metrics.vertexCount, 0)}点 / 工数 ${fmt(metrics.cost, 1)}` : "場所指定中"
        : this.pendingConstructionKind ? "場所指定中" : "待機";
    }
    if (ui.constructionPlacementNote) {
      ui.constructionPlacementNote.textContent = this.pendingConstructionKind === "earthWall"
        ? "採土・往復・担当数で変動"
        : pendingDef ? `${pendingDef.effect} / 採土・往復・担当数で変動` : "採土・往復・担当数で変動";
    }
    button.hidden = !isPending;
    button.disabled = metrics.targetCount <= 0;
    button.title = metrics.targetCount > 0
      ? `土壁を確定: 一筆線 / 全長 ${fmt(metrics.totalLength, 0)} / 工数 ${fmt(metrics.cost, 1)}`
      : "土壁の頂点を2つ以上指定";
    const main = button.querySelector(".button-main");
    const sub = button.querySelector(".button-sub");
    if (main) main.textContent = metrics.targetCount > 0 ? "土壁の一筆線を決定" : "土壁の開始点を指定";
    if (sub) sub.textContent = metrics.targetCount > 0 ? `${fmt(metrics.vertexCount, 0)}点 / 全長${fmt(metrics.totalLength, 0)} / 工数${fmt(metrics.cost, 1)}` : "地面をクリックして開始点を置く";
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
    if (this.shouldPreserveTouchedButton(ui.constructionProgressList)) return;
    this.cleanupBuildTaskAssignments();
    const activeTasks = this.buildTasks.filter((task) => task.progress < task.maxProgress);
    ui.constructionProgressList.replaceChildren();
    if (activeTasks.length <= 0) {
      const empty = document.createElement("div");
      empty.className = "construction-task";
      empty.textContent = this.constructionMessage || "作業なし";
      ui.constructionProgressList.append(empty);
      return;
    }
    const heading = document.createElement("div");
    heading.className = "construction-progress-heading";
    heading.textContent = "作業中";
    ui.constructionProgressList.append(heading);
    for (const task of activeTasks) {
      const progress = clamp(task.progress / Math.max(task.maxProgress, 0.001), 0, 1);
      const percent = Math.round(progress * 100);
      const detail = getConstructionDef(task.kind);
      const assigneeCount = Math.max(this.constructionAssignees(task).length, this.normalizeBuildTaskClaims(task).length);
      const assigneeTarget = this.normalizeBuildTaskAssigneeTarget(task);
      const assigneeLimit = this.buildTaskAssigneeLimit();
      const row = document.createElement("div");
      row.className = "construction-task";

      const iconWrap = document.createElement("span");
      iconWrap.className = "construction-task-icon";
      const icon = document.createElement("img");
      icon.src = this.constructionIconAsset(task.kind);
      icon.alt = "";
      icon.loading = "lazy";
      icon.setAttribute("aria-hidden", "true");
      iconWrap.append(icon);

      const body = document.createElement("div");
      body.className = "construction-task-body";

      const header = document.createElement("div");
      header.className = "construction-task-header";
      const label = document.createElement("strong");
      label.textContent = this.constructionTaskDisplayLabel(task);
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
      meta.textContent = `${this.constructionTaskStatus(task)} / 工数 ${fmt(task.maxProgress, 1)} / 目安 ${detail.timeHint} / ${detail.timeNote}`;
      body.append(header, track, meta);

      const controls = document.createElement("div");
      controls.className = "construction-crew-controls";
      const controlsLabel = document.createElement("span");
      controlsLabel.className = "construction-crew-label";
      controlsLabel.textContent = `担当 ${fmt(assigneeCount, 0)}/${fmt(assigneeTarget, 0)}`;
      const decrease = document.createElement("button");
      decrease.type = "button";
      decrease.dataset.buildTask = String(task.id);
      decrease.dataset.crewDelta = "-1";
      decrease.disabled = this.isGameEnded() || assigneeTarget <= 1;
      decrease.title = "担当を1匹減らす";
      decrease.textContent = "-";
      const target = document.createElement("span");
      target.textContent = `${fmt(assigneeTarget, 0)}/${fmt(assigneeLimit, 0)}`;
      const increase = document.createElement("button");
      increase.type = "button";
      increase.dataset.buildTask = String(task.id);
      increase.dataset.crewDelta = "1";
      increase.disabled = this.isGameEnded() || assigneeTarget >= assigneeLimit;
      increase.title = "担当を1匹増やす";
      increase.textContent = "+";
      controls.append(controlsLabel, decrease, target, increase);
      target.textContent = `目標 ${fmt(assigneeTarget, 0)}/${fmt(assigneeLimit, 0)}`;

      row.append(iconWrap, body, controls);
      ui.constructionProgressList.append(row);
    }
  }

  barracksStatusText() {
    const active = this.barracksQueue()[0];
    if (!active) return "キューなし";
    const def = getBarracksTrainingDef(active.variant);
    if (active.remainingSeconds <= 0 && !this.canCompleteBarracksTraining(active.variant)) {
      return `${def.label} 完了待ち / 上限`;
    }
    const secondsLeft = active.remainingSeconds / this.barracksTrainingSpeedMultiplier(active.variant);
    return `${def.label} 育成中 / 残り ${fmt(Math.ceil(secondsLeft), 0)}s`;
  }

  renderBarracksPanel() {
    if (!ui.barracksTrainingList || !ui.barracksQueueList) return;
    if (
      this.shouldPreserveTouchedButton(ui.barracksTrainingList)
      || this.shouldPreserveTouchedButton(ui.barracksQueueList)
    ) return;
    const d = this.computeDerived();
    ui.barracksQueueList.replaceChildren();
    const queue = this.barracksQueue();
    if (queue.length <= 0) {
      const empty = document.createElement("div");
      empty.className = "barracks-empty-queue";
      empty.innerHTML = `
        <strong>育成キューなし</strong>
        <span>次に育てる候補から1匹ずつキューへ追加します。</span>
      `;
      ui.barracksQueueList.append(empty);
    } else {
      const active = queue[0];
      const activeDef = getBarracksTrainingDef(active.variant);
      const activeUi = this.barracksVariantUi(active.variant);
      const progress = clamp(1 - active.remainingSeconds / Math.max(active.totalSeconds, 0.001), 0, 1);
      const secondsLeft = active.remainingSeconds / this.barracksTrainingSpeedMultiplier(active.variant);

      const shell = document.createElement("div");
      shell.className = "barracks-queue-shell";

      const activeCard = document.createElement("div");
      activeCard.className = "barracks-active-card";
      activeCard.innerHTML = `
        <span class="barracks-active-state">育成中</span>
        <span class="barracks-active-icon">${this.iconImage(activeUi.asset, "barracks-ant-icon", activeDef.label)}</span>
        <div class="barracks-active-body">
          <strong>${activeDef.label}</strong>
          <div class="barracks-progress-track" aria-hidden="true">
            <span class="barracks-progress-fill" style="width: ${Math.round(progress * 100)}%"></span>
          </div>
          <div class="barracks-active-meta">
            <span>${fmt(Math.max(0, active.totalSeconds - active.remainingSeconds), 0)}s / ${fmt(active.totalSeconds, 0)}s</span>
            <strong>残り ${fmt(Math.ceil(secondsLeft), 0)}s</strong>
          </div>
        </div>
      `;

      const rail = document.createElement("div");
      rail.className = "barracks-queue-rail";
      const railLabel = document.createElement("span");
      railLabel.className = "barracks-queue-rail-label";
      railLabel.textContent = "待ちキュー";
      rail.append(railLabel);
      for (let index = 0; index < 6; index += 1) {
        const order = queue[index + 1];
        const slot = document.createElement("div");
        slot.className = order ? "barracks-queue-slot is-filled" : "barracks-queue-slot";
        if (order) {
          const def = getBarracksTrainingDef(order.variant);
          const variantUi = this.barracksVariantUi(order.variant);
          slot.innerHTML = `
            <span class="barracks-slot-index">${index + 1}</span>
            <span class="barracks-slot-icon">${this.iconImage(variantUi.asset, "barracks-slot-image", def.label)}</span>
            <strong>${def.label}</strong>
          `;
        } else {
          slot.innerHTML = `<span class="barracks-slot-index">${index + 1}</span><strong>空き</strong>`;
        }
        rail.append(slot);
      }

      shell.append(activeCard, rail);
      ui.barracksQueueList.append(shell);
    }

    ui.barracksTrainingList.replaceChildren();
    const createTrainingCard = (variant, index) => {
      const def = getBarracksTrainingDef(variant);
      const variantUi = this.barracksVariantUi(variant);
      const state = this.canStartBarracksTraining(variant);
      const current = this.barracksCurrentCount(variant, d);
      const pending = this.barracksPendingCount(variant);
      const card = document.createElement("article");
      card.className = "barracks-card";

      const rank = document.createElement("span");
      rank.className = "barracks-recommend-rank";
      rank.textContent = String(index + 1);

      const icon = document.createElement("span");
      icon.className = "barracks-card-icon";
      icon.innerHTML = this.iconImage(variantUi.asset, "barracks-ant-icon", def.label);

      const body = document.createElement("div");
      body.className = "barracks-card-body";
      body.innerHTML = `
        <div class="barracks-card-heading">
          <strong>${def.label}</strong>
          <span>${variantUi.tag}</span>
        </div>
        <span>所持 ${fmt(current, 0)}${pending > 0 ? ` + ${fmt(pending, 0)}` : ""}</span>
        <div class="barracks-card-meta">
          <span>食料 ${fmt(def.foodCost, 0)}</span>
          <span>時間 ${fmt(def.trainingSeconds, 0)}s</span>
        </div>
      `;

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.trainVariant = def.variant;
      button.disabled = !state.ok;
      button.title = state.ok ? `${def.label}を育成キューへ追加` : state.reason;
      button.setAttribute("aria-label", state.ok ? `${def.label}を育成キューへ追加` : `${def.label}: ${state.reason}`);
      button.textContent = state.ok ? "+" : "×";

      const stateText = document.createElement("span");
      stateText.className = "barracks-card-state";
      stateText.textContent = state.ok ? "育成可能" : state.reason;

      card.append(rank, icon, body, button, stateText);
      return card;
    };

    BARRACKS_ALWAYS_VISIBLE_VARIANTS.forEach((variant, index) => {
      ui.barracksTrainingList.append(createTrainingCard(variant, index));
    });
  }

  updateStats() {
    const d = this.computeDerived();
    const deployedSoldiers = this.deployedSoldierCount();
    const availableSoldiers = this.availableSortieSoldiers();
    const plannedSortie = this.plannedSortieCount();
    const plannedRecon = this.plannedReconScoutCount(d);
    const sortiePool = this.sortieSoldierPool(d);
    const activeConstruction = this.buildTasks.filter((task) => task.progress < task.maxProgress).length;
    const completeConstruction = this.earthworks.filter((earthwork) => earthwork.strength > 0.95).length;
    const reservedBuilderTargets = this.buildTasks
      .filter((task) => task.progress < task.maxProgress)
      .reduce((sum, task) => sum + this.normalizeBuildTaskAssigneeTarget(task), 0);
    const trailCommand = this.canStartConstruction("trailReinforce");
    const barricadeCommand = this.canStartConstruction("lowBarricade");
    const wallCommand = this.canStartConstruction("earthWall");
    const sentryCommand = this.canStartConstruction("sentryMound");
    const cooldownLeft = Math.ceil(this.soldierSortieCooldown);
    const raid = this.ensureRaidState();
    const raidTime = Math.max(0, Math.ceil(raid.timer));
    const enemyNestLabel = this.rivalNest.defeated ? "敵巣陥落" : this.isRivalNestKnown() ? `敵巣発見 ${fmt((this.rivalNest.integrity ?? 1) * 100, 0)}%` : `探索範囲 ${fmt(this.mapVisionRadiusValue || this.mapVisionRadius(d), 0)}`;
    const gameEnded = this.isGameEnded();
    const gameEndCopy = this.gameEndCopy();
    const raidLabel =
      gameEnded ? `${gameEndCopy.title}: ${gameEndCopy.detail}` :
      raid.phase === "warning" ? `敵襲予兆 ${raidTime}s / 防衛準備` :
      raid.phase === "active" ? `敵襲防衛中 / 侵入 ${this.raidRivals().length}` :
      raid.phase === "retreating" ? "敵アリ退却中" :
      raid.phase === "recovering" ? `防衛後の警戒 ${raidTime}s` :
      `${enemyNestLabel} / 次の敵襲まで ${raidTime}s`;
    const barracksQueue = this.barracksQueue();
    const activeBarracksOrder = barracksQueue[0];
    const activeBarracksProgress = activeBarracksOrder
      ? clamp(1 - activeBarracksOrder.remainingSeconds / Math.max(activeBarracksOrder.totalSeconds, 0.001), 0, 1)
      : 0;
    const activeBarracksRate = activeBarracksOrder ? (60 * this.barracksTrainingSpeedMultiplier(activeBarracksOrder.variant)) / Math.max(activeBarracksOrder.totalSeconds, 0.001) : 0;

    ui.statFood.textContent = fmt(this.colony.food, 0);
    ui.statAnts.textContent = `${fmt(this.colony.antPopulation, 0)}/${fmt(d.capacity, 0)}`;
    if (ui.statNestDurability) ui.statNestDurability.textContent = `${fmt(this.colony.nestDurability, 0)}/${fmt(PLAYER_NEST_MAX_DURABILITY, 0)}`;
    ui.statFoodRate.textContent = fmt(this.recentForagingPerMinute(), 1);
    ui.statNestLevel.textContent = fmt(this.colony.nestLevel, 0);
    ui.statCapacity.textContent = fmt(d.capacity, 0);
    ui.statSoldiers.textContent = fmt(this.colony.soldierAnts, 0);
    ui.statWounded.textContent = fmt(this.colony.woundedAnts, 0);
    ui.statGrowthRate.textContent = fmt(activeBarracksRate, 2);
    ui.statThreat.textContent = fmt(this.colony.enemyThreat, 1);
    ui.colonySummary.textContent =
      `巣Lv${this.colony.nestLevel} / 巣耐久 ${fmt(this.colony.nestDurability, 0)}/${fmt(PLAYER_NEST_MAX_DURABILITY, 0)} / 働き蟻 ${fmt(d.workers, 0)} / 兵隊 ${fmt(d.normalSoldiers, 0)} / 重兵装 ${fmt(d.heavySoldiers, 0)} / 盾頭 ${fmt(d.shieldHeads, 0)} / 酸射 ${fmt(d.acidShooters, 0)} / 斥候 ${fmt(d.scouts, 0)} / 救護 ${fmt(d.medics, 0)} / 小隊長 ${fmt(d.captains, 0)} / 土木 ${fmt(d.builders, 0)}`;
    ui.growthFill.style.width = `${Math.round(activeBarracksProgress * 100)}%`;
    const pendingConstructionLabel = this.pendingConstructionKind === "earthWall"
      ? `${this.constructionLabel(this.pendingConstructionKind)} 一筆線指定中`
      : this.pendingConstructionKind ? `${this.constructionLabel(this.pendingConstructionKind)} 場所指定中` : "";
    ui.activeToolLabel.textContent = pendingConstructionLabel || (gameEnded ? raidLabel : this.raidSoonMode ? "通常モード / 敵襲を短縮確認中" : raidLabel);
    document.body.classList.toggle("is-game-ended", gameEnded);
    if (ui.gameEndBanner) {
      ui.gameEndBanner.hidden = !gameEnded;
      ui.gameEndBanner.classList.toggle("is-victory", this.colony.gameStatus === "victory");
      ui.gameEndBanner.classList.toggle("is-defeat", this.colony.gameStatus === "defeat");
      if (ui.gameEndTitle) ui.gameEndTitle.textContent = gameEnded ? gameEndCopy.title : "";
      if (ui.gameEndDetail) ui.gameEndDetail.textContent = gameEnded ? gameEndCopy.detail : "";
    }
    if (ui.constructionBuilders) ui.constructionBuilders.textContent = fmt(d.builders, 0);
    if (ui.constructionIdle) ui.constructionIdle.textContent = fmt(Math.max(0, (d.builders ?? 0) - reservedBuilderTargets), 0);
    if (ui.constructionActive) ui.constructionActive.textContent = fmt(activeConstruction, 0);
    if (ui.constructionComplete) ui.constructionComplete.textContent = fmt(completeConstruction, 0);
    this.updateConstructionCommandButton(ui.constructionTrailBtn, "trailReinforce", trailCommand);
    this.updateConstructionCommandButton(ui.constructionBarricadeBtn, "lowBarricade", barricadeCommand);
    this.updateConstructionCommandButton(ui.constructionWallBtn, "earthWall", wallCommand);
    this.updateConstructionCommandButton(ui.constructionSentryBtn, "sentryMound", sentryCommand);
    this.updateWallPlacementConfirmButton();
    if (ui.constructionStatus) {
      const activeProgress = this.buildTasks
        .filter((task) => task.progress < task.maxProgress)
        .map((task) => clamp(task.progress / Math.max(task.maxProgress, 0.001), 0, 1));
      const averageProgress = activeProgress.length > 0
        ? Math.round((activeProgress.reduce((sum, value) => sum + value, 0) / activeProgress.length) * 100)
        : 0;
      ui.constructionStatus.textContent =
        this.pendingConstructionKind ? `${this.constructionShortLabel(this.pendingConstructionKind)} 場所指定中 / 採土・往復・担当数で変動` :
        activeConstruction > 0 ? `作業中 ${fmt(activeConstruction, 0)} / 平均 ${averageProgress}% / 完成 ${fmt(completeConstruction, 0)}` :
        this.constructionMessage || "待機";
    }
    if (ui.constructionCrew) {
      const crew = this.constructionCrewStatus();
      ui.constructionCrew.textContent =
        `採土 ${fmt(crew.fetching, 0)} / 運搬 ${fmt(crew.carrying, 0)} / 作業 ${fmt(crew.building, 0)} / 退避 ${fmt(crew.retreating, 0)} / 待機 ${fmt(crew.idle, 0)}`;
    }
    if (this.activeTab === "construction") this.renderConstructionProgress();
    if (ui.barracksQueueCount) ui.barracksQueueCount.textContent = fmt(barracksQueue.length, 0);
    if (ui.barracksActive) ui.barracksActive.textContent = activeBarracksOrder ? getBarracksTrainingDef(activeBarracksOrder.variant).label : "なし";
    if (ui.barracksStatus) ui.barracksStatus.textContent = this.barracksStatusText();
    if (this.activeTab === "barracks") this.renderBarracksPanel();
    if (ui.soldierNest) ui.soldierNest.textContent = fmt(Math.max(0, sortiePool - deployedSoldiers), 0);
    ui.soldierDeployed.textContent = fmt(deployedSoldiers, 0);
    ui.soldierStatus.textContent =
      deployedSoldiers > 0 ? "出撃中" :
      cooldownLeft > 0 ? `再準備 ${cooldownLeft}s` :
      plannedSortie > 0 ? `出撃可 ${plannedSortie}` :
      availableSoldiers > 0 ? "上限待ち" : "兵隊不足";
    this.renderMilitaryPanel(d, plannedSortie, deployedSoldiers, sortiePool, cooldownLeft);
    this.updateSortieCommandButton(ui.soldierSortieBtn, "defense", plannedSortie, cooldownLeft);
    this.updateReconCommandButton(ui.reconSortieBtn, plannedRecon, cooldownLeft);
    this.updateSortieCommandButton(ui.expeditionSortieBtn, "expedition", plannedSortie, cooldownLeft);
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
