import { expect, test } from "@playwright/test";

async function waitForSimulation(page, path = "/") {
  await page.goto(path);
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
      deployedSoldiers: sim.deployedSoldierCount(),
      rivalAnts: sim.rivalAnts.length,
      raidPhase: sim.colony.raidState.phase,
      raidTimer: sim.colony.raidState.timer,
      rivalColor: sim.materials.antRival.color.getHexString(),
      foodSources: sim.food.length,
      worldRadius: sim.worldRadius,
      terrainPatches: sim.terrain.length,
      terrainBumps: sim.terrainBumps?.length ?? 0,
      nestEntrances: sim.nestEntrances?.length ?? sim.nestHoles?.length ?? 0,
      nestSpoils: sim.nestSpoils?.length ?? 0,
      stoneCount: sim.stones.length,
      branchCount: sim.branches.length,
      upgradeButtons: document.querySelectorAll("[data-upgrade]").length,
      calls: info.render.calls,
      triangles: info.render.triangles,
    };
  });

  expect(metrics.hasCanvas).toBe(true);
  expect(metrics.cssWidth).toBeGreaterThan(300);
  expect(metrics.cssHeight).toBeGreaterThan(500);
  expect(metrics.antPopulation).toBe(12);
  expect(metrics.renderedAnts).toBe(11);
  expect(metrics.deployedSoldiers).toBe(0);
  expect(metrics.rivalAnts).toBe(0);
  expect(metrics.raidPhase).toBe("calm");
  expect(metrics.raidTimer).toBeGreaterThan(0);
  expect(metrics.rivalColor).toBe("8a4a2f");
  expect(metrics.foodSources).toBeGreaterThanOrEqual(4);
  expect(metrics.worldRadius).toBeGreaterThanOrEqual(120);
  expect(metrics.terrainPatches).toBeGreaterThanOrEqual(8);
  expect(metrics.terrainBumps).toBeGreaterThanOrEqual(8);
  expect(metrics.nestEntrances).toBeGreaterThanOrEqual(4);
  expect(metrics.nestSpoils).toBeGreaterThanOrEqual(24);
  expect(metrics.stoneCount).toBeGreaterThanOrEqual(6);
  expect(metrics.branchCount).toBeGreaterThanOrEqual(5);
  expect(metrics.upgradeButtons).toBeGreaterThanOrEqual(13);
  expect(metrics.calls).toBeGreaterThan(0);
  expect(metrics.triangles).toBeGreaterThan(0);
});

test("raidSoon query keeps normal mode but starts a raid quickly without saving", async ({ page }) => {
  await waitForSimulation(page, "/?raidSoon=1");

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const initial = {
      raidSoonMode: sim.raidSoonMode,
      bodyClass: document.body.classList.contains("is-raid-soon"),
      activeTab: sim.activeTab,
      phase: sim.colony.raidState.phase,
      timer: sim.colony.raidState.timer,
      savedState: localStorage.getItem("ant3d.colonyState"),
    };
    for (let i = 0; i < 600; i += 1) {
      sim.updateRaid(1 / 60);
      if (sim.colony.raidState.phase === "active") break;
    }
    return {
      initial,
      phase: sim.colony.raidState.phase,
      activeCount: sim.colony.raidState.activeCount,
      rivals: sim.raidRivals().length,
      savedState: localStorage.getItem("ant3d.colonyState"),
    };
  });

  expect(result.initial.raidSoonMode).toBe(true);
  expect(result.initial.bodyClass).toBe(true);
  expect(result.initial.activeTab).toBe("growth");
  expect(result.initial.phase).toBe("calm");
  expect(result.initial.timer).toBeLessThanOrEqual(2.6);
  expect(result.initial.savedState).toBeNull();
  expect(result.phase).toBe("active");
  expect(result.activeCount).toBeGreaterThan(0);
  expect(result.rivals).toBeGreaterThan(0);
  expect(result.savedState).toBeNull();
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
    sim.setPanelCompact(false, false);
    sim.renderUpgrades();
    sim.updateStats();
  });

  const before = await page.evaluate(() => (window.__ANT_SIM as any).colony.upgrades.storageChambers);
  await page.locator('[data-upgrade="storageChambers"]').click();
  const after = await page.evaluate(() => (window.__ANT_SIM as any).colony.upgrades.storageChambers);

  expect(after).toBe(before + 1);
});

test("soldier tab deploys nest soldiers on player command", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 1000;
    sim.colony.antPopulation = 36;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 7;
    sim.soldierSortieCooldown = 0;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.setActiveTab("soldiers");
    sim.updateStats();
    const before = {
      visible: sim.ants.length,
      guards: sim.ants.filter((ant: any) => ant.role === "guard").length,
      deployed: sim.deployedSoldierCount(),
      activeTab: sim.activeTab,
      button: (document.querySelector("#soldierSortieBtn") as HTMLButtonElement).textContent,
      tabText: document.querySelector(".panel-tabs")?.textContent ?? "",
    };
    const started = sim.startSoldierSortie();
    const deployed = sim.deployedSoldiers();
    for (let i = 0; i < 90; i += 1) sim.updateGame(1 / 60);
    for (const ant of deployed) {
      ant.sortieTimer = 0;
      ant.x = sim.nest.x;
      ant.z = sim.nest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.setState("return");
      ant.updateReturn(1 / 60, sim, { x: 0, z: 0 });
    }
    sim.flushSortieRetires();
    sim.updateStats();
    return {
      before,
      started,
      deployedCount: deployed.length,
      deployedRoles: deployed.map((ant: any) => ant.role),
      spawnDistances: deployed.map((ant: any) => Math.hypot(ant.x - sim.nest.x, ant.z - sim.nest.z)),
      afterRetire: sim.deployedSoldierCount(),
      statusText: (document.querySelector("#soldierStatus") as HTMLElement).textContent,
      logText: sim.colony.battleLog.join("\n"),
    };
  });

  expect(result.before.activeTab).toBe("soldiers");
  expect(result.before.guards).toBe(0);
  expect(result.before.deployed).toBe(0);
  expect(result.before.button).toContain("兵隊を出撃");
  expect(result.before.tabText).not.toContain("遠征");
  expect(result.started).toBe(true);
  expect(result.deployedCount).toBe(7);
  expect(result.deployedRoles.every((role: string) => role === "guard")).toBe(true);
  expect(Math.max(...result.spawnDistances)).toBeLessThan(14);
  expect(result.afterRetire).toBe(0);
  expect(result.statusText).toContain("再準備");
  expect(result.logText).toContain("兵隊出撃");
});

test("sortied soldiers intercept raid rivals after player command", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.antPopulation = 42;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.soldierSortieCooldown = 0;
    sim.syncAntPopulation();
    const guardsBefore = sim.ants.filter((ant: any) => ant.role === "guard").length;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 7,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    rival.x = sim.nest.x + 42;
    rival.z = sim.nest.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    sim.colony.raidState.phase = "active";

    const started = sim.startSoldierSortie();
    const guard = sim.deployedSoldiers()[0];
    guard.x = sim.nest.x;
    guard.z = sim.nest.z;
    guard.prevX = guard.x;
    guard.prevZ = guard.z;
    const before = Math.hypot(guard.x - rival.x, guard.z - rival.z);
    let minDistance = before;
    let clashStarted = false;
    for (let i = 0; i < 210; i += 1) {
      for (const ant of sim.deployedSoldiers()) ant.update(1 / 60, sim);
      minDistance = Math.min(minDistance, Math.hypot(guard.x - rival.x, guard.z - rival.z));
      clashStarted = rival.resolveAntContacts(sim) || clashStarted;
      if (clashStarted) break;
    }
    return {
      guardsBefore,
      started,
      deployed: sim.deployedSoldierCount(),
      before,
      minDistance,
      after: Math.hypot(guard.x - rival.x, guard.z - rival.z),
      guardInClash: rival.clash?.ants?.includes(guard) ?? false,
      clashStarted,
      alarmTrails: sim.trails.filter((trail: any) => trail.kind === "alarm").length,
    };
  });

  expect(result.guardsBefore).toBe(0);
  expect(result.started).toBe(true);
  expect(result.deployed).toBe(6);
  expect(result.minDistance).toBeLessThan(result.before - 10);
  expect(result.after).toBeLessThan(result.before);
  expect(result.alarmTrails).toBeGreaterThanOrEqual(1);
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

test("rival raids warn first and enter from the map edge", async ({ page }) => {
  await waitForSimulation(page);

  const raid = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.raidState = {
      phase: "calm",
      timer: 0.01,
      wave: 0,
      activeCount: 0,
      approachAngle: 0,
      signalTimer: 0,
      lastOutcome: "none",
    };
    sim.updateRaid(0.02);
    const warning = {
      phase: sim.colony.raidState.phase,
      timer: sim.colony.raidState.timer,
      rivals: sim.rivalAnts.length,
      activeCount: sim.colony.raidState.activeCount,
      log: sim.colony.battleLog.join("\n"),
    };

    sim.colony.raidState.timer = 0.01;
    sim.updateRaid(0.02);
    const activePhase = sim.colony.raidState.phase;
    sim.updateStats();
    const rivals = sim.raidRivals();
    const minNestDistance = Math.min(...rivals.map((rival: any) => Math.hypot(rival.x - sim.nest.x, rival.z - sim.nest.z)));
    const spawnRadii = rivals.map((rival: any) => Math.hypot(rival.x, rival.z));
    const approachAngle = sim.colony.raidState.approachAngle ?? 0;
    const flankX = -Math.sin(approachAngle);
    const flankZ = Math.cos(approachAngle);
    const spawnLateral = rivals.map((rival: any) => rival.x * flankX + rival.z * flankZ);
    const targetLateral = rivals.map((rival: any) => rival.raidTargetX * flankX + rival.raidTargetZ * flankZ);
    const exitRadii = rivals.map((rival: any) => Math.hypot(rival.homeX, rival.homeZ));
    const minWorldRadius = Math.min(...spawnRadii);
    const spawnDepthSpread = Math.max(...spawnRadii) - Math.min(...spawnRadii);
    const spawnLateralSpread = Math.max(...spawnLateral) - Math.min(...spawnLateral);
    const targetLateralSpread = Math.max(...targetLateral) - Math.min(...targetLateral);
    const minExitRadius = Math.min(...exitRadii);
    return {
      warning,
      activePhase,
      phaseAfterStats: sim.colony.raidState.phase,
      activeCount: sim.colony.raidState.activeCount,
      rivalCount: rivals.length,
      minNestDistance,
      minWorldRadius,
      spawnDepthSpread,
      spawnLateralSpread,
      targetLateralSpread,
      minExitRadius,
      worldRadius: sim.worldRadius,
      log: sim.colony.battleLog.join("\n"),
    };
  });

  expect(raid.warning.phase).toBe("warning");
  expect(raid.warning.rivals).toBe(0);
  expect(raid.warning.activeCount).toBeGreaterThanOrEqual(4);
  expect(raid.warning.log).toContain("敵アリの気配");
  expect(raid.activePhase).toBe("active");
  expect(raid.phaseAfterStats).toBe("active");
  expect(raid.rivalCount).toBe(raid.activeCount);
  expect(raid.minNestDistance).toBeGreaterThan(50);
  expect(raid.minWorldRadius).toBeGreaterThan(raid.worldRadius * 0.88);
  expect(raid.spawnDepthSpread).toBeGreaterThan(2);
  expect(raid.spawnLateralSpread).toBeGreaterThan(12);
  expect(raid.targetLateralSpread).toBeGreaterThan(6);
  expect(raid.minExitRadius).toBeGreaterThan(raid.worldRadius + 16);
  expect(raid.log).toContain("敵襲開始");
});

test("rival ant combat grapples before the loser exits or remains", async ({ page }) => {
  await waitForSimulation(page);

  const fight = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const ant = sim.ants[0];
    const guard = sim.ants[1];
    const supportA = sim.ants[2];
    const supportB = sim.ants[3];
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    sim.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };
    const antPopulationBefore = sim.colony.antPopulation;
    const colonyCorpseCountBeforeWorker = sim.colonyCorpses?.length ?? 0;

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
    let workerPreviousGait = ant.gaitPhase;
    let workerGaitAdvance = 0;
    let workerMaxCenterDrift = 0;
    let workerMaxAxisDrift = 0;
    for (let i = 0; i < 220; i += 1) {
      ant.update(1 / 60, sim);
      rival.update(1 / 60, sim);
      const gaitDelta = Math.atan2(Math.sin(ant.gaitPhase - workerPreviousGait), Math.cos(ant.gaitPhase - workerPreviousGait));
      workerGaitAdvance += Math.abs(gaitDelta);
      workerPreviousGait = ant.gaitPhase;
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
    const workerAlive = sim.ants.includes(ant);
    const workerCasualties = sim.colony.raidState.casualties;
    const antPopulationAfterWorker = sim.colony.antPopulation;
    const workerCombatEffects = sim.combatEffects?.length ?? 0;
    const colonyCorpseCountAfterWorker = sim.colonyCorpses?.length ?? 0;

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
    supportA.role = "guard";
    supportA.traits.persistence = 1;
    supportA.traits.caution = 1;
    supportA.state = "explore";
    supportA.x = 3.35;
    supportA.z = 0.9;
    supportA.prevX = supportA.x;
    supportA.prevZ = supportA.z;
    supportA.fleeTimer = 0;
    supportA.clashTimer = 0;
    supportB.role = "worker";
    supportB.traits.persistence = 0.8;
    supportB.traits.caution = 0.8;
    supportB.state = "explore";
    supportB.x = 3.55;
    supportB.z = -0.9;
    supportB.prevX = supportB.x;
    supportB.prevZ = supportB.z;
    supportB.fleeTimer = 0;
    supportB.clashTimer = 0;
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
    const corpseCountBeforeGuard = sim.rivalCorpses?.length ?? 0;
    const guardStarted = rival.resolveAntContacts(sim);
    const guardStateAtStart = guard.state;
    const guardGrapplersAtStart = rival.clash?.ants?.length ?? 0;
    let guardPreviousGait = guard.gaitPhase;
    let guardGaitAdvance = 0;
    for (let i = 0; i < 220; i += 1) {
      guard.update(1 / 60, sim);
      supportA.update(1 / 60, sim);
      supportB.update(1 / 60, sim);
      rival.update(1 / 60, sim);
      const gaitDelta = Math.atan2(Math.sin(guard.gaitPhase - guardPreviousGait), Math.cos(guard.gaitPhase - guardPreviousGait));
      guardGaitAdvance += Math.abs(gaitDelta);
      guardPreviousGait = guard.gaitPhase;
    }
    const enemyCorpseCountAfterGuard = sim.rivalCorpses?.length ?? 0;
    for (let i = 0; i < 620; i += 1) sim.updateCorpses(1 / 60);

    return {
      workerStarted,
      workerStateAtStart,
      workerStateAfter,
      workerFleeTimer,
      workerAlive,
      workerCasualties,
      workerGaitAdvance,
      workerCombatEffects,
      antPopulationBefore,
      antPopulationAfterWorker,
      colonyCorpseCountBeforeWorker,
      colonyCorpseCountAfterWorker,
      colonyCorpseCountAfterExpiry: sim.colonyCorpses?.length ?? 0,
      workerDistanceBefore,
      workerDistanceAfterStart,
      workerMaxCenterDrift,
      workerMaxAxisDrift,
      workerDistanceToNestBefore,
      guardStarted,
      guardStateAtStart,
      guardGrapplersAtStart,
      guardGaitAdvance,
      combatEffects: sim.combatEffects?.length ?? 0,
      lastWinner: rival.lastFightWinner,
      rivalRetreat: rival.retreat,
      enemyDefeated: rival.defeated,
      enemyMarkedGone: rival.leftRaid,
      enemyStillLive: sim.rivalAnts.includes(rival),
      enemyCorpseCount: enemyCorpseCountAfterGuard,
      enemyCorpseCountAfterExpiry: sim.rivalCorpses?.length ?? 0,
      corpseCountBeforeGuard,
      stats: sim.rivalFightStats,
    };
  });

  expect(fight.workerStarted).toBe(true);
  expect(fight.workerStateAtStart).toBe("clash");
  expect(Math.abs(fight.workerDistanceAfterStart - fight.workerDistanceBefore)).toBeLessThan(0.25);
  expect(fight.workerMaxCenterDrift).toBeLessThan(0.55);
  expect(fight.workerMaxAxisDrift).toBeLessThan(0.34);
  expect(fight.workerAlive).toBe(false);
  expect(fight.workerCasualties).toBeGreaterThanOrEqual(1);
  expect(fight.workerGaitAdvance).toBeGreaterThan(0.5);
  expect(fight.workerCombatEffects).toBeGreaterThanOrEqual(3);
  expect(fight.antPopulationAfterWorker).toBe(fight.antPopulationBefore - 1);
  expect(fight.colonyCorpseCountAfterWorker).toBeGreaterThan(fight.colonyCorpseCountBeforeWorker);
  expect(fight.colonyCorpseCountAfterExpiry).toBe(fight.colonyCorpseCountBeforeWorker);
  expect(fight.guardStarted).toBe(true);
  expect(fight.guardStateAtStart).toBe("clash");
  expect(fight.guardGrapplersAtStart).toBeGreaterThanOrEqual(2);
  expect(fight.guardGaitAdvance).toBeGreaterThan(0.5);
  expect(fight.combatEffects).toBeGreaterThan(fight.workerCombatEffects);
  expect(fight.lastWinner).toBe("colony");
  expect(fight.enemyDefeated).toBe(true);
  expect(fight.enemyMarkedGone).toBe(true);
  expect(fight.enemyStillLive).toBe(false);
  expect(fight.enemyCorpseCount).toBeGreaterThan(fight.corpseCountBeforeGuard);
  expect(fight.enemyCorpseCountAfterExpiry).toBe(fight.corpseCountBeforeGuard);
  expect(fight.stats.rivalWins).toBeGreaterThanOrEqual(1);
  expect(fight.stats.colonyWins).toBeGreaterThanOrEqual(1);
});

test("rival ants actively harass ants near food instead of only camping", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const food = sim.food[0];
    const ant = sim.ants[0];
    const rival = sim.raidRivals()[0];
    sim.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };

    for (const other of sim.ants) {
      other.state = "stunned";
      other.stun = 30;
      other.fleeTimer = 0;
      other.clashTimer = 0;
      other.clashRival = null;
      other.x = sim.nest.x;
      other.z = sim.nest.z;
      other.prevX = other.x;
      other.prevZ = other.z;
    }

    ant.role = "worker";
    ant.traits.persistence = 0.1;
    ant.traits.caution = 0.1;
    ant.state = "explore";
    ant.stun = 0;
    ant.fleeTimer = 0;
    ant.clashTimer = 0;
    ant.carrying = 0;
    ant.x = food.x + 42;
    ant.z = food.z + 8;
    rival.x = food.x - 10;
    rival.z = food.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.aggression = 1;
    rival.stubbornness = 1;
    rival.scale = 1.35;
    rival.baseSpeed = 16;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    rival.defeated = false;
    rival.leftRaid = false;
    const targetBeforeMove = rival.findHarassmentTarget(sim);
    const beforeDistance = Math.hypot(ant.x - rival.x, ant.z - rival.z);
    let minDistance = beforeDistance;
    for (let i = 0; i < 260; i += 1) {
      rival.update(1 / 30, sim);
      minDistance = Math.min(minDistance, Math.hypot(ant.x - rival.x, ant.z - rival.z));
      if (sim.rivalFightStats.clashes > 0) break;
    }
    const afterDistance = Math.hypot(ant.x - rival.x, ant.z - rival.z);

    return {
      beforeDistance,
      minDistance,
      afterDistance,
      targetRole: targetBeforeMove?.role ?? null,
      antState: ant.state,
      antAlive: sim.ants.includes(ant),
      casualties: sim.colony.raidState.casualties,
      rivalWins: sim.rivalFightStats.rivalWins,
      clashes: sim.rivalFightStats.clashes,
    };
  });

  expect(result.minDistance).toBeLessThan(result.beforeDistance);
  expect(result.targetRole).toBe("worker");
  expect(result.clashes).toBeGreaterThanOrEqual(1);
  expect(result.rivalWins).toBeGreaterThanOrEqual(1);
  expect(result.antAlive).toBe(false);
  expect(result.casualties).toBeGreaterThanOrEqual(1);
});
