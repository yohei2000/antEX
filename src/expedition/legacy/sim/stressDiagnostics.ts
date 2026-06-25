import type { ArmySlime, SlimeLink, SlimeNode } from "./types";

export type StressLinkInfo = {
  link: SlimeLink;
  nodeA?: SlimeNode;
  nodeB?: SlimeNode;
  loadRatio: number;
};

export function stressLinks(slime: ArmySlime): StressLinkInfo[] {
  const byId = new Map(slime.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const result: StressLinkInfo[] = [];
  for (const node of slime.nodes) {
    for (const link of node.links) {
      const key = [link.nodeAId, link.nodeBId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        link,
        nodeA: byId.get(link.nodeAId),
        nodeB: byId.get(link.nodeBId),
        loadRatio: link.stress / Math.max(0.08, slime.effectiveToughness),
      });
    }
  }
  return result.sort((a, b) => b.loadRatio - a.loadRatio);
}

export function shortNodeName(nodeId: string): string {
  if (nodeId.endsWith("-core")) return "C";
  const match = nodeId.match(/-(outer|mid|inner)-(\d+)$/);
  if (!match) return nodeId;
  const prefix = match[1] === "outer" ? "O" : match[1] === "mid" ? "M" : "I";
  return `${prefix}${match[2]}`;
}

export function stressCause(slime: ArmySlime, info?: StressLinkInfo): string {
  if (!info) return "敵圧なし";
  if (info.loadRatio < 0.05 && info.link.localPressure < 0.05) return "敵圧なし";
  const causes: string[] = [];
  if (info.link.localPressure > 0.2) causes.push("接触圧");
  if (slime.currentWidth > slime.baseWidth * 1.22) causes.push("展開");
  if (slime.fatigue > 45) causes.push("疲労");
  if (slime.cohesion < 62) causes.push("低結束");
  if (slime.morale < 42) causes.push("低士気");
  return causes.length ? causes.join(" + ") : "一時的な局所圧";
}
