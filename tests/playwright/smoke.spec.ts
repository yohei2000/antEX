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
      variantConfigCount: ["worker", "soldier", "heavySoldier", "builder"].filter((variant) =>
        Boolean(sim.getAntVariantConfig(variant)),
      ).length,
      variantCounts: sim.ants.reduce((counts: Record<string, number>, ant: any) => {
        counts[ant.variant] = (counts[ant.variant] ?? 0) + 1;
        return counts;
      }, {}),
      rivalAnts: sim.rivalAnts.length,
      raidPhase: sim.colony.raidState.phase,
      raidTimer: sim.colony.raidState.timer,
      rivalColor: sim.materials.antRival.color.getHexString(),
      colonyMaterialStates: ["explore", "panic", "flee", "clash", "wet", "stunned", "rescue", "return"].map((state) =>
        sim.antRenderer.materialStateFor({ isRival: false }, { state }),
      ),
      rivalMaterialState: sim.antRenderer.materialStateFor({ isRival: true }, { state: "clash" }),
      foodSources: sim.food.length,
      worldRadius: sim.worldRadius,
      terrainPatches: sim.terrain.length,
      terrainBumps: sim.terrainBumps?.length ?? 0,
      nestEntrances: sim.nestEntrances?.length ?? sim.nestHoles?.length ?? 0,
      nestSpoils: sim.nestSpoils?.length ?? 0,
      nestIsHoleGroup: sim.nestMound?.type === "Group",
      nestHasMoundGeometry: Boolean(sim.nestMound?.geometry),
      nestEntranceMaxY: Math.max(...(sim.nestEntrances ?? []).map((entrance: any) => entrance.position.y)),
      nestMainHoleDiameter: ((sim.nestMound?.children?.[0]?.scale?.x ?? 0) as number) * 2,
      nestEntranceMaxHoleDiameter: Math.max(...(sim.nestEntrances ?? []).map((entrance: any) => (entrance.children?.[0]?.scale?.x ?? 0) * 2)),
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
  expect(metrics.variantConfigCount).toBe(4);
  expect(metrics.variantCounts.worker).toBe(11);
  expect(metrics.rivalAnts).toBe(0);
  expect(metrics.raidPhase).toBe("calm");
  expect(metrics.raidTimer).toBeGreaterThan(0);
  expect(metrics.rivalColor).toBe("8a4a2f");
  expect(metrics.colonyMaterialStates.every((state) => state === "explore")).toBe(true);
  expect(metrics.rivalMaterialState).toBe("rival");
  expect(metrics.foodSources).toBeGreaterThanOrEqual(4);
  expect(metrics.worldRadius).toBeGreaterThanOrEqual(120);
  expect(metrics.terrainPatches).toBeGreaterThanOrEqual(8);
  expect(metrics.terrainBumps).toBeGreaterThanOrEqual(8);
  expect(metrics.nestEntrances).toBeGreaterThanOrEqual(4);
  expect(metrics.nestSpoils).toBeGreaterThanOrEqual(24);
  expect(metrics.nestIsHoleGroup).toBe(true);
  expect(metrics.nestHasMoundGeometry).toBe(false);
  expect(metrics.nestEntranceMaxY).toBeLessThan(0.12);
  expect(metrics.nestMainHoleDiameter).toBeLessThan(1.3);
  expect(metrics.nestEntranceMaxHoleDiameter).toBeLessThan(0.7);
  expect(metrics.stoneCount).toBeGreaterThanOrEqual(6);
  expect(metrics.branchCount).toBe(0);
  expect(metrics.upgradeButtons).toBeGreaterThanOrEqual(15);
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
    sim.updateStats();
    const notice = document.querySelector("#raidNotice") as HTMLElement;
    return {
      initial,
      phase: sim.colony.raidState.phase,
      activeCount: sim.colony.raidState.activeCount,
      rivals: sim.raidRivals().length,
      noticeText: notice?.textContent ?? "",
      noticeHidden: notice?.hidden ?? true,
      noticeKind: sim.raidNotice.kind,
      savedState: localStorage.getItem("ant3d.colonyState"),
    };
  });

  expect(result.initial.raidSoonMode).toBe(true);
  expect(result.initial.bodyClass).toBe(true);
  expect(result.initial.activeTab).toBe("growth");
  expect(["calm", "warning", "active"]).toContain(result.initial.phase);
  if (result.initial.phase === "calm") expect(result.initial.timer).toBeLessThanOrEqual(2.6);
  if (result.initial.phase === "warning") expect(result.initial.timer).toBeLessThanOrEqual(5.6);
  expect(result.initial.savedState).toBeNull();
  expect(result.phase).toBe("active");
  expect(result.activeCount).toBeGreaterThan(0);
  expect(result.rivals).toBeGreaterThan(0);
  expect(result.noticeHidden).toBe(false);
  expect(result.noticeText).toContain("敵襲開始");
  expect(result.noticeKind).toBe("warning");
  expect(result.savedState).toBeNull();
});

test("raid completion notice reports actual fallen delta", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.fallenAnts = 4;
    sim.colony.raidState = {
      phase: "active",
      timer: 10,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 7,
      enemyCasualties: 1,
      startFallenAnts: 4,
      lastOutcome: "active",
    };
    sim.resolveRaid("repelled");
    sim.updateStats();
    const notice = document.querySelector("#raidNotice") as HTMLElement;
    return {
      casualties: sim.colony.raidState.casualties,
      noticeText: notice?.textContent ?? "",
      log: sim.colony.battleLog.join("\n"),
    };
  });

  expect(result.casualties).toBe(0);
  expect(result.noticeText).toContain("味方死亡0");
  expect(result.noticeText).not.toContain("味方死亡7");
  expect(result.log).toContain("死亡0");
  expect(result.log).not.toContain("死亡7");
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
    const expectedReturnGain = carrier.carrying * sim.computeDerived().foragedFoodMultiplier;
    carrier.updateReturn(1 / 60, sim, { x: 0, z: 0 });
    const returnAfter = sim.colony.food;
    const hiddenAfterNestEntry = !sim.shouldRenderAnt(carrier);
    const stayTimerAfterEntry = carrier.nestStayTimer;
    carrier.update(9.8, sim);
    const hiddenBeforeCooldownEnds = !sim.shouldRenderAnt(carrier);
    carrier.update(0.4, sim);
    const visibleAfterCooldown = sim.shouldRenderAnt(carrier);
    const distanceAfterCooldown = Math.hypot(carrier.x - sim.nest.x, carrier.z - sim.nest.z);

    return {
      noDeliveryBefore,
      noDeliveryAfter,
      returnBefore,
      returnAfter,
      expectedReturnGain,
      hiddenAfterNestEntry,
      stayTimerAfterEntry,
      hiddenBeforeCooldownEnds,
      visibleAfterCooldown,
      distanceAfterCooldown,
    };
  });

  expect(result.noDeliveryAfter).toBeLessThanOrEqual(result.noDeliveryBefore + 0.0001);
  expect(result.noDeliveryAfter).toBeGreaterThan(result.noDeliveryBefore - 0.2);
  expect(result.returnAfter).toBeGreaterThan(result.returnBefore);
  expect(result.returnAfter - result.returnBefore).toBeCloseTo(result.expectedReturnGain, 5);
  expect(result.expectedReturnGain).toBeCloseTo(3.75, 5);
  expect(result.hiddenAfterNestEntry).toBe(true);
  expect(result.stayTimerAfterEntry).toBeGreaterThanOrEqual(9.9);
  expect(result.hiddenBeforeCooldownEnds).toBe(true);
  expect(result.visibleAfterCooldown).toBe(true);
  expect(result.distanceAfterCooldown).toBeGreaterThan(5);
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
  const clicked = await page.evaluate(() => {
    const button = document.querySelector('[data-upgrade="storageChambers"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  });
  const after = await page.evaluate(() => (window.__ANT_SIM as any).colony.upgrades.storageChambers);

  expect(clicked).toBe(true);
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
      sortieLimit: sim.sortieSoldierLimit(),
      availableSortie: sim.availableSortieSoldiers(),
      plannedSortie: sim.plannedSortieCount(),
      activeTab: sim.activeTab,
      button: (document.querySelector("#soldierSortieBtn") as HTMLButtonElement).textContent,
      tabText: document.querySelector(".panel-tabs")?.textContent ?? "",
    };
    const started = sim.startSoldierSortie();
    const firstWave = sim.deployedSoldiers();
    sim.soldierSortieCooldown = 0;
    sim.updateStats();
    const plannedAfterFirstCooldown = sim.plannedSortieCount();
    const secondStarted = sim.startSoldierSortie();
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
      firstWaveCount: firstWave.length,
      plannedAfterFirstCooldown,
      secondStarted,
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
  expect(result.before.sortieLimit).toBe(4);
  expect(result.before.availableSortie).toBe(4);
  expect(result.before.plannedSortie).toBe(4);
  expect(result.before.button).toContain("兵隊を出撃 4");
  expect(result.before.tabText).not.toContain("遠征");
  expect(result.started).toBe(true);
  expect(result.firstWaveCount).toBe(4);
  expect(result.plannedAfterFirstCooldown).toBe(3);
  expect(result.secondStarted).toBe(true);
  expect(result.deployedCount).toBe(7);
  expect(result.deployedRoles.every((role: string) => role === "guard")).toBe(true);
  expect(Math.max(...result.spawnDistances)).toBeLessThan(14);
  expect(result.afterRetire).toBe(0);
  expect(result.statusText).toContain("再準備");
  expect(result.logText).toContain("兵隊出撃");
});

test("heavy soldiers and builders unlock without replacing existing ants", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const first = sim.ants[0];
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 40;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 5;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 4;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.chamberExcavation = 1;
    const heavyBought = sim.buyUpgrade("heavySoldierBrood");
    const builderBought = sim.buyUpgrade("builderTraining");
    sim.computeDerived();
    sim.syncAntPopulation();
    const surfaceHeavyBeforeSortie = sim.ants.filter((ant: any) => ant.variant === "heavySoldier" && sim.shouldRenderAnt(ant)).length;
    const sortieLimitBefore = sim.sortieSoldierLimit();
    const availableSortieBefore = sim.availableSortieSoldiers();
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    sim.renderGame(1);
    const builders = sim.ants.filter((ant: any) => ant.variant === "builder");
    const deployed = sim.deployedSoldiers();
    const counts = sim.ants.reduce((acc: Record<string, number>, ant: any) => {
      acc[ant.variant] = (acc[ant.variant] ?? 0) + 1;
      return acc;
    }, {});
    const visibleRoleLabels = sim.roleLabelSystem.sprites.filter((sprite: any) => sprite.visible).length;
    const expectedRoleLabels = sim.ants.filter((ant: any) =>
      sim.shouldRenderAnt(ant) && !ant.isRival && ["soldier", "heavySoldier", "builder"].includes(ant.variant),
    ).length;
    const roleLabelBands = [...sim.roleLabelSystem.textures.entries()].map(([, texture]: any) => {
      const sample = texture.image.getContext("2d").getImageData(24, 64, 1, 1).data;
      return `${sample[0]},${sample[1]},${sample[2]}`;
    });
    return {
      heavyBought,
      builderBought,
      sameFirstObject: sim.ants[0] === first,
      firstId: sim.ants[0].id,
      beforeFirstId: first.id,
      uniqueIds: new Set(sim.ants.map((ant: any) => ant.id)).size,
      renderedAnts: sim.ants.length,
      counts,
      heavyCount: sim.colony.heavySoldierAnts,
      builderCount: sim.colony.builderAnts,
      builderTarget: sim.computeDerived().builderTarget,
      surfaceHeavyBeforeSortie,
      sortieStarted,
      deployedCount: deployed.length,
      deployedHeavyCount: deployed.filter((ant: any) => ant.variant === "heavySoldier").length,
      idleBuildersInNest: builders.every((ant: any) => Math.hypot(ant.x - sim.nest.x, ant.z - sim.nest.z) < sim.nest.radius * 0.6),
      surfaceBuilders: sim.renderAntBuffer.filter((ant: any) => ant.variant === "builder").length,
      normalSoldiers: sim.computeDerived().normalSoldiers,
      soldierPool: sim.sortieSoldierPool(),
      sortieLimit: sortieLimitBefore,
      availableSortie: availableSortieBefore,
      heavyConfig: sim.getAntVariantConfig("heavySoldier"),
      soldierConfig: sim.getAntVariantConfig("soldier"),
      builderConfig: sim.getAntVariantConfig("builder"),
      workerConfig: sim.getAntVariantConfig("worker"),
      finitePositions: sim.ants.every((ant: any) => Number.isFinite(ant.x) && Number.isFinite(ant.z)),
      visibleRoleLabels,
      expectedRoleLabels,
      roleLabelTextureCount: sim.roleLabelSystem.textures.size,
      distinctRoleLabelBandCount: new Set(roleLabelBands).size,
    };
  });

  expect(result.heavyBought).toBe(true);
  expect(result.builderBought).toBe(true);
  expect(result.sameFirstObject).toBe(true);
  expect(result.firstId).toBe(result.beforeFirstId);
  expect(result.uniqueIds).toBe(result.renderedAnts);
  expect(result.counts.heavySoldier).toBeGreaterThanOrEqual(1);
  expect(result.counts.builder).toBeGreaterThanOrEqual(1);
  expect(result.heavyCount).toBeGreaterThanOrEqual(1);
  expect(result.builderCount).toBe(2);
  expect(result.builderTarget).toBe(2);
  expect(result.surfaceHeavyBeforeSortie).toBe(0);
  expect(result.sortieStarted).toBe(true);
  expect(result.deployedCount).toBe(3);
  expect(result.deployedHeavyCount).toBe(1);
  expect(result.idleBuildersInNest).toBe(true);
  expect(result.surfaceBuilders).toBe(0);
  expect(result.sortieLimit).toBe(Math.ceil(result.soldierPool / 2));
  expect(result.availableSortie).toBe(result.sortieLimit);
  expect(result.heavyConfig.speed).toBeLessThan(result.workerConfig.speed);
  expect(result.heavyConfig.hp).toBeGreaterThan(result.soldierConfig.hp);
  expect(result.heavyConfig.pushMass).toBeGreaterThan(result.soldierConfig.pushMass);
  expect(result.builderConfig.attack).toBeLessThan(result.workerConfig.attack);
  expect(result.finitePositions).toBe(true);
  expect(result.visibleRoleLabels).toBe(result.expectedRoleLabels);
  expect(result.roleLabelTextureCount).toBeGreaterThanOrEqual(2);
  expect(result.distinctRoleLabelBandCount).toBe(result.roleLabelTextureCount);
});

test("construction tab issues earthwork commands separately from growth", async ({ page }) => {
  await waitForSimulation(page);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 42;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.builderAnts = 2;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 4;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.chamberExcavation = 1;
    sim.colony.upgrades.builderTraining = 1;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.setPanelCompact(false, false);
    sim.setActiveTab("construction");
    sim.updateStats();
  });

  await page.locator("#constructionTrailBtn").click();
  await page.locator("#constructionBarricadeBtn").click();

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.updateStats();
    return {
      activeTab: sim.activeTab,
      tabText: document.querySelector(".panel-tabs")?.textContent ?? "",
      growthActive: document.querySelector("#growthTab")?.classList.contains("active") ?? false,
      constructionActive: document.querySelector("#constructionTab")?.classList.contains("active") ?? false,
      taskKinds: sim.buildTasks.map((task: any) => task.kind).sort(),
      earthworkKinds: sim.earthworks.map((earthwork: any) => earthwork.kind).sort(),
      builderCountText: (document.querySelector("#constructionBuilders") as HTMLElement).textContent,
      activeCountText: (document.querySelector("#constructionActive") as HTMLElement).textContent,
      statusText: (document.querySelector("#constructionStatus") as HTMLElement).textContent,
      crewText: (document.querySelector("#constructionCrew") as HTMLElement).textContent,
      progressText: (document.querySelector("#constructionProgressList") as HTMLElement).textContent,
      progressRows: document.querySelectorAll("#constructionProgressList .construction-task").length,
      taskAssigneeCounts: sim.buildTasks.map((task: any) => sim.constructionAssignees(task).length).sort(),
      taskAssigneeTotal: sim.buildTasks.reduce((sum: number, task: any) => sum + sim.constructionAssignees(task).length, 0),
      taskAssigneeLimit: sim.buildTaskAssigneeLimit(),
      trailButtonText: (document.querySelector("#constructionTrailBtn") as HTMLButtonElement).textContent,
      barricadeButtonText: (document.querySelector("#constructionBarricadeBtn") as HTMLButtonElement).textContent,
      trailButtonTitle: (document.querySelector("#constructionTrailBtn") as HTMLButtonElement).title,
      barricadeButtonTitle: (document.querySelector("#constructionBarricadeBtn") as HTMLButtonElement).title,
      trailDisabledAfterCommand: (document.querySelector("#constructionTrailBtn") as HTMLButtonElement).disabled,
      savedEarthworks: sim.colony.earthworks.length,
    };
  });

  expect(result.activeTab).toBe("construction");
  expect(result.tabText).toContain("土木");
  expect(result.growthActive).toBe(false);
  expect(result.constructionActive).toBe(true);
  expect(result.taskKinds).toEqual(["lowBarricade", "trailReinforce"]);
  expect(result.earthworkKinds).toEqual(["lowBarricade", "trailReinforce"]);
  expect(result.builderCountText).toBe("2");
  expect(result.activeCountText).toBe("2");
  expect(result.statusText).toContain("作業中");
  expect(result.statusText).toContain("平均");
  expect(result.crewText).toContain("待機");
  expect(result.progressText).toContain("採餌道");
  expect(result.progressText).toContain("低い土塁");
  expect(result.trailButtonText).toContain("採土・往復あり");
  expect(result.trailButtonText).toContain("採餌効率");
  expect(result.barricadeButtonText).toContain("採土・往復あり");
  expect(result.barricadeButtonText).toContain("敵減速");
  expect(result.trailButtonTitle).toContain("距離・担当数で変動");
  expect(result.trailButtonTitle).toContain("味方の移動");
  expect(result.barricadeButtonTitle).toContain("距離・担当数で変動");
  expect(result.barricadeButtonTitle).toContain("重兵装");
  expect(result.taskAssigneeCounts.every((count: number) => count <= result.taskAssigneeLimit)).toBe(true);
  expect(result.taskAssigneeTotal).toBe(2);
  expect(result.taskAssigneeLimit).toBe(2);
  expect(result.progressRows).toBe(2);
  expect(result.trailDisabledAfterCommand).toBe(true);
  expect(result.savedEarthworks).toBe(2);
});

test("multiple builders can share one construction task", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 42;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.builderAnts = 3;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 4;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.chamberExcavation = 1;
    sim.colony.upgrades.builderTraining = 3;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.setPanelCompact(false, false);
    sim.setActiveTab("construction");
    sim.buildTasks = [];
    for (const item of [...sim.earthworks]) sim.disposeDynamicItem(item);
    sim.earthworks = [];

    const task = sim.createBuildTask("trailReinforce", sim.nest.x + 16, sim.nest.z + 4, { radius: 13, maxProgress: 4 });
    const builders = sim.ants.filter((ant: any) => ant.variant === "builder").slice(0, 3);
    const claimedTaskIds = builders.map((builder: any) => sim.claimBuildTask(builder)?.id ?? null);
    const before = task.progress;
    for (const builder of builders) sim.progressBuildTask(task, builder, 0.4);
    sim.updateStats();

    return {
      claimedTaskIds,
      claimedByIds: task.claimedByIds,
      progressGain: task.progress - before,
      progressText: (document.querySelector("#constructionProgressList") as HTMLElement).textContent,
      crewText: (document.querySelector("#constructionCrew") as HTMLElement).textContent,
    };
  });

  expect(result.claimedTaskIds).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
  expect(new Set(result.claimedTaskIds).size).toBe(1);
  expect(result.claimedByIds).toHaveLength(3);
  expect(result.progressGain).toBeCloseTo(1.2, 5);
  expect(result.progressText).toContain("担当 3/3");
  expect(result.crewText).toContain("待機");
});

test("builders stay in the nest until assigned and spread across construction types", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 44;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.builderAnts = 4;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 4;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.chamberExcavation = 1;
    sim.colony.upgrades.builderTraining = 2;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.buildTasks = [];
    for (const item of [...sim.earthworks]) sim.disposeDynamicItem(item);
    sim.earthworks = [];
    sim.renderGame(1);

    const builders = sim.ants.filter((ant: any) => ant.variant === "builder");
    const surfaceBuildersBefore = sim.renderAntBuffer.filter((ant: any) => ant.variant === "builder").length;
    const idleBuildersInNest = builders.every((ant: any) => Math.hypot(ant.x - sim.nest.x, ant.z - sim.nest.z) < sim.nest.radius * 0.6);

    const trail = sim.createBuildTask("trailReinforce", sim.nest.x + 18, sim.nest.z + 4, { radius: 13, maxProgress: 4 });
    const barricade = sim.createBuildTask("lowBarricade", sim.nest.x + 12, sim.nest.z - 10, { radius: 10, maxProgress: 4 });
    const claimedTaskIds = builders.map((builder: any) => sim.claimBuildTask(builder)?.id ?? null);
    for (let i = 0; i < 3; i += 1) sim.updateGame(1 / 60);
    sim.renderGame(1);

    return {
      builderTarget: sim.computeDerived().builderTarget,
      builderCount: sim.colony.builderAnts,
      surfaceBuildersBefore,
      idleBuildersInNest,
      claimedTaskIds,
      trailClaims: trail.claimedByIds.length,
      barricadeClaims: barricade.claimedByIds.length,
      surfaceBuildersAfter: sim.renderAntBuffer.filter((ant: any) => ant.variant === "builder").length,
      visibleBuilderLabels: sim.roleLabelSystem.sprites.filter((sprite: any) => sprite.visible && sprite.material.map === sim.roleLabelSystem.textures.get("builder")).length,
    };
  });

  expect(result.builderTarget).toBe(4);
  expect(result.builderCount).toBe(4);
  expect(result.surfaceBuildersBefore).toBe(0);
  expect(result.idleBuildersInNest).toBe(true);
  expect(result.claimedTaskIds.every((id: number | null) => id != null)).toBe(true);
  expect(new Set(result.claimedTaskIds).size).toBe(2);
  expect(result.trailClaims).toBeGreaterThanOrEqual(1);
  expect(result.barricadeClaims).toBeGreaterThanOrEqual(1);
  expect(result.surfaceBuildersAfter).toBe(4);
  expect(result.visibleBuilderLabels).toBe(4);
});

test("heavy soldiers brace while builders complete earthworks and retreat", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 42;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.builderAnts = 1;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.builderTraining = 1;
    sim.computeDerived();
    sim.syncAntPopulation();
    const surfaceHeavyBeforeSortie = sim.ants.filter((ant: any) => ant.variant === "heavySoldier" && sim.shouldRenderAnt(ant)).length;
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const heavy = sim.deployedSoldiers().find((ant: any) => ant.variant === "heavySoldier");
    const builder = sim.ants.find((ant: any) => ant.variant === "builder");

    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 3,
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
    heavy.x = sim.nest.x + sim.nest.radius + 2;
    heavy.z = sim.nest.z;
    rival.x = heavy.x + 3;
    rival.z = heavy.z;
    rival.retreat = 0;
    rival.clash = null;
    const steering = { x: 0, z: 0 };
    const heavyHandled = heavy.updateHeavySoldier(1 / 60, sim, steering, heavy.sensed);
    rival.x = sim.worldRadius;
    rival.z = sim.worldRadius;

    sim.buildTasks = [];
    sim.earthworks = [];
    const trailTask = sim.createBuildTask("trailReinforce", sim.nest.x + 16, sim.nest.z + 4, { radius: 13, maxProgress: 1 });
    const claimed = sim.claimBuildTask(builder);
    const sourceX = sim.nest.x + Math.cos(builder.id * 1.7) * (sim.nest.radius + 4.5);
    const sourceZ = sim.nest.z + Math.sin(builder.id * 1.7) * (sim.nest.radius + 4.5);
    builder.x = sourceX;
    builder.z = sourceZ;
    builder.updateBuilder(1 / 60, sim, { x: 0, z: 0 }, builder.sensed);
    const carryingAfterFetch = builder.carryingSoil;
    builder.x = trailTask.x;
    builder.z = trailTask.z;
    builder.updateBuilder(1.2, sim, { x: 0, z: 0 }, builder.sensed);
    sim.updateEarthworks();
    const trailStrength = sim.earthworks.find((item: any) => item.kind === "trailReinforce")?.strength ?? 0;
    const friendlySpeed = sim.earthworkSpeedAt(trailTask.x, trailTask.z, "builder");

    const barricadeTask = sim.createBuildTask("lowBarricade", sim.nest.x + 8, sim.nest.z, { radius: 10, maxProgress: 1 });
    sim.progressBuildTask(barricadeTask, builder, 1);
    sim.updateEarthworks();
    const rivalSpeed = sim.rivalSpeedAt(barricadeTask.x, barricadeTask.z);
    const braceBonus = sim.braceBonusAt(barricadeTask.x, barricadeTask.z);

    const retreatTask = sim.createBuildTask("trailReinforce", sim.nest.x + 22, sim.nest.z + 8, { radius: 13, maxProgress: 2 });
    retreatTask.claimedBy = builder.id;
    retreatTask.claimedByIds = [builder.id];
    builder.x = rival.x + 1.5;
    builder.z = rival.z;
    builder.carryingSoil = true;
    builder.buildTaskId = retreatTask.id;
    const retreatSteering = { x: 0, z: 0 };
    builder.updateBuilder(1 / 60, sim, retreatSteering, builder.sensed);
    const retreatTaskClaimAfterDanger = retreatTask.claimedBy;
    const retreatTaskClaimsAfterDanger = retreatTask.claimedByIds;

    return {
      heavyHandled,
      heavyAction: heavy.lastTacticalAction,
      heavyBrace: heavy.braceIntent,
      surfaceHeavyBeforeSortie,
      sortieStarted,
      claimedKind: claimed?.kind,
      carryingAfterFetch,
      trailStrength,
      friendlySpeed,
      rivalSpeed,
      braceBonus,
      builderAction: builder.lastTacticalAction,
      builderCarryingAfterDanger: builder.carryingSoil,
      builderTaskAfterDanger: builder.buildTaskId,
      retreatTaskClaimAfterDanger,
      retreatTaskClaimsAfterDanger,
      retreatLength: Math.hypot(retreatSteering.x, retreatSteering.z),
    };
  });

  expect(result.surfaceHeavyBeforeSortie).toBe(0);
  expect(result.sortieStarted).toBe(true);
  expect(result.heavyHandled).toBe(true);
  expect(["brace", "block"]).toContain(result.heavyAction);
  expect(result.heavyBrace).toBeGreaterThan(0);
  expect(result.claimedKind).toBe("trailReinforce");
  expect(result.carryingAfterFetch).toBe(true);
  expect(result.trailStrength).toBeGreaterThan(0.95);
  expect(result.friendlySpeed).toBeGreaterThan(1);
  expect(result.rivalSpeed).toBeLessThan(1);
  expect(result.braceBonus).toBeGreaterThan(0);
  expect(result.builderAction).toBe("retreatBehindGuard");
  expect(result.builderCarryingAfterDanger).toBe(false);
  expect(result.builderTaskAfterDanger).toBeNull();
  expect(result.retreatTaskClaimAfterDanger).toBeNull();
  expect(result.retreatTaskClaimsAfterDanger).toEqual([]);
  expect(result.retreatLength).toBeGreaterThan(0);
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
    rival.x = sim.nest.x + 118;
    rival.z = sim.nest.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    sim.colony.raidState.phase = "active";

    const sortieLimit = sim.sortieSoldierLimit();
    const plannedSortie = sim.plannedSortieCount();
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
      sortieLimit,
      plannedSortie,
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
  expect(result.sortieLimit).toBe(3);
  expect(result.plannedSortie).toBe(3);
  expect(result.deployed).toBe(3);
  expect(result.before).toBeGreaterThan(62);
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
      builderTraining: 5,
      ventilationShafts: 5,
      wasteGallery: 4,
      broodNursery: 8,
      broodClimate: 5,
      foodDistribution: 5,
      queenCare: 8,
      soldierTraining: 6,
      heavySoldierBrood: 4,
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

  expect(tree.buttonCount).toBeGreaterThanOrEqual(15);
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
    sim.colony.antPopulation = 500;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 80;
    sim.colony.heavySoldierAnts = 4;
    sim.colony.nestLevel = 12;
    sim.colony.territory = 18;
    sim.colony.enemyThreat = 6;
    sim.colony.upgrades.heavySoldierBrood = 4;
    sim.computeDerived();
    const largeNestRaidCount = sim.raidEnemyCount();
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
      largeNestRaidCount,
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
  expect(raid.largeNestRaidCount).toBeGreaterThanOrEqual(30);
  expect(raid.warning.activeCount).toBe(raid.largeNestRaidCount);
  expect(raid.warning.log).toContain("敵アリの気配");
  expect(raid.activePhase).toBe("active");
  expect(raid.phaseAfterStats).toBe("active");
  expect(raid.rivalCount).toBe(raid.activeCount);
  expect(raid.minNestDistance).toBeGreaterThan(50);
  expect(raid.minWorldRadius).toBeGreaterThan(raid.worldRadius * 0.85);
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
    let guardSlotOffsets: number[] = [];
    for (let i = 0; i < 220; i += 1) {
      guard.update(1 / 60, sim);
      supportA.update(1 / 60, sim);
      supportB.update(1 / 60, sim);
      rival.update(1 / 60, sim);
      if (i === 24 && rival.clash) {
        const lineAngle = Math.atan2(rival.clash.lineZ, rival.clash.lineX);
        guardSlotOffsets = rival.clash.ants.map((grappler: any) => {
          const angle = Math.atan2(grappler.z - rival.z, grappler.x - rival.x);
          return Math.atan2(Math.sin(angle - lineAngle), Math.cos(angle - lineAngle));
        });
      }
      const gaitDelta = Math.atan2(Math.sin(guard.gaitPhase - guardPreviousGait), Math.cos(guard.gaitPhase - guardPreviousGait));
      guardGaitAdvance += Math.abs(gaitDelta);
      guardPreviousGait = guard.gaitPhase;
    }
    const enemyCorpseCountAfterGuard = sim.rivalCorpses?.length ?? 0;
    sim.updateRaid(1 / 60);
    sim.updateStats();
    const repelNotice = document.querySelector("#raidNotice") as HTMLElement;
    const hasFrontBite = guardSlotOffsets.some((offset) => Math.abs(offset) < 0.72);
    const hasSideBite = guardSlotOffsets.some((offset) => Math.abs(Math.abs(offset) - Math.PI / 2) < 0.72);
    const hasRearBite = guardSlotOffsets.some((offset) => Math.abs(Math.abs(offset) - Math.PI) < 0.78);
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
      guardSlotOffsets,
      hasFrontBite,
      hasSideBite,
      hasRearBite,
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
      repelNoticeText: repelNotice?.textContent ?? "",
      repelNoticeHidden: repelNotice?.hidden ?? true,
      repelNoticeKind: sim.raidNotice.kind,
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
  expect(fight.guardGrapplersAtStart).toBe(3);
  expect(fight.guardSlotOffsets).toHaveLength(3);
  expect(fight.hasFrontBite).toBe(true);
  expect(fight.hasSideBite).toBe(true);
  expect(fight.hasRearBite).toBe(true);
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
  expect(fight.repelNoticeHidden).toBe(false);
  expect(fight.repelNoticeText).toContain("敵アリ撃退");
  expect(fight.repelNoticeKind).toBe("repelled");
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
