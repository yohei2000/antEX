import * as THREE from "three";
import { getBoundaryNodes } from "./sim/slime";
import type { ArmySlime, BattleState, SlimeLink, SlimeParticle, Vector2Like } from "./sim/types";

const WORLD_SCALE = 0.18;
const MAX_ANTS_PER_SIDE = 384;
export const EXPEDITION_ANT_MIN_WORLD_GAP = 3.15;
const BOARD_WIDTH = 1000 * WORLD_SCALE;
const BOARD_HEIGHT = 650 * WORLD_SCALE;
const ANT_VISUAL_SCALE = 1.16;

const ANT_BODY_PARTS = [
  { name: "gaster", x: 0, y: 0, z: -1.78, sx: 0.48, sy: 0.29, sz: 0.72 },
  { name: "postpetiole", x: 0, y: -0.02, z: -0.82, sx: 0.18, sy: 0.16, sz: 0.19 },
  { name: "petiole", x: 0, y: -0.02, z: -0.48, sx: 0.14, sy: 0.14, sz: 0.16 },
  { name: "mesosoma", x: 0, y: 0, z: 0.18, sx: 0.36, sy: 0.25, sz: 0.58 },
  { name: "head", x: 0, y: 0, z: 1.22, sx: 0.42, sy: 0.27, sz: 0.42 },
] as const;

const ANT_APPENDAGE_SEGMENTS = (() => {
  const segments: Array<{
    radius: number;
    from: readonly [number, number, number];
    to: readonly [number, number, number];
  }> = [];
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

export type ExpeditionAntRenderState = {
  x: number;
  z: number;
  y: number;
  angle: number;
  scale: number;
};

type SideMeshes = {
  formation: THREE.LineSegments;
  pheromone: THREE.LineSegments;
  stress: THREE.LineSegments;
  bodyParts: Map<string, THREE.InstancedMesh>;
  bodyCounts: Map<string, number>;
  appendages: THREE.InstancedMesh;
  appendageCount: number;
};

export class ExpeditionThreeView {
  readonly group = new THREE.Group();
  private readonly player: SideMeshes;
  private readonly enemy: SideMeshes;
  private readonly contactLines: THREE.LineSegments;
  private readonly dummy = new THREE.Object3D();
  private readonly segmentStart = new THREE.Vector3();
  private readonly segmentEnd = new THREE.Vector3();
  private readonly segmentMid = new THREE.Vector3();
  private readonly segmentDirection = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly segmentQuaternion = new THREE.Quaternion();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();

  constructor() {
    this.group.name = "ExpeditionBattleView";
    this.group.visible = false;
    this.group.position.y = 5.2;

    const board = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT)),
      this.trackMaterial(new THREE.MeshBasicMaterial({
        color: 0x6b4d2f,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      })),
    );
    board.rotation.x = -Math.PI / 2;
    board.position.y = -0.05;
    this.group.add(board);
    this.group.add(this.soilMarks());
    this.group.add(this.landmarks());

    this.player = this.createSideMeshes(0x1b1510, 0x5c3b22, 0x1a120c, 0x65b69a);
    this.enemy = this.createSideMeshes(0x8a4a2f, 0x5c2418, 0x2a100b, 0xd07a52);
    this.group.add(...this.sideObjects(this.player), ...this.sideObjects(this.enemy));

    this.contactLines = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: 0xf2c66d,
        transparent: true,
        opacity: 0.42,
      })),
    );
    this.contactLines.position.y = 0.36;
    this.group.add(this.contactLines);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  update(state: BattleState): void {
    this.updateSide(this.player, state.playerSlimes, 0x5c3b22, 1);
    this.updateSide(this.enemy, state.enemySlimes, 0x8a4a2f, 1.08);
    this.updateContacts([...state.playerSlimes, ...state.enemySlimes]);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private createSideMeshes(
    bodyColor: number,
    lineColor: number,
    appendageColor: number,
    zocColor: number,
  ): SideMeshes {
    const formation = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: 0.1,
      })),
    );
    formation.position.y = 0.34;

    const pheromone = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: zocColor,
        transparent: true,
        opacity: 0.05,
      })),
    );
    pheromone.position.y = 0.18;

    const stress = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: 0xf0a43a,
        transparent: true,
        opacity: 0.6,
      })),
    );
    stress.position.y = 0.55;

    const material = this.trackMaterial(new THREE.MeshBasicMaterial({ color: bodyColor }));
    const antSphere = this.trackGeometry(new THREE.SphereGeometry(1, 10, 6));
    const bodyParts = new Map<string, THREE.InstancedMesh>();
    const bodyCounts = new Map<string, number>();
    for (const part of ANT_BODY_PARTS) {
      const mesh = new THREE.InstancedMesh(antSphere, material, MAX_ANTS_PER_SIDE);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      bodyParts.set(part.name, mesh);
      bodyCounts.set(part.name, 0);
    }

    const appendageGeometry = this.trackGeometry(new THREE.CylinderGeometry(1, 1, 1, 4, 1));
    const appendages = new THREE.InstancedMesh(
      appendageGeometry,
      this.trackMaterial(new THREE.MeshBasicMaterial({
        color: appendageColor,
        transparent: true,
        opacity: 0.34,
      })),
      MAX_ANTS_PER_SIDE * ANT_APPENDAGE_SEGMENTS.length,
    );
    appendages.count = 0;
    appendages.castShadow = true;
    appendages.frustumCulled = false;

    return {
      formation,
      pheromone,
      stress,
      bodyParts,
      bodyCounts,
      appendages,
      appendageCount: 0,
    };
  }

  private sideObjects(meshes: SideMeshes): THREE.Object3D[] {
    return [
      meshes.formation,
      meshes.pheromone,
      meshes.stress,
      ...meshes.bodyParts.values(),
      meshes.appendages,
    ];
  }

  private soilMarks(): THREE.LineSegments {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 38; i += 1) {
      const x = -BOARD_WIDTH / 2 + 8 + ((i * 37) % Math.floor(BOARD_WIDTH - 16));
      const z = -BOARD_HEIGHT / 2 + 10 + ((i * 53) % Math.floor(BOARD_HEIGHT - 20));
      const length = 2.5 + (i % 5) * 1.2;
      points.push(new THREE.Vector3(x - length, 0.04, z));
      points.push(new THREE.Vector3(x + length, 0.04, z + (i % 2 ? 1.2 : -1.2)));
    }
    const geometry = this.trackGeometry(new THREE.BufferGeometry().setFromPoints(points));
    const material = this.trackMaterial(new THREE.LineBasicMaterial({
      color: 0x5a4329,
      transparent: true,
      opacity: 0.26,
    }));
    return new THREE.LineSegments(geometry, material);
  }

  private landmarks(): THREE.Group {
    const group = new THREE.Group();
    group.add(this.ring({ x: 300, y: 325 }, 22, 0x2a1a10, 0.7));
    group.add(this.ring({ x: 700, y: 325 }, 22, 0x5a2418, 0.72));
    group.add(this.ring({ x: 498, y: 325 }, 9, 0xb48a35, 0.82));
    group.add(this.pathLine({ x: 300, y: 325 }, { x: 498, y: 325 }, 0x7a5c32, 0.26));
    group.add(this.pathLine({ x: 700, y: 325 }, { x: 498, y: 325 }, 0x7a3b2f, 0.24));
    return group;
  }

  private ring(center: Vector2Like, radius: number, color: number, opacity: number): THREE.LineSegments {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 32; i += 1) {
      const a = (i / 32) * Math.PI * 2;
      const b = ((i + 1) / 32) * Math.PI * 2;
      points.push(
        toWorld({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius }),
        toWorld({ x: center.x + Math.cos(b) * radius, y: center.y + Math.sin(b) * radius }),
      );
    }
    const line = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry().setFromPoints(points)),
      this.trackMaterial(new THREE.LineBasicMaterial({ color, transparent: true, opacity })),
    );
    line.position.y = 0.34;
    return line;
  }

  private pathLine(a: Vector2Like, b: Vector2Like, color: number, opacity: number): THREE.LineSegments {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 15; i += 2) {
      const t0 = i / 15;
      const t1 = (i + 1) / 15;
      points.push(toWorld(lerpPoint(a, b, t0)), toWorld(lerpPoint(a, b, t1)));
    }
    const line = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry().setFromPoints(points)),
      this.trackMaterial(new THREE.LineBasicMaterial({ color, transparent: true, opacity })),
    );
    line.position.y = 0.3;
    return line;
  }

  private updateSide(meshes: SideMeshes, slimes: ArmySlime[], lineColor: number, sideScale: number): void {
    this.setSegments(meshes.formation, slimes.flatMap((slime) => formationSegments(slime)));
    this.setSegments(meshes.pheromone, slimes.flatMap((slime) => brokenBoundarySegments(slime, slime.zocRadius)));
    this.setSegments(meshes.stress, slimes.flatMap((slime) => stressSegments(slime)));
    (meshes.formation.material as THREE.LineBasicMaterial).color.setHex(lineColor);
    this.updateAnts(meshes, createExpeditionAntRenderStates(slimes, MAX_ANTS_PER_SIDE, sideScale));
  }

  private updateAnts(meshes: SideMeshes, ants: ExpeditionAntRenderState[]): void {
    for (const key of meshes.bodyCounts.keys()) meshes.bodyCounts.set(key, 0);
    meshes.appendageCount = 0;

    let antIndex = 0;
    for (const ant of ants) {
      for (const part of ANT_BODY_PARTS) {
        const index = meshes.bodyCounts.get(part.name) ?? 0;
        const mesh = meshes.bodyParts.get(part.name);
        if (!mesh || index >= MAX_ANTS_PER_SIDE) continue;
        this.composeLocalMatrix(ant, part.x, part.y, part.z, part.sx, part.sy, part.sz);
        mesh.setMatrixAt(index, this.dummy.matrix);
        meshes.bodyCounts.set(part.name, index + 1);
      }

      if (antIndex % 6 === 0) {
        for (const segment of ANT_APPENDAGE_SEGMENTS) {
          if (meshes.appendageCount >= MAX_ANTS_PER_SIDE * ANT_APPENDAGE_SEGMENTS.length) break;
          this.composeSegmentMatrix(ant, segment);
          meshes.appendages.setMatrixAt(meshes.appendageCount, this.dummy.matrix);
          meshes.appendageCount += 1;
        }
      }
      antIndex += 1;
    }

    for (const [partName, mesh] of meshes.bodyParts.entries()) {
      mesh.count = meshes.bodyCounts.get(partName) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    meshes.appendages.count = meshes.appendageCount;
    meshes.appendages.instanceMatrix.needsUpdate = true;
  }

  private composeLocalMatrix(
    ant: ExpeditionAntRenderState,
    localX: number,
    localY: number,
    localZ: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
  ): void {
    const sin = Math.sin(ant.angle);
    const cos = Math.cos(ant.angle);
    const visualScale = ant.scale * ANT_VISUAL_SCALE;
    const x = localX * visualScale;
    const y = localY * visualScale;
    const z = localZ * visualScale;
    this.dummy.position.set(
      ant.x + x * cos + z * sin,
      ant.y + y,
      ant.z - x * sin + z * cos,
    );
    this.dummy.rotation.set(0, ant.angle, 0);
    this.dummy.scale.set(scaleX * visualScale, scaleY * visualScale, scaleZ * visualScale);
    this.dummy.updateMatrix();
  }

  private composeSegmentMatrix(
    ant: ExpeditionAntRenderState,
    segment: (typeof ANT_APPENDAGE_SEGMENTS)[number],
  ): void {
    this.localPointToWorld(ant, segment.from, this.segmentStart);
    this.localPointToWorld(ant, segment.to, this.segmentEnd);
    this.segmentMid.addVectors(this.segmentStart, this.segmentEnd).multiplyScalar(0.5);
    this.segmentDirection.subVectors(this.segmentEnd, this.segmentStart);
    const length = this.segmentDirection.length();
    this.segmentDirection.normalize();
    this.segmentQuaternion.setFromUnitVectors(this.up, this.segmentDirection);
    this.dummy.position.copy(this.segmentMid);
    this.dummy.quaternion.copy(this.segmentQuaternion);
    const radius = segment.radius * ant.scale * ANT_VISUAL_SCALE * 0.72;
    this.dummy.scale.set(radius, length, radius);
    this.dummy.updateMatrix();
  }

  private localPointToWorld(
    ant: ExpeditionAntRenderState,
    point: readonly [number, number, number],
    target: THREE.Vector3,
  ): void {
    const sin = Math.sin(ant.angle);
    const cos = Math.cos(ant.angle);
    const visualScale = ant.scale * ANT_VISUAL_SCALE;
    const localX = point[0] * visualScale;
    const localY = point[1] * visualScale;
    const localZ = point[2] * visualScale;
    target.set(
      ant.x + localX * cos + localZ * sin,
      ant.y + localY,
      ant.z - localX * sin + localZ * cos,
    );
  }

  private updateContacts(slimes: ArmySlime[]): void {
    const points: THREE.Vector3[] = [];
    for (const slime of slimes) {
      for (const patch of slime.contactPatches) {
        const center = toWorld(patch.center);
        const normalEnd = toWorld({
          x: patch.center.x + patch.normal.x * (18 + patch.pressure * 0.7),
          y: patch.center.y + patch.normal.y * (18 + patch.pressure * 0.7),
        });
        points.push(center, normalEnd);
      }
    }
    this.setSegments(this.contactLines, points);
  }

  private setSegments(line: THREE.LineSegments, points: THREE.Vector3[]): void {
    line.geometry.dispose();
    this.geometries.delete(line.geometry);
    line.geometry = this.trackGeometry(new THREE.BufferGeometry().setFromPoints(points));
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }
}

export function createExpeditionAntRenderStates(
  slimes: ArmySlime[],
  maxCount = MAX_ANTS_PER_SIDE,
  sideScale = 1,
): ExpeditionAntRenderState[] {
  const states: ExpeditionAntRenderState[] = [];
  for (const slime of slimes) {
    for (const particle of slime.particles) {
      if (!particle.alive || states.length >= maxCount) continue;
      const world = toWorld(particle.position);
      const facing = particleFacing(slime, particle);
      const scale = sideScale * (slime.isRouting ? 0.86 : 1) * (0.98 + Math.min(0.08, slime.currentDensity * 0.025));
      states.push({
        x: world.x,
        z: world.z,
        y: 0.76 + Math.sin(particle.phase * 1.7) * 0.018,
        angle: Math.atan2(facing.x, facing.y),
        scale,
      });
    }
  }
  relaxAntRenderStates(states);
  return states;
}

export function nearestAntRenderGap(states: ExpeditionAntRenderState[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < states.length; i += 1) {
    for (let j = i + 1; j < states.length; j += 1) {
      nearest = Math.min(nearest, Math.hypot(states[i].x - states[j].x, states[i].z - states[j].z));
    }
  }
  return nearest;
}

function relaxAntRenderStates(states: ExpeditionAntRenderState[]): void {
  for (let pass = 0; pass < 8; pass += 1) {
    for (let i = 0; i < states.length; i += 1) {
      for (let j = i + 1; j < states.length; j += 1) {
        const a = states[i];
        const b = states[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const gap = Math.hypot(dx, dz);
        if (gap >= EXPEDITION_ANT_MIN_WORLD_GAP) continue;
        const nx = gap > 0.001 ? dx / gap : 1;
        const nz = gap > 0.001 ? dz / gap : 0;
        const push = (EXPEDITION_ANT_MIN_WORLD_GAP - gap) * 0.56;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
    for (const state of states) {
      state.x = clamp(state.x, -BOARD_WIDTH * 0.5 + 5, BOARD_WIDTH * 0.5 - 5);
      state.z = clamp(state.z, -BOARD_HEIGHT * 0.5 + 5, BOARD_HEIGHT * 0.5 - 5);
    }
  }
}

function particleFacing(slime: ArmySlime, particle: SlimeParticle): Vector2Like {
  const speed = Math.hypot(particle.velocity.x, particle.velocity.y);
  if (speed > 0.8) {
    return { x: particle.velocity.x / speed, y: particle.velocity.y / speed };
  }
  return slime.facing;
}

function formationSegments(slime: ArmySlime): THREE.Vector3[] {
  const forward = slime.facing;
  const side = { x: -forward.y, y: forward.x };
  const points: THREE.Vector3[] = [];
  const depth = Math.max(62, slime.currentDepth * 0.64);
  const width = Math.max(42, slime.currentWidth * 0.42);
  const rankCount = Math.max(2, Math.min(4, Math.round(slime.currentWidth / 96)));
  const front = {
    x: slime.center.x + forward.x * depth * 0.5,
    y: slime.center.y + forward.y * depth * 0.5,
  };
  const rear = {
    x: slime.center.x - forward.x * depth * 0.5,
    y: slime.center.y - forward.y * depth * 0.5,
  };
  points.push(toWorld(rear), toWorld(front));
  for (let i = 0; i < rankCount; i += 1) {
    const t = rankCount === 1 ? 0.5 : i / (rankCount - 1);
    const center = lerpPoint(rear, front, t);
    const localWidth = width * (0.75 + Math.sin(t * Math.PI) * 0.2);
    points.push(
      toWorld({
        x: center.x - side.x * localWidth * 0.5,
        y: center.y - side.y * localWidth * 0.5,
      }),
      toWorld({
        x: center.x + side.x * localWidth * 0.5,
        y: center.y + side.y * localWidth * 0.5,
      }),
    );
  }
  if (slime.isRouting) {
    const fleeTail = {
      x: rear.x - forward.x * 32,
      y: rear.y - forward.y * 32,
    };
    points.push(toWorld(rear), toWorld(fleeTail));
  }
  return points;
}

function brokenBoundarySegments(slime: ArmySlime, padding: number): THREE.Vector3[] {
  const boundary = getBoundaryNodes(slime);
  if (boundary.length < 2) return [];
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < boundary.length; i += 2) {
    const current = paddedPoint(slime.center, boundary[i].position, padding);
    const next = paddedPoint(slime.center, boundary[(i + 1) % boundary.length].position, padding);
    points.push(toWorld(current), toWorld(next));
  }
  return points;
}

function stressSegments(slime: ArmySlime): THREE.Vector3[] {
  const nodes = new Map(slime.nodes.map((node) => [node.id, node.position]));
  const links = new Set<SlimeLink>();
  for (const node of slime.nodes) {
    for (const link of node.links) links.add(link);
  }
  const points: THREE.Vector3[] = [];
  for (const link of links) {
    const load = link.stress / Math.max(0.08, slime.effectiveToughness);
    if (!link.broken && load < 0.72) continue;
    const a = nodes.get(link.nodeAId);
    const b = nodes.get(link.nodeBId);
    if (!a || !b) continue;
    points.push(toWorld(a), toWorld(b));
  }
  return points;
}

function paddedPoint(center: Vector2Like, point: Vector2Like, padding: number): Vector2Like {
  if (padding <= 0) return point;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  return {
    x: point.x + (dx / length) * padding,
    y: point.y + (dy / length) * padding,
  };
}

function lerpPoint(a: Vector2Like, b: Vector2Like, t: number): Vector2Like {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function toWorld(point: Vector2Like): THREE.Vector3 {
  return new THREE.Vector3(
    (point.x - 500) * WORLD_SCALE,
    0,
    (point.y - 325) * WORLD_SCALE,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
