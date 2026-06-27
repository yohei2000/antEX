import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_DEFS,
  CONSTRUCTION_KINDS,
  getConstructionDef,
  isConstructionKind,
  normalizeConstructionKind,
} from "../../src/config/construction";

describe("construction registry", () => {
  it("keeps construction kinds and definitions in one registry", () => {
    expect(CONSTRUCTION_KINDS).toEqual(["trailReinforce", "lowBarricade", "earthWall"]);
    expect(Object.keys(CONSTRUCTION_DEFS).sort()).toEqual([...CONSTRUCTION_KINDS].sort());
  });

  it("exposes construction costs and timing hints from the registry", () => {
    expect(getConstructionDef("trailReinforce")).toMatchObject({
      label: "採餌道",
      defaultRadius: 12,
      targetRadius: 13,
      buildCost: 2.8,
      timeHint: "短め",
      completedLimit: 4,
      requiresHeavySoldier: false,
      startMessage: "採餌道整備を発注",
      completeMessage: "採餌道整備が完成",
    });
    expect(getConstructionDef("lowBarricade")).toMatchObject({
      label: "低い土塁",
      defaultRadius: 10,
      targetRadius: 10,
      buildCost: 3.6,
      timeHint: "中くらい",
      completedLimit: 3,
      requiresHeavySoldier: true,
      startMessage: "低い土塁を発注",
      completeMessage: "低い土塁が完成",
    });
    expect(getConstructionDef("earthWall")).toMatchObject({
      label: "大きな土壁",
      defaultRadius: 14,
      targetRadius: 14,
      buildCost: 7.2,
      timeHint: "長め",
      completedLimit: 2,
      requiresHeavySoldier: true,
      enemySlowStrength: 0.28,
      braceBonus: 0.42,
      startMessage: "大きな土壁を発注",
      completeMessage: "大きな土壁が完成",
    });
  });

  it("normalizes unknown construction kinds for old or malformed saves", () => {
    expect(isConstructionKind("lowBarricade")).toBe(true);
    expect(isConstructionKind("earthWall")).toBe(true);
    expect(isConstructionKind("unknown")).toBe(false);
    expect(normalizeConstructionKind("unknown")).toBe("trailReinforce");
    expect(getConstructionDef("unknown").label).toBe("採餌道");
  });
});
