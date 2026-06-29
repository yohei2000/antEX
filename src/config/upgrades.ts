export interface UpgradeRequirement {
  ants?: number;
  lifetimeFood?: number;
  territory?: number;
  nestLevel?: number;
  upgrades?: Record<string, number>;
}

export interface UpgradeDef {
  id: string;
  branch: string;
  name: string;
  desc: string;
  effect: string;
  max: number;
  baseCost: number;
  costScale: number;
  requires: UpgradeRequirement;
}

export const UPGRADE_BRANCHES = [
  { id: "foraging", name: "採餌網" },
  { id: "nursery", name: "育房" },
  { id: "architecture", name: "巣構造" },
  { id: "defense", name: "防衛" },
];

export const UPGRADE_DEFS: UpgradeDef[] = [
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
    id: "builderTraining",
    branch: "architecture",
    name: "土木アリを育てる",
    desc: "土粒を運ぶ作業アリを育て、採餌道と巣口を整える",
    effect: "土木アリの育成を解禁し、育成速度を少し上げる",
    max: 5,
    baseCost: 150,
    costScale: 1.75,
    requires: { ants: 16, upgrades: { chamberExcavation: 1 } },
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
    effect: "育成速度と負傷回復を上げる",
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
    effect: "育成速度を上げる",
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
    effect: "育成速度と採餌効率を少し上げる",
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
    effect: "育成速度を大きく上げる",
    max: 8,
    baseCost: 120,
    costScale: 2.05,
    requires: { lifetimeFood: 160, upgrades: { broodNursery: 1 } },
  },
  {
    id: "soldierTraining",
    branch: "defense",
    name: "兵隊訓練",
    desc: "大きめの働き蟻を巣内兵隊として育てる",
    effect: "兵隊比率と攻撃力を上げる",
    max: 6,
    baseCost: 180,
    costScale: 2.1,
    requires: { ants: 24, nestLevel: 2 },
  },
  {
    id: "heavySoldierBrood",
    branch: "defense",
    name: "重兵装アリを育てる",
    desc: "大きな頭部と厚い外骨格を持つ兵隊アリを育てる",
    effect: "巣防衛と押し合いに強い兵隊の育成を解禁し、育成速度を少し上げる",
    max: 4,
    baseCost: 260,
    costScale: 1.95,
    requires: { ants: 24, nestLevel: 2, upgrades: { soldierTraining: 1 } },
  },
  {
    id: "shieldHeadBrood",
    branch: "defense",
    name: "盾頭アリを育てる",
    desc: "平たく大きな頭で巣口や狭い道を塞ぐ兵隊を育てる",
    effect: "敵の侵入と突破圧を遅らせる兵隊の育成を解禁し、育成速度を少し上げる",
    max: 4,
    baseCost: 245,
    costScale: 1.92,
    requires: { ants: 24, nestLevel: 2, upgrades: { soldierTraining: 1 } },
  },
  {
    id: "acidShooterBrood",
    branch: "defense",
    name: "酸射アリを育てる",
    desc: "腹部を持ち上げ、短射程の酸で敵の動きを鈍らせる兵隊を育てる",
    effect: "敵へ酸をかける兵隊の育成を解禁し、育成速度を少し上げる",
    max: 4,
    baseCost: 230,
    costScale: 1.9,
    requires: { ants: 24, nestLevel: 2, upgrades: { soldierTraining: 1 } },
  },
  {
    id: "scoutBrood",
    branch: "defense",
    name: "斥候アリを育てる",
    desc: "長い触角で敵を見つけ、味方の狙いを揃える軽量兵を育てる",
    effect: "敵を標識する軽量兵の育成を解禁し、育成速度を少し上げる",
    max: 4,
    baseCost: 210,
    costScale: 1.88,
    requires: { ants: 24, nestLevel: 2, upgrades: { soldierTraining: 1 } },
  },
  {
    id: "captainBrood",
    branch: "defense",
    name: "小隊長アリを育てる",
    desc: "周囲の兵隊をまとめ、前線で狙いと隊列を揃える指揮個体を育てる",
    effect: "一時小隊を作る指揮個体の育成を解禁し、育成速度を少し上げる",
    max: 3,
    baseCost: 280,
    costScale: 2.02,
    requires: { ants: 30, nestLevel: 3, upgrades: { soldierTraining: 2 } },
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

export function upgradeCost(upgrade: UpgradeDef, level: number) {
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.costScale, level));
}

export function upgradeLevel(upgrades: Record<string, number> | undefined, id: string) {
  return Math.max(0, Number(upgrades?.[id]) || 0);
}

export function upgradeName(id: string) {
  return UPGRADE_DEFS.find((upgrade) => upgrade.id === id)?.name ?? id;
}
