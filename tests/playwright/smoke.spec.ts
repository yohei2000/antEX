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
      terrainPatches: sim.terrain.length,
      terrainBumps: sim.terrainBumps?.length ?? 0,
      nestEntrances: sim.nestEntrances?.length ?? sim.nestHoles?.length ?? 0,
      nestSpoils: sim.nestSpoils?.length ?? 0,
      stoneCount: sim.stones.length,
      branchCount: sim.branches.length,
      variantConfigCount: ["worker", "soldier", "heavySoldier", "builder"].filter((variant) => Boolean(sim.getAntVariantConfig(variant))).length,
      variantCounts: sim.ants.reduce((counts: Record<string, number>, ant: any) => {
        counts[ant.variant] = (counts[ant.variant] ?? 0) + 1;
        return counts;
      }, {}),
      upgradeButtons: document.querySelectorAll("[data-upgrade]").length,
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
  expect(metrics.rivalColor).toBe("8a4a2f");
  expect(metrics.foodSources).toBeGreaterThanOrEqual(4);
  expect(metrics.worldRadius).toBeGreaterThanOrEqual(120);
  expect(metrics.terrainPatches).toBeGreaterThanOrEqual(8);
  expect(metrics.terrainBumps).toBeGreaterThanOrEqual(8);
  expect(metrics.nestEntrances).toBeGreaterThanOrEqual(4);
  expect(metrics.nestSpoils).toBeGreaterThanOrEqual(24);
  expect(metrics.stoneCount).toBeGreaterThanOrEqual(6);
  expect(metrics.branchCount).toBeGreaterThanOrEqual(5);
  expect(metrics.variantConfigCount).toBe(4);
  expect(metrics.variantCounts.soldier).toBeGreaterThanOrEqual(1);
  expect(metrics.upgradeButtons).toBeGreaterThanOrEqual(15);
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

test("camera zooms with mouse wheel and two finger pinch", async ({ page }) => {
  await waitForSimulation(page);

  const viewport = page.viewportSize();
  const wheel: { before: number; zoomIn?: number; zoomOut?: number } = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.targetCameraDistance = 240;
    sim.cameraDistance = 240;
    return { before: sim.targetCameraDistance };
  });
  if ((viewport?.width ?? 0) >= 600) {
    const canvas = page.locator("#world3d canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("world canvas was not visible for wheel zoom test");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.wheel(0, -360);
    wheel.zoomIn = await page.evaluate(() => (window.__ANT_SIM as any).targetCameraDistance);
    await page.mouse.wheel(0, 720);
    wheel.zoomOut = await page.evaluate(() => (window.__ANT_SIM as any).targetCameraDistance);
  }

  const pinch = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const canvas = document.querySelector("#world3d canvas") as HTMLCanvasElement;
    const dispatchPointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        pointerId,
        pointerType: "touch",
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      }));
    };

    sim.pointerMap.clear();
    sim.pinchStart = null;
    sim.targetCameraDistance = 240;
    sim.cameraDistance = 240;
    const pinchBefore = sim.targetCameraDistance;
    dispatchPointer("pointerdown", 4101, 120, 180);
    dispatchPointer("pointerdown", 4102, 200, 180);
    dispatchPointer("pointermove", 4102, 280, 180);
    const pinchSpread = sim.targetCameraDistance;
    dispatchPointer("pointermove", 4102, 132, 180);
    const pinchClose = sim.targetCameraDistance;
    dispatchPointer("pointerup", 4101, 120, 180);
    dispatchPointer("pointerup", 4102, 132, 180);

    return { before: pinchBefore, spread: pinchSpread, close: pinchClose };
  });

  if ((viewport?.width ?? 0) >= 600) {
    expect(wheel.zoomIn).toBeDefined();
    expect(wheel.zoomOut).toBeDefined();
    expect(wheel.zoomIn!).toBeLessThan(wheel.before);
    expect(wheel.zoomOut!).toBeGreaterThan(wheel.zoomIn!);
  }
  expect(pinch.spread).toBeLessThan(pinch.before);
  expect(pinch.close).toBeGreaterThan(pinch.before);
});

test("empire panel can be collapsed and expanded by swipe", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(async () => {
    const sim = window.__ANT_SIM as any;
    const panel = document.querySelector("#empirePanel") as HTMLElement;
    const grip = document.querySelector("#panelGrip") as HTMLElement;
    const settle = () => new Promise((resolve) => window.setTimeout(resolve, 220));
    sim.setPanelCompact(false, false);
    await settle();
    const expandedHeight = panel.getBoundingClientRect().height;
    const expandedTabsDisplay = window.getComputedStyle(document.querySelector(".panel-tabs") as HTMLElement).display;

    const swipe = (fromY: number, toY: number) => {
      const pointerId = 7401;
      grip.dispatchEvent(new PointerEvent("pointerdown", {
        pointerId,
        pointerType: "touch",
        clientX: 180,
        clientY: fromY,
        bubbles: true,
        cancelable: true,
      }));
      grip.dispatchEvent(new PointerEvent("pointermove", {
        pointerId,
        pointerType: "touch",
        clientX: 180,
        clientY: toY,
        bubbles: true,
        cancelable: true,
      }));
      grip.dispatchEvent(new PointerEvent("pointerup", {
        pointerId,
        pointerType: "touch",
        clientX: 180,
        clientY: toY,
        bubbles: true,
        cancelable: true,
      }));
    };

    swipe(620, 690);
    await settle();
    const compact = panel.classList.contains("is-compact");
    const compactHeight = panel.getBoundingClientRect().height;
    const compactTabsDisplay = window.getComputedStyle(document.querySelector(".panel-tabs") as HTMLElement).display;
    swipe(690, 610);
    await settle();
    const expandedAgain = !panel.classList.contains("is-compact");
    return { expandedHeight, compactHeight, compact, expandedAgain, expandedTabsDisplay, compactTabsDisplay };
  });

  expect(result.compact).toBe(true);
  expect(result.expandedAgain).toBe(true);
  expect(result.expandedTabsDisplay).not.toBe("none");
  expect(result.compactTabsDisplay).toBe("none");
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

  expect(result.noDeliveryAfter).toBeLessThanOrEqual(result.noDeliveryBefore);
  expect(result.noDeliveryAfter).toBeGreaterThan(result.noDeliveryBefore - 0.2);
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
    sim.setPanelCompact(false, false);
    sim.renderUpgrades();
    sim.updateStats();
  });

  const before = await page.evaluate(() => (window.__ANT_SIM as any).colony.upgrades.storageChambers);
  await page.locator('[data-upgrade="storageChambers"]').click();
  const after = await page.evaluate(() => (window.__ANT_SIM as any).colony.upgrades.storageChambers);

  expect(after).toBe(before + 1);
});

test("expanded nest upgrade tree gates deeper branches and stays bounded", async ({ page }) => {
  await waitForSimulation(page);

  const tree = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 1000000;
    sim.colony.lifetimeFood = 1000000;
    sim.colony.antPopulation = 60;
    sim.colony.soldierAnts = 5;
    sim.colony.woundedAnts = 0;
    sim.colony.nestLevel = 4;
    sim.colony.territory = 5;
    for (const key of Object.keys(sim.colony.upgrades)) sim.colony.upgrades[key] = 0;
    sim.renderUpgrades();
    const buttons = [...document.querySelectorAll("[data-upgrade]")] as HTMLButtonElement[];
    const branches = [...document.querySelectorAll(".upgrade-branch")].map((node) => node.textContent);
    const lockedBefore = (document.querySelector('[data-upgrade="broodClimate"]') as HTMLButtonElement).disabled;
    const base = sim.computeDerived();

    sim.colony.upgrades.broodNursery = 2;
    sim.renderUpgrades();
    const unlockedAfterPrereq = !(document.querySelector('[data-upgrade="broodClimate"]') as HTMLButtonElement).disabled;

    const maxLevels = {
      foragerTrails: 8,
      trailPheromones: 4,
      storageChambers: 8,
      chamberExcavation: 6,
      ventilationShafts: 5,
      wasteGallery: 4,
      broodNursery: 8,
      broodClimate: 5,
      foodDistribution: 5,
      queenCare: 8,
      soldierTraining: 6,
      nestGuard: 6,
      sentinelPosts: 4,
    };
    for (const [key, max] of Object.entries(maxLevels)) sim.colony.upgrades[key] = max;
    const maxed = sim.computeDerived();

    return {
      buttonCount: buttons.length,
      branches,
      lockedBefore,
      unlockedAfterPrereq,
      foodRateRatio: maxed.foodRate / base.foodRate,
      growthRatio: maxed.growthPerSecond / base.growthPerSecond,
      capacityRatio: maxed.capacity / base.capacity,
      defensePower: maxed.defensePower,
      attackPower: maxed.attackPower,
      threatGrowthMultiplier: maxed.threatGrowthMultiplier,
    };
  });

  expect(tree.buttonCount).toBeGreaterThanOrEqual(13);
  expect(tree.branches).toEqual(["採餌網", "育房", "巣構造", "防衛"]);
  expect(tree.lockedBefore).toBe(true);
  expect(tree.unlockedAfterPrereq).toBe(true);
  expect(tree.foodRateRatio).toBeGreaterThan(3);
  expect(tree.foodRateRatio).toBeLessThan(4.6);
  expect(tree.growthRatio).toBeGreaterThan(5);
  expect(tree.growthRatio).toBeLessThan(7.6);
  expect(tree.capacityRatio).toBeGreaterThan(2.6);
  expect(tree.capacityRatio).toBeLessThan(3.7);
  expect(tree.attackPower).toBeLessThan(2.2);
  expect(tree.defensePower).toBeLessThan(2.8);
  expect(tree.threatGrowthMultiplier).toBeGreaterThanOrEqual(0.55);
});

test("ant variants can be unlocked without replacing existing ants", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 36;
    sim.colony.soldierAnts = 4;
    sim.colony.woundedAnts = 0;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 3;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.chamberExcavation = 1;
    sim.syncAntPopulation();
    const firstAnt = sim.ants[0];
    const idsBefore = sim.ants.map((ant: any) => ant.id).join(",");
    const boughtHeavy = sim.buyUpgrade("heavySoldierBrood");
    const boughtBuilder = sim.buyUpgrade("builderTraining");
    sim.syncAntPopulation();
    sim.renderGame(1);
    const idsAfter = sim.ants.map((ant: any) => ant.id).join(",");
    const counts = sim.ants.reduce((acc: Record<string, number>, ant: any) => {
      acc[ant.variant] = (acc[ant.variant] ?? 0) + 1;
      return acc;
    }, {});
    const finite = sim.ants.every((ant: any) => Number.isFinite(ant.x) && Number.isFinite(ant.z) && Number.isFinite(ant.angle));
    const uniqueIds = new Set(sim.ants.map((ant: any) => ant.id)).size;
    const renderIndexes = sim.ants.map((ant: any) => ant.renderIndex);
    return {
      boughtHeavy,
      boughtBuilder,
      sameFirstObject: sim.ants[0] === firstAnt,
      idsBefore,
      idsAfter,
      counts,
      finite,
      uniqueIds,
      antLength: sim.ants.length,
      renderIndexes,
      heavyConfig: sim.getAntVariantConfig("heavySoldier"),
      soldierConfig: sim.getAntVariantConfig("soldier"),
      workerConfig: sim.getAntVariantConfig("worker"),
      builderConfig: sim.getAntVariantConfig("builder"),
      deterministic: [0, 1, 2, 3, 4].map((index) => sim.variantForIndex(index, { heavySoldier: 1, soldier: 2, builder: 1, worker: 1 })),
    };
  });

  expect(result.boughtHeavy).toBe(true);
  expect(result.boughtBuilder).toBe(true);
  expect(result.sameFirstObject).toBe(true);
  expect(result.idsAfter).toBe(result.idsBefore);
  expect(result.counts.heavySoldier).toBe(1);
  expect(result.counts.builder).toBe(1);
  expect(result.finite).toBe(true);
  expect(result.uniqueIds).toBe(result.antLength);
  expect(result.renderIndexes).toEqual([...Array(result.antLength)].map((_, index) => index));
  expect(result.heavyConfig.speed).toBeLessThan(result.workerConfig.speed);
  expect(result.heavyConfig.pushMass).toBeGreaterThan(result.soldierConfig.pushMass);
  expect(result.heavyConfig.brace).toBeGreaterThan(result.soldierConfig.brace);
  expect(result.builderConfig.attack).toBeLessThan(result.workerConfig.attack);
  expect(result.deterministic).toEqual(["heavySoldier", "soldier", "soldier", "builder", "worker"]);
});

test("heavy soldiers brace near nest threats instead of chasing away", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.antPopulation = 30;
    sim.colony.soldierAnts = 4;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.builderAnts = 0;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.syncAntPopulation();
    const heavy = sim.ants.find((ant: any) => ant.variant === "heavySoldier");
    const rival = sim.rivalAnts[0];
    heavy.x = sim.nest.x + 3;
    heavy.z = sim.nest.z;
    heavy.prevX = heavy.x;
    heavy.prevZ = heavy.z;
    heavy.state = "explore";
    heavy.fleeTimer = 0;
    heavy.stun = 0;
    rival.x = heavy.x + 6;
    rival.z = heavy.z;
    rival.retreat = 0;
    rival.clash = null;
    const beforeThreatDistance = Math.hypot(heavy.x - rival.x, heavy.z - rival.z);
    for (let i = 0; i < 40; i += 1) heavy.update(1 / 30, sim);
    const afterThreatDistance = Math.hypot(heavy.x - rival.x, heavy.z - rival.z);
    const nestDistance = Math.hypot(heavy.x - sim.nest.x, heavy.z - sim.nest.z);
    return {
      action: heavy.lastTacticalAction,
      braceIntent: heavy.braceIntent,
      beforeThreatDistance,
      afterThreatDistance,
      nestDistance,
      variant: heavy.variant,
    };
  });

  expect(result.variant).toBe("heavySoldier");
  expect(["brace", "block"]).toContain(result.action);
  expect(result.afterThreatDistance).toBeLessThan(result.beforeThreatDistance + 1);
  expect(result.nestDistance).toBeLessThan(24);
});

test("builders complete earthworks and retreat from nearby rivals", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.antPopulation = 30;
    sim.colony.soldierAnts = 3;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.builderAnts = 1;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.builderTraining = 1;
    sim.syncAntPopulation();
    const builder = sim.ants.find((ant: any) => ant.variant === "builder");
    const task = sim.createBuildTask("trailReinforce", sim.nest.x + 10, sim.nest.z + 4, { radius: 9, maxProgress: 0.4 });
    builder.x = task.x;
    builder.z = task.z;
    builder.prevX = builder.x;
    builder.prevZ = builder.z;
    builder.carryingSoil = 1;
    builder.updateBuilder(1, sim, { x: 0, z: 0 });
    const earthwork = sim.earthworks.find((item: any) => item.id === task.earthworkId);
    const friendlySpeed = sim.earthworkSpeedAt(task.x, task.z, "worker");

    const barricade = sim.createBuildTask("lowBarricade", sim.nest.x + 12, sim.nest.z, { radius: 10, maxProgress: 1 });
    const barricadeEarthwork = sim.earthworks.find((item: any) => item.id === barricade.earthworkId);
    barricadeEarthwork.strength = 1;
    barricadeEarthwork.progress = barricadeEarthwork.maxProgress;
    const rivalSpeed = sim.rivalSpeedAt(barricade.x, barricade.z);
    const braceBonus = sim.braceBonusAt(barricade.x, barricade.z);

    const dangerTask = sim.createBuildTask("trailReinforce", sim.nest.x + 20, sim.nest.z + 2, { radius: 8, maxProgress: 2 });
    builder.buildTaskId = dangerTask.id;
    builder.carryingSoil = 1;
    builder.x = dangerTask.x;
    builder.z = dangerTask.z;
    const rival = sim.rivalAnts[0];
    rival.x = builder.x + 3;
    rival.z = builder.z;
    rival.retreat = 0;
    rival.clash = null;
    const beforeDangerDistance = Math.hypot(builder.x - rival.x, builder.z - rival.z);
    const steering = { x: 0, z: 0 };
    builder.updateBuilder(1 / 30, sim, steering);
    builder.move(1 / 30, sim, steering);
    const afterDangerDistance = Math.hypot(builder.x - rival.x, builder.z - rival.z);
    const awayDot = steering.x * (builder.x - rival.x) + steering.z * (builder.z - rival.z);

    return {
      taskComplete: task.complete,
      earthworkStrength: earthwork.strength,
      friendlySpeed,
      rivalSpeed,
      braceBonus,
      dangerAction: builder.lastTacticalAction,
      carryingAfterDanger: builder.carryingSoil,
      buildTaskAfterDanger: builder.buildTaskId,
      beforeDangerDistance,
      afterDangerDistance,
      awayDot,
    };
  });

  expect(result.taskComplete).toBe(true);
  expect(result.earthworkStrength).toBe(1);
  expect(result.friendlySpeed).toBeGreaterThan(1);
  expect(result.rivalSpeed).toBeLessThan(1);
  expect(result.braceBonus).toBeGreaterThan(0);
  expect(result.dangerAction).toBe("retreatBehindGuard");
  expect(result.carryingAfterDanger).toBe(0);
  expect(result.buildTaskAfterDanger).toBeNull();
  expect(result.awayDot).toBeGreaterThan(0);
});

test("rival ant combat grapples before the loser flees home", async ({ page }) => {
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
    ant.prevX = ant.x;
    ant.prevZ = ant.z;
    ant.fleeTimer = 0;
    ant.clashTimer = 0;
    rival.x = 0.5;
    rival.z = 0;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.aggression = 1;
    rival.stubbornness = 1;
    rival.scale = 1.35;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    const workerDistanceBefore = Math.hypot(ant.x - rival.x, ant.z - rival.z);
    const workerStarted = rival.resolveAntContacts(sim);
    const workerDistanceAfterStart = Math.hypot(ant.x - rival.x, ant.z - rival.z);
    const workerStateAtStart = ant.state;
    const workerDistanceToNestBefore = Math.hypot(ant.x - sim.nest.x, ant.z - sim.nest.z);
    const workerAnchorX = rival.clash.anchorX;
    const workerAnchorZ = rival.clash.anchorZ;
    const workerLineX = rival.clash.lineX;
    const workerLineZ = rival.clash.lineZ;
    let workerMaxCenterDrift = 0;
    let workerMaxAxisDrift = 0;
    for (let i = 0; i < 160; i += 1) {
      ant.update(1 / 60, sim);
      rival.update(1 / 60, sim);
      if (i < 100 && rival.clash) {
        const centerX = (ant.x + rival.x) * 0.5;
        const centerZ = (ant.z + rival.z) * 0.5;
        workerMaxCenterDrift = Math.max(workerMaxCenterDrift, Math.hypot(centerX - workerAnchorX, centerZ - workerAnchorZ));
        const pairX = ant.x - rival.x;
        const pairZ = ant.z - rival.z;
        const pairLength = Math.hypot(pairX, pairZ) || 1;
        const axisDrift = Math.abs((pairX * workerLineZ - pairZ * workerLineX) / pairLength);
        workerMaxAxisDrift = Math.max(workerMaxAxisDrift, axisDrift);
      }
    }
    const workerStateAfter = ant.state;
    const workerFleeTimer = ant.fleeTimer;
    const workerDistanceToNestAfter = Math.hypot(ant.x - sim.nest.x, ant.z - sim.nest.z);

    ant.x = -80;
    ant.z = -80;
    ant.fleeTimer = 0;
    ant.clashTimer = 0;
    guard.role = "guard";
    guard.traits.persistence = 1;
    guard.traits.caution = 1;
    guard.state = "explore";
    guard.carrying = 0;
    guard.energy = 1;
    guard.x = 4;
    guard.z = 0;
    guard.prevX = guard.x;
    guard.prevZ = guard.z;
    guard.fleeTimer = 0;
    guard.clashTimer = 0;
    rival.x = 4.5;
    rival.z = 0;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.aggression = 0.1;
    rival.stubbornness = 0.1;
    rival.scale = 1.2;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    const guardStarted = rival.resolveAntContacts(sim);
    const guardStateAtStart = guard.state;
    for (let i = 0; i < 150; i += 1) {
      guard.update(1 / 60, sim);
      rival.update(1 / 60, sim);
    }

    return {
      workerStarted,
      workerStateAtStart,
      workerStateAfter,
      workerFleeTimer,
      workerDistanceBefore,
      workerDistanceAfterStart,
      workerMaxCenterDrift,
      workerMaxAxisDrift,
      workerDistanceToNestBefore,
      workerDistanceToNestAfter,
      guardStarted,
      guardStateAtStart,
      lastWinner: rival.lastFightWinner,
      rivalRetreat: rival.retreat,
      stats: sim.rivalFightStats,
    };
  });

  expect(fight.workerStarted).toBe(true);
  expect(fight.workerStateAtStart).toBe("clash");
  expect(Math.abs(fight.workerDistanceAfterStart - fight.workerDistanceBefore)).toBeLessThan(0.25);
  expect(fight.workerMaxCenterDrift).toBeLessThan(0.55);
  expect(fight.workerMaxAxisDrift).toBeLessThan(0.22);
  expect(fight.workerStateAfter).toBe("flee");
  expect(fight.workerFleeTimer).toBeGreaterThan(0);
  expect(fight.workerDistanceToNestAfter).toBeLessThan(fight.workerDistanceToNestBefore);
  expect(fight.guardStarted).toBe(true);
  expect(fight.guardStateAtStart).toBe("clash");
  expect(fight.lastWinner).toBe("colony");
  expect(fight.rivalRetreat).toBeGreaterThan(0);
  expect(fight.stats.rivalWins).toBeGreaterThanOrEqual(1);
  expect(fight.stats.colonyWins).toBeGreaterThanOrEqual(1);
});

test("rival ants actively harass ants near food instead of only camping", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const food = sim.food[0];
    const ant = sim.ants[0];
    const rival = sim.rivalAnts[0];
    sim.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };

    ant.role = "worker";
    ant.traits.persistence = 0.1;
    ant.traits.caution = 0.1;
    ant.state = "explore";
    ant.stun = 0;
    ant.fleeTimer = 0;
    ant.clashTimer = 0;
    ant.carrying = 0;
    ant.x = food.x + 9;
    ant.z = food.z;
    rival.x = food.x;
    rival.z = food.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.aggression = 1;
    rival.stubbornness = 1;
    rival.scale = 1.35;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    const beforeDistance = Math.hypot(ant.x - rival.x, ant.z - rival.z);
    let minDistance = beforeDistance;
    for (let i = 0; i < 140; i += 1) {
      rival.update(1 / 30, sim);
      minDistance = Math.min(minDistance, Math.hypot(ant.x - rival.x, ant.z - rival.z));
      if (sim.rivalFightStats.clashes > 0) break;
    }
    const afterDistance = Math.hypot(ant.x - rival.x, ant.z - rival.z);

    return {
      beforeDistance,
      minDistance,
      afterDistance,
      antState: ant.state,
      rivalWins: sim.rivalFightStats.rivalWins,
      clashes: sim.rivalFightStats.clashes,
    };
  });

  expect(result.minDistance).toBeLessThan(result.beforeDistance);
  expect(result.clashes).toBeGreaterThanOrEqual(1);
  expect(result.rivalWins).toBeGreaterThanOrEqual(1);
  expect(result.antState).toBe("flee");
});
