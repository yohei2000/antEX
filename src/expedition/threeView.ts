import * as THREE from "three";
import { getBoundaryNodes } from "./sim/slime";
import type { ArmySlime, BattleState, SlimeLink, Vector2Like } from "./sim/types";

const WORLD_SCALE = 0.18;
const MAX_PARTICLES_PER_SIDE = 768;
const BOARD_WIDTH = 1000 * WORLD_SCALE;
const BOARD_HEIGHT = 650 * WORLD_SCALE;

type SideMeshes = {
  formation: THREE.LineSegments;
  pheromone: THREE.LineSegments;
  stress: THREE.LineSegments;
  legs: THREE.LineSegments;
  particles: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
};

export class ExpeditionThreeView {
  readonly group = new THREE.Group();
  private readonly player: SideMeshes;
  private readonly enemy: SideMeshes;
  private readonly contactLines: THREE.LineSegments;
  private readonly dummy = new THREE.Object3D();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();

  constructor() {
    this.group.name = "ExpeditionBattleView";
    this.group.visible = false;
    this.group.position.y = 5.2;

    const board = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT)),
      this.trackMaterial(new THREE.MeshBasicMaterial({
        color: 0x21190f,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      })),
    );
    board.rotation.x = -Math.PI / 2;
    board.position.y = -0.05;
    this.group.add(board);
    this.group.add(this.soilMarks());
    this.group.add(this.landmarks());

    this.player = this.createSideMeshes(0x1b1510, 0x5c3b22, 0x65b69a);
    this.enemy = this.createSideMeshes(0x8a4a2f, 0x5c2418, 0xd07a52);
    this.group.add(...Object.values(this.player), ...Object.values(this.enemy));

    this.contactLines = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: 0xf2c66d,
        transparent: true,
        opacity: 0.65,
      })),
    );
    this.contactLines.position.y = 0.35;
    this.group.add(this.contactLines);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  update(state: BattleState): void {
    this.updateSide(this.player, state.playerSlimes, 0x5c3b22);
    this.updateSide(this.enemy, state.enemySlimes, 0x8a4a2f);
    this.updateContacts([...state.playerSlimes, ...state.enemySlimes]);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private createSideMeshes(
    particleColor: number,
    lineColor: number,
    zocColor: number,
  ): SideMeshes {
    const formation = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: 0.74,
      })),
    );
    formation.position.y = 0.44;

    const pheromone = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: zocColor,
        transparent: true,
        opacity: 0.2,
      })),
    );
    pheromone.position.y = 0.22;

    const stress = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: 0xf0a43a,
        transparent: true,
        opacity: 0.78,
      })),
    );
    stress.position.y = 0.55;

    const legs = new THREE.LineSegments(
      this.trackGeometry(new THREE.BufferGeometry()),
      this.trackMaterial(new THREE.LineBasicMaterial({
        color: particleColor,
        transparent: true,
        opacity: 0.48,
      })),
    );
    legs.position.y = 0.86;

    const particles = new THREE.InstancedMesh(
      this.trackGeometry(new THREE.SphereGeometry(0.68, 8, 5)),
      this.trackMaterial(new THREE.MeshBasicMaterial({ color: particleColor })),
      MAX_PARTICLES_PER_SIDE,
    );
    particles.position.y = 0.72;
    particles.count = 0;

    const heads = new THREE.InstancedMesh(
      this.trackGeometry(new THREE.SphereGeometry(0.38, 8, 4)),
      this.trackMaterial(new THREE.MeshBasicMaterial({ color: particleColor })),
      MAX_PARTICLES_PER_SIDE,
    );
    heads.position.y = 0.78;
    heads.count = 0;

    return { formation, pheromone, stress, legs, particles, heads };
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

  private updateSide(meshes: SideMeshes, slimes: ArmySlime[], lineColor: number): void {
    this.setSegments(meshes.formation, slimes.flatMap((slime) => formationSegments(slime)));
    this.setSegments(meshes.pheromone, slimes.flatMap((slime) => brokenBoundarySegments(slime, slime.zocRadius)));
    this.setSegments(meshes.stress, slimes.flatMap((slime) => stressSegments(slime)));
    (meshes.formation.material as THREE.LineBasicMaterial).color.setHex(lineColor);
    this.updateParticles(meshes, slimes);
  }

  private updateParticles(meshes: SideMeshes, slimes: ArmySlime[]): void {
    let count = 0;
    const legPoints: THREE.Vector3[] = [];
    for (const slime of slimes) {
      for (const particle of slime.particles) {
        if (!particle.alive || count >= MAX_PARTICLES_PER_SIDE) continue;
        const body = toWorld(particle.position);
        const head = toWorld({
          x: particle.position.x + slime.facing.x * 8,
          y: particle.position.y + slime.facing.y * 8,
        });
        const bodyScale = 1 + slime.currentDensity * 0.12;
        this.dummy.position.copy(body);
        this.dummy.rotation.set(0, Math.atan2(slime.facing.x, slime.facing.y), 0);
        this.dummy.scale.set(1.15 * bodyScale, 0.34, 0.72 * bodyScale);
        this.dummy.updateMatrix();
        meshes.particles.setMatrixAt(count, this.dummy.matrix);

        this.dummy.position.copy(head);
        this.dummy.rotation.set(0, Math.atan2(slime.facing.x, slime.facing.y), 0);
        this.dummy.scale.set(0.82, 0.26, 0.58);
        this.dummy.updateMatrix();
        meshes.heads.setMatrixAt(count, this.dummy.matrix);
        if (count % 2 === 0) {
          legPoints.push(...antLegSegments(particle.position, slime.facing, count));
        }
        count += 1;
      }
    }
    meshes.particles.count = count;
    meshes.heads.count = count;
    meshes.particles.instanceMatrix.needsUpdate = true;
    meshes.heads.instanceMatrix.needsUpdate = true;
    this.setSegments(meshes.legs, legPoints);
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

function formationSegments(slime: ArmySlime): THREE.Vector3[] {
  const forward = slime.facing;
  const side = { x: -forward.y, y: forward.x };
  const points: THREE.Vector3[] = [];
  const depth = Math.max(70, slime.currentDepth * 0.78);
  const width = Math.max(52, slime.currentWidth * 0.52);
  const rankCount = Math.max(3, Math.min(7, Math.round(slime.currentWidth / 56)));
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
    const localWidth = width * (0.72 + Math.sin(t * Math.PI) * 0.28);
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
  for (let i = 0; i < boundary.length; i += 1) {
    if (i % 2 !== 0) continue;
    const current = paddedPoint(slime.center, boundary[i].position, padding);
    const next = paddedPoint(slime.center, boundary[(i + 1) % boundary.length].position, padding);
    points.push(toWorld(current), toWorld(next));
  }
  return points;
}

function antLegSegments(position: Vector2Like, facing: Vector2Like, index: number): THREE.Vector3[] {
  const side = { x: -facing.y, y: facing.x };
  const gait = index % 4 < 2 ? 1 : -1;
  const points: THREE.Vector3[] = [];
  for (const offset of [-5, 0, 5]) {
    const base = {
      x: position.x + facing.x * offset,
      y: position.y + facing.y * offset,
    };
    const reach = 4.6 + Math.abs(offset) * 0.22;
    const skew = gait * (offset === 0 ? 1.5 : -1.2);
    points.push(
      toWorld(base),
      toWorld({
        x: base.x + side.x * reach + facing.x * skew,
        y: base.y + side.y * reach + facing.y * skew,
      }),
      toWorld(base),
      toWorld({
        x: base.x - side.x * reach - facing.x * skew,
        y: base.y - side.y * reach - facing.y * skew,
      }),
    );
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
