import { expect, test } from "@playwright/test";

async function waitForSimulation(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__ANT_SIM_READY === true);
}

test("renders the initial ant empire scene", async ({ page }) => {
  await waitForSimulation(page);

  const metrics = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const canvas = document.querySelector("#world3d canvas") as HTMLCanvasElement | null;
    const rect = canvas?.getBoundingClientRect();
    const info = sim.renderer.info;
    return {
      hasCanvas: Boolean(canvas),
      cssWidth: rect?.width ?? 0,
      cssHeight: rect?.height ?? 0,
      antPopulation: sim.colony.antPopulation,
      renderedAnts: sim.ants.length,
      rivalAnts: sim.rivalAnts.length,
      rivalColor: sim.materials.antRival.color.getHexString(),
      foodSources: sim.food.length,
      worldRadius: sim.worldRadius,
      calls: info.render.calls,
      triangles: info.render.triangles,
    };
  });

  expect(metrics.hasCanvas).toBe(true);
  expect(metrics.cssWidth).toBeGreaterThan(300);
  expect(metrics.cssHeight).toBeGreaterThan(500);
  expect(metrics.antPopulation).toBe(12);
  expect(metrics.renderedAnts).toBe(12);
  expect(metrics.rivalAnts).toBe(4);
  expect(metrics.rivalColor).toBe("c65318");
  expect(metrics.foodSources).toBeGreaterThanOrEqual(4);
  expect(metrics.worldRadius).toBeGreaterThanOrEqual(120);
  expect(metrics.calls).toBeGreaterThan(0);
  expect(metrics.triangles).toBeGreaterThan(0);
});

test("hover alone does not rotate the camera", async ({ page }) => {
  await waitForSimulation(page);

  const delta = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const canvas = document.querySelector("#world3d canvas") as HTMLCanvasElement;
    const before = sim.targetCameraYaw;
    canvas.dispatchEvent(new PointerEvent("pointermove", {
      pointerId: 991,
      pointerType: "mouse",
      clientX: 60,
      clientY: 80,
      bubbles: true,
      cancelable: true,
    }));
    canvas.dispatchEvent(new PointerEvent("pointermove", {
      pointerId: 991,
      pointerType: "mouse",
      clientX: 240,
      clientY: 180,
      bubbles: true,
      cancelable: true,
    }));
    return Math.abs(sim.targetCameraYaw - before);
  });

  expect(delta).toBe(0);
});

test("food only increases when a carrying ant returns to the nest", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const noDeliveryRestore = {
      ants: sim.colony.antPopulation,
      soldiers: sim.colony.soldierAnts,
      hatchProgress: sim.colony.hatchProgress,
      food: sim.colony.food,
    };
    sim.colony.antPopulation = sim.computeDerived().capacity;
    sim.colony.hatchProgress = 0;
    sim.colony.soldierAnts = sim.computeDerived().soldierTarget;
    const noDeliveryBefore = sim.colony.food;
    sim.updateColony(20);
    const noDeliveryAfter = sim.colony.food;
    sim.colony.antPopulation = noDeliveryRestore.ants;
    sim.colony.soldierAnts = noDeliveryRestore.soldiers;
    sim.colony.hatchProgress = noDeliveryRestore.hatchProgress;
    sim.colony.food = noDeliveryRestore.food;
    sim.syncAntPopulation();

    const carrier = sim.ants[0];
    carrier.x = sim.nest.x;
    carrier.z = sim.nest.z;
    carrier.prevX = carrier.x;
    carrier.prevZ = carrier.z;
    carrier.carrying = 1.25;
    carrier.foodSourceId = null;
    carrier.state = "return";
    const returnBefore = sim.colony.food;
    carrier.updateReturn(1 / 60, sim, { x: 0, z: 0 });
    const returnAfter = sim.colony.food;

    return { noDeliveryBefore, noDeliveryAfter, returnBefore, returnAfter };
  });

  expect(result.noDeliveryAfter).toBeCloseTo(result.noDeliveryBefore, 5);
  expect(result.returnAfter).toBeGreaterThan(result.returnBefore);
});

test("upgrade click increments an available upgrade", async ({ page }) => {
  await waitForSimulation(page);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 10000;
    sim.colony.lifetimeFood = 10000;
    sim.colony.antPopulation = 30;
    sim.colony.territory = 4;
    sim.colony.nestLevel = 3;
    sim.renderUpgrades();
    sim.updateStats();
  });

  const before = await page.evaluate(() => (window.__ANT_SIM as any).colony.upgrades.storageChambers);
  await page.locator('[data-upgrade="storageChambers"]').click();
  const after = await page.evaluate(() => (window.__ANT_SIM as any).colony.upgrades.storageChambers);

  expect(after).toBe(before + 1);
});

test("rival ant combat can stun a worker and be repelled by a guard", async ({ page }) => {
  await waitForSimulation(page);

  const fight = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const ant = sim.ants[0];
    const guard = sim.ants[1];
    const rival = sim.rivalAnts[0];
    sim.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };

    ant.role = "worker";
    ant.traits.persistence = 0.1;
    ant.traits.caution = 0.1;
    ant.state = "explore";
    ant.carrying = 0;
    ant.energy = 1;
    ant.x = 0;
    ant.z = 0;
    rival.x = 0.5;
    rival.z = 0;
    rival.aggression = 1;
    rival.stubbornness = 1;
    rival.scale = 1.35;
    rival.retreat = 0;
    rival.fightCooldown = 0;
    const workerResolved = rival.resolveAntContacts(sim);
    const workerState = ant.state;

    guard.role = "guard";
    guard.traits.persistence = 1;
    guard.traits.caution = 1;
    guard.state = "explore";
    guard.carrying = 0;
    guard.energy = 1;
    guard.x = 4;
    guard.z = 0;
    rival.x = 4.5;
    rival.z = 0;
    rival.aggression = 0.1;
    rival.stubbornness = 0.1;
    rival.scale = 1.2;
    rival.retreat = 0;
    rival.fightCooldown = 0;
    const guardResolved = rival.resolveAntContacts(sim);

    return {
      workerResolved,
      workerState,
      guardResolved,
      lastWinner: rival.lastFightWinner,
      rivalRetreat: rival.retreat,
      stats: sim.rivalFightStats,
    };
  });

  expect(fight.workerResolved).toBe(true);
  expect(fight.workerState).toBe("stunned");
  expect(fight.guardResolved).toBe(true);
  expect(fight.lastWinner).toBe("colony");
  expect(fight.rivalRetreat).toBeGreaterThan(0);
  expect(fight.stats.rivalWins).toBeGreaterThanOrEqual(1);
  expect(fight.stats.colonyWins).toBeGreaterThanOrEqual(1);
});
