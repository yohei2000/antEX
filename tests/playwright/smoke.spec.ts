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
  expect(metrics.upgradeButtons).toBeGreaterThanOrEqual(13);
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

test("expedition uses agent battle physics and renders replay agents", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.battleCooldownUntil = 0;
    sim.colony.food = 800;
    sim.colony.lifetimeFood = 1200;
    sim.colony.antPopulation = 48;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 14;
    sim.colony.territory = 2;
    sim.colony.enemyThreat = 5;
    sim.computeDerived();
    sim.startExpedition();
    for (let i = 0; i < 20; i += 1) {
      sim.updateExpeditionReplay(1 / 60);
      sim.renderExpeditionReplay();
    }
    return {
      hasBattle: Boolean(sim.lastExpeditionBattle),
      engine: sim.expeditionEngine,
      reason: sim.lastExpeditionBattle?.reason,
      winner: sim.lastExpeditionBattle?.winner,
      frameLogs: sim.lastExpeditionBattle?.frameLogs?.length ?? 0,
      forwardMotionRatio: sim.lastExpeditionBattle?.metrics?.forwardMotionRatio ?? 0,
      contactFacingRatio: sim.lastExpeditionBattle?.metrics?.contactFacingRatio ?? 0,
      replayActive: Boolean(sim.expeditionReplay),
      replayAgents: sim.expeditionReplay?.renderAgents?.length ?? 0,
      replaySpeedChecks: [0.5, 1, 1.5].map((speed) => {
        sim.expeditionReplay.time = 0;
        sim.expeditionReplay.speed = speed;
        for (let i = 0; i < 30; i += 1) sim.updateExpeditionReplay(1 / 60);
        sim.renderExpeditionReplay();
        return {
          speed,
          agents: sim.expeditionReplay.renderAgents.length,
          finite: sim.expeditionReplay.renderAgents.every((agent: any) =>
            Number.isFinite(agent.position.x) &&
            Number.isFinite(agent.position.y) &&
            Number.isFinite(agent.heading) &&
            Number.isFinite(agent.gaitPhase),
          ),
        };
      }),
      lowFpsAgents: (() => {
        sim.expeditionReplay.time = 0;
        sim.expeditionReplay.speed = 1;
        sim.updateExpeditionReplay(1 / 8);
        sim.renderExpeditionReplay();
        return sim.expeditionReplay.renderAgents.length;
      })(),
      logText: sim.colony.battleLog.join("\n"),
      cooldownSet: sim.colony.battleCooldownUntil > Date.now(),
    };
  });

  expect(result.hasBattle).toBe(true);
  expect(result.engine).toBe("agent");
  expect(["enemy_all_retreat", "player_all_retreat", "objective_held", "timeout_draw"]).toContain(result.reason);
  expect(["player", "enemy", "draw"]).toContain(result.winner);
  expect(result.frameLogs).toBeGreaterThan(0);
  expect(result.forwardMotionRatio).toBeGreaterThan(0.8);
  expect(result.contactFacingRatio).toBeGreaterThan(0.4);
  expect(result.replayActive).toBe(true);
  expect(result.replayAgents).toBeGreaterThan(0);
  expect(result.lowFpsAgents).toBeGreaterThan(0);
  for (const check of result.replaySpeedChecks) {
    expect(check.agents).toBeGreaterThan(0);
    expect(check.finite).toBe(true);
  }
  expect(result.logText).toContain("reason:");
  expect(result.cooldownSet).toBe(true);
});

test("expedition legacy engine flag stays isolated from agent replay", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.expeditionEngine = "legacy";
    sim.colony.battleCooldownUntil = 0;
    sim.colony.food = 800;
    sim.colony.lifetimeFood = 1200;
    sim.colony.antPopulation = 48;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 14;
    sim.colony.territory = 2;
    sim.colony.enemyThreat = 5;
    sim.computeDerived();
    sim.startExpedition();
    return {
      engine: sim.expeditionEngine,
      hasBattle: Boolean(sim.lastExpeditionBattle),
      frameLogs: sim.lastExpeditionBattle?.frameLogs?.length ?? -1,
      replayActive: Boolean(sim.expeditionReplay),
      logText: sim.colony.battleLog.join("\n"),
      cooldownSet: sim.colony.battleCooldownUntil > Date.now(),
    };
  });

  expect(result.engine).toBe("legacy");
  expect(result.hasBattle).toBe(true);
  expect(result.frameLogs).toBe(0);
  expect(result.replayActive).toBe(false);
  expect(result.logText).toContain("legacy reason:");
  expect(result.cooldownSet).toBe(true);
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
