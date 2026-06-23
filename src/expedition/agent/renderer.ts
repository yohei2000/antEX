import * as THREE from "three";
import type { AntAgent, AgentSide } from "./types";

type SegmentName = "head" | "thorax" | "abdomen";

export class AntAgentInstancedRenderer {
  private readonly scene: THREE.Scene;
  private readonly capacity: number;
  private readonly dummy = new THREE.Object3D();
  private readonly root = new THREE.Group();
  private readonly meshes: Record<AgentSide, Record<SegmentName, THREE.InstancedMesh>>;
  private scale = 1;

  constructor(scene: THREE.Scene, capacity: number) {
    this.scene = scene;
    this.capacity = capacity;
    this.scene.add(this.root);
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x17110c, roughness: 0.82 });
    const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0x8a4a2f, roughness: 0.84 });
    this.meshes = {
      player: this.createSideMeshes(sphere, playerMaterial),
      enemy: this.createSideMeshes(sphere, enemyMaterial),
    };
  }

  render(agents: AntAgent[]) {
    const counts = {
      player: { head: 0, thorax: 0, abdomen: 0 },
      enemy: { head: 0, thorax: 0, abdomen: 0 },
    };

    for (const agent of agents) {
      if (agent.hp <= 0) continue;
      const gaitLift = agent.velocity.x * agent.velocity.x + agent.velocity.y * agent.velocity.y > 0.01
        ? Math.sin(agent.gaitPhase) * 0.025
        : 0;
      this.writeSegment(agent, "head", 0.46, 0.28, 0.34 + gaitLift, counts[agent.side].head++);
      this.writeSegment(agent, "thorax", 0, 0.38, 0.42 + gaitLift, counts[agent.side].thorax++);
      this.writeSegment(agent, "abdomen", -0.58, 0.48, 0.54 + gaitLift, counts[agent.side].abdomen++);
    }

    for (const side of ["player", "enemy"] as const) {
      for (const part of ["head", "thorax", "abdomen"] as const) {
        const mesh = this.meshes[side][part];
        mesh.count = counts[side][part];
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (const side of Object.values(this.meshes)) {
      for (const mesh of Object.values(side)) {
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.dispose();
        this.root.remove(mesh);
      }
    }
    this.scene.remove(this.root);
  }

  setTransform(x: number, z: number, scale: number) {
    this.root.position.set(x, 0, z);
    this.scale = scale;
  }

  setVisible(visible: boolean) {
    this.root.visible = visible;
  }

  private createSideMeshes(geometry: THREE.BufferGeometry, material: THREE.Material) {
    const meshes = {
      head: new THREE.InstancedMesh(geometry, material, this.capacity),
      thorax: new THREE.InstancedMesh(geometry, material, this.capacity),
      abdomen: new THREE.InstancedMesh(geometry, material, this.capacity),
    };
    for (const mesh of Object.values(meshes)) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    return meshes;
  }

  private writeSegment(agent: AntAgent, part: SegmentName, localX: number, radius: number, y: number, index: number) {
    const mesh = this.meshes[agent.side][part];
    if (index >= this.capacity) return;
    const forwardX = Math.cos(agent.heading);
    const forwardY = Math.sin(agent.heading);
    this.dummy.position.set(
      (agent.position.x + forwardX * localX * agent.bodyLength) * this.scale,
      y * this.scale,
      (agent.position.y + forwardY * localX * agent.bodyLength) * this.scale,
    );
    this.dummy.rotation.set(0, -agent.heading + Math.PI / 2, 0);
    const lengthScale = part === "abdomen" ? 1.25 : part === "head" ? 0.82 : 1;
    this.dummy.scale.set(radius * 0.9 * this.scale, radius * 0.74 * this.scale, radius * lengthScale * this.scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }
}
