export const CONSTRUCTION_KINDS = ["trailReinforce", "lowBarricade"] as const;

export type ConstructionKind = typeof CONSTRUCTION_KINDS[number];

export interface ConstructionDef {
  label: string;
  command: string;
  timeNote: string;
  effect: string;
  defaultRadius: number;
  targetRadius: number;
  defaultMaxProgress: number;
  completedLimit: number;
  requiresHeavySoldier: boolean;
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
    defaultRadius: 12,
    targetRadius: 13,
    defaultMaxProgress: 2.8,
    completedLimit: 4,
    requiresHeavySoldier: false,
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
    defaultRadius: 10,
    targetRadius: 10,
    defaultMaxProgress: 3.6,
    completedLimit: 3,
    requiresHeavySoldier: true,
    startMessage: "低い土塁を発注",
    startLog: "土木指示: 低い土塁を築く",
    completeMessage: "低い土塁が完成",
    completeLog: "土木アリが低い土塁を固めた",
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
