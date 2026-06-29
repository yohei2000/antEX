import * as THREE from "three";
import type { ConstructionKind } from "../config/construction";

interface VoxelBuildingAssets {
  geometries: {
    trailCircle: THREE.BufferGeometry;
    earthworkVoxel: THREE.BufferGeometry;
  };
  materials: {
    earthworkTrail: THREE.Material;
    earthworkBarricade: THREE.Material;
    earthworkWall: THREE.Material;
    earthworkSentry: THREE.Material;
    earthworkVoxel: THREE.Material;
    earthworkVoxelTrail?: THREE.Material;
    earthworkVoxelBarricade?: THREE.Material;
    earthworkVoxelWall?: THREE.Material;
    earthworkVoxelSentry?: THREE.Material;
  };
  shadowsEnabled: boolean;
}

interface EarthworkRenderConfig {
  kind: ConstructionKind;
  x: number;
  z: number;
  radius: number;
  rotation?: number;
}

interface VoxelCell {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  threshold: number;
  color: number;
}

export interface VoxelBuildingView {
  group: THREE.Group;
  footprint: THREE.Mesh;
  voxelMesh: THREE.InstancedMesh;
  voxelCells: VoxelCell[];
}

const FOOTPRINT_OPACITY: Record<ConstructionKind, number> = {
  trailReinforce: 0.3,
  lowBarricade: 0.28,
  earthWall: 0.42,
  sentryMound: 0.34,
};

const TRAIL_COLORS = [0x9a8f5a, 0x7a8050, 0xb6a66d];
const BARRICADE_COLORS = [0x6a4a32, 0x8a6a43, 0x51412f];
const WALL_COLORS = [0x8a6041, 0x6f4f35, 0x9b7952];
const SENTRY_COLORS = [0x6e735d, 0x8a8266, 0x9b7144, 0x5a4a37];

export class VoxelBuildingRenderer {
  private readonly assets: VoxelBuildingAssets;
  private readonly matrixDummy = new THREE.Object3D();
  private readonly colorDummy = new THREE.Color();

  constructor(assets: VoxelBuildingAssets) {
    this.assets = assets;
  }

  createEarthwork(config: EarthworkRenderConfig): VoxelBuildingView {
    const group = new THREE.Group();
    group.name = `earthwork-${config.kind}`;
    group.position.set(config.x, 0, config.z);
    group.rotation.y = config.rotation ?? 0;

    const footprint = new THREE.Mesh(this.assets.geometries.trailCircle, this.footprintMaterial(config.kind));
    footprint.name = `${config.kind}-footprint`;
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.set(0, this.footprintHeight(config.kind), 0);
    footprint.visible = false;
    group.add(footprint);

    const voxelCells = this.voxelCellsFor(config.kind, config.radius).sort((a, b) => a.threshold - b.threshold);
    const voxelMaterial = this.voxelMaterial(config.kind);
    const voxelMesh = new THREE.InstancedMesh(
      this.assets.geometries.earthworkVoxel,
      voxelMaterial,
      Math.max(1, voxelCells.length),
    );
    voxelMesh.name = `${config.kind}-voxel-blocks`;
    voxelMesh.count = 0;
    voxelMesh.castShadow = this.assets.shadowsEnabled;
    voxelMesh.receiveShadow = this.assets.shadowsEnabled;
    voxelMesh.frustumCulled = false;
    voxelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (usesVertexColors(voxelMaterial)) {
      voxelCells.forEach((cell, index) => {
        voxelMesh.setColorAt(index, this.colorDummy.setHex(cell.color));
      });
      if (voxelMesh.instanceColor) voxelMesh.instanceColor.needsUpdate = true;
    }
    group.add(voxelMesh);

    this.applyFootprintScale(footprint, config.kind, config.radius, 0);

    return { group, footprint, voxelMesh, voxelCells };
  }

  update(view: VoxelBuildingView, kind: ConstructionKind, radius: number, strength: number): void {
    const visibleStrength = clamp01(strength);
    view.footprint.visible = visibleStrength > 0.02;
    this.setFootprintOpacity(view.footprint, FOOTPRINT_OPACITY[kind] * Math.max(0.15, visibleStrength));
    this.applyFootprintScale(view.footprint, kind, radius, visibleStrength);
    this.updateVoxelMesh(view, visibleStrength);
  }

  private updateVoxelMesh(view: VoxelBuildingView, strength: number): void {
    let visibleCount = 0;
    while (visibleCount < view.voxelCells.length && strength >= view.voxelCells[visibleCount].threshold) visibleCount += 1;
    view.voxelMesh.count = visibleCount;
    view.voxelMesh.visible = visibleCount > 0;
    for (let i = 0; i < visibleCount; i += 1) {
      const cell = view.voxelCells[i];
      const appear = clamp01((strength - cell.threshold) / 0.16);
      const grow = 0.36 + appear * 0.64;
      this.matrixDummy.position.set(cell.x, cell.y * (0.7 + appear * 0.3), cell.z);
      this.matrixDummy.rotation.set(0, cell.ry, 0);
      this.matrixDummy.scale.set(cell.sx * grow, cell.sy * grow, cell.sz * grow);
      this.matrixDummy.updateMatrix();
      view.voxelMesh.setMatrixAt(i, this.matrixDummy.matrix);
    }
    view.voxelMesh.instanceMatrix.needsUpdate = visibleCount > 0;
  }

  private footprintMaterial(kind: ConstructionKind): THREE.Material {
    const source =
      kind === "earthWall" ? this.assets.materials.earthworkWall :
      kind === "sentryMound" ? this.assets.materials.earthworkSentry :
      kind === "lowBarricade" ? this.assets.materials.earthworkBarricade :
      this.assets.materials.earthworkTrail;
    return source.clone();
  }

  private voxelMaterial(kind: ConstructionKind): THREE.Material {
    if (kind === "earthWall") return this.assets.materials.earthworkVoxelWall ?? this.assets.materials.earthworkVoxel;
    if (kind === "sentryMound") return this.assets.materials.earthworkVoxelSentry ?? this.assets.materials.earthworkVoxel;
    if (kind === "lowBarricade") return this.assets.materials.earthworkVoxelBarricade ?? this.assets.materials.earthworkVoxel;
    return this.assets.materials.earthworkVoxelTrail ?? this.assets.materials.earthworkVoxel;
  }

  private footprintHeight(kind: ConstructionKind): number {
    if (kind === "earthWall") return 0.16;
    if (kind === "sentryMound") return 0.1;
    if (kind === "lowBarricade") return 0.065;
    return 0.045;
  }

  private setFootprintOpacity(mesh: THREE.Mesh, opacity: number): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = opacity;
      material.needsUpdate = true;
    }
  }

  private applyFootprintScale(mesh: THREE.Mesh, kind: ConstructionKind, radius: number, strength: number): void {
    const scale = 0.78 + strength * 0.22;
    if (kind === "earthWall") mesh.scale.set(radius * 1.16 * scale, radius * 0.14 * scale, 1);
    else if (kind === "sentryMound") mesh.scale.set(radius * 0.72 * scale, radius * 0.5 * scale, 1);
    else if (kind === "lowBarricade") mesh.scale.set(radius * 0.95 * scale, radius * 0.28 * scale, 1);
    else mesh.scale.set(radius * 1.35 * scale, radius * 0.36 * scale, 1);
  }

  private voxelCellsFor(kind: ConstructionKind, radius: number): VoxelCell[] {
    if (kind === "earthWall") return earthWallVoxels(radius);
    if (kind === "sentryMound") return sentryMoundVoxels(radius);
    if (kind === "lowBarricade") return lowBarricadeVoxels(radius);
    return trailReinforceVoxels(radius);
  }
}

function trailReinforceVoxels(radius: number): VoxelCell[] {
  const cells: VoxelCell[] = [];
  const count = clampInt(Math.round(radius * 1.08), 12, 20);
  const length = radius * 2.12;
  const step = length / Math.max(1, count - 1);
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const baseX = (t - 0.5) * length;
    const wobble = rough(i, 1);
    cells.push({
      x: baseX + wobble * 0.24,
      y: 0.055 + rough(i + 30, 0.018),
      z: rough(i + 10, radius * 0.045),
      sx: step * (0.6 + rough(i + 20, 0.16)),
      sy: 0.1 + rough(i + 40, 0.025),
      sz: radius * (0.3 + rough(i + 50, 0.06)),
      ry: rough(i + 60, 0.22),
      threshold: 0.04 + t * 0.9,
      color: pickColor(i, TRAIL_COLORS),
    });
    for (const side of [-1, 1]) {
      if ((i + (side > 0 ? 0 : 2)) % 3 === 1) continue;
      cells.push({
        x: baseX + rough(i + side * 70, 0.32),
        y: 0.12 + rough(i + side * 80, 0.025),
        z: side * radius * (0.27 + rough(i + side * 90, 0.025)),
        sx: step * (0.42 + rough(i + side * 100, 0.1)),
        sy: 0.14 + rough(i + side * 110, 0.03),
        sz: 0.16 + rough(i + side * 120, 0.035),
        ry: rough(i + side * 130, 0.3),
        threshold: 0.08 + t * 0.84,
        color: TRAIL_COLORS[2],
      });
    }
  }
  return cells;
}

function lowBarricadeVoxels(radius: number): VoxelCell[] {
  const cells: VoxelCell[] = [];
  const count = clampInt(Math.round(radius * 1.72), 16, 25);
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const arc = -1.2 + t * 2.4 + rough(i + 5, 0.035);
    const baseX = Math.sin(arc) * radius * (0.82 + rough(i + 15, 0.035));
    const baseZ = Math.cos(arc) * radius * (0.32 + rough(i + 25, 0.025));
    const spikeTilt = (t < 0.5 ? -0.18 : 0.18) + rough(i + 35, 0.16);
    cells.push({
      x: baseX,
      y: 0.2 + rough(i + 45, 0.045),
      z: baseZ,
      sx: 0.56 + rough(i + 55, 0.14),
      sy: 0.34 + rough(i + 65, 0.09),
      sz: 0.3 + rough(i + 75, 0.07),
      ry: arc + rough(i + 85, 0.24),
      threshold: 0.08 + t * 0.86,
      color: BARRICADE_COLORS[0],
    });
    if (i % 2 === 0 || i % 7 === 0) {
      cells.push({
        x: baseX + Math.sin(arc + spikeTilt) * (0.34 + rough(i + 95, 0.08)),
        y: 0.62 + rough(i + 105, 0.12),
        z: baseZ + Math.cos(arc + spikeTilt) * (0.34 + rough(i + 115, 0.08)),
        sx: 0.18 + rough(i + 125, 0.04),
        sy: 0.74 + rough(i + 135, 0.18),
        sz: 0.18 + rough(i + 145, 0.04),
        ry: arc + spikeTilt,
        threshold: 0.16 + t * 0.76,
        color: BARRICADE_COLORS[1],
      });
    }
    if (i % 5 === 0 || i === count - 2) {
      cells.push({
        x: baseX + rough(i + 155, 0.24),
        y: 0.42 + rough(i + 165, 0.08),
        z: baseZ - radius * (0.08 + rough(i + 175, 0.02)),
        sx: 0.28 + rough(i + 185, 0.07),
        sy: 0.52 + rough(i + 195, 0.12),
        sz: 0.24 + rough(i + 205, 0.05),
        ry: arc + Math.PI / 2 + rough(i + 215, 0.18),
        threshold: 0.2 + t * 0.7,
        color: BARRICADE_COLORS[2],
      });
    }
  }
  return cells;
}

function earthWallVoxels(radius: number): VoxelCell[] {
  const cells: VoxelCell[] = [];
  const columns = clampInt(Math.round(radius * 1.2), 14, 26);
  const length = radius * 2.02;
  const step = length / Math.max(1, columns - 1);
  for (let column = 0; column < columns; column += 1) {
    const t = columns === 1 ? 0.5 : column / (columns - 1);
    const columnWobble = rough(column + 10, 1);
    const x = (t - 0.5) * length + columnWobble * 0.34;
    const isEnd = column === 0 || column === columns - 1;
    const isButtress = column % 7 === 0 || column % 11 === 4 || isEnd;
    const wallWidth = (isButtress ? 0.9 : 0.62) + rough(column + 20, 0.11);
    const layerCount = 3 + (column % 9 === 0 || isEnd ? 1 : 0);
    for (let layer = 0; layer < 4; layer += 1) {
      if (layer >= layerCount) continue;
      const layerIndex = column * 10 + layer;
      cells.push({
        x: x + rough(layerIndex + 30, 0.09),
        y: 0.26 + layer * 0.48 + rough(layerIndex + 40, 0.045),
        z: rough(layerIndex + 50, 0.1),
        sx: step * (isButtress ? 1.16 : 1.02) * (1 + rough(layerIndex + 60, 0.13)),
        sy: 0.46 + rough(layerIndex + 70, 0.1),
        sz: wallWidth * (1 + rough(layerIndex + 80, 0.08)),
        ry: rough(layerIndex + 90, 0.08),
        threshold: clamp01(0.04 + t * 0.52 + layer * 0.1),
        color: layer >= 3 ? WALL_COLORS[2] : WALL_COLORS[column % 2],
      });
    }
    if (column % 3 === 0 || column % 8 === 5 || isEnd) {
      const capIndex = column * 12;
      const capSide = column % 2 === 0 ? -1 : 1;
      cells.push({
        x: x + rough(capIndex + 100, 0.11),
        y: 2.04 + rough(capIndex + 110, 0.08),
        z: capSide * (0.26 + rough(capIndex + 120, 0.08)),
        sx: step * (0.34 + rough(capIndex + 130, 0.08)),
        sy: 0.34 + rough(capIndex + 140, 0.07),
        sz: 0.26 + rough(capIndex + 150, 0.05),
        ry: rough(capIndex + 160, 0.14),
        threshold: clamp01(0.34 + t * 0.46),
        color: WALL_COLORS[2],
      });
      if (column % 6 === 0 || isEnd) {
        cells.push({
          x: x + rough(capIndex + 170, 0.11),
          y: 2.0 + rough(capIndex + 180, 0.08),
          z: -capSide * (0.3 + rough(capIndex + 190, 0.08)),
          sx: step * (0.28 + rough(capIndex + 200, 0.08)),
          sy: 0.3 + rough(capIndex + 210, 0.07),
          sz: 0.24 + rough(capIndex + 220, 0.05),
          ry: rough(capIndex + 230, 0.14),
          threshold: clamp01(0.36 + t * 0.46),
          color: WALL_COLORS[2],
        });
      }
    }
    if (isButtress) {
      cells.push({
        x: x + rough(column + 240, 0.12),
        y: 1.0 + rough(column + 250, 0.1),
        z: -0.7 + rough(column + 260, 0.08),
        sx: step * (0.8 + rough(column + 270, 0.1)),
        sy: 1.1 + rough(column + 280, 0.18),
        sz: 0.28 + rough(column + 290, 0.05),
        ry: rough(column + 300, 0.12),
        threshold: clamp01(0.22 + t * 0.58),
        color: WALL_COLORS[1],
      });
    }
  }
  return cells;
}

function sentryMoundVoxels(radius: number): VoxelCell[] {
  const cells: VoxelCell[] = [];
  const legOffsetX = radius * 0.22;
  const legOffsetZ = radius * 0.16;
  let index = 0;
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const legIndex = index + 1;
      cells.push({
        x: xSign * (legOffsetX + rough(legIndex + 10, 0.18)),
        y: 0.66 + rough(legIndex + 20, 0.08),
        z: zSign * (legOffsetZ + rough(legIndex + 30, 0.14)),
        sx: 0.32 + rough(legIndex + 40, 0.06),
        sy: 1.22 + rough(legIndex + 50, 0.18),
        sz: 0.32 + rough(legIndex + 60, 0.06),
        ry: rough(legIndex + 70, 0.18),
        threshold: 0.08 + index * 0.035,
        color: SENTRY_COLORS[3],
      });
      index += 1;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = i * 2.399;
    const ring = i < 3 ? 0.1 : 0.32;
    cells.push({
      x: Math.cos(angle) * radius * ring + rough(i + 80, 0.18),
      y: 0.22 + i * 0.12 + rough(i + 90, 0.035),
      z: Math.sin(angle) * radius * ring * 0.72 + rough(i + 100, 0.14),
      sx: radius * (0.34 - i * 0.01 + rough(i + 110, 0.025)),
      sy: 0.12 + rough(i + 120, 0.025),
      sz: radius * (0.24 - i * 0.008 + rough(i + 130, 0.02)),
      ry: angle + rough(i + 140, 0.22),
      threshold: 0.12 + i * 0.055,
      color: i >= 5 ? SENTRY_COLORS[1] : SENTRY_COLORS[0],
    });
  }
  for (let i = 0; i < 5; i += 1) {
    const angle = (i - 2) * 0.18;
    cells.push({
      x: rough(i + 150, 0.24),
      y: 1.54 + rough(i + 160, 0.05),
      z: (i - 2) * radius * 0.1 + rough(i + 170, 0.08),
      sx: radius * (0.46 + rough(i + 180, 0.04)),
      sy: 0.13 + rough(i + 190, 0.025),
      sz: 0.28 + rough(i + 200, 0.05),
      ry: angle,
      threshold: 0.52 + i * 0.025,
      color: SENTRY_COLORS[1],
    });
  }
  for (let i = 0; i < 5; i += 1) {
    const angle = i * 1.256 + 0.3;
    cells.push({
      x: Math.cos(angle) * radius * (0.18 + rough(i + 210, 0.03)),
      y: 1.82 + rough(i + 220, 0.08),
      z: Math.sin(angle) * radius * (0.13 + rough(i + 230, 0.03)),
      sx: 0.22 + rough(i + 240, 0.04),
      sy: 0.5 + rough(i + 250, 0.1),
      sz: 0.22 + rough(i + 260, 0.04),
      ry: angle + rough(i + 270, 0.22),
      threshold: 0.62 + i * 0.03,
      color: i === 0 ? SENTRY_COLORS[2] : SENTRY_COLORS[1],
    });
  }
  cells.push({
    x: rough(300, 0.08),
    y: 2.1,
    z: rough(301, 0.08),
    sx: 0.26,
    sy: 0.78,
    sz: 0.26,
    ry: rough(302, 0.16),
    threshold: 0.72,
    color: SENTRY_COLORS[2],
  });
  return cells;
}

function pickColor(index: number, palette: number[]): number {
  return palette[Math.abs(index) % palette.length];
}

function wave(index: number, frequency: number, amplitude: number): number {
  return Math.sin(index * frequency) * amplitude;
}

function rough(index: number, amplitude: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return ((value - Math.floor(value)) * 2 - 1) * amplitude;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function usesVertexColors(material: THREE.Material): boolean {
  return "vertexColors" in material && material.vertexColors === true;
}
