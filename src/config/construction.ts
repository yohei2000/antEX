export const CONSTRUCTION_KINDS = ["trailReinforce", "lowBarricade", "earthWall"] as const;

export type ConstructionKind = typeof CONSTRUCTION_KINDS[number];

export interface ConstructionDef {
  label: string;
  command: string;
  timeNote: string;
  effect: string;
  buttonSummary: string;
  defaultRadius: number;
  targetRadius: number;
  buildCost: number;
  timeHint: string;
  completedLimit: number;
  requiresHeavySoldier: boolean;
  enemySlowStrength: number;
  braceBonus: number;
  wallAttackBonus: number;
  wallTopHeight: number;
  startMessage: string;
  startLog: string;
  completeMessage: string;
  completeLog: string;
}

export const CONSTRUCTION_DEFS: Record<ConstructionKind, ConstructionDef> = {
  trailReinforce: {
    label: "採餌道",
    command: "採餌道を整える",
    timeNote: "完了時間は距離・担当数で変動",
    effect: "味方の移動と採餌効率を少し上げる",
    buttonSummary: "移動・採餌効率↑",
    defaultRadius: 12,
    targetRadius: 13,
    buildCost: 2.8,
    timeHint: "短め",
    completedLimit: 4,
    requiresHeavySoldier: false,
    enemySlowStrength: 0,
    braceBonus: 0,
    wallAttackBonus: 0,
    wallTopHeight: 0,
    startMessage: "採餌道整備を発注",
    startLog: "土木指示: 採餌道を整える",
    completeMessage: "採餌道整備が完成",
    completeLog: "土木アリが採餌道を整えた",
  },
  lowBarricade: {
    label: "低い土塁",
    command: "低い土塁を築く",
    timeNote: "完了時間は距離・担当数で変動",
    effect: "敵を少し鈍らせ、重兵装の踏ん張りを助ける",
    buttonSummary: "敵減速・踏ん張り↑",
    defaultRadius: 10,
    targetRadius: 10,
    buildCost: 3.6,
    timeHint: "中くらい",
    completedLimit: 3,
    requiresHeavySoldier: true,
    enemySlowStrength: 0.16,
    braceBonus: 0.28,
    wallAttackBonus: 0,
    wallTopHeight: 0,
    startMessage: "低い土塁を発注",
    startLog: "土木指示: 低い土塁を築く",
    completeMessage: "低い土塁が完成",
    completeLog: "土木アリが低い土塁を固めた",
  },
  earthWall: {
    label: "大きな土壁",
    command: "大きな土壁を築く",
    timeNote: "完了時間は線の長さ・採土・往復・担当数で大きく変動",
    effect: "敵の侵入を大きく遅らせ、壁上の味方攻撃を強く助ける",
    buttonSummary: "侵入遅延・壁上攻撃↑↑",
    defaultRadius: 14,
    targetRadius: 14,
    buildCost: 7.2,
    timeHint: "長め",
    completedLimit: 2,
    requiresHeavySoldier: true,
    enemySlowStrength: 0.62,
    braceBonus: 0.55,
    wallAttackBonus: 1.15,
    wallTopHeight: 0.58,
    startMessage: "大きな土壁を発注",
    startLog: "土木指示: 大きな土壁を築く",
    completeMessage: "大きな土壁が完成",
    completeLog: "土木アリが大きな土壁を固めた",
  },
};

export function isConstructionKind(kind: unknown): kind is ConstructionKind {
  return CONSTRUCTION_KINDS.includes(kind as ConstructionKind);
}

export function normalizeConstructionKind(kind: unknown): ConstructionKind {
  return isConstructionKind(kind) ? kind : "trailReinforce";
}

export function getConstructionDef(kind: unknown): ConstructionDef {
  return CONSTRUCTION_DEFS[normalizeConstructionKind(kind)];
}
