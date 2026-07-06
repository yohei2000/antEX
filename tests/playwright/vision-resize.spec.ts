import { expect, test } from "@playwright/test";

async function waitForSimulation(page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => window.__ANT_SIM_READY === true);
}

test("vision edge drag resizes the exploration range", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const canvas = document.querySelector("#world3d canvas") as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const toScreen = (x: number, z: number) => {
      const point = sim.camera.position.clone();
      point.set(x, 0, z);
      point.project(sim.camera);
      return {
        x: rect.left + ((point.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - point.y) * rect.height) / 2,
      };
    };
    const dispatch = (type: string, point: { x: number; y: number }, buttons: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 41,
        pointerType: "mouse",
        button: 0,
        buttons,
        clientX: point.x,
        clientY: point.y,
      }));
    };

    sim.paused = true;
    sim.exploredPatches = [];
    sim.manualMapVisionRadius = null;
    sim.updateMapIntel();
    const before = sim.mapVisionRadiusValue;
    const growTarget = Math.min(sim.worldRadius - 18, before + 52);
    const growStart = toScreen(sim.nest.x + before, sim.nest.z);
    const growEnd = toScreen(sim.nest.x + growTarget, sim.nest.z);
    dispatch("pointerdown", growStart, 1);
    dispatch("pointermove", growEnd, 1);
    dispatch("pointerup", growEnd, 0);
    const afterGrow = sim.mapVisionRadiusValue;
    const grownVisible = sim.isPointVisible(sim.nest.x + before + 35, sim.nest.z, 0);

    const shrinkTarget = Math.max(sim.manualMapVisionRadiusMin() + 4, before - 22);
    const shrinkStart = toScreen(sim.nest.x + afterGrow, sim.nest.z);
    const shrinkEnd = toScreen(sim.nest.x + shrinkTarget, sim.nest.z);
    dispatch("pointerdown", shrinkStart, 1);
    dispatch("pointermove", shrinkEnd, 1);
    dispatch("pointerup", shrinkEnd, 0);
    const afterShrink = sim.mapVisionRadiusValue;
    const outsideAfterShrink = sim.isPointVisible(sim.nest.x + afterGrow - 4, sim.nest.z, 0);
    const stored = Number(localStorage.getItem("ant3d.manualMapVisionRadius") ?? "0");

    return {
      before,
      growTarget,
      afterGrow,
      grownVisible,
      shrinkTarget,
      afterShrink,
      outsideAfterShrink,
      stored,
      fogRevealRadius: sim.fogOfWarMaterial.uniforms.revealRadius.value,
      edgeScale: sim.visionEdge.scale.x,
    };
  });

  expect(result.afterGrow).toBeGreaterThan(result.before + 35);
  expect(result.afterGrow).toBeCloseTo(result.growTarget, 0);
  expect(result.grownVisible).toBe(true);
  expect(result.afterShrink).toBeLessThan(result.before - 10);
  expect(result.afterShrink).toBeCloseTo(result.shrinkTarget, 0);
  expect(result.outsideAfterShrink).toBe(false);
  expect(result.stored).toBeCloseTo(result.afterShrink, 1);
  expect(result.fogRevealRadius).toBeCloseTo(result.afterShrink, 1);
  expect(result.edgeScale).toBeCloseTo(result.afterShrink, 1);
});
