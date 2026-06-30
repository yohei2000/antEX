import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { VoxelBuildingRenderer } from "../../src/render/VoxelBuildingRenderer";

function createRenderer() {
  return new VoxelBuildingRenderer({
    geometries: {
      trailCircle: new THREE.CircleGeometry(1, 18),
      earthworkVoxel: new THREE.BoxGeometry(1, 1, 1),
    },
    materials: {
      earthworkTrail: new THREE.MeshBasicMaterial({ transparent: true }),
      earthworkBarricade: new THREE.MeshBasicMaterial({ transparent: true }),
      earthworkWall: new THREE.MeshBasicMaterial({ transparent: true }),
      earthworkSentry: new THREE.MeshBasicMaterial({ transparent: true }),
      earthworkVoxel: new THREE.MeshStandardMaterial({ vertexColors: true }),
      earthworkVoxelTrail: new THREE.MeshBasicMaterial({ color: 0x9a8f5a }),
      earthworkVoxelBarricade: new THREE.MeshBasicMaterial({ color: 0x6a4a32 }),
      earthworkVoxelWall: new THREE.MeshBasicMaterial({ color: 0x8a6041 }),
      earthworkVoxelSentry: new THREE.MeshBasicMaterial({ color: 0x6e735d }),
    },
    shadowsEnabled: false,
  });
}

describe("VoxelBuildingRenderer", () => {
  it("renders an earth wall as progressive voxel blocks", () => {
    const renderer = createRenderer();
    const view = renderer.createEarthwork({ kind: "earthWall", x: 12, z: -4, radius: 14, rotation: 0.4 });

    expect(view.group.name).toBe("earthwork-earthWall");
    expect(view.voxelCells.length).toBeGreaterThan(40);
    expect(view.voxelMesh.count).toBe(0);

    renderer.update(view, "earthWall", 14, 0.35);
    const partialCount = view.voxelMesh.count;
    expect(partialCount).toBeGreaterThan(0);
    expect(partialCount).toBeLessThan(view.voxelCells.length);
    expect(view.footprint.visible).toBe(true);

    renderer.update(view, "earthWall", 14, 1);
    expect(view.voxelMesh.count).toBe(view.voxelCells.length);
  });

  it("uses different voxel templates for sentry mounds and trail reinforcement", () => {
    const renderer = createRenderer();
    const sentry = renderer.createEarthwork({ kind: "sentryMound", x: 0, z: 0, radius: 8 });
    const trail = renderer.createEarthwork({ kind: "trailReinforce", x: 0, z: 0, radius: 12 });

    expect(sentry.voxelCells.length).toBeGreaterThan(20);
    expect(trail.voxelCells.length).toBeGreaterThan(20);
    expect(sentry.voxelCells.length).not.toBe(trail.voxelCells.length);
  });

  it("uses kind-specific voxel colors when materials are provided", () => {
    const renderer = createRenderer();
    const trail = renderer.createEarthwork({ kind: "trailReinforce", x: 0, z: 0, radius: 12 });
    const wall = renderer.createEarthwork({ kind: "earthWall", x: 0, z: 0, radius: 14 });
    const sentry = renderer.createEarthwork({ kind: "sentryMound", x: 0, z: 0, radius: 8 });

    expect((trail.voxelMesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x9a8f5a);
    expect((wall.voxelMesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x8a6041);
    expect((sentry.voxelMesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x6e735d);
  });
});
