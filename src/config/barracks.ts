import type { AntVariant } from "./variants";

export const BARRACKS_TRAINING_VARIANTS = [
  "worker",
  "builder",
  "soldier",
  "heavySoldier",
  "shieldHead",
  "acidShooter",
  "scout",
  "captain",
] as const;

export type BarracksTrainingVariant = typeof BARRACKS_TRAINING_VARIANTS[number];

export interface BarracksTrainingDef {
  variant: BarracksTrainingVariant;
  label: string;
  summary: string;
  foodCost: number;
  trainingSeconds: number;
  requiresUpgrade?: string;
}

export const BARRACKS_QUEUE_CAP = 30;

export const BARRACKS_TRAINING_DEFS: Record<BarracksTrainingVariant, BarracksTrainingDef> = {
  worker: {
    variant: "worker",
    label: "働きアリ",
    summary: "採餌を担う基本個体。総アリ数を1増やす",
    foodCost: 6,
    trainingSeconds: 12,
  },
  builder: {
    variant: "builder",
    label: "土木アリ",
    summary: "工事に割り当てる作業個体。未割当時は巣内で待機",
    foodCost: 10,
    trainingSeconds: 24,
    requiresUpgrade: "builderTraining",
  },
  soldier: {
    variant: "soldier",
    label: "兵隊アリ",
    summary: "標準的な前衛。巣内兵力を1増やす",
    foodCost: 8,
    trainingSeconds: 18,
  },
  heavySoldier: {
    variant: "heavySoldier",
    label: "重兵装アリ",
    summary: "遅いが硬く、前線を支える",
    foodCost: 15,
    trainingSeconds: 36,
    requiresUpgrade: "heavySoldierBrood",
  },
  shieldHead: {
    variant: "shieldHead",
    label: "盾頭アリ",
    summary: "敵を押し返す壁役",
    foodCost: 13,
    trainingSeconds: 32,
    requiresUpgrade: "shieldHeadBrood",
  },
  acidShooter: {
    variant: "acidShooter",
    label: "酸射アリ",
    summary: "酸で敵の動きを鈍らせる支援兵",
    foodCost: 12,
    trainingSeconds: 28,
    requiresUpgrade: "acidShooterBrood",
  },
  scout: {
    variant: "scout",
    label: "斥候アリ",
    summary: "敵を標識し、狙いを揃える",
    foodCost: 10,
    trainingSeconds: 22,
    requiresUpgrade: "scoutBrood",
  },
  captain: {
    variant: "captain",
    label: "小隊長アリ",
    summary: "小隊の集合位置と集中目標を揃える",
    foodCost: 18,
    trainingSeconds: 42,
    requiresUpgrade: "captainBrood",
  },
};

export function isBarracksTrainingVariant(variant: unknown): variant is BarracksTrainingVariant {
  return BARRACKS_TRAINING_VARIANTS.includes(variant as BarracksTrainingVariant);
}

export function normalizeBarracksTrainingVariant(variant: unknown): BarracksTrainingVariant {
  return isBarracksTrainingVariant(variant) ? variant : "soldier";
}

export function getBarracksTrainingDef(variant: unknown): BarracksTrainingDef {
  return BARRACKS_TRAINING_DEFS[normalizeBarracksTrainingVariant(variant)];
}

export function isCombatAntVariant(variant: AntVariant): variant is BarracksTrainingVariant {
  return (
    variant === "soldier" ||
    variant === "heavySoldier" ||
    variant === "shieldHead" ||
    variant === "acidShooter" ||
    variant === "scout" ||
    variant === "captain"
  );
}
