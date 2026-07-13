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
    const outsidePoint = { x: sim.nest.x + sim.mapVisionRadiusValue + 30, z: sim.nest.z };
    const outsideVisibleBeforeYaw = sim.isPointVisible(outsidePoint.x, outsidePoint.z, 0);
    const beforeYaw = sim.cameraYaw;
    const beforeTargetYaw = sim.targetCameraYaw;
    sim.cameraYaw = beforeYaw + Math.PI * 0.45;
    sim.targetCameraYaw = sim.cameraYaw;
    sim.updateCamera();
    const outsideVisibleAfterYaw = sim.isPointVisible(outsidePoint.x, outsidePoint.z, 0);
    sim.cameraYaw = beforeYaw;
    sim.targetCameraYaw = beforeTargetYaw;
    sim.updateCamera();
    const info = sim.renderer.info;
    const profileSpread = (profile: number[] = []) => (profile.length ? Math.max(...profile) - Math.min(...profile) : 0);
    const terrainProfileSpreads = sim.terrain.map((patch: any) => profileSpread(patch.boundaryProfile));
    const waterPools = sim.water.map((water: any) => water.group?.children?.find((child: any) => child.name === "natural-water-pool"));
    const waterProfileSpreads = sim.water.map((water: any) => profileSpread(water.boundaryProfile));
    const stoneSurfaces = sim.stones.flatMap((stone: any) => stone.group?.children?.filter((child: any) => child.name === "natural-stone-surface") ?? []);
    const stoneSurfaceProfileSpreads = stoneSurfaces.map((surface: any) => profileSpread(surface.geometry?.userData?.irregularProfile));
    const rivalWorkers = typeof sim.rivalNestWorkers === "function"
      ? sim.rivalNestWorkers()
      : sim.rivalAnts.filter((rival: any) => rival.isRivalWorker);
    const rivalWorkerDistances = rivalWorkers.map((rival: any) => Math.hypot(rival.x - sim.rivalNest.x, rival.z - sim.rivalNest.z));
    const rivalAntsInitial = sim.rivalAnts.length;
    const raidRivalsInitial = sim.raidRivals().length;
    const rivalNestDiscoveredInitial = sim.rivalNest.discovered;
    const rivalNestVisibleInitial = sim.rivalNest.group?.visible ?? false;
    const visibleRivalWorkersInitial = rivalWorkers.filter((rival: any) => sim.shouldRenderRival(rival)).length;
    const rivalWorkerProbe = (() => {
      const probe = sim.ants.find((ant: any) => ant.variant !== "builder") ?? sim.ants[0];
      if (!probe) return { visibleWorkers: 0, visibleNest: false };
      const saved = {
        x: probe.x,
        z: probe.z,
        prevX: probe.prevX,
        prevZ: probe.prevZ,
        angle: probe.angle,
        prevAngle: probe.prevAngle,
        variant: probe.variant,
        variantConfig: probe.variantConfig,
        role: probe.role,
        inNest: probe.inNest,
        nestStayTimer: probe.nestStayTimer,
      };
      probe.inNest = false;
      probe.nestStayTimer = 0;
      probe.setVariant?.("scout");
      probe.role = "worker";
      probe.x = sim.rivalNest.x;
      probe.z = sim.rivalNest.z;
      probe.prevX = probe.x;
      probe.prevZ = probe.z;
      sim.updateMapIntel();
      sim.updateMapVisibility();
      const visibleWorkers = rivalWorkers.filter((rival: any) => sim.shouldRenderRival(rival)).length;
      const visibleNest = sim.rivalNest.group?.visible ?? false;
      Object.assign(probe, saved);
      return { visibleWorkers, visibleNest };
    })();
    const rivalWorkerScaleProbe = (() => {
      const saved = {
        enemyThreat: sim.colony.enemyThreat,
        nestLevel: sim.colony.nestLevel,
        territory: sim.colony.territory,
        antPopulation: sim.colony.antPopulation,
      };
      const baseTarget = sim.rivalNestWorkerTargetCount?.() ?? rivalWorkers.length;
      sim.colony.enemyThreat = 42;
      sim.colony.nestLevel = 7;
      sim.colony.territory = 16;
      sim.colony.antPopulation = 180;
      sim.computeDerived();
      const scaledTarget = sim.rivalNestWorkerTargetCount?.() ?? rivalWorkers.length;
      sim.spawnRivalNestWorkers?.();
      const scaledWorkers = sim.rivalNestWorkers?.().length ?? sim.rivalAnts.filter((rival: any) => rival.isRivalWorker).length;
      Object.assign(sim.colony, saved);
      sim.computeDerived();
      return { baseTarget, scaledTarget, scaledWorkers };
    })();
    return {
      hasCanvas: Boolean(canvas),
      cssWidth: rect?.width ?? 0,
      cssHeight: rect?.height ?? 0,
      antPopulation: sim.colony.antPopulation,
      renderedAnts: sim.ants.length,
      deployedSoldiers: sim.deployedSoldierCount(),
      variantConfigCount: ["worker", "soldier", "heavySoldier", "shieldHead", "acidShooter", "scout", "medic", "captain", "builder"].filter((variant) =>
        Boolean(sim.getAntVariantConfig(variant)),
      ).length,
      variantCounts: sim.ants.reduce((counts: Record<string, number>, ant: any) => {
        counts[ant.variant] = (counts[ant.variant] ?? 0) + 1;
        return counts;
      }, {}),
      rivalAnts: rivalAntsInitial,
      raidRivals: raidRivalsInitial,
      rivalWorkers: rivalWorkers.length,
      visibleRivalWorkersInitial,
      visibleRivalWorkersAfterProbe: rivalWorkerProbe.visibleWorkers,
      rivalNestVisibleAfterProbe: rivalWorkerProbe.visibleNest,
      rivalWorkerMinNestDistance: Math.min(...rivalWorkerDistances),
      rivalWorkerMaxNestDistance: Math.max(...rivalWorkerDistances),
      rivalWorkerVariants: rivalWorkers.map((rival: any) => rival.variant),
      rivalWorkerBaseTarget: rivalWorkerScaleProbe.baseTarget,
      rivalWorkerScaledTarget: rivalWorkerScaleProbe.scaledTarget,
      rivalWorkerScaledCount: rivalWorkerScaleProbe.scaledWorkers,
      raidPhase: sim.colony.raidState.phase,
      raidTimer: sim.colony.raidState.timer,
      rivalColor: sim.materials.antRival.color.getHexString(),
      colonyMaterialStates: ["explore", "panic", "flee", "clash", "wet", "stunned", "rescue", "return"].map((state) =>
        sim.antRenderer.materialStateFor({ isRival: false }, { state }),
      ),
      rivalMaterialState: sim.antRenderer.materialStateFor({ isRival: true }, { state: "clash" }),
      foodSources: sim.food.length,
      foodSpawnSites: sim.foodSpawnSites.length,
      worldRadius: sim.worldRadius,
      mapVisionRadius: sim.mapVisionRadiusValue,
      mapActivityRadius: sim.workerActivityRadius?.() ?? sim.mapVisionRadiusValue,
      nestVisionRadius: sim.currentNestVisionRadius?.() ?? sim.mapVisionRadius(),
      rivalNestExists: Boolean(sim.rivalNest),
      rivalNestDistance: Math.hypot(sim.rivalNest.x - sim.nest.x, sim.rivalNest.z - sim.nest.z),
      rivalNestDiscovered: rivalNestDiscoveredInitial,
      rivalNestVisible: rivalNestVisibleInitial,
      fogOfWarVisible: Boolean(sim.fogOfWar?.visible),
      fogCanvasCount: document.querySelectorAll("#world3d canvas").length,
      fogRenderOrder: sim.fogOfWar?.renderOrder ?? 0,
      visionEdgeRenderOrder: sim.visionEdge?.renderOrder ?? 0,
      fogDepthTest: sim.fogOfWarMaterial?.depthTest ?? true,
      fogDepthWrite: sim.fogOfWarMaterial?.depthWrite ?? true,
      fogMaterialTransparent: sim.fogOfWarMaterial?.transparent ?? false,
      fogMaterialToneMapped: sim.fogOfWarMaterial?.toneMapped ?? true,
      fogUniformRevealRadius: sim.fogOfWarMaterial?.uniforms?.revealRadius?.value ?? 0,
      fogHasExplorationMask: Boolean(sim.fogOfWarMaterial?.uniforms?.exploredMask?.value?.isDataTexture),
      fogExplorationMaskSize: sim.fogOfWarMaterial?.uniforms?.exploredMask?.value?.image?.width ?? 0,
      fogUniformActiveSightCount: sim.fogOfWarMaterial?.uniforms?.activeSightCount?.value ?? -1,
      fogUniformRememberedAlpha: sim.fogOfWarMaterial?.uniforms?.rememberedAlpha?.value ?? 0,
      fogUniformMaxAlpha: sim.fogOfWarMaterial?.uniforms?.maxAlpha?.value ?? 0,
      initialExploredMaskCells: sim.exploredMaskData.reduce((count: number, value: number) => count + (value > 0 ? 1 : 0), 0),
      hasNextActionDock: Boolean(document.querySelector("#nextActionDock")),
      hasNestNowLabel: document.body.textContent?.includes("巣のいま") ?? false,
      outsideInitialCircleVisible: outsideVisibleBeforeYaw,
      outsideVisibilityChangedByCameraYaw: outsideVisibleBeforeYaw !== outsideVisibleAfterYaw,
      terrainPatches: sim.terrain.length,
      terrainBumps: sim.terrainBumps?.length ?? 0,
      groundTextureSource: sim.groundTextureSource ?? "",
      generatedMapTextureCount: [
        "groundTexture",
        "terrainMossTexture",
        "terrainSandTexture",
        "terrainGravelTexture",
        "stoneTexture",
        "waterTexture",
        "grassTuftTexture",
        "mossWetlandTexture",
        "microGravelTexture",
        "crackedMudTexture",
        "shorelineWetEdgeTexture",
      ].filter((key) =>
        Boolean(sim.assetService.get(key)),
      ).length,
      groundMaterialUsesGeneratedTexture: sim.materials.ground.map === sim.assetService.get("groundTexture"),
      groundTextureRepeatX: sim.materials.ground.map?.repeat?.x ?? 0,
      groundTextureFlipY: sim.materials.ground.map?.flipY ?? true,
      texturedTerrainPatches: sim.terrain.filter((patch: any) => Boolean(patch.mesh?.material?.map)).length,
      irregularTerrainPatches: sim.terrain.filter((patch: any) => Boolean(patch.mesh?.geometry?.userData?.naturalBlob)).length,
      minTerrainProfileSpread: Math.min(...terrainProfileSpreads),
      stoneMaterialUsesGeneratedTexture: sim.materials.stone.map === sim.assetService.get("stoneTexture"),
      stoneSurfaceUsesGeneratedTexture: sim.materials.stoneSurface.map === sim.assetService.get("stoneTexture"),
      waterMaterialUsesGeneratedTexture: sim.materials.water.map === sim.assetService.get("waterTexture"),
      waterCount: sim.water.length,
      permanentWaterCount: sim.water.filter((water: any) => water.permanent).length,
      maxWaterRadius: Math.max(...sim.water.map((water: any) => water.radius)),
      irregularWaterPools: waterPools.filter((pool: any) => Boolean(pool?.geometry?.userData?.naturalBlob)).length,
      minWaterProfileSpread: Math.min(...waterProfileSpreads),
      nestEntrances: sim.nestEntrances?.length ?? sim.nestHoles?.length ?? 0,
      nestSpoils: sim.nestSpoils?.length ?? 0,
      nestIsHoleGroup: sim.nestMound?.type === "Group",
      nestHasMoundGeometry: Boolean(sim.nestMound?.geometry),
      nestEntranceMaxY: Math.max(...(sim.nestEntrances ?? []).map((entrance: any) => entrance.position.y)),
      nestMainHoleDiameter: ((sim.nestMound?.children?.[0]?.scale?.x ?? 0) as number) * 2,
      nestEntranceMaxHoleDiameter: Math.max(...(sim.nestEntrances ?? []).map((entrance: any) => (entrance.children?.[0]?.scale?.x ?? 0) * 2)),
      stoneCount: sim.stones.length,
      stoneMeshCount: sim.stones.reduce((count: number, stone: any) => count + (stone.group?.children?.filter((child: any) => child.type === "Mesh").length ?? 0), 0),
      irregularStoneSurfaces: stoneSurfaces.filter((surface: any) => Boolean(surface.geometry?.userData?.naturalBlob)).length,
      minStoneSurfaceProfileSpread: Math.min(...stoneSurfaceProfileSpreads),
      naturalDetailObjects: sim.naturalDetails?.length ?? 0,
      naturalDetailStats: sim.naturalDetailStats ?? {},
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
  expect(metrics.variantConfigCount).toBe(9);
  expect(metrics.variantCounts.worker).toBe(11);
  expect(metrics.rivalAnts).toBe(9);
  expect(metrics.raidRivals).toBe(0);
  expect(metrics.rivalWorkers).toBe(9);
  expect(metrics.visibleRivalWorkersInitial).toBe(0);
  expect(metrics.visibleRivalWorkersAfterProbe).toBeGreaterThan(0);
  expect(metrics.rivalNestVisibleAfterProbe).toBe(true);
  expect(metrics.rivalWorkerVariants.every((variant) => variant === "worker")).toBe(true);
  expect(metrics.rivalWorkerMinNestDistance).toBeGreaterThanOrEqual(4);
  expect(metrics.rivalWorkerMaxNestDistance).toBeLessThanOrEqual(36);
  expect(metrics.rivalWorkerBaseTarget).toBe(9);
  expect(metrics.rivalWorkerScaledTarget).toBeGreaterThan(metrics.rivalWorkerBaseTarget);
  expect(metrics.rivalWorkerScaledCount).toBe(metrics.rivalWorkerScaledTarget);
  expect(metrics.raidPhase).toBe("calm");
  expect(metrics.raidTimer).toBeGreaterThan(0);
  expect(metrics.rivalColor).toBe("8a4a2f");
  expect(metrics.colonyMaterialStates.every((state) => state === "explore")).toBe(true);
  expect(metrics.rivalMaterialState).toBe("rival");
  expect(metrics.foodSources).toBeGreaterThanOrEqual(4);
  expect(metrics.foodSpawnSites).toBeGreaterThanOrEqual(metrics.foodSources);
  expect(metrics.worldRadius).toBeGreaterThanOrEqual(260);
  expect(metrics.mapVisionRadius).toBeGreaterThanOrEqual(70);
  expect(metrics.mapVisionRadius).toBeLessThanOrEqual(90);
  expect(metrics.mapActivityRadius).toBeCloseTo(metrics.mapVisionRadius, 1);
  expect(metrics.rivalNestExists).toBe(true);
  expect(metrics.rivalNestDistance).toBeGreaterThan(metrics.mapVisionRadius);
  expect(metrics.rivalNestDistance).toBeGreaterThan(420);
  expect(metrics.rivalNestDiscovered).toBe(false);
  expect(metrics.rivalNestVisible).toBe(false);
  expect(metrics.fogOfWarVisible).toBe(true);
  expect(metrics.fogCanvasCount).toBe(1);
  expect(metrics.fogRenderOrder).toBeGreaterThanOrEqual(80);
  expect(metrics.visionEdgeRenderOrder).toBeGreaterThan(metrics.fogRenderOrder);
  expect(metrics.fogDepthTest).toBe(false);
  expect(metrics.fogDepthWrite).toBe(false);
  expect(metrics.fogMaterialTransparent).toBe(true);
  expect(metrics.fogMaterialToneMapped).toBe(false);
  expect(metrics.fogUniformRevealRadius).toBeCloseTo(metrics.nestVisionRadius, 1);
  expect(metrics.fogHasExplorationMask).toBe(true);
  expect(metrics.fogExplorationMaskSize).toBe(256);
  expect(metrics.fogUniformActiveSightCount).toBeGreaterThanOrEqual(0);
  expect(metrics.fogUniformRememberedAlpha).toBeGreaterThanOrEqual(0.24);
  expect(metrics.fogUniformRememberedAlpha).toBeLessThanOrEqual(0.36);
  expect(metrics.fogUniformMaxAlpha - metrics.fogUniformRememberedAlpha).toBeGreaterThanOrEqual(0.6);
  expect(metrics.fogUniformRememberedAlpha).toBeLessThan(metrics.fogUniformMaxAlpha);
  expect(metrics.initialExploredMaskCells).toBeGreaterThan(0);
  expect(metrics.hasNextActionDock).toBe(false);
  expect(metrics.hasNestNowLabel).toBe(false);
  expect(metrics.outsideInitialCircleVisible).toBe(false);
  expect(metrics.outsideVisibilityChangedByCameraYaw).toBe(false);
  expect(metrics.terrainPatches).toBeGreaterThanOrEqual(16);
  expect(metrics.terrainBumps).toBeGreaterThanOrEqual(20);
  expect(metrics.groundTextureSource).toBe("generated-soil-texture");
  expect(metrics.generatedMapTextureCount).toBe(11);
  expect(metrics.groundMaterialUsesGeneratedTexture).toBe(true);
  expect(metrics.groundTextureRepeatX).toBeGreaterThanOrEqual(7);
  expect(metrics.groundTextureFlipY).toBe(false);
  expect(metrics.texturedTerrainPatches).toBeGreaterThanOrEqual(16);
  expect(metrics.irregularTerrainPatches).toBe(metrics.terrainPatches);
  expect(metrics.minTerrainProfileSpread).toBeGreaterThan(0.12);
  expect(metrics.stoneMaterialUsesGeneratedTexture).toBe(true);
  expect(metrics.stoneSurfaceUsesGeneratedTexture).toBe(true);
  expect(metrics.waterMaterialUsesGeneratedTexture).toBe(true);
  expect(metrics.waterCount).toBeGreaterThanOrEqual(4);
  expect(metrics.permanentWaterCount).toBeGreaterThanOrEqual(4);
  expect(metrics.maxWaterRadius).toBeGreaterThanOrEqual(42);
  expect(metrics.irregularWaterPools).toBe(metrics.waterCount);
  expect(metrics.minWaterProfileSpread).toBeGreaterThan(0.12);
  expect(metrics.nestEntrances).toBeGreaterThanOrEqual(4);
  expect(metrics.nestSpoils).toBeGreaterThanOrEqual(24);
  expect(metrics.nestIsHoleGroup).toBe(true);
  expect(metrics.nestHasMoundGeometry).toBe(false);
  expect(metrics.nestEntranceMaxY).toBeLessThan(0.12);
  expect(metrics.nestMainHoleDiameter).toBeLessThan(1.3);
  expect(metrics.nestEntranceMaxHoleDiameter).toBeLessThan(0.7);
  expect(metrics.stoneCount).toBeGreaterThanOrEqual(34);
  expect(metrics.stoneMeshCount).toBeGreaterThan(metrics.stoneCount);
  expect(metrics.irregularStoneSurfaces).toBeGreaterThanOrEqual(metrics.stoneCount);
  expect(metrics.minStoneSurfaceProfileSpread).toBeGreaterThan(0.12);
  expect(metrics.naturalDetailObjects).toBeGreaterThanOrEqual(20);
  expect(metrics.naturalDetailStats.grassClumps).toBeGreaterThanOrEqual(64);
  expect(metrics.naturalDetailStats.microPebbles).toBeGreaterThanOrEqual(280);
  expect(metrics.naturalDetailStats.wetEdgeDecals).toBeGreaterThanOrEqual(8);
  expect(metrics.naturalDetailStats.crackDecals).toBeGreaterThanOrEqual(5);
  expect(metrics.naturalDetailStats.mossDecals).toBeGreaterThanOrEqual(6);
  expect(metrics.naturalDetailStats.gravelDecals).toBeGreaterThanOrEqual(6);
  expect(metrics.branchCount).toBe(0);
  expect(metrics.upgradeButtons).toBeGreaterThanOrEqual(15);
  expect(metrics.calls).toBeGreaterThan(0);
  expect(metrics.triangles).toBeGreaterThan(0);
});

test("depleted natural food respawns after a spacing interval", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const site = sim.foodSpawnSites[0];
    const original = sim.food.find((food: any) => food.id === site.activeFoodId);
    original.amount = 0;
    sim.refreshFoodMesh(original);
    const afterDeplete = {
      foodCount: sim.food.length,
      activeFoodId: site.activeFoodId,
      timer: site.respawnTimer,
      minTimer: sim.foodRespawnScaleForDistance(site.distanceFromNest) * 70,
    };
    sim.updateFoodRespawns(Math.max(0, site.respawnTimer - 0.5));
    const beforeRespawn = {
      foodCount: sim.food.length,
      activeFoodId: site.activeFoodId,
      timer: site.respawnTimer,
    };
    sim.updateFoodRespawns(1);
    const respawned = sim.food.find((food: any) => food.id === site.activeFoodId);
    return {
      afterDeplete,
      beforeRespawn,
      afterRespawn: {
        foodCount: sim.food.length,
        activeFoodId: site.activeFoodId,
        exists: Boolean(respawned),
        amount: respawned?.amount ?? 0,
        distanceFromSite: respawned ? Math.hypot(respawned.x - site.homeX, respawned.z - site.homeZ) : Infinity,
      },
    };
  });

  expect(result.afterDeplete.foodCount).toBeGreaterThanOrEqual(1);
  expect(result.afterDeplete.activeFoodId).toBeNull();
  expect(result.afterDeplete.timer).toBeGreaterThanOrEqual(result.afterDeplete.minTimer - 0.001);
  expect(result.beforeRespawn.activeFoodId).toBeNull();
  expect(result.beforeRespawn.foodCount).toBe(result.afterDeplete.foodCount);
  expect(result.beforeRespawn.timer).toBeGreaterThan(0);
  expect(result.afterRespawn.exists).toBe(true);
  expect(result.afterRespawn.foodCount).toBe(result.afterDeplete.foodCount + 1);
  expect(result.afterRespawn.amount).toBeGreaterThan(0);
  expect(result.afterRespawn.distanceFromSite).toBeLessThan(6);
});

test("near food supports early colonies while distant food unlocks wider growth", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const sites = sim.foodSpawnSites.map((site: any) => ({
      amount: site.amount,
      distance: site.distanceFromNest,
      tier: site.distanceTier,
      respawnDelay: sim.foodRespawnDelayForSite(site),
    }));
    const near = sites.filter((site: any) => site.tier === "near");
    const far = sites.filter((site: any) => site.tier === "far");

    const restore = {
      food: sim.colony.food,
      lifetimeFood: sim.colony.lifetimeFood,
      antPopulation: sim.colony.antPopulation,
      nestLevel: sim.colony.nestLevel,
      territory: sim.colony.territory,
      progress: sim.foragingTerritoryProgress,
      recentSamples: [...sim.recentForagingSamples],
      recentTotal: sim.recentForagingTotal,
      simTime: sim.simTime,
    };

    sim.colony.food = 0;
    sim.colony.lifetimeFood = 0;
    sim.gainFood(1, true, { sourceDistance: 54 });
    const nearGain = sim.colony.food;
    sim.colony.food = 0;
    sim.colony.lifetimeFood = 0;
    sim.gainFood(1, true, { sourceDistance: 230 });
    const farGain = sim.colony.food;

    sim.colony.food = 0;
    sim.colony.lifetimeFood = 10000;
    sim.colony.antPopulation = 28;
    sim.colony.nestLevel = 2;
    sim.colony.territory = 0;
    sim.foragingTerritoryProgress = 0;
    sim.updateMapIntel();
    const activityBeforeTerritory = sim.workerActivityRadius();
    const visionBeforeTerritory = sim.fogOfWarMaterial.uniforms.revealRadius.value;
    sim.autoLevelNest();
    const blockedNestLevel = sim.colony.nestLevel;

    sim.foragingTerritoryProgress = Math.max(0, sim.foragingTerritoryCost() - 0.01);
    sim.gainFood(1, true, { sourceDistance: 230 });
    const territoryAfterFarFood = sim.colony.territory;
    sim.autoLevelNest();
    const nestLevelAfterTerritory = sim.colony.nestLevel;
    sim.updateMapIntel();
    const activityAfterTerritory = sim.workerActivityRadius();
    const visionAfterTerritory = sim.fogOfWarMaterial.uniforms.revealRadius.value;
    const activityEdgeVisibleAfterTerritory = sim.isPointVisible(sim.nest.x + activityAfterTerritory - 2, sim.nest.z, 0);

    sim.recentForagingSamples = [];
    sim.recentForagingTotal = 0;
    sim.simTime = 30;
    sim.colony.food = 0;
    sim.colony.lifetimeFood = 0;
    sim.gainFood(1, true, { sourceDistance: 54 });
    const recentForaging = sim.recentForagingPerMinute();
    sim.updateStats();
    const recentMetric = Number((document.querySelector("#statFoodRate")?.textContent ?? "0").replace(/,/g, ""));
    const recentLabel = document.querySelector("#statFoodRate")?.previousElementSibling?.textContent ?? "";

    sim.colony.food = restore.food;
    sim.colony.lifetimeFood = restore.lifetimeFood;
    sim.colony.antPopulation = restore.antPopulation;
    sim.colony.nestLevel = restore.nestLevel;
    sim.colony.territory = restore.territory;
    sim.foragingTerritoryProgress = restore.progress;
    sim.recentForagingSamples = restore.recentSamples;
    sim.recentForagingTotal = restore.recentTotal;
    sim.simTime = restore.simTime;
    sim.syncAntPopulation();
    sim.updateStats();

    return {
      nearCount: near.length,
      farCount: far.length,
      nearMaxAmount: Math.max(...near.map((site: any) => site.amount)),
      farMinAmount: Math.min(...far.map((site: any) => site.amount)),
      nearMaxRespawn: Math.max(...near.map((site: any) => site.respawnDelay)),
      farMinRespawn: Math.min(...far.map((site: any) => site.respawnDelay)),
      nearGain,
      farGain,
      recentForaging,
      recentMetric,
      recentLabel,
      blockedNestLevel,
      territoryAfterFarFood,
      nestLevelAfterTerritory,
      activityBeforeTerritory,
      activityAfterTerritory,
      visionBeforeTerritory,
      visionAfterTerritory,
      activityEdgeVisibleAfterTerritory,
    };
  });

  expect(result.nearCount).toBeGreaterThanOrEqual(2);
  expect(result.farCount).toBeGreaterThanOrEqual(2);
  expect(result.nearMaxAmount).toBeLessThan(result.farMinAmount);
  expect(result.farMinRespawn).toBeGreaterThan(result.nearMaxRespawn);
  expect(result.farGain).toBeLessThan(result.nearGain);
  expect(result.farGain).toBeGreaterThan(result.nearGain * 0.6);
  expect(result.recentLabel).toBe("直近採餌/分");
  expect(result.recentForaging).toBeCloseTo(result.nearGain, 5);
  expect(result.recentMetric).toBeCloseTo(result.nearGain, 1);
  expect(result.blockedNestLevel).toBe(2);
  expect(result.territoryAfterFarFood).toBeGreaterThanOrEqual(1);
  expect(result.nestLevelAfterTerritory).toBe(3);
  expect(result.activityAfterTerritory).toBeGreaterThan(result.activityBeforeTerritory);
  expect(result.visionAfterTerritory).toBeCloseTo(result.visionBeforeTerritory, 1);
  expect(result.activityEdgeVisibleAfterTerritory).toBe(false);
});

test("food sites span the map and unlock contested foraging as the colony grows", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const sites = sim.foodSpawnSites.map((site: any) => ({
      x: site.homeX,
      z: site.homeZ,
      amount: site.amount,
      distance: site.distanceFromNest,
      tier: site.distanceTier,
      rivalForage: Boolean(site.rivalForage),
    }));
    const initialWorker = sim.ants.find((ant: any) => ant.role === "worker" && ant.id % 6 === 0);
    const initialContestedTarget = sim.findContestedFoodForWorker(initialWorker);
    const central = sites.find((site: any) => site.x === 12 && site.z === 8);

    sim.colony.nestLevel = 7;
    sim.colony.territory = 16;
    sim.colony.antPopulation = 180;
    sim.colony.enemyThreat = 0;
    sim.computeDerived();
    sim.updateMapIntel();
    sim.syncAntPopulation();
    sim.spawnRivalNestWorkers();
    const matureWorker = sim.ants.find((ant: any) => ant.role === "worker" && ant.id % 6 === 0);
    matureWorker.setVariant?.("worker");
    matureWorker.isSortieSoldier = false;
    matureWorker.state = "explore";
    matureWorker.carrying = 0;
    const matureContestedTarget = sim.findContestedFoodForWorker(matureWorker);
    const quadrants = new Set(sites.map((site: any) => `${site.x >= 0 ? "east" : "west"}-${site.z >= 0 ? "north" : "south"}`));

    return {
      count: sites.length,
      totalAmount: sites.reduce((sum: number, site: any) => sum + site.amount, 0),
      near: sites.filter((site: any) => site.tier === "near"),
      mid: sites.filter((site: any) => site.tier === "mid"),
      far: sites.filter((site: any) => site.tier === "far"),
      rivalForageCount: sites.filter((site: any) => site.rivalForage).length,
      quadrants: [...quadrants],
      minWaterDistance: Math.min(...sites.map((site: any) => sim.waterDistanceAt(site.x, site.z, 1.2))),
      maxWorldDistance: Math.max(...sites.map((site: any) => Math.hypot(site.x, site.z))),
      initialContestedTargetId: initialContestedTarget?.id ?? null,
      matureContestedTargetId: matureContestedTarget?.id ?? null,
      centralFoodId: sim.food.find((food: any) => food.x === central.x && food.z === central.z)?.id ?? null,
      matureActivityRadius: sim.workerActivityRadius(),
      matureRivalForageRadius: sim.rivalWorkerForageRadius(),
      centralDistance: central.distance,
      centralRivalDistance: Math.hypot(central.x - sim.rivalNest.x, central.z - sim.rivalNest.z),
    };
  });

  expect(result.count).toBe(12);
  expect(result.totalAmount).toBe(188);
  expect(result.near).toHaveLength(4);
  expect(result.mid).toHaveLength(2);
  expect(result.far).toHaveLength(6);
  expect(result.rivalForageCount).toBe(4);
  expect(result.quadrants).toHaveLength(4);
  expect(result.minWaterDistance).toBeGreaterThanOrEqual(1);
  expect(result.maxWorldDistance).toBeLessThan(270);
  expect(result.initialContestedTargetId).toBeNull();
  expect(result.matureContestedTargetId).toBe(result.centralFoodId);
  expect(result.matureActivityRadius).toBeGreaterThan(result.centralDistance);
  expect(result.matureRivalForageRadius).toBeGreaterThan(result.centralRivalDistance);
});

test("mature worker colonies meet rival workers at shared forage without forced placement", async ({ page }) => {
  test.setTimeout(75_000);
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const originalRandom = Math.random;
    let randomState = 74023;
    Math.random = () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    try {
      sim.reset(true);
      sim.paused = true;
      sim.frameAccumulator = 0;
      sim.clearRaidRivals();
      sim.clearRivalNestDefenders();
      sim.colony.gameStatus = "playing";
      sim.colony.food = 1200;
      sim.colony.lifetimeFood = 5000;
      sim.colony.nestLevel = 7;
      sim.colony.territory = 16;
      sim.colony.antPopulation = 180;
      sim.colony.enemyThreat = 0;
      sim.computeDerived();
      sim.updateMapIntel();
      sim.syncAntPopulation();
      sim.spawnRivalNestWorkers();
      const raid = sim.ensureRaidState();
      raid.phase = "calm";
      raid.timer = 9999;

      for (const ant of sim.ants) {
        ant.setVariant?.("worker");
        ant.role = "worker";
        ant.isSortieSoldier = false;
        ant.sortieMode = "defense";
        ant.state = "explore";
        ant.inNest = false;
        ant.nestStayTimer = 0;
        ant.fleeTimer = 0;
        ant.stun = 0;
        ant.clashTimer = 0;
        ant.clashDuration = 0;
        ant.clashRival = null;
        ant.carrying = 0;
      }
      for (const rival of sim.rivalNestWorkers()) {
        rival.clash = null;
        rival.retreat = 0;
        rival.fightCooldown = 0;
        rival.workerTaskTimer = 0;
        rival.workerTargetFoodId = null;
      }

      let workerClashes = 0;
      let sharedWorkerFrames = 0;
      let firstContactSeconds: number | null = null;
      const seenClashes = new Set<number>();
      const stepDt = 1 / 60;
      for (let frame = 0; frame < 75 / stepDt; frame += 1) {
        sim.updateGame(stepDt);
        for (const ant of sim.ants) {
          if (ant.role === "worker" && sim.isRivalForageZone(ant.x, ant.z, 5)) sharedWorkerFrames += 1;
        }
        for (const rival of sim.rivalNestWorkers()) {
          const worker = rival.clash?.ants?.find((ant: any) => ant.role === "worker" && ant.variant === "worker");
          if (!worker || seenClashes.has(rival.id)) continue;
          seenClashes.add(rival.id);
          workerClashes += 1;
          if (firstContactSeconds == null) firstContactSeconds = frame * stepDt;
        }
      }
      return {
        workerClashes,
        sharedWorkerFrames,
        firstContactSeconds,
        matureActivityRadius: sim.workerActivityRadius(),
        matureRivalForageRadius: sim.rivalWorkerForageRadius(),
      };
    } finally {
      Math.random = originalRandom;
    }
  });

  expect(result.matureActivityRadius).toBeGreaterThan(230);
  expect(result.matureRivalForageRadius).toBeGreaterThan(230);
  expect(result.sharedWorkerFrames, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.workerClashes, JSON.stringify(result)).toBeGreaterThanOrEqual(1);
  expect(result.firstContactSeconds).not.toBeNull();
  expect(result.firstContactSeconds).toBeLessThan(75);
});

test("top stats omit territory display", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const statCardElements = [...document.querySelectorAll(".stats-strip div")] as HTMLElement[];
    const statCards = statCardElements.map((card) => ({
      label: card.querySelector("span")?.textContent?.trim() ?? "",
      valueId: card.querySelector("strong")?.id ?? "",
    }));
    const stripRect = (document.querySelector(".stats-strip") as HTMLElement).getBoundingClientRect();
    const lastCardRect = statCardElements[statCardElements.length - 1]?.getBoundingClientRect();
    const statTextOverflowCount = statCardElements.reduce((count, card) => {
      const cardRect = card.getBoundingClientRect();
      const overflows = [...card.querySelectorAll("span, strong")].some((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        return rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1;
      });
      return count + (overflows ? 1 : 0);
    }, 0);
    const titleRect = (document.querySelector(".title-block") as HTMLElement).getBoundingClientRect();
    const actionsRect = (document.querySelector(".quick-actions") as HTMLElement).getBoundingClientRect();
    return {
      statCards,
      statText: document.querySelector(".stats-strip")?.textContent ?? "",
      hasTerritoryStat: Boolean(document.querySelector("#statTerritory")),
      statTrailingGap: stripRect.right - (lastCardRect?.right ?? stripRect.right),
      statTextOverflowCount,
      titleLeft: titleRect.left,
      titleRight: titleRect.right,
      actionsLeft: actionsRect.left,
      actionsRight: actionsRect.right,
      viewportWidth: window.innerWidth,
    };
  });

  expect(result.statCards.map((card) => card.label)).toEqual(["食料", "アリ", "巣耐久", "直近採餌/分"]);
  expect(result.statCards.map((card) => card.valueId)).not.toContain("statTerritory");
  expect(result.statText).not.toContain("領土");
  expect(result.hasTerritoryStat).toBe(false);
  expect(result.statTrailingGap).toBeLessThanOrEqual(8);
  expect(result.statTextOverflowCount).toBe(0);
  expect(result.titleLeft).toBeGreaterThanOrEqual(0);
  expect(result.titleRight).toBeLessThanOrEqual(result.actionsLeft - 4);
  expect(result.actionsRight).toBeLessThanOrEqual(result.viewportWidth);
});

test("ants reveal current sight while remembered areas stay hazed", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearExplorationMask();
    sim.updateMapIntel();
    const radius = sim.mapVisionRadiusValue || sim.mapVisionRadius();
    const x = sim.nest.x + radius + 44;
    const z = sim.nest.z + 14;
    const beforeVisible = sim.isPointVisible(x, z, 0);
    const ant = sim.ants.find((candidate: any) => sim.shouldRenderAnt(candidate));
    const antSightRadius = sim.currentSightRadiusForAnt(ant);
    const edgeX = x + antSightRadius * 0.9;
    const edgeZ = z;
    const outsideCoreX = x + antSightRadius + 5;
    const outsideCoreZ = z;
    ant.inNest = false;
    ant.nestStayTimer = 0;
    ant.state = "explore";
    ant.x = x;
    ant.z = z;
    ant.prevX = x;
    ant.prevZ = z;
    sim.updateExploredPatches(0, true);
    sim.updateMapVisibility();
    const afterVisible = sim.isPointVisible(x, z, 0);
    const afterExplored = sim.isPointExplored(x, z, 0);
    const edgeExplored = sim.isPointExplored(edgeX, edgeZ, 0);
    const centerMaskValue = sim.explorationMaskValueAt(x, z);
    const edgeMaskValue = sim.explorationMaskValueAt(edgeX, edgeZ);
    const rememberedRival = { x, z, defeated: false, leftRaid: false, retreat: 0, clash: null, scoutMarkTimer: 0 };
    const rivalVisibleInCurrentSight = sim.shouldRenderRival(rememberedRival);
    ant.inNest = true;
    ant.nestStayTimer = 12;
    sim.updateMapVisibility();
    const rememberedVisible = sim.isPointVisible(x, z, 0);
    const rememberedExplored = sim.isPointExplored(x, z, 0);
    const outsideCoreExplored = sim.isPointExplored(outsideCoreX, outsideCoreZ, 0);
    const outsideCoreMaskValue = sim.explorationMaskValueAt(outsideCoreX, outsideCoreZ);
    const rivalVisibleInRememberedArea = sim.shouldRenderRival(rememberedRival);
    const firstRememberedPoint = { x, z };
    for (let index = 0; index < 120; index += 1) {
      const angle = (index / 120) * Math.PI * 2;
      const distance = index % 2 === 0 ? 180 : 238;
      sim.recordExploredPatch(Math.cos(angle) * distance, Math.sin(angle) * distance, 12);
    }
    const rememberedAfterManyDiscoveries = sim.isPointExplored(firstRememberedPoint.x, firstRememberedPoint.z, 0);
    return {
      x,
      z,
      beforeVisible,
      afterVisible,
      afterExplored,
      edgeExplored,
      centerMaskValue,
      edgeMaskValue,
      rememberedVisible,
      rememberedExplored,
      outsideCoreExplored,
      outsideCoreMaskValue,
      rememberedAfterManyDiscoveries,
      rivalVisibleInCurrentSight,
      rivalVisibleInRememberedArea,
      maskTextureBound: sim.fogOfWarMaterial.uniforms.exploredMask.value === sim.exploredMaskTexture,
      markedMaskCells: sim.exploredMaskData.reduce((count: number, value: number) => count + (value > 0 ? 1 : 0), 0),
      activeSightCount: sim.fogOfWarMaterial.uniforms.activeSightCount.value,
      rememberedAlpha: sim.fogOfWarMaterial.uniforms.rememberedAlpha.value,
    };
  });

  expect(result.beforeVisible).toBe(false);
  expect(result.afterVisible).toBe(true);
  expect(result.afterExplored).toBe(true);
  expect(result.edgeExplored).toBe(true);
  expect(result.centerMaskValue).toBeGreaterThan(0.95);
  expect(result.edgeMaskValue).toBeGreaterThan(0.8);
  expect(result.rememberedVisible).toBe(false);
  expect(result.rememberedExplored).toBe(true);
  expect(result.outsideCoreExplored).toBe(false);
  expect(result.outsideCoreMaskValue).toBeGreaterThan(0);
  expect(result.outsideCoreMaskValue).toBeLessThan(0.9);
  expect(result.rememberedAfterManyDiscoveries).toBe(true);
  expect(result.rivalVisibleInCurrentSight).toBe(true);
  expect(result.rivalVisibleInRememberedArea).toBe(false);
  expect(result.maskTextureBound).toBe(true);
  expect(result.markedMaskCells).toBeGreaterThan(0);
  expect(result.activeSightCount).toBeGreaterThanOrEqual(0);
  expect(result.rememberedAlpha).toBeLessThanOrEqual(0.36);
});

test("exploration memory records every visible surface ant", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearExplorationMask();
    const originalAnts = sim.ants;
    const target = { x: 52, z: -126 };
    sim.ants = Array.from({ length: 64 }, (_, index) => ({
      id: 9000 + index,
      variant: "worker",
      inNest: false,
      nestStayTimer: 0,
      x: index === 63 ? target.x : -54,
      z: index === 63 ? target.z : -52,
    }));
    sim.updateExploredPatches(0, true);
    const maskValue = sim.explorationMaskValueAt(target.x, target.z);
    const activeSightCount = sim.fogOfWarMaterial.uniforms.activeSightCount.value;
    const activeSightIncludesLastAnt = sim.fogOfWarMaterial.uniforms.activeSightPatches.value
      .slice(0, activeSightCount)
      .some((patch: any) => Math.hypot(patch.x - target.x, patch.y - target.z) < 0.01);
    sim.ants = originalAnts;
    sim.updateMapVisibility();
    return {
      maskValue,
      activeSightCount,
      activeSightIncludesLastAnt,
      visibleAfterRestore: sim.isPointVisible(target.x, target.z, 0),
      exploredAfterRestore: sim.isPointExplored(target.x, target.z, 0),
    };
  });

  expect(result.maskValue).toBeGreaterThan(0.95);
  expect(result.activeSightCount).toBe(64);
  expect(result.activeSightIncludesLastAnt).toBe(true);
  expect(result.visibleAfterRestore).toBe(false);
  expect(result.exploredAfterRestore).toBe(true);
});

test("remembered fog texture reveals terrain at the recorded world position", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearExplorationMask();
    for (const ant of sim.ants) {
      ant.inNest = true;
      ant.nestStayTimer = 12;
    }
    const remembered = { x: 34, z: 0 };
    const unexplored = { x: -34, z: 0 };
    sim.recordExploredPatch(remembered.x, remembered.z, 16);
    sim.updateMapVisibility();
    sim.cameraYaw = 0;
    sim.targetCameraYaw = 0;
    sim.cameraPitch = 1.2;
    sim.targetCameraPitch = 1.2;
    sim.cameraDistance = 220;
    sim.targetCameraDistance = 220;
    sim.setCameraTarget(0, 0, true);
    sim.updateCamera();
    sim.renderGame(1);

    const source = sim.renderer.domElement as HTMLCanvasElement;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = source.width;
    sampleCanvas.height = source.height;
    const context = sampleCanvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(source, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const Vector3 = sim.camera.position.constructor;
    const sampleWorld = (point: { x: number; z: number }) => {
      const projected = new Vector3(point.x, 0.42, point.z).project(sim.camera);
      const pixelX = Math.round(((projected.x + 1) * 0.5) * (sampleCanvas.width - 1));
      const pixelY = Math.round(((1 - projected.y) * 0.5) * (sampleCanvas.height - 1));
      const left = Math.max(0, pixelX - 2);
      const top = Math.max(0, pixelY - 2);
      const width = Math.min(5, sampleCanvas.width - left);
      const height = Math.min(5, sampleCanvas.height - top);
      const pixels = context.getImageData(left, top, width, height).data;
      let luminance = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        luminance += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
      }
      return {
        pixelX,
        pixelY,
        inside: projected.x >= -1 && projected.x <= 1 && projected.y >= -1 && projected.y <= 1,
        luminance: luminance / Math.max(1, pixels.length / 4),
      };
    };
    return {
      remembered: sampleWorld(remembered),
      unexplored: sampleWorld(unexplored),
      rememberedMask: sim.explorationMaskValueAt(remembered.x, remembered.z),
      unexploredMask: sim.explorationMaskValueAt(unexplored.x, unexplored.z),
    };
  });

  expect(result.remembered.inside).toBe(true);
  expect(result.unexplored.inside).toBe(true);
  expect(result.rememberedMask).toBeGreaterThan(0.95);
  expect(result.unexploredMask).toBe(0);
  expect(result.remembered.luminance).toBeGreaterThan(result.unexplored.luminance + 12);
});

test("worker activity range tugs ordinary foragers back without granting sight", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearExplorationMask();
    sim.manualMapVisionRadius = null;
    sim.colony.territory = 3;
    sim.colony.nestLevel = 1;
    sim.updateMapIntel();

    const activity = sim.workerActivityRadius();
    const vision = sim.currentNestVisionRadius();
    const x = sim.nest.x + activity + 26;
    const z = sim.nest.z;
    const beforeVisible = sim.isPointVisible(x, z, 0);
    const ant = sim.ants.find((candidate: any) => candidate.variant === "worker" && !candidate.isSortieSoldier);
    const saved = {
      x: ant.x,
      z: ant.z,
      prevX: ant.prevX,
      prevZ: ant.prevZ,
      role: ant.role,
      state: ant.state,
      energy: ant.energy,
      homeTimer: ant.homeTimer,
      carrying: ant.carrying,
      foodSourceId: ant.foodSourceId,
      inNest: ant.inNest,
      nestStayTimer: ant.nestStayTimer,
      wander: ant.wander,
      traits: { ...ant.traits },
    };
    ant.inNest = false;
    ant.nestStayTimer = 0;
    ant.role = "worker";
    ant.state = "explore";
    ant.energy = 1;
    ant.homeTimer = 0;
    ant.carrying = 0;
    ant.foodSourceId = null;
    ant.traits.curiosity = 0.2;
    ant.traits.persistence = 1;
    ant.wander = Math.PI * 0.5;
    ant.x = x;
    ant.z = z;
    ant.prevX = x;
    ant.prevZ = z;

    const steering = { x: 0, z: 0 };
    ant.updateExplore(1, sim, steering, ant.sense(sim));
    const homeDistance = Math.hypot(sim.nest.x - ant.x, sim.nest.z - ant.z) || 1;
    const homePull = steering.x * ((sim.nest.x - ant.x) / homeDistance) + steering.z * ((sim.nest.z - ant.z) / homeDistance);
    const homeTimerAfter = ant.homeTimer;
    ant.inNest = true;
    ant.nestStayTimer = 12;
    const afterVisible = sim.isPointVisible(x, z, 0);
    Object.assign(ant, saved);
    ant.traits = saved.traits;

    return {
      activity,
      vision,
      beforeVisible,
      afterVisible,
      homePull,
      homeTimerAfter,
    };
  });

  expect(result.activity).toBeGreaterThan(result.vision);
  expect(result.beforeVisible).toBe(false);
  expect(result.afterVisible).toBe(false);
  expect(result.homePull).toBeGreaterThan(0.25);
  expect(result.homeTimerAfter).toBeGreaterThan(0);
});

test("completed earthworks add live sight to the map fog", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearExplorationMask();
    for (const ant of sim.ants) {
      ant.inNest = true;
      ant.nestStayTimer = 12;
      ant.state = "explore";
      ant.x = sim.nest.x;
      ant.z = sim.nest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    sim.updateMapIntel();
    const baseRadius = sim.mapVisionRadiusValue || sim.mapVisionRadius();
    const activeSightBefore = sim.fogOfWarMaterial.uniforms.activeSightCount.value;
    const nextId = () => {
      sim.colony.nextEarthworkId = sim.colony.nextEarthworkId ?? 1;
      return sim.colony.nextEarthworkId++;
    };
    const addEarthwork = (kind: string, x: number, z: number, radius: number, progress: number, maxProgress = 1, rotation = 0) => {
      const earthwork = sim.addEarthwork({
        id: nextId(),
        kind,
        x,
        z,
        radius,
        progress,
        maxProgress,
        strength: progress / maxProgress,
        rotation,
        owner: "colony",
      });
      sim.updateEarthworks();
      sim.updateMapIntel();
      return earthwork;
    };

    const sentry = { x: sim.nest.x + baseRadius + 58, z: sim.nest.z };
    const sentryProbe = { x: sentry.x + 78, z: sentry.z };
    const sentryFood = sim.addFood(sentryProbe.x, sentryProbe.z, { amount: 6, radius: 3.2, crumbs: 3 });
    sim.updateMapVisibility();
    const sentryBefore = sim.isPointVisible(sentryProbe.x, sentryProbe.z, 0);
    const sentryFoodBefore = sentryFood.group.visible;
    const sentryEarthwork = addEarthwork("sentryMound", sentry.x, sentry.z, 8, 1);
    const sentryAfter = sim.isPointVisible(sentryProbe.x, sentryProbe.z, 0);
    const sentryFoodAfter = sentryFood.group.visible;

    const low = { x: sim.nest.x - baseRadius - 90, z: sim.nest.z - 20 };
    const lowProbe = { x: low.x - 28, z: low.z };
    const incompleteLow = addEarthwork("lowBarricade", low.x, low.z, 10, 0.6);
    const lowIncompleteVisible = sim.isPointVisible(lowProbe.x, lowProbe.z, 0);
    incompleteLow.progress = 1;
    incompleteLow.maxProgress = 1;
    sim.updateEarthworks();
    sim.updateMapIntel();
    const lowCompleteVisible = sim.isPointVisible(lowProbe.x, lowProbe.z, 0);

    const wallRadius = 14;
    const wallHalfLength = wallRadius * 1.16;
    const wall = { x: sim.nest.x + 20, z: sim.nest.z + baseRadius + 98 };
    const wallProbe = { x: wall.x + wallHalfLength, z: wall.z + 27 };
    const wallFarProbe = { x: wall.x + wallHalfLength, z: wall.z + 41 };
    const wallBefore = sim.isPointVisible(wallProbe.x, wallProbe.z, 0);
    const wallEarthwork = addEarthwork("earthWall", wall.x, wall.z, wallRadius, 1, 1, 0);
    const wallAfter = sim.isPointVisible(wallProbe.x, wallProbe.z, 0);
    const wallFarAfter = sim.isPointVisible(wallFarProbe.x, wallFarProbe.z, 0);

    const activeCount = sim.fogOfWarMaterial.uniforms.activeSightCount.value;
    const activePatches = sim.fogOfWarMaterial.uniforms.activeSightPatches.value.slice(0, activeCount).map((patch: any) => ({
      x: patch.x,
      z: patch.y,
      radius: patch.z,
    }));
    const sentryPatchVisible = activePatches.some((patch: any) =>
      Math.hypot(patch.x - sentry.x, patch.z - sentry.z) < 1 && patch.radius > 90,
    );
    const wallPatchVisible = activePatches.some((patch: any) =>
      Math.abs(patch.z - wall.z) < 1 && Math.abs(patch.x - wall.x) <= wallHalfLength + 1 && patch.radius > 28,
    );

    return {
      baseRadius,
      activeSightBefore,
      activeSightAfter: activeCount,
      sentryRadius: sim.buildingSightRadiusForEarthwork(sentryEarthwork),
      lowRadius: sim.buildingSightRadiusForEarthwork(incompleteLow),
      wallRadius: sim.buildingSightRadiusForEarthwork(wallEarthwork),
      sentryBefore,
      sentryAfter,
      sentryFoodBefore,
      sentryFoodAfter,
      lowIncompleteVisible,
      lowCompleteVisible,
      wallBefore,
      wallAfter,
      wallFarAfter,
      sentryPatchVisible,
      wallPatchVisible,
    };
  });

  expect(result.baseRadius).toBeGreaterThan(60);
  expect(result.sentryRadius).toBeGreaterThan(result.lowRadius);
  expect(result.sentryRadius).toBeGreaterThan(result.wallRadius);
  expect(result.sentryBefore).toBe(false);
  expect(result.sentryAfter).toBe(true);
  expect(result.sentryFoodBefore).toBe(false);
  expect(result.sentryFoodAfter).toBe(true);
  expect(result.lowIncompleteVisible).toBe(false);
  expect(result.lowCompleteVisible).toBe(true);
  expect(result.wallBefore).toBe(false);
  expect(result.wallAfter).toBe(true);
  expect(result.wallFarAfter).toBe(false);
  expect(result.activeSightAfter).toBeGreaterThan(result.activeSightBefore);
  expect(result.sentryPatchVisible).toBe(true);
  expect(result.wallPatchVisible).toBe(true);
});

test("enemy nest stays hidden until reconnaissance or vision reveal it", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.updateMapIntel();
    const initial = {
      vision: sim.mapVisionRadiusValue,
      distance: Math.hypot(sim.rivalNest.x - sim.nest.x, sim.rivalNest.z - sim.nest.z),
      known: sim.isRivalNestKnown(),
      visible: sim.rivalNest.group?.visible ?? false,
      raidIntel: sim.hasRaidDirectionIntel(),
    };

    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 3,
      approachAngle: sim.raidApproachAngle(),
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: sim.colony.fallenAnts,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const rivals = sim.raidRivals();
    const hiddenRaid = {
      phase: sim.colony.raidState.phase,
      rivalCount: rivals.length,
      spawnDistances: rivals.map((rival: any) => Math.hypot(rival.x - sim.rivalNest.x, rival.z - sim.rivalNest.z)),
      renderedRivals: rivals.filter((rival: any) => sim.shouldRenderRival(rival)).length,
    };

    sim.clearRaidRivals();
    sim.colony.raidState = {
      phase: "calm",
      timer: 30,
      wave: 1,
      activeCount: 0,
      approachAngle: sim.raidApproachAngle(),
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: null,
      lastOutcome: "none",
    };
    sim.colony.antPopulation = 28;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 3;
    sim.colony.scoutAnts = 1;
    sim.colony.territory = 4;
    sim.colony.upgrades.scoutBrood = 1;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateMapIntel();
    sim.setActiveTab("soldiers");
    sim.updateStats();
    const afterScoutOwnership = {
      known: sim.isRivalNestKnown(),
      visible: sim.rivalNest.group?.visible ?? false,
      raidIntel: sim.hasRaidDirectionIntel(),
      activity: sim.workerActivityRadius(),
      vision: sim.currentNestVisionRadius(),
      target: sim.currentSortieTarget(),
      reconReady: sim.canStartReconSortie(),
      reconButtonDisabled: (document.querySelector("#reconSortieBtn") as HTMLButtonElement).disabled,
    };

    sim.soldierSortieCooldown = 0;
    sim.updateStats();
    const reconStarted = sim.startReconSortie();
    const reconScouts = sim.reconScouts();
    const scout = reconScouts[0];
    const firstTarget = scout ? sim.reconSearchTargetForAnt(scout) : null;
    const firstTargetDistance = firstTarget
      ? Math.hypot(firstTarget.x - sim.nest.x, firstTarget.z - sim.nest.z)
      : 0;
    const knownAfterLaunch = sim.isRivalNestKnown();
    const sightRadius = scout ? sim.currentSightRadiusForAnt(scout) : 0;
    if (scout) {
      scout.x = sim.rivalNest.x - sightRadius * 0.45;
      scout.z = sim.rivalNest.z;
      scout.prevX = scout.x;
      scout.prevZ = scout.z;
      scout.setState("explore");
    }
    sim.updateExploredPatches(0, true);
    sim.updateMapIntel();
    const afterRecon = {
      reconStarted,
      reconCount: reconScouts.length,
      reconModes: reconScouts.map((ant: any) => ant.sortieMode),
      reconVariants: reconScouts.map((ant: any) => ant.variant),
      firstTarget,
      firstTargetDistance,
      knownAfterLaunch,
      known: sim.isRivalNestKnown(),
      visible: sim.rivalNest.group?.visible ?? false,
      raidIntel: sim.hasRaidDirectionIntel(),
      target: sim.currentSortieTarget(),
      notice: sim.raidNotice.message,
      log: sim.colony.battleLog.join("\n"),
    };

    return { initial, hiddenRaid, afterScoutOwnership, afterRecon };
  });

  expect(result.initial.distance).toBeGreaterThan(result.initial.vision);
  expect(result.initial.known).toBe(false);
  expect(result.initial.visible).toBe(false);
  expect(result.initial.raidIntel).toBe(false);
  expect(result.hiddenRaid.phase).toBe("active");
  expect(result.hiddenRaid.rivalCount).toBe(3);
  expect(Math.max(...result.hiddenRaid.spawnDistances)).toBeLessThan(26);
  expect(result.hiddenRaid.renderedRivals).toBe(0);
  expect(result.afterScoutOwnership.known).toBe(false);
  expect(result.afterScoutOwnership.visible).toBe(false);
  expect(result.afterScoutOwnership.raidIntel).toBe(true);
  expect(result.afterScoutOwnership.activity).toBeGreaterThan(result.afterScoutOwnership.vision);
  expect(result.afterScoutOwnership.target).toBeNull();
  expect(result.afterScoutOwnership.reconReady).toBe(true);
  expect(result.afterScoutOwnership.reconButtonDisabled).toBe(false);
  expect(result.afterRecon.reconStarted).toBe(true);
  expect(result.afterRecon.reconCount).toBe(1);
  expect(result.afterRecon.reconModes).toEqual(["recon"]);
  expect(result.afterRecon.reconVariants).toEqual(["scout"]);
  expect(result.afterRecon.firstTarget?.kind).toBe("recon-search");
  expect(result.afterRecon.firstTargetDistance).toBeGreaterThan(result.initial.vision);
  expect(result.afterRecon.firstTargetDistance).toBeGreaterThan(result.afterScoutOwnership.activity);
  expect(result.afterRecon.knownAfterLaunch).toBe(false);
  expect(result.afterRecon.known).toBe(true);
  expect(result.afterRecon.visible).toBe(true);
  expect(result.afterRecon.raidIntel).toBe(true);
  expect(result.afterRecon.target?.kind).toBe("rival-nest");
  expect(result.afterRecon.notice).toContain("敵巣発見");
  expect(result.afterRecon.log).toContain("敵巣");
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
      approachAngle: sim.raidApproachAngle(),
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
    const wheelPoint = await canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const candidates = [
        [rect.left + rect.width * 0.35, rect.top + rect.height * 0.35],
        [rect.left + rect.width * 0.25, rect.top + rect.height * 0.5],
        [rect.left + rect.width * 0.5, rect.top + rect.height * 0.2],
        [rect.left + rect.width * 0.08, rect.top + rect.height * 0.5],
      ];
      for (const [x, y] of candidates) {
        if (document.elementFromPoint(x, y) === node) return { x, y };
      }
      return null;
    });
    if (!wheelPoint) throw new Error("world canvas had no unobstructed wheel test point");
    await page.mouse.move(wheelPoint.x, wheelPoint.y);
    await page.mouse.wheel(0, -360);
    wheel.zoomIn = await page.evaluate(() => (window.__ANT_SIM as any).targetCameraDistance);
    await page.mouse.wheel(0, 720);
    wheel.zoomOut = await page.evaluate(() => (window.__ANT_SIM as any).targetCameraDistance);
  }

  const pinch = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const canvas = document.querySelector("#world3d canvas") as HTMLCanvasElement;
    const ant = sim.ants.find((item: any) => item.variant !== "builder") ?? sim.ants[0];
    sim.selectedAnt = null;
    sim.pointerMap.clear();
    sim.pointerStart = null;
    sim.activePointerId = null;
    sim.pinchStart = null;
    sim.pinchLastCenter = null;
    sim.multiPointerGesture = false;
    sim.dragMoved = false;
    sim.targetCameraDistance = 240;
    sim.cameraDistance = 240;
    sim.updateCamera();
    const pointUnderLastTouch = sim.screenToGround(190, 180);
    if (pointUnderLastTouch && ant) {
      ant.x = pointUnderLastTouch.x;
      ant.z = pointUnderLastTouch.z;
      ant.inNest = false;
      ant.nestStayTimer = 0;
    }
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

    const pinchBefore = sim.targetCameraDistance;
    dispatchPointer("pointerdown", 4101, 160, 180);
    dispatchPointer("pointerdown", 4102, 200, 180);
    dispatchPointer("pointermove", 4101, 140, 180);
    dispatchPointer("pointermove", 4102, 220, 180);
    const pinchSpread = sim.targetCameraDistance;
    dispatchPointer("pointermove", 4101, 170, 180);
    dispatchPointer("pointermove", 4102, 190, 180);
    const pinchClose = sim.targetCameraDistance;
    dispatchPointer("pointerup", 4101, 170, 180);
    dispatchPointer("pointerup", 4102, 190, 180);

    return {
      before: pinchBefore,
      spread: pinchSpread,
      close: pinchClose,
      selectedAfterPinch: Boolean(sim.selectedAnt),
      pointerMapSize: sim.pointerMap.size,
      multiPointerGesture: sim.multiPointerGesture,
    };
  });

  if ((viewport?.width ?? 0) >= 600) {
    expect(wheel.zoomIn).toBeDefined();
    expect(wheel.zoomOut).toBeDefined();
    expect(wheel.zoomIn!).toBeLessThan(wheel.before);
    expect(wheel.zoomOut!).toBeGreaterThan(wheel.zoomIn!);
  }
  expect(pinch.spread).toBeLessThan(pinch.before);
  expect(pinch.close).toBeGreaterThan(pinch.before);
  expect(pinch.selectedAfterPinch).toBe(false);
  expect(pinch.pointerMapSize).toBe(0);
  expect(pinch.multiPointerGesture).toBe(false);
});

test("touch tap on the world canvas tolerates small finger drift", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const canvas = document.querySelector("#world3d canvas") as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const startX = rect.left + rect.width * 0.48;
    const startY = rect.top + rect.height * 0.36;
    const point = sim.screenToGround(startX, startY);
    const ant = sim.ants.find((item: any) => item.variant !== "builder") ?? sim.ants[0];
    if (!point || !ant) return { selected: false, pointerMapSize: sim.pointerMap.size, reason: "setup" };

    ant.x = point.x;
    ant.z = point.z;
    ant.inNest = false;
    ant.nestStayTimer = 0;
    sim.selectedAnt = null;
    sim.pointerMap.clear();
    sim.pointerStart = null;
    sim.activePointerId = null;
    sim.pinchStart = null;
    sim.pinchLastCenter = null;
    sim.multiPointerGesture = false;
    sim.dragMoved = false;

    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        pointerId: 5101,
        pointerType: "touch",
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      }));
    };

    dispatchPointer("pointerdown", startX, startY);
    dispatchPointer("pointermove", startX + 8, startY + 2);
    dispatchPointer("pointerup", startX + 8, startY + 2);

    return {
      selected: sim.selectedAnt === ant,
      pointerMapSize: sim.pointerMap.size,
      multiPointerGesture: sim.multiPointerGesture,
    };
  });

  expect(result.selected).toBe(true);
  expect(result.pointerMapSize).toBe(0);
  expect(result.multiPointerGesture).toBe(false);
});

test("mobile DOM buttons activate once after small touch drift", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "mobile touch cancellation path");
  await waitForSimulation(page);

  await page.evaluate(() => {
    (window as any).__pauseButtonClicks = 0;
    (window as any).__soldiersTabClicks = 0;
    const button = document.querySelector("#pauseBtn") as HTMLButtonElement;
    button.addEventListener("click", () => {
      (window as any).__pauseButtonClicks += 1;
    });
    const soldiersTab = document.querySelector('[data-tab="soldiers"]') as HTMLButtonElement;
    soldiersTab.addEventListener("click", () => {
      (window as any).__soldiersTabClicks += 1;
    });
  });
  const client = await page.context().newCDPSession(page);
  const dispatchTouchAt = async (
    x: number,
    y: number,
    dy: number,
    endType: "touchEnd" | "touchCancel" = "touchEnd",
    holdMs = 0,
  ) => {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, radiusX: 5, radiusY: 5, id: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + dy, radiusX: 5, radiusY: 5, id: 1 }],
    });
    if (holdMs > 0) await page.waitForTimeout(holdMs);
    await client.send("Input.dispatchTouchEvent", { type: endType, touchPoints: [] });
  };
  const touchButton = async (
    selector: string,
    dy: number,
    endType: "touchEnd" | "touchCancel" = "touchEnd",
    holdMs = 0,
  ) => {
    const box = await page.evaluate((targetSelector) => {
      const button = document.querySelector(targetSelector) as HTMLButtonElement | null;
      if (!button) return null;
      button.scrollIntoView({ block: "center", inline: "center" });
      const rect = button.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, selector);
    if (!box) throw new Error(`${selector} is not visible`);
    await dispatchTouchAt(box.x + box.width / 2, box.y + box.height / 2, dy, endType, holdMs);
  };

  await touchButton("#pauseBtn", 0);
  await expect.poll(() => page.evaluate(() => (window as any).__pauseButtonClicks)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window.__ANT_SIM as any).paused)).toBe(true);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const button = document.querySelector("#pauseBtn") as HTMLButtonElement;
    sim.paused = false;
    button.classList.remove("is-paused");
    (window as any).__pauseButtonClicks = 0;
  });

  await touchButton("#pauseBtn", 16);
  await expect.poll(() => page.evaluate(() => (window as any).__pauseButtonClicks)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window.__ANT_SIM as any).paused)).toBe(true);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const button = document.querySelector("#pauseBtn") as HTMLButtonElement;
    sim.paused = false;
    button.classList.remove("is-paused");
    (window as any).__pauseButtonClicks = 0;
  });
  await touchButton("#pauseBtn", 56);
  await page.waitForTimeout(260);
  expect(await page.evaluate(() => (window as any).__pauseButtonClicks)).toBe(0);
  expect(await page.evaluate(() => (window.__ANT_SIM as any).paused)).toBe(false);

  await touchButton("#pauseBtn", 16, "touchCancel");
  await expect.poll(() => page.evaluate(() => (window as any).__pauseButtonClicks)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window.__ANT_SIM as any).paused)).toBe(true);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.barracksQueue = [];
    sim.colony.food = 1000;
    sim.colony.antPopulation = 20;
    sim.paused = false;
    sim.setPanelHidden(false, false);
    sim.setPanelCompact(false, false);
    sim.setActiveTab("barracks");
    sim.updateStats();
  });
  await expect(page.locator('[data-train-variant="worker"]')).toBeEnabled();
  await touchButton('[data-train-variant="worker"]', 8, "touchCancel", 320);
  await expect.poll(() => page.evaluate(() => (window.__ANT_SIM as any).colony.barracksQueue.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window.__ANT_SIM as any).colony.barracksQueue[0]?.variant)).toBe("worker");
  await page.waitForTimeout(320);
  expect(await page.evaluate(() => (window.__ANT_SIM as any).colony.barracksQueue.length)).toBe(1);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.setPanelCompact(true, false);
    sim.setActiveTab("growth");
    (window as any).__soldiersTabClicks = 0;
  });
  await touchButton('[data-tab="soldiers"]', 16);
  await expect.poll(() => page.evaluate(() => (window as any).__soldiersTabClicks)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window.__ANT_SIM as any).activeTab)).toBe("soldiers");
  await expect.poll(() => page.evaluate(() => (window.__ANT_SIM as any).panelCompact)).toBe(false);
});

test("empire panel keeps the same frame across management tabs on desktop", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(async () => {
    const viewportWidth = window.innerWidth;
    if (viewportWidth < 820) return { skipped: true, viewportWidth, sizes: [] };
    const sim = window.__ANT_SIM as any;
    const panel = document.querySelector("#empirePanel") as HTMLElement;
    const settle = () => new Promise((resolve) => window.setTimeout(resolve, 220));
    sim.setPanelHidden(false, false);
    sim.setPanelCompact(false, false);
    await settle();

    const tabs = ["growth", "construction", "barracks", "soldiers"];
    const sizes = [];
    for (const tab of tabs) {
      sim.setActiveTab(tab);
      await settle();
      const rect = panel.getBoundingClientRect();
      sizes.push({ tab, width: Math.round(rect.width), height: Math.round(rect.height) });
    }
    const widths = sizes.map((item) => item.width);
    const heights = sizes.map((item) => item.height);
    return {
      skipped: false,
      viewportWidth,
      sizes,
      widthDelta: Math.max(...widths) - Math.min(...widths),
      heightDelta: Math.max(...heights) - Math.min(...heights),
    };
  });

  if (result.skipped) return;
  expect(result.widthDelta, JSON.stringify(result.sizes)).toBeLessThanOrEqual(1);
  expect(result.heightDelta, JSON.stringify(result.sizes)).toBeLessThanOrEqual(1);
});

test("camera target pans away from the home nest and can return home", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const canvas = document.querySelector("#world3d canvas") as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    sim.cameraTarget.set(sim.nest.x, 0, sim.nest.z);
    sim.cameraRenderTarget.copy(sim.cameraTarget);
    sim.targetCameraYaw = -0.62;
    sim.cameraYaw = -0.62;
    const before = { x: sim.cameraTarget.x, z: sim.cameraTarget.z, yaw: sim.targetCameraYaw };
    const startX = rect.left + rect.width * 0.54;
    const startY = rect.top + rect.height * 0.44;
    const endX = startX + 84;
    const endY = startY + 42;
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 6011,
      pointerType: "mouse",
      button: 2,
      buttons: 2,
      clientX: startX,
      clientY: startY,
      bubbles: true,
      cancelable: true,
    }));
    canvas.dispatchEvent(new PointerEvent("pointermove", {
      pointerId: 6011,
      pointerType: "mouse",
      button: 2,
      buttons: 2,
      clientX: endX,
      clientY: endY,
      bubbles: true,
      cancelable: true,
    }));
    canvas.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 6011,
      pointerType: "mouse",
      button: 2,
      buttons: 0,
      clientX: endX,
      clientY: endY,
      bubbles: true,
      cancelable: true,
    }));
    const afterDrag = {
      x: sim.cameraTarget.x,
      z: sim.cameraTarget.z,
      yaw: sim.targetCameraYaw,
      distanceFromHome: Math.hypot(sim.cameraTarget.x - sim.nest.x, sim.cameraTarget.z - sim.nest.z),
    };
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", bubbles: true, cancelable: true }));
    sim.updateCameraKeyboardPan(0.5);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", bubbles: true, cancelable: true }));
    const afterKey = {
      x: sim.cameraTarget.x,
      z: sim.cameraTarget.z,
      distanceFromDrag: Math.hypot(sim.cameraTarget.x - afterDrag.x, sim.cameraTarget.z - afterDrag.z),
    };
    sim.focusCameraOnNest();
    const afterHome = {
      x: sim.cameraTarget.x,
      z: sim.cameraTarget.z,
      distanceFromHome: Math.hypot(sim.cameraTarget.x - sim.nest.x, sim.cameraTarget.z - sim.nest.z),
    };
    return { before, afterDrag, afterKey, afterHome };
  });

  expect(result.afterDrag.distanceFromHome).toBeGreaterThan(2);
  expect(result.afterDrag.yaw).toBeCloseTo(result.before.yaw, 5);
  expect(result.afterKey.distanceFromDrag).toBeGreaterThan(2);
  expect(result.afterHome.distanceFromHome).toBeLessThan(0.001);
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
  expect(result.compactTabsDisplay).not.toBe("none");
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

test("military tab deploys nest soldiers on player command", async ({ page }) => {
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
      expeditionButton: (document.querySelector("#expeditionSortieBtn") as HTMLButtonElement).textContent,
      expeditionDisabled: (document.querySelector("#expeditionSortieBtn") as HTMLButtonElement).disabled,
      tabText: document.querySelector(".panel-tabs")?.textContent ?? "",
      soldierPanelText: document.querySelector("#soldierTab")?.textContent ?? "",
    };
    const started = sim.startSoldierSortie("defense");
    const firstWave = sim.deployedSoldiers();
    sim.soldierSortieCooldown = 0;
    sim.updateStats();
    const plannedAfterFirstCooldown = sim.plannedSortieCount();
    const secondStarted = sim.startSoldierSortie("defense");
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
      deployedModes: deployed.map((ant: any) => ant.sortieMode),
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
  expect(result.before.button).toContain("防衛出動 4");
  expect(result.before.expeditionButton).toContain("遠征出動 4");
  expect(result.before.expeditionDisabled).toBe(true);
  expect(result.before.tabText).toContain("軍事");
  expect(result.before.soldierPanelText).toContain("遠征出動");
  expect(result.started).toBe(true);
  expect(result.firstWaveCount).toBe(4);
  expect(result.plannedAfterFirstCooldown).toBe(3);
  expect(result.secondStarted).toBe(true);
  expect(result.deployedCount).toBe(7);
  expect(result.deployedRoles.every((role: string) => role === "guard")).toBe(true);
  expect(result.deployedModes.every((mode: string) => mode === "defense")).toBe(true);
  expect(Math.max(...result.spawnDistances)).toBeLessThan(14);
  expect(result.afterRetire).toBe(0);
  expect(result.statusText).toContain("再準備");
  expect(result.logText).toContain("兵隊出撃");
});

test("military default sortie composition balances current soldier variants", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 50;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 14;
    sim.colony.heavySoldierAnts = 2;
    sim.colony.shieldHeadAnts = 2;
    sim.colony.acidShooterAnts = 2;
    sim.colony.scoutAnts = 2;
    sim.colony.medicAnts = 2;
    sim.colony.captainAnts = 2;
    sim.colony.upgrades.soldierTraining = 2;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.shieldHeadBrood = 1;
    sim.colony.upgrades.acidShooterBrood = 1;
    sim.colony.upgrades.scoutBrood = 1;
    sim.colony.upgrades.medicBrood = 1;
    sim.colony.upgrades.captainBrood = 1;
    sim.manualSortiePlan = null;
    sim.soldierSortieCooldown = 0;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.setActiveTab("soldiers");
    sim.updateStats();

    const planned = sim.plannedSortieComposition();
    const started = sim.startSoldierSortie("defense");
    const deployedCounts = sim.deployedSoldiers().reduce((memo: Record<string, number>, ant: any) => {
      memo[ant.variant] = (memo[ant.variant] ?? 0) + 1;
      return memo;
    }, {});

    return {
      planned,
      started,
      deployedCounts,
      plannedText: document.querySelector("#sortiePlanTotal")?.textContent ?? "",
    };
  });

  expect(result.planned).toMatchObject({
    heavy: 1,
    shield: 1,
    captain: 1,
    acid: 1,
    scout: 1,
    medic: 1,
    normal: 1,
    total: 7,
  });
  expect(result.plannedText).toContain("7 / 7");
  expect(result.started).toBe(true);
  expect(result.deployedCounts).toMatchObject({
    heavySoldier: 1,
    shieldHead: 1,
    captain: 1,
    acidShooter: 1,
    scout: 1,
    medic: 1,
    soldier: 1,
  });
});

test("expedition sortie targets a discovered enemy nest instead of defense patrol", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.raidState = {
      phase: "calm",
      timer: 60,
      wave: 1,
      activeCount: 0,
      approachAngle: sim.raidApproachAngle(),
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: null,
      lastOutcome: "none",
    };
    sim.colony.food = 1000;
    sim.colony.antPopulation = 36;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.rivalNest.discovered = true;
    sim.rivalNest.defeated = false;
    sim.rivalNest.integrity = 0.82;
    sim.soldierSortieCooldown = 0;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateMapIntel();
    sim.setActiveTab("soldiers");
    sim.updateStats();
    const defenseTarget = sim.currentSortieTarget(sim.nest.x, sim.nest.z, "defense");
    const expeditionTarget = sim.currentSortieTarget(sim.nest.x, sim.nest.z, "expedition");
    const before = {
      planned: sim.plannedSortieCount(),
      expeditionDisabled: (document.querySelector("#expeditionSortieBtn") as HTMLButtonElement).disabled,
      expeditionText: (document.querySelector("#expeditionSortieBtn") as HTMLButtonElement).textContent,
      defenseTarget,
      expeditionTarget,
    };
    const started = sim.startSoldierSortie("expedition");
    const deployed = sim.deployedSoldiers();
    return {
      before,
      started,
      modes: deployed.map((ant: any) => ant.sortieMode),
      targetKinds: deployed.map((ant: any) => Math.hypot((ant.sortieTargetX ?? 0) - sim.rivalNest.x, (ant.sortieTargetZ ?? 0) - sim.rivalNest.z)),
      log: sim.colony.battleLog.join("\n"),
    };
  });

  expect(result.before.planned).toBe(3);
  expect(result.before.expeditionDisabled).toBe(false);
  expect(result.before.expeditionText).toContain("遠征出動 3");
  expect(result.before.defenseTarget).toBeNull();
  expect(result.before.expeditionTarget?.kind).toBe("rival-nest");
  expect(result.started).toBe(true);
  expect(result.modes.every((mode: string) => mode === "expedition")).toBe(true);
  expect(Math.max(...result.targetKinds)).toBeLessThan(0.001);
  expect(result.log).toContain("敵巣へ遠征");
});

test("enemy nest sends dedicated defenders and grapples stop nest damage", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.clearRivalNestDefenders();
    sim.colony.gameStatus = "playing";
    sim.colony.food = 1000;
    sim.colony.antPopulation = 36;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.rivalNest.discovered = true;
    sim.rivalNest.defeated = false;
    sim.rivalNest.integrity = 0.8;
    sim.rivalNest.defenseWaveArmed = true;
    sim.rivalNest.defenseClearTimer = 0;
    sim.soldierSortieCooldown = 0;
    sim.computeDerived();
    sim.syncAntPopulation();
    const started = sim.startSoldierSortie("expedition");
    const attackers = sim.deployedSoldiers();
    attackers.forEach((ant: any, index: number) => {
      ant.setVariant?.("soldier");
      ant.role = "guard";
      ant.sortieMode = "expedition";
      ant.state = "explore";
      ant.inNest = false;
      ant.nestStayTimer = 0;
      ant.stun = 0;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashRival = null;
      ant.x = sim.rivalNest.x - 34 - index * 4;
      ant.z = sim.rivalNest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    });

    const targetCount = sim.rivalNestDefenderTargetCount(attackers);
    sim.ensureRaidState().phase = "warning";
    sim.raidNotice.message = "敵襲警告を維持";
    sim.raidNotice.timer = 5;
    sim.updateRivalNestDefense(0.1);
    const raidNoticeAfterDefense = sim.raidNotice.message;
    sim.ensureRaidState().phase = "calm";
    const defenders = sim.rivalNestDefenders();
    const firstWaveCount = defenders.length;
    sim.updateRivalNestDefense(0.1);
    const repeatedCount = sim.rivalNestDefenders().length;
    const firstDefenseTarget = defenders[0].findRivalNestDefenseTarget(sim);
    firstDefenseTarget.state = "clash";
    firstDefenseTarget.clashRival = defenders[0];
    const secondDefenseTarget = defenders[1].findRivalNestDefenseTarget(sim);
    firstDefenseTarget.state = "explore";
    firstDefenseTarget.clashRival = null;

    const attacker = attackers[0];
    const partner = attackers[1];
    const defender = defenders[0];
    for (const ant of attackers.slice(2)) {
      ant.x = sim.rivalNest.x - 80;
      ant.z = sim.rivalNest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    attacker.x = sim.rivalNest.x;
    attacker.z = sim.rivalNest.z;
    attacker.prevX = attacker.x;
    attacker.prevZ = attacker.z;
    partner.x = sim.rivalNest.x - 0.7;
    partner.z = sim.rivalNest.z + 0.4;
    partner.prevX = partner.x;
    partner.prevZ = partner.z;
    defender.x = sim.rivalNest.x + 0.45;
    defender.z = sim.rivalNest.z;
    defender.prevX = defender.x;
    defender.prevZ = defender.z;
    defender.retreat = 0;
    defender.clash = null;
    defender.fightCooldown = 0;
    defender.defeated = false;
    defender.leftRaid = false;
    const contactStarted = defender.resolveAntContacts(sim);
    const firstPairGrapplers = defender.clash?.ants?.length ?? 0;
    const integrityBefore = sim.rivalNest.integrity;
    sim.updateRivalNestAssault(0.5);
    const attackerStateDuringContact = attacker.state;
    if (defender.clash) {
      defender.clash.elapsed = defender.clash.duration;
      defender.finishClash(sim);
    }
    const defenderSurvivedFirstPairClash = sim.rivalAnts.includes(defender);
    const defenderDamageAfterFirstPairClash = defender.combatDamage;
    defender.x = sim.rivalNest.x + 0.45;
    defender.z = sim.rivalNest.z;
    defender.prevX = defender.x;
    defender.prevZ = defender.z;
    defender.retreat = 0;
    defender.clash = null;
    defender.fightCooldown = 0;
    for (const [index, ant] of [attacker, partner].entries()) {
      ant.state = "explore";
      ant.fleeTimer = 0;
      ant.stun = 0;
      ant.clashRival = null;
      ant.clashTimer = 0;
      ant.x = sim.rivalNest.x - index * 0.7;
      ant.z = sim.rivalNest.z + index * 0.4;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    const secondPairClashStarted = defenderSurvivedFirstPairClash && defender.startClash(attacker, sim.rivalNest.x + 0.2, sim.rivalNest.z, sim);
    const secondPairGrapplers = defender.clash?.ants?.length ?? 0;
    if (defender.clash) {
      defender.clash.elapsed = defender.clash.duration;
      defender.finishClash(sim);
    }
    const defenderSurvivedSecondPairClash = sim.rivalAnts.includes(defender);
    const defenderDamageAfterSecondPairClash = defender.combatDamage;
    defender.x = sim.rivalNest.x + 0.45;
    defender.z = sim.rivalNest.z;
    defender.prevX = defender.x;
    defender.prevZ = defender.z;
    defender.retreat = 0;
    defender.clash = null;
    defender.fightCooldown = 0;
    for (const [index, ant] of [attacker, partner].entries()) {
      ant.state = "explore";
      ant.fleeTimer = 0;
      ant.stun = 0;
      ant.clashRival = null;
      ant.clashTimer = 0;
      ant.x = sim.rivalNest.x - index * 0.7;
      ant.z = sim.rivalNest.z + index * 0.4;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    const thirdPairClashStarted = defenderSurvivedSecondPairClash && defender.startClash(attacker, sim.rivalNest.x + 0.2, sim.rivalNest.z, sim);
    const thirdPairGrapplers = defender.clash?.ants?.length ?? 0;
    if (defender.clash) {
      defender.clash.elapsed = defender.clash.duration;
      defender.finishClash(sim);
    }
    const defenderDefeatedAfterThirdPairClash = !sim.rivalAnts.includes(defender);
    for (const ant of attackers) ant.state = "flee";
    sim.updateRivalNestDefense(6.1);
    const defendersDuringFlee = sim.rivalNestDefenders().length;
    const defenseWaveArmedDuringFlee = sim.rivalNest.defenseWaveArmed;
    for (const ant of attackers) {
      ant.state = "return";
    }
    sim.updateRivalNestDefense(6.1);

    return {
      started,
      attackerCount: attackers.length,
      targetCount,
      raidNoticeAfterDefense,
      firstWaveCount,
      repeatedCount,
      defenseTargetsDistributed: firstDefenseTarget?.id !== secondDefenseTarget?.id,
      defenderKinds: defenders.map((rival: any) => ({
        nestDefender: rival.isRivalNestDefender,
        raid: rival.isRaidRival,
        worker: rival.isRivalWorker,
        variant: rival.variant,
      })),
      maxSpawnDistance: Math.max(...defenders.map((rival: any) => Math.hypot(rival.x - sim.rivalNest.x, rival.z - sim.rivalNest.z))),
      contactStarted,
      firstPairGrapplers,
      attackerState: attackerStateDuringContact,
      integrityBefore,
      integrityAfter: sim.rivalNest.integrity,
      defenderSurvivedFirstPairClash,
      defenderDamageAfterFirstPairClash,
      secondPairClashStarted,
      secondPairGrapplers,
      defenderSurvivedSecondPairClash,
      defenderDamageAfterSecondPairClash,
      thirdPairClashStarted,
      thirdPairGrapplers,
      defenderDefeatedAfterThirdPairClash,
      defendersDuringFlee,
      defenseWaveArmedDuringFlee,
      defendersAfterReturn: sim.rivalNestDefenders().length,
      defenseWaveRearmed: sim.rivalNest.defenseWaveArmed,
      attackerClashCleared: attacker.clashRival == null && attacker.clashTimer === 0,
      log: sim.colony.battleLog.join("\n"),
    };
  });

  expect(result.started).toBe(true);
  expect(result.attackerCount).toBe(3);
  expect(result.targetCount).toBe(2);
  expect(result.raidNoticeAfterDefense).toBe("敵襲警告を維持");
  expect(result.firstWaveCount).toBe(result.targetCount);
  expect(result.repeatedCount).toBe(result.firstWaveCount);
  expect(result.defenseTargetsDistributed).toBe(true);
  expect(result.defenderKinds.every((rival: any) => rival.nestDefender && !rival.raid && !rival.worker && rival.variant === "soldier")).toBe(true);
  expect(result.maxSpawnDistance).toBeLessThan(18);
  expect(result.contactStarted).toBe(true);
  expect(result.firstPairGrapplers).toBe(2);
  expect(result.attackerState).toBe("clash");
  expect(result.integrityAfter).toBeCloseTo(result.integrityBefore, 6);
  expect(result.defenderSurvivedFirstPairClash).toBe(true);
  expect(result.defenderDamageAfterFirstPairClash).toBeGreaterThan(0.4);
  expect(result.defenderDamageAfterFirstPairClash).toBeLessThan(0.55);
  expect(result.secondPairClashStarted).toBe(true);
  expect(result.secondPairGrapplers).toBe(2);
  expect(result.defenderSurvivedSecondPairClash).toBe(true);
  expect(result.defenderDamageAfterSecondPairClash).toBeGreaterThan(0.8);
  expect(result.defenderDamageAfterSecondPairClash).toBeLessThan(1);
  expect(result.thirdPairClashStarted).toBe(true);
  expect(result.thirdPairGrapplers).toBe(2);
  expect(result.defenderDefeatedAfterThirdPairClash).toBe(true);
  expect(result.defendersDuringFlee).toBe(result.firstWaveCount - 1);
  expect(result.defenseWaveArmedDuringFlee).toBe(false);
  expect(result.defendersAfterReturn).toBe(0);
  expect(result.defenseWaveRearmed).toBe(true);
  expect(result.attackerClashCleared).toBe(true);
  expect(result.log).toContain("敵巣防衛出動");
});

test("enemy nest defenders only engage active expedition ants", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.clearRivalNestDefenders();
    sim.colony.gameStatus = "playing";
    sim.colony.food = 1000;
    sim.colony.antPopulation = 36;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.rivalNest.discovered = true;
    sim.rivalNest.defeated = false;
    sim.rivalNest.defenseWaveArmed = true;
    sim.soldierSortieCooldown = 0;
    sim.computeDerived();
    sim.syncAntPopulation();
    const started = sim.startSoldierSortie("expedition");
    const attackers = sim.deployedSoldiers();
    const [activeAttacker, returningAttacker, fleeingAttacker] = attackers;
    const worker = sim.ants.find((ant: any) => !ant.isSortieSoldier);
    const farX = sim.rivalNest.x - 80;
    const farZ = sim.rivalNest.z;

    for (const ant of sim.ants) {
      ant.clashRival = null;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      ant.x = farX;
      ant.z = farZ;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.stun = 0;
      ant.fleeTimer = 0;
      ant.inNest = false;
      ant.nestStayTimer = 0;
      if (ant.state === "clash") ant.setState("explore");
    }
    for (const ant of attackers) {
      ant.setVariant?.("soldier");
      ant.role = "guard";
      ant.sortieMode = "expedition";
      ant.state = "explore";
    }
    worker.setVariant?.("worker");
    worker.role = "worker";
    worker.state = "explore";

    sim.spawnRivalNestDefenders(1);
    const defender = sim.rivalNestDefenders()[0];
    const resetDefenderClash = () => {
      for (const ant of sim.ants) {
        if (ant.clashRival !== defender) continue;
        ant.clashRival = null;
        ant.clashTimer = 0;
        ant.clashDuration = 0;
        if (ant.state === "clash") ant.setState("explore");
      }
      defender.clash = null;
      defender.state = "rival";
      defender.retreat = 0;
      defender.fightCooldown = 0;
    };
    const placeDefender = () => {
      defender.x = sim.rivalNest.x + 0.45;
      defender.z = sim.rivalNest.z;
      defender.prevX = defender.x;
      defender.prevZ = defender.z;
      defender.retreat = 0;
      defender.fightCooldown = 0;
    };

    placeDefender();
    returningAttacker.state = "return";
    returningAttacker.x = defender.x + 0.1;
    returningAttacker.z = defender.z;
    const returningContactResolved = defender.resolveAntContacts(sim);
    const returningContactIgnored = !returningContactResolved && defender.clash == null && returningAttacker.clashRival == null;
    resetDefenderClash();
    returningAttacker.state = "return";
    returningAttacker.x = farX;
    returningAttacker.z = farZ;

    placeDefender();
    worker.x = defender.x + 0.1;
    worker.z = defender.z;
    const workerContactResolved = defender.resolveAntContacts(sim);
    const workerContactIgnored = !workerContactResolved && defender.clash == null && worker.clashRival == null;
    resetDefenderClash();

    placeDefender();
    activeAttacker.state = "explore";
    activeAttacker.x = defender.x + 0.1;
    activeAttacker.z = defender.z;
    returningAttacker.state = "return";
    returningAttacker.x = defender.x + 6.5;
    returningAttacker.z = defender.z;
    fleeingAttacker.state = "flee";
    fleeingAttacker.fleeTimer = 4;
    fleeingAttacker.x = defender.x + 7;
    fleeingAttacker.z = defender.z;
    worker.state = "explore";
    worker.x = defender.x + 7.5;
    worker.z = defender.z;
    const activeContactStarted = defender.resolveAntContacts(sim);
    const recruitedIds = defender.clash?.ants?.map((ant: any) => ant.id) ?? [];

    return {
      started,
      attackerCount: attackers.length,
      returningContactIgnored,
      workerContactIgnored,
      activeContactStarted,
      recruitedIds,
      activeAttackerId: activeAttacker.id,
      returningUnclashed: returningAttacker.clashRival == null,
      fleeingUnclashed: fleeingAttacker.clashRival == null,
      workerUnclashed: worker.clashRival == null,
    };
  });

  expect(result.started).toBe(true);
  expect(result.attackerCount).toBe(3);
  expect(result.returningContactIgnored).toBe(true);
  expect(result.workerContactIgnored).toBe(true);
  expect(result.activeContactStarted).toBe(true);
  expect(result.recruitedIds).toEqual([result.activeAttackerId]);
  expect(result.returningUnclashed).toBe(true);
  expect(result.fleeingUnclashed).toBe(true);
  expect(result.workerUnclashed).toBe(true);
});

test("enemy nest collapse ends the game in victory", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.gameStatus = "playing";
    sim.colony.food = 1000;
    sim.colony.lifetimeFood = 1000;
    sim.colony.antPopulation = 36;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.rivalNest.discovered = true;
    sim.rivalNest.defeated = false;
    sim.rivalNest.integrity = 0.001;
    sim.soldierSortieCooldown = 0;
    sim.computeDerived();
    sim.syncAntPopulation();
    const started = sim.startSoldierSortie("expedition");
    for (const ant of sim.deployedSoldiers()) {
      ant.x = sim.rivalNest.x;
      ant.z = sim.rivalNest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.state = "guard";
      ant.stun = 0;
      ant.sortieTimer = 30;
    }
    sim.updateRivalNestAssault(0.5);
    return {
      started,
      gameStatus: sim.colony.gameStatus,
      rivalNestDefeated: sim.rivalNest.defeated,
      rivalNestIntegrity: sim.rivalNest.integrity,
      notice: document.querySelector("#raidNotice")?.textContent ?? "",
      bannerHidden: (document.querySelector("#gameEndBanner") as HTMLElement).hidden,
      bannerText: (document.querySelector("#gameEndBanner") as HTMLElement).textContent ?? "",
      resetAction: (document.querySelector("#gameEndResetBtn") as HTMLButtonElement).textContent ?? "",
      log: sim.colony.battleLog.join("\n"),
    };
  });

  expect(result.started).toBe(true);
  expect(result.gameStatus).toBe("victory");
  expect(result.rivalNestDefeated).toBe(true);
  expect(result.rivalNestIntegrity).toBe(0);
  expect(result.notice).toContain("勝利");
  expect(result.bannerHidden).toBe(false);
  expect(result.bannerText).toContain("勝利");
  expect(result.resetAction).toContain("新しい巣で再開");
  expect(result.log).toContain("勝利");
});

test("raid staging near the nest does not damage durability without a direct attack", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.gameStatus = "playing";
    sim.colony.nestDurability = 100;
    sim.colony.food = 1000;
    sim.colony.enemyThreat = 6;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: sim.colony.fallenAnts,
      lastOutcome: "warning",
    };
    sim.raidNestBreachEvents = 0;
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    rival.raidTargetKind = "food";
    rival.x = sim.nest.x + sim.nest.radius + 15;
    rival.z = sim.nest.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;
    rival.defeated = false;
    rival.leftRaid = false;
    sim.colony.raidState.breachTimer = 7.19;
    const before = sim.colony.nestDurability;
    const oldRandom = Math.random;
    Math.random = () => 1;
    try {
      sim.updateRaidBreachDamage(0.2);
    } finally {
      Math.random = oldRandom;
    }
    return {
      before,
      after: sim.colony.nestDurability,
      gameStatus: sim.colony.gameStatus,
      breachEvents: sim.raidNestBreachEvents,
      breachTimer: sim.colony.raidState.breachTimer,
      log: sim.colony.battleLog.join("\n"),
    };
  });

  expect(result.after).toBe(result.before);
  expect(result.gameStatus).toBe("playing");
  expect(result.breachEvents).toBe(0);
  expect(result.breachTimer).toBeLessThan(7.19);
  expect(result.log).not.toContain("巣穴を直接攻撃");
  expect(result.log).not.toContain("巣耐久-");
});

test("assigned nest attacker reaches the entrance before applying direct pressure", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    for (const ant of sim.ants) {
      ant.inNest = true;
      ant.nestStayTimer = 30;
      ant.clashRival = null;
    }
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: sim.raidApproachAngle(),
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: sim.colony.fallenAnts,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    rival.aggression = 0;
    rival.stubbornness = 1;
    let minNestDistance = Math.hypot(rival.x - sim.nest.x, rival.z - sim.nest.z);
    let secondsToReach: number | null = null;
    for (let step = 0; step < 92 * 30; step += 1) {
      rival.update(1 / 30, sim);
      minNestDistance = Math.min(minNestDistance, Math.hypot(rival.x - sim.nest.x, rival.z - sim.nest.z));
      if (sim.isRaidRivalDirectlyAttackingPlayerNest(rival)) {
        secondsToReach = (step + 1) / 30;
        break;
      }
    }
    return {
      targetKind: rival.raidTargetKind,
      baseSpeed: rival.baseSpeed,
      targetDistance: Math.hypot(rival.raidTargetX - sim.nest.x, rival.raidTargetZ - sim.nest.z),
      minNestDistance,
      nestRadius: sim.nest.radius,
      directlyAttacking: sim.isRaidRivalDirectlyAttackingPlayerNest(rival),
      secondsToReach,
    };
  });

  expect(result.targetKind).toBe("nest");
  expect(result.baseSpeed).toBeGreaterThanOrEqual(4.6 * 1.7);
  expect(result.targetDistance).toBeLessThanOrEqual(result.nestRadius);
  expect(result.minNestDistance).toBeLessThanOrEqual(result.nestRadius);
  expect(result.directlyAttacking).toBe(true);
  expect(result.secondsToReach).not.toBeNull();
  expect(result.secondsToReach).toBeLessThanOrEqual(84.8);
});

test("direct nest attack reaching zero ends the game in defeat", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.gameStatus = "playing";
    sim.colony.nestDurability = 5;
    sim.colony.food = 1000;
    sim.colony.lifetimeFood = 1000;
    sim.colony.enemyThreat = 6;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: sim.colony.fallenAnts,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    rival.x = sim.nest.x;
    rival.z = sim.nest.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;
    rival.defeated = false;
    rival.leftRaid = false;
    rival.raidTargetKind = "nest";
    sim.colony.raidState.breachTimer = 7.19;
    const beforeFood = sim.colony.food;
    const oldRandom = Math.random;
    Math.random = () => 1;
    try {
      sim.updateRaidBreachDamage(0.2);
    } finally {
      Math.random = oldRandom;
    }
    const trainStarted = sim.startBarracksTraining("worker");
    return {
      gameStatus: sim.colony.gameStatus,
      nestDurability: sim.colony.nestDurability,
      beforeFood,
      food: sim.colony.food,
      trainStarted,
      notice: document.querySelector("#raidNotice")?.textContent ?? "",
      bannerHidden: (document.querySelector("#gameEndBanner") as HTMLElement).hidden,
      bannerText: (document.querySelector("#gameEndBanner") as HTMLElement).textContent ?? "",
      activeTool: document.querySelector("#activeToolLabel")?.textContent ?? "",
      log: sim.colony.battleLog.join("\n"),
    };
  });

  expect(result.gameStatus).toBe("defeat");
  expect(result.nestDurability).toBe(0);
  expect(result.food).toBeLessThan(result.beforeFood);
  expect(result.trainStarted).toBe(false);
  expect(result.notice).toContain("敗北");
  expect(result.bannerHidden).toBe(false);
  expect(result.bannerText).toContain("敗北");
  expect(result.activeTool).toContain("敗北");
  expect(result.log).toContain("巣耐久");
  expect(result.log).toContain("敗北");
});

test("barracks tab queues every ant type and completes one ant at a time", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 1000;
    sim.colony.lifetimeFood = 1000;
    sim.colony.antPopulation = 30;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 4;
    sim.colony.builderAnts = 1;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 4;
    sim.colony.upgrades.storageChambers = 2;
    sim.colony.upgrades.soldierTraining = 2;
    sim.colony.upgrades.builderTraining = 1;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.medicBrood = 1;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.setPanelCompact(false, false);
    sim.setActiveTab("barracks");
    sim.updateStats();

    const directTrainingCardElements = [...document.querySelectorAll("#barracksTrainingList > .barracks-card")] as HTMLElement[];
    const visibleTrainingCards = directTrainingCardElements.filter((card) => {
      const rect = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }).length;
    const before = {
      food: sim.colony.food,
      ants: sim.colony.antPopulation,
      workers: sim.computeDerived().workers,
      builders: sim.colony.builderAnts,
      soldiers: sim.colony.soldierAnts,
      heavy: sim.colony.heavySoldierAnts,
      medic: sim.colony.medicAnts,
      tabText: document.querySelector(".panel-tabs")?.textContent ?? "",
      trainingCards: document.querySelectorAll("#barracksTrainingList .barracks-card").length,
      directTrainingCards: directTrainingCardElements.length,
      visibleTrainingCards,
      hiddenTrainingGroups: document.querySelectorAll("#barracksTrainingList details").length,
      trainingCardVariants: directTrainingCardElements.map(
        (card) => (card.querySelector("button[data-train-variant]") as HTMLButtonElement | null)?.dataset.trainVariant ?? "",
      ),
      trainingText: document.querySelector("#barracksTrainingList")?.textContent ?? "",
    };

    const workerStarted = sim.startBarracksTraining("worker");
    const builderStarted = sim.startBarracksTraining("builder");
    const soldierStarted = sim.startBarracksTraining("soldier");
    const heavyStarted = sim.startBarracksTraining("heavySoldier");
    const medicStarted = sim.startBarracksTraining("medic");
    const queueAfterStart = sim.colony.barracksQueue.map((order: any) => ({ ...order }));
    const firstDuration = sim.colony.barracksQueue[0].totalSeconds;
    sim.updateBarracksTraining(firstDuration - 0.1);
    const beforeFirstComplete = {
      soldiers: sim.colony.soldierAnts,
      heavy: sim.colony.heavySoldierAnts,
      queueLength: sim.colony.barracksQueue.length,
      firstRemaining: sim.colony.barracksQueue[0].remainingSeconds,
    };

    sim.updateBarracksTraining(0.2);
    const afterFirstComplete = {
      ants: sim.colony.antPopulation,
      workers: sim.computeDerived().workers,
      builders: sim.colony.builderAnts,
      soldiers: sim.colony.soldierAnts,
      heavy: sim.colony.heavySoldierAnts,
      queueLength: sim.colony.barracksQueue.length,
      activeVariant: sim.colony.barracksQueue[0]?.variant ?? null,
      activeRemaining: sim.colony.barracksQueue[0]?.remainingSeconds ?? null,
    };

    const remainingQueueSeconds = sim.colony.barracksQueue.reduce((sum: number, order: any) => sum + order.remainingSeconds, 0);
    sim.updateBarracksTraining(remainingQueueSeconds + 0.1);
    sim.updateStats();

    return {
      before,
      workerStarted,
      builderStarted,
      soldierStarted,
      heavyStarted,
      medicStarted,
      queueAfterStart,
      beforeFirstComplete,
      afterFirstComplete,
      afterAll: {
        food: sim.colony.food,
        ants: sim.colony.antPopulation,
        builders: sim.colony.builderAnts,
        soldiers: sim.colony.soldierAnts,
        heavy: sim.colony.heavySoldierAnts,
        medic: sim.colony.medicAnts,
        queueLength: sim.colony.barracksQueue.length,
        queueCountText: (document.querySelector("#barracksQueueCount") as HTMLElement).textContent,
        activeText: (document.querySelector("#barracksActive") as HTMLElement).textContent,
        statusText: (document.querySelector("#barracksStatus") as HTMLElement).textContent,
        queueText: (document.querySelector("#barracksQueueList") as HTMLElement).textContent,
        logText: sim.colony.battleLog.join("\n"),
      },
    };
  });

  expect(result.before.tabText).toContain("育房");
  expect(result.before.trainingCards).toBe(9);
  expect(result.before.directTrainingCards).toBe(9);
  expect(result.before.visibleTrainingCards).toBe(9);
  expect(result.before.hiddenTrainingGroups).toBe(0);
  expect(result.before.trainingCardVariants).toEqual([
    "worker",
    "builder",
    "soldier",
    "heavySoldier",
    "shieldHead",
    "acidShooter",
    "scout",
    "medic",
    "captain",
  ]);
  expect(result.before.trainingText).toContain("働きアリ");
  expect(result.before.trainingText).toContain("土木アリ");
  expect(result.before.trainingText).toContain("兵隊アリ");
  expect(result.before.trainingText).toContain("重兵装アリ");
  expect(result.before.trainingText).toContain("救護アリ");
  expect(result.workerStarted).toBe(true);
  expect(result.builderStarted).toBe(true);
  expect(result.soldierStarted).toBe(true);
  expect(result.heavyStarted).toBe(true);
  expect(result.medicStarted).toBe(true);
  expect(result.queueAfterStart).toHaveLength(5);
  expect(result.queueAfterStart.map((order: any) => order.variant)).toEqual(["worker", "builder", "soldier", "heavySoldier", "medic"]);
  expect(result.queueAfterStart[0].foodCost).not.toBe(result.queueAfterStart[1].foodCost);
  expect(result.queueAfterStart[0].totalSeconds).not.toBe(result.queueAfterStart[1].totalSeconds);
  expect(result.beforeFirstComplete.queueLength).toBe(5);
  expect(result.beforeFirstComplete.soldiers).toBe(result.before.soldiers);
  expect(result.beforeFirstComplete.heavy).toBe(result.before.heavy);
  expect(result.beforeFirstComplete.firstRemaining).toBeGreaterThan(0);
  expect(result.afterFirstComplete.ants).toBe(result.before.ants + 1);
  expect(result.afterFirstComplete.workers).toBe(result.before.workers + 1);
  expect(result.afterFirstComplete.builders).toBe(result.before.builders);
  expect(result.afterFirstComplete.soldiers).toBe(result.before.soldiers);
  expect(result.afterFirstComplete.heavy).toBe(result.before.heavy);
  expect(result.afterFirstComplete.queueLength).toBe(4);
  expect(result.afterFirstComplete.activeVariant).toBe("builder");
  expect(result.afterAll.ants).toBe(result.before.ants + 5);
  expect(result.afterAll.builders).toBe(result.before.builders + 1);
  expect(result.afterAll.soldiers).toBe(result.before.soldiers + 3);
  expect(result.afterAll.heavy).toBe(result.before.heavy + 1);
  expect(result.afterAll.medic).toBe(result.before.medic + 1);
  expect(result.afterAll.food).toBe(result.before.food - 50);
  expect(result.afterAll.queueLength).toBe(0);
  expect(result.afterAll.queueCountText).toBe("0");
  expect(result.afterAll.activeText).toBe("なし");
  expect(result.afterAll.statusText).toBe("キューなし");
  expect(result.afterAll.queueText).toContain("育成キューなし");
  expect(result.afterAll.logText).toContain("育成完了");
});

test("nursery queue accepts thirty orders without per-species caps", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 10000;
    sim.colony.lifetimeFood = 10000;
    sim.colony.antPopulation = 20;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 2;
    sim.colony.nestLevel = 6;
    sim.colony.territory = 8;
    sim.colony.upgrades.storageChambers = 4;
    sim.colony.upgrades.soldierTraining = 6;
    sim.colony.upgrades.heavySoldierBrood = 4;
    sim.colony.barracksQueue = [];
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.setActiveTab("barracks");
    const starts = Array.from({ length: 30 }, () => sim.startBarracksTraining("heavySoldier"));
    const extraStarted = sim.startBarracksTraining("heavySoldier");
    sim.updateStats();
    return {
      starts,
      extraStarted,
      queueLength: sim.colony.barracksQueue.length,
      queueCountText: (document.querySelector("#barracksQueueCount") as HTMLElement).textContent,
      trainingText: document.querySelector("#barracksTrainingList")?.textContent ?? "",
      statusText: (document.querySelector("#barracksStatus") as HTMLElement).textContent,
    };
  });

  expect(result.starts.every(Boolean)).toBe(true);
  expect(result.extraStarted).toBe(false);
  expect(result.queueLength).toBe(30);
  expect(result.queueCountText).toBe("30");
  expect(result.trainingText).toContain("キュー満杯");
  expect(result.statusText).toContain("重兵装アリ");
});

test("heavy soldiers, shield heads, acid shooters, scouts, medics, captains, and builders unlock without replacing existing ants", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const first = sim.ants[0];
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 40;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 12;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 4;
    sim.colony.upgrades.soldierTraining = 6;
    sim.colony.upgrades.chamberExcavation = 1;
    const heavyBought = sim.buyUpgrade("heavySoldierBrood");
    const shieldBought = sim.buyUpgrade("shieldHeadBrood");
    const acidBought = sim.buyUpgrade("acidShooterBrood");
    const scoutBought = sim.buyUpgrade("scoutBrood");
    const medicBought = sim.buyUpgrade("medicBrood");
    const captainBought = sim.buyUpgrade("captainBrood");
    const builderBought = sim.buyUpgrade("builderTraining");
    const countsAfterUnlock = {
      heavy: sim.colony.heavySoldierAnts,
      shield: sim.colony.shieldHeadAnts,
      acid: sim.colony.acidShooterAnts,
      scout: sim.colony.scoutAnts,
      medic: sim.colony.medicAnts,
      captain: sim.colony.captainAnts,
      builders: sim.colony.builderAnts,
    };
    const trainingStarted = [
      sim.startBarracksTraining("heavySoldier"),
      sim.startBarracksTraining("shieldHead"),
      sim.startBarracksTraining("acidShooter"),
      sim.startBarracksTraining("scout"),
      sim.startBarracksTraining("medic"),
      sim.startBarracksTraining("captain"),
      sim.startBarracksTraining("builder"),
    ];
    const queuedSeconds = sim.colony.barracksQueue.reduce((sum: number, order: any) => sum + order.remainingSeconds, 0);
    sim.updateBarracksTraining(queuedSeconds + 0.1);
    sim.computeDerived();
    sim.syncAntPopulation();
    const surfaceHeavyBeforeSortie = sim.ants.filter((ant: any) => ant.variant === "heavySoldier" && sim.shouldRenderAnt(ant)).length;
    const surfaceShieldBeforeSortie = sim.ants.filter((ant: any) => ant.variant === "shieldHead" && sim.shouldRenderAnt(ant)).length;
    const surfaceAcidBeforeSortie = sim.ants.filter((ant: any) => ant.variant === "acidShooter" && sim.shouldRenderAnt(ant)).length;
    const surfaceScoutBeforeSortie = sim.ants.filter((ant: any) => ant.variant === "scout" && sim.shouldRenderAnt(ant)).length;
    const surfaceMedicBeforeSortie = sim.ants.filter((ant: any) => ant.variant === "medic" && sim.shouldRenderAnt(ant)).length;
    const surfaceCaptainBeforeSortie = sim.ants.filter((ant: any) => ant.variant === "captain" && sim.shouldRenderAnt(ant)).length;
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
      sim.shouldRenderAnt(ant) && !ant.isRival && ["soldier", "heavySoldier", "shieldHead", "acidShooter", "scout", "medic", "captain", "builder"].includes(ant.variant),
    ).length;
    const roleLabelBands = [...sim.roleLabelSystem.textures.entries()].map(([, texture]: any) => {
      const sample = texture.image.getContext("2d").getImageData(24, 64, 1, 1).data;
      return `${sample[0]},${sample[1]},${sample[2]}`;
    });
    return {
      heavyBought,
      shieldBought,
      acidBought,
      scoutBought,
      medicBought,
      captainBought,
      builderBought,
      countsAfterUnlock,
      trainingStarted,
      sameFirstObject: sim.ants[0] === first,
      firstId: sim.ants[0].id,
      beforeFirstId: first.id,
      uniqueIds: new Set(sim.ants.map((ant: any) => ant.id)).size,
      renderedAnts: sim.ants.length,
      counts,
      heavyCount: sim.colony.heavySoldierAnts,
      shieldCount: sim.colony.shieldHeadAnts,
      acidCount: sim.colony.acidShooterAnts,
      scoutCount: sim.colony.scoutAnts,
      medicCount: sim.colony.medicAnts,
      captainCount: sim.colony.captainAnts,
      builderCount: sim.colony.builderAnts,
      builderTarget: sim.computeDerived().builderTarget,
      surfaceHeavyBeforeSortie,
      surfaceShieldBeforeSortie,
      surfaceAcidBeforeSortie,
      surfaceScoutBeforeSortie,
      surfaceMedicBeforeSortie,
      surfaceCaptainBeforeSortie,
      sortieStarted,
      deployedCount: deployed.length,
      deployedHeavyCount: deployed.filter((ant: any) => ant.variant === "heavySoldier").length,
      deployedShieldCount: deployed.filter((ant: any) => ant.variant === "shieldHead").length,
      deployedAcidCount: deployed.filter((ant: any) => ant.variant === "acidShooter").length,
      deployedScoutCount: deployed.filter((ant: any) => ant.variant === "scout").length,
      deployedMedicCount: deployed.filter((ant: any) => ant.variant === "medic").length,
      deployedCaptainCount: deployed.filter((ant: any) => ant.variant === "captain").length,
      idleBuildersInNest: builders.every((ant: any) => Math.hypot(ant.x - sim.nest.x, ant.z - sim.nest.z) < sim.nest.radius * 0.6),
      surfaceBuilders: sim.renderAntBuffer.filter((ant: any) => ant.variant === "builder").length,
      normalSoldiers: sim.computeDerived().normalSoldiers,
      soldierPool: sim.sortieSoldierPool(),
      sortieLimit: sortieLimitBefore,
      availableSortie: availableSortieBefore,
      heavyConfig: sim.getAntVariantConfig("heavySoldier"),
      shieldConfig: sim.getAntVariantConfig("shieldHead"),
      acidConfig: sim.getAntVariantConfig("acidShooter"),
      scoutConfig: sim.getAntVariantConfig("scout"),
      medicConfig: sim.getAntVariantConfig("medic"),
      captainConfig: sim.getAntVariantConfig("captain"),
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
  expect(result.shieldBought).toBe(true);
  expect(result.acidBought).toBe(true);
  expect(result.scoutBought).toBe(true);
  expect(result.medicBought).toBe(true);
  expect(result.captainBought).toBe(true);
  expect(result.builderBought).toBe(true);
  expect(result.countsAfterUnlock).toEqual({
    heavy: 0,
    shield: 0,
    acid: 0,
    scout: 0,
    medic: 0,
    captain: 0,
    builders: 0,
  });
  expect(result.trainingStarted).toEqual([true, true, true, true, true, true, true]);
  expect(result.sameFirstObject).toBe(true);
  expect(result.firstId).toBe(result.beforeFirstId);
  expect(result.uniqueIds).toBe(result.renderedAnts);
  expect(result.counts.heavySoldier).toBeGreaterThanOrEqual(1);
  expect(result.counts.shieldHead).toBeGreaterThanOrEqual(1);
  expect(result.counts.acidShooter).toBeGreaterThanOrEqual(1);
  expect(result.counts.scout).toBeGreaterThanOrEqual(1);
  expect(result.counts.medic).toBeGreaterThanOrEqual(1);
  expect(result.counts.captain).toBeGreaterThanOrEqual(1);
  expect(result.counts.builder).toBeGreaterThanOrEqual(1);
  expect(result.heavyCount).toBeGreaterThanOrEqual(1);
  expect(result.shieldCount).toBeGreaterThanOrEqual(1);
  expect(result.acidCount).toBeGreaterThanOrEqual(1);
  expect(result.scoutCount).toBeGreaterThanOrEqual(1);
  expect(result.medicCount).toBeGreaterThanOrEqual(1);
  expect(result.captainCount).toBeGreaterThanOrEqual(1);
  expect(result.builderCount).toBe(1);
  expect(result.builderTarget).toBeGreaterThan(result.builderCount);
  expect(result.surfaceHeavyBeforeSortie).toBe(0);
  expect(result.surfaceShieldBeforeSortie).toBe(0);
  expect(result.surfaceAcidBeforeSortie).toBe(0);
  expect(result.surfaceScoutBeforeSortie).toBe(0);
  expect(result.surfaceMedicBeforeSortie).toBe(0);
  expect(result.surfaceCaptainBeforeSortie).toBe(0);
  expect(result.sortieStarted).toBe(true);
  expect(result.deployedCount).toBe(result.sortieLimit);
  expect(result.deployedHeavyCount).toBe(1);
  expect(result.deployedShieldCount).toBe(1);
  expect(result.deployedAcidCount).toBe(1);
  expect(result.deployedScoutCount).toBe(1);
  expect(result.deployedMedicCount).toBe(1);
  expect(result.deployedCaptainCount).toBe(1);
  expect(result.idleBuildersInNest).toBe(true);
  expect(result.surfaceBuilders).toBe(0);
  expect(result.sortieLimit).toBe(Math.ceil(result.soldierPool / 2));
  expect(result.availableSortie).toBe(result.sortieLimit);
  expect(result.heavyConfig.speed).toBeLessThan(result.workerConfig.speed);
  expect(result.heavyConfig.hp).toBeGreaterThan(result.soldierConfig.hp);
  expect(result.heavyConfig.pushMass).toBeGreaterThan(result.soldierConfig.pushMass);
  expect(result.shieldConfig.headScale).toBeGreaterThan(result.heavyConfig.headScale);
  expect(result.shieldConfig.attack).toBeLessThan(result.heavyConfig.attack);
  expect(result.acidConfig.forageEfficiency).toBe(0);
  expect(result.acidConfig.attack).toBeLessThan(result.heavyConfig.attack);
  expect(result.scoutConfig.forageEfficiency).toBe(0);
  expect(result.scoutConfig.attack).toBeLessThan(result.soldierConfig.attack);
  expect(result.scoutConfig.speed).toBeGreaterThan(result.soldierConfig.speed);
  expect(result.medicConfig.forageEfficiency).toBe(0);
  expect(result.medicConfig.attack).toBeLessThan(result.soldierConfig.attack);
  expect(result.medicConfig.speed).toBeGreaterThan(result.heavyConfig.speed);
  expect(result.captainConfig.forageEfficiency).toBe(0);
  expect(result.captainConfig.attack).toBeLessThan(result.soldierConfig.attack);
  expect(result.captainConfig.hp).toBeGreaterThan(result.workerConfig.hp);
  expect(result.builderConfig.attack).toBeLessThan(result.workerConfig.attack);
  expect(result.finitePositions).toBe(true);
  expect(result.visibleRoleLabels).toBe(result.expectedRoleLabels);
  expect(result.roleLabelTextureCount).toBeGreaterThanOrEqual(2);
  expect(result.distinctRoleLabelBandCount).toBe(result.roleLabelTextureCount);
});

test("acid shooters stop to spray nearby rivals and apply a debuff", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 40;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 4;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.acidShooterAnts = 1;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.acidShooterBrood = 1;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const acid = sim.deployedSoldiers().find((ant: any) => ant.variant === "acidShooter");
    if (!acid || !rival) return { sortieStarted, acidFound: Boolean(acid), rivalFound: Boolean(rival) };

    acid.x = 0;
    acid.z = 0;
    acid.prevX = acid.x;
    acid.prevZ = acid.z;
    acid.state = "explore";
    acid.sortieTimer = 30;
    acid.acidSprayCooldown = 0;
    acid.acidSprayTimer = 0;
    acid.acidTargetId = null;
    rival.x = 10;
    rival.z = 0;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.aggression = 0.1;
    rival.stubbornness = 0.1;
    rival.scale = 1.25;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    rival.acidDebuff = 0;
    const before = { x: acid.x, z: acid.z };

    acid.updateAcidShooter(1 / 60, sim, { x: 0, z: 0 });
    const firstRenderState = acid.renderState(sim, 1);
    const stoppedDistanceAfterSpray = Math.hypot(acid.x - before.x, acid.z - before.z);
    const firstAcidEffect = sim.combatEffects.find((effect: any) => effect.type === "acid");
    let acidEffectCountAfterFirstSpray = sim.combatEffects.filter((effect: any) => effect.type === "acid").length;
    let clashStarted = false;
    for (let i = 0; i < 120; i += 1) {
      acid.update(1 / 60, sim);
      rival.update(1 / 60, sim);
      acidEffectCountAfterFirstSpray = sim.combatEffects.filter((effect: any) => effect.type === "acid").length;
      if (acid.state === "clash" || rival.clash?.ants?.includes(acid)) {
        clashStarted = true;
        break;
      }
    }
    const debuffedPower = rival.combatPowers(acid, sim).rivalPower;
    const debuff = rival.acidDebuff;
    rival.acidDebuff = 0;
    const normalPower = rival.combatPowers(acid, sim).rivalPower;

    return {
      sortieStarted,
      acidFound: true,
      rivalFound: true,
      action: acid.lastTacticalAction,
      stoppedDistance: stoppedDistanceAfterSpray,
      acidTargetId: acid.acidTargetId,
      rivalId: rival.id,
      debuff,
      debuffedPower,
      normalPower,
      acidPose: firstRenderState.acidPose,
      acidSprayColor: firstAcidEffect?.sprayMaterial?.color?.getHexString?.() ?? "",
      acidSplashColor: firstAcidEffect?.splashMaterial?.color?.getHexString?.() ?? "",
      acidDropletCount: firstAcidEffect?.droplets?.length ?? 0,
      acidBeamRadius: firstAcidEffect?.beam?.scale?.x ?? 0,
      effectCount: sim.combatEffects.filter((effect: any) => effect.type === "acid").length,
      repeatedEffectCount: acidEffectCountAfterFirstSpray,
      clashStarted,
      rivalFightCooldown: rival.fightCooldown,
      alarmTrails: sim.trails.filter((trail: any) => trail.kind === "alarm").length,
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.acidFound).toBe(true);
  expect(result.rivalFound).toBe(true);
  expect(result.action).toBe("acidSpray");
  expect(result.stoppedDistance).toBeLessThan(0.001);
  expect(result.acidTargetId).toBe(result.rivalId);
  expect(result.debuff).toBeGreaterThan(0);
  expect(result.debuffedPower).toBeLessThan(result.normalPower);
  expect(result.acidPose).toBeGreaterThan(0.8);
  expect(result.acidSprayColor).toBe("ff5a47");
  expect(result.acidSplashColor).toBe("ff2f5d");
  expect(result.acidDropletCount).toBeGreaterThanOrEqual(4);
  expect(result.acidBeamRadius).toBeGreaterThan(0.05);
  expect(result.effectCount).toBeGreaterThanOrEqual(1);
  expect(result.repeatedEffectCount).toBeGreaterThanOrEqual(2);
  expect(result.clashStarted).toBe(false);
  expect(result.rivalFightCooldown).toBeGreaterThan(0);
  expect(result.alarmTrails).toBeGreaterThanOrEqual(1);
});

test("medic ants aid exhausted sortie soldiers without joining clashes", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 40;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 4;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.shieldHeadAnts = 0;
    sim.colony.acidShooterAnts = 0;
    sim.colony.scoutAnts = 0;
    sim.colony.medicAnts = 1;
    sim.colony.captainAnts = 0;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.medicBrood = 1;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const medic = sim.deployedSoldiers().find((ant: any) => ant.variant === "medic");
    const patient = sim.deployedSoldiers().find((ant: any) => ant.variant === "soldier");
    if (!medic || !patient) return { sortieStarted, medicFound: Boolean(medic), patientFound: Boolean(patient) };

    medic.x = 0;
    medic.z = 0;
    medic.prevX = medic.x;
    medic.prevZ = medic.z;
    medic.state = "explore";
    medic.sortieTimer = 30;
    medic.medicAidCooldown = 0;
    medic.medicAidTimer = 0;
    medic.medicTargetId = null;
    patient.x = 1.4;
    patient.z = 0;
    patient.prevX = patient.x;
    patient.prevZ = patient.z;
    patient.state = "explore";
    patient.sortieTimer = 30;
    patient.energy = 0.12;
    patient.stamina = 0.12;
    patient.stun = 0.35;
    patient.wet = 0.5;
    const beforeEnergy = patient.energy;

    const chosen = sim.findMedicPatient(medic);
    medic.updateMedic(1 / 60, sim, { x: 0, z: 0 });
    sim.renderGame(1);
    const aidEffect = sim.combatEffects.find((effect: any) => effect.type === "medicAid");
    const renderState = medic.renderState(sim, 1);
    const visibleMedicPouches = sim.antRenderer.medicPouchMesh.count;
    const visibleRoleLabels = sim.roleLabelSystem.sprites.filter((sprite: any) => sprite.visible).length;

    return {
      sortieStarted,
      medicFound: true,
      patientFound: true,
      chosenId: chosen?.id ?? null,
      patientId: patient.id,
      medicAction: medic.lastTacticalAction,
      patientAction: patient.lastTacticalAction,
      patientState: patient.state,
      patientFleeTimer: patient.fleeTimer,
      beforeEnergy,
      afterEnergy: patient.energy,
      afterStun: patient.stun,
      afterWet: patient.wet,
      medicTargetId: medic.medicTargetId,
      medicPose: renderState.medicPose,
      aidEffectCount: sim.combatEffects.filter((effect: any) => effect.type === "medicAid").length,
      aidColor: aidEffect?.aidMaterial?.color?.getHexString?.() ?? "",
      crossBarCount: aidEffect?.bars?.length ?? 0,
      rescueTrails: sim.trails.filter((trail: any) => trail.kind === "rescue").length,
      clashStarted: medic.state === "clash" || patient.state === "clash",
      visibleMedicPouches,
      visibleRoleLabels,
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.medicFound).toBe(true);
  expect(result.patientFound).toBe(true);
  expect(result.chosenId).toBe(result.patientId);
  expect(result.medicAction).toBe("medicEvacuate");
  expect(result.patientAction).toBe("medicEvacuated");
  expect(result.patientState).toBe("flee");
  expect(result.patientFleeTimer).toBeGreaterThan(0);
  expect(result.afterEnergy).toBeGreaterThan(result.beforeEnergy);
  expect(result.afterStun).toBeLessThan(0.35);
  expect(result.afterWet).toBeLessThan(0.5);
  expect(result.medicTargetId).toBe(result.patientId);
  expect(result.medicPose).toBeGreaterThan(0.8);
  expect(result.aidEffectCount).toBeGreaterThanOrEqual(1);
  expect(result.aidColor).toBe("aee9c9");
  expect(result.crossBarCount).toBe(2);
  expect(result.rescueTrails).toBeGreaterThanOrEqual(1);
  expect(result.clashStarted).toBe(false);
  expect(result.visibleMedicPouches).toBeGreaterThanOrEqual(2);
  expect(result.visibleRoleLabels).toBeGreaterThanOrEqual(1);
});

test("scout ants mark enemies so sortie ants prioritize the same target", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 40;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 4;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.shieldHeadAnts = 0;
    sim.colony.acidShooterAnts = 1;
    sim.colony.scoutAnts = 1;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.acidShooterBrood = 1;
    sim.colony.upgrades.scoutBrood = 1;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 2,
      activeCount: 2,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateRaid(0.01);
    const rivals = sim.raidRivals();
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const acid = sim.deployedSoldiers().find((ant: any) => ant.variant === "acidShooter");
    const scout = sim.deployedSoldiers().find((ant: any) => ant.variant === "scout");
    if (!acid || !scout || rivals.length < 2) {
      return { sortieStarted, acidFound: Boolean(acid), scoutFound: Boolean(scout), rivalCount: rivals.length };
    }

    const marked = rivals[0];
    const decoy = rivals[1];
    acid.x = 0;
    acid.z = 0;
    acid.prevX = acid.x;
    acid.prevZ = acid.z;
    acid.state = "explore";
    acid.sortieTimer = 30;
    acid.acidSprayCooldown = 0;
    acid.acidSprayTimer = 0;
    acid.acidTargetId = null;
    scout.x = 30;
    scout.z = 0;
    scout.prevX = scout.x;
    scout.prevZ = scout.z;
    scout.state = "explore";
    scout.sortieTimer = 30;
    scout.scoutMarkCooldown = 0;
    scout.scoutTargetId = null;
    scout.scoutSignal = 0;
    marked.x = 22;
    marked.z = 0;
    marked.prevX = marked.x;
    marked.prevZ = marked.z;
    marked.retreat = 0;
    marked.clash = null;
    marked.scoutMarkTimer = 0;
    marked.scoutMarkStrength = 0;
    marked.scoutMarkedById = null;
    decoy.x = 14;
    decoy.z = -10;
    decoy.prevX = decoy.x;
    decoy.prevZ = decoy.z;
    decoy.retreat = 0;
    decoy.clash = null;
    decoy.scoutMarkTimer = 0;
    decoy.scoutMarkStrength = 0;
    decoy.scoutMarkedById = null;

    const targetBeforeMark = sim.findRivalThreat(acid.x, acid.z, 230);
    const scoutSteering = { x: 0, z: 0 };
    const scoutHandled = scout.updateScout(1 / 60, sim, scoutSteering);
    const targetAfterMark = sim.findRivalThreat(acid.x, acid.z, 230);
    acid.update(1 / 60, sim);
    const scoutRender = scout.renderState(sim, 1);
    sim.renderGame(1);

    return {
      sortieStarted,
      acidFound: true,
      scoutFound: true,
      rivalCount: rivals.length,
      scoutHandled,
      scoutAction: scout.lastTacticalAction,
      scoutTargetId: scout.scoutTargetId,
      scoutPose: scoutRender.scoutPose,
      markedId: marked.id,
      decoyId: decoy.id,
      targetBeforeMarkId: targetBeforeMark?.id ?? null,
      targetAfterMarkId: targetAfterMark?.id ?? null,
      markedTimer: marked.scoutMarkTimer,
      markedBy: marked.scoutMarkedById,
      markedStrength: marked.scoutMarkStrength,
      acidAction: acid.lastTacticalAction,
      acidTargetId: acid.acidTargetId,
      scoutEffects: sim.combatEffects.filter((effect: any) => effect.type === "scoutMark").length,
      scoutRoleLabel: sim.roleLabelSystem.textures.has("scout"),
      scoutInClash: Boolean(scout.state === "clash" || marked.clash?.ants?.includes(scout) || decoy.clash?.ants?.includes(scout)),
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.acidFound).toBe(true);
  expect(result.scoutFound).toBe(true);
  expect(result.rivalCount).toBe(2);
  expect(result.scoutHandled).toBe(true);
  expect(["scoutMark", "scoutEvade"]).toContain(result.scoutAction);
  expect(result.scoutTargetId).toBe(result.markedId);
  expect(result.scoutPose).toBeGreaterThan(0.9);
  expect(result.targetBeforeMarkId).toBe(result.decoyId);
  expect(result.targetAfterMarkId).toBe(result.markedId);
  expect(result.markedTimer).toBeGreaterThan(0);
  expect(result.markedBy).toBeTruthy();
  expect(result.markedStrength).toBeGreaterThan(0);
  expect(result.acidAction).toBe("acidSpray");
  expect(result.acidTargetId).toBe(result.markedId);
  expect(result.scoutEffects).toBeGreaterThanOrEqual(1);
  expect(result.scoutRoleLabel).toBe(true);
  expect(result.scoutInClash).toBe(false);
});

test("scout ants move into the frontline while marking enemies", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 36;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 4;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.shieldHeadAnts = 0;
    sim.colony.acidShooterAnts = 0;
    sim.colony.scoutAnts = 1;
    sim.colony.captainAnts = 0;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.scoutBrood = 1;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 2,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const scout = sim.deployedSoldiers().find((ant: any) => ant.variant === "scout");
    if (!scout || !rival) {
      return { sortieStarted, scoutFound: Boolean(scout), rivalFound: Boolean(rival) };
    }

    scout.x = 60;
    scout.z = 0;
    scout.prevX = scout.x;
    scout.prevZ = scout.z;
    scout.state = "explore";
    scout.sortieTimer = 30;
    scout.scoutMarkCooldown = 0;
    scout.skipMoveThisFrame = false;
    rival.x = 22;
    rival.z = 0;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;
    rival.scoutMarkTimer = 0;
    rival.scoutMarkStrength = 0;
    rival.scoutMarkedById = null;

    const steering = { x: 0, z: 0 };
    const handled = scout.updateScout(1 / 60, sim, steering);
    return {
      sortieStarted,
      scoutFound: true,
      rivalFound: true,
      handled,
      action: scout.lastTacticalAction,
      markedBy: rival.scoutMarkedById,
      markedTimer: rival.scoutMarkTimer,
      steeringX: steering.x,
      steeringMagnitude: Math.hypot(steering.x, steering.z),
      skipMoveThisFrame: scout.skipMoveThisFrame,
      distanceToRival: Math.hypot(scout.x - rival.x, scout.z - rival.z),
      scoutInClash: Boolean(scout.state === "clash" || rival.clash?.ants?.includes(scout)),
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.scoutFound).toBe(true);
  expect(result.rivalFound).toBe(true);
  expect(result.handled).toBe(true);
  expect(result.action).toBe("scoutMark");
  expect(result.markedBy).toBeTruthy();
  expect(result.markedTimer).toBeGreaterThan(0);
  expect(result.distanceToRival).toBeGreaterThan(30);
  expect(result.steeringX).toBeLessThan(-0.5);
  expect(result.steeringMagnitude).toBeGreaterThan(0.5);
  expect(result.skipMoveThisFrame).toBe(false);
  expect(result.scoutInClash).toBe(false);
});

test("captain ants form temporary squads and align members on one target", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 44;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 8;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.shieldHeadAnts = 1;
    sim.colony.acidShooterAnts = 1;
    sim.colony.scoutAnts = 0;
    sim.colony.captainAnts = 1;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 2;
    sim.colony.upgrades.shieldHeadBrood = 1;
    sim.colony.upgrades.acidShooterBrood = 1;
    sim.colony.upgrades.captainBrood = 1;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 3,
      activeCount: 2,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateRaid(0.01);
    const rivals = sim.raidRivals();
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const captain = sim.deployedSoldiers().find((ant: any) => ant.variant === "captain");
    const acid = sim.deployedSoldiers().find((ant: any) => ant.variant === "acidShooter");
    const shield = sim.deployedSoldiers().find((ant: any) => ant.variant === "shieldHead");
    const normal = sim.deployedSoldiers().find((ant: any) => ant.variant === "soldier");
    if (!captain || !acid || !shield || !normal || rivals.length < 2) {
      return {
        sortieStarted,
        captainFound: Boolean(captain),
        acidFound: Boolean(acid),
        shieldFound: Boolean(shield),
        normalFound: Boolean(normal),
        rivalCount: rivals.length,
      };
    }

    const marked = rivals[0];
    const decoy = rivals[1];
    captain.x = 20;
    captain.z = 0;
    captain.prevX = captain.x;
    captain.prevZ = captain.z;
    captain.state = "explore";
    captain.sortieTimer = 30;
    captain.commandEffectCooldown = 0;
    acid.x = 0;
    acid.z = 0;
    acid.prevX = acid.x;
    acid.prevZ = acid.z;
    acid.state = "explore";
    acid.sortieTimer = 30;
    acid.acidSprayCooldown = 0;
    acid.acidSprayTimer = 0;
    acid.acidTargetId = null;
    shield.x = 14;
    shield.z = 3;
    shield.prevX = shield.x;
    shield.prevZ = shield.z;
    normal.x = 5;
    normal.z = -5;
    normal.prevX = normal.x;
    normal.prevZ = normal.z;
    marked.x = 24;
    marked.z = 0;
    marked.prevX = marked.x;
    marked.prevZ = marked.z;
    marked.retreat = 0;
    marked.clash = null;
    marked.scoutMarkTimer = 0;
    marked.scoutMarkStrength = 0;
    decoy.x = 10;
    decoy.z = -2;
    decoy.prevX = decoy.x;
    decoy.prevZ = decoy.z;
    decoy.retreat = 0;
    decoy.clash = null;
    decoy.scoutMarkTimer = 0;
    decoy.scoutMarkStrength = 0;

    sim.updateSquads(1 / 60);
    const squad = sim.squads[0];
    const targetBeforeCommand = sim.findRivalThreat(acid.x, acid.z, 230);
    const steering = { x: 0, z: 0 };
    const captainHandled = captain.updateCaptain(1 / 60, sim, steering);
    sim.updateSquads(1 / 60);
    const targetAfterCommand = sim.findRivalThreat(acid.x, acid.z, 230, acid.squadTargetId);
    const squadSteering = { x: 0, z: 0 };
    const squadPull = sim.applySquadSteering(acid, squadSteering);
    acid.update(1 / 60, sim);
    const captainRender = captain.renderState(sim, 1);
    sim.renderGame(1);
    const commandEffect = sim.combatEffects.find((effect: any) => effect.type === "captainCommand");
    const squadMembers = (squad?.memberIds ?? [])
      .map((id: number) => sim.getAntById(id))
      .filter(Boolean);
    const targetDx = (squad?.rallyX ?? marked.x) - captain.x;
    const targetDz = (squad?.rallyZ ?? marked.z) - captain.z;
    const targetLength = Math.hypot(targetDx, targetDz) || 1;
    const forwardX = targetDx / targetLength;
    const forwardZ = targetDz / targetLength;
    const memberForwardOffsets = squadMembers.map((ant: any) => ((ant.squadAnchorX - captain.x) * forwardX) + ((ant.squadAnchorZ - captain.z) * forwardZ));
    const squadRingColors = [...new Set((sim.squadRingSystem?.lastColors ?? []).map((color: number) => color))];

    return {
      sortieStarted,
      captainFound: true,
      acidFound: true,
      shieldFound: true,
      normalFound: true,
      rivalCount: rivals.length,
      squadCount: sim.squads.length,
      squadLeaderId: squad?.leaderId ?? null,
      captainId: captain.id,
      memberCount: squad?.memberIds?.length ?? 0,
      acidSquadId: acid.squadId,
      captainSquadId: captain.squadId,
      squadColorHex: squad?.colorHex ?? null,
      captainColorHex: captain.squadColorHex,
      membersShareSquadColor: squadMembers.every((ant: any) => ant.squadColorHex === squad?.colorHex),
      memberForwardMin: Math.min(...memberForwardOffsets),
      memberForwardMax: Math.max(...memberForwardOffsets),
      captainHandled,
      captainAction: captain.lastTacticalAction,
      captainPose: captainRender.commandPose,
      squadTargetId: squad?.targetRivalId ?? null,
      acidTargetId: acid.squadTargetId,
      markedId: marked.id,
      decoyId: decoy.id,
      targetBeforeCommandId: targetBeforeCommand?.id ?? null,
      targetAfterCommandId: targetAfterCommand?.id ?? null,
      acidAction: acid.lastTacticalAction,
      acidSprayTarget: acid.acidTargetId,
      acidAnchorSet: acid.squadAnchorX != null && acid.squadAnchorZ != null,
      squadPull,
      squadPullMagnitude: Math.hypot(squadSteering.x, squadSteering.z),
      squadCohesion: squad?.cohesion ?? 0,
      commandEffects: sim.combatEffects.filter((effect: any) => effect.type === "captainCommand").length,
      commandEffectColor: commandEffect?.commandMaterial?.color?.getHex?.() ?? null,
      commandEffectLife: commandEffect?.life ?? 0,
      commandEffectRadius: commandEffect?.radius ?? 0,
      squadRingVisibleCount: sim.squadRingSystem?.lastVisibleCount ?? 0,
      squadRingColors,
      captainRoleLabel: sim.roleLabelSystem.textures.has("captain"),
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.captainFound).toBe(true);
  expect(result.acidFound).toBe(true);
  expect(result.shieldFound).toBe(true);
  expect(result.normalFound).toBe(true);
  expect(result.rivalCount).toBe(2);
  expect(result.squadCount).toBe(1);
  expect(result.squadLeaderId).toBe(result.captainId);
  expect(result.memberCount).toBeGreaterThanOrEqual(3);
  expect(result.acidSquadId).toBe(result.captainSquadId);
  expect(result.squadColorHex).toBeTruthy();
  expect(result.captainColorHex).toBe(result.squadColorHex);
  expect(result.membersShareSquadColor).toBe(true);
  expect(result.memberForwardMin).toBeLessThan(-2);
  expect(result.memberForwardMax).toBeGreaterThan(2);
  expect(result.captainHandled).toBe(true);
  expect(["captainAdvance", "captainCommand", "captainFallBack", "captainHold", "captainRally", "captainWaitSquad"]).toContain(result.captainAction);
  expect(result.captainPose).toBeGreaterThan(0.6);
  expect(result.squadTargetId).toBe(result.markedId);
  expect(result.acidTargetId).toBe(result.markedId);
  expect(result.targetBeforeCommandId).toBe(result.decoyId);
  expect(result.targetAfterCommandId).toBe(result.markedId);
  expect(result.acidAction).toBe("acidSpray");
  expect(result.acidSprayTarget).toBe(result.markedId);
  expect(result.acidAnchorSet).toBe(true);
  expect(result.squadPull).toBe(true);
  expect(result.squadPullMagnitude).toBeGreaterThan(1);
  expect(result.squadCohesion).toBeGreaterThan(0);
  expect(result.commandEffects).toBeGreaterThanOrEqual(1);
  expect(result.commandEffectColor).toBe(result.squadColorHex);
  expect(result.commandEffectLife).toBeGreaterThanOrEqual(1);
  expect(result.commandEffectRadius).toBeGreaterThan(3);
  expect(result.squadRingVisibleCount).toBeGreaterThanOrEqual(result.memberCount + 1);
  expect(result.squadRingColors).toEqual([result.squadColorHex]);
  expect(result.captainRoleLabel).toBe(true);
});

test("captain squads use distinct command ring colors per squad", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 60;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 16;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.shieldHeadAnts = 0;
    sim.colony.acidShooterAnts = 0;
    sim.colony.scoutAnts = 0;
    sim.colony.captainAnts = 2;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 2;
    sim.colony.upgrades.captainBrood = 2;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    sim.updateSquads(1 / 60);
    sim.renderGame(1);

    const captains = sim.deployedSoldiers().filter((ant: any) => ant.variant === "captain");
    const colorDistance = (a: number, b: number) => {
      const ar = (a >> 16) & 255;
      const ag = (a >> 8) & 255;
      const ab = a & 255;
      const br = (b >> 16) & 255;
      const bg = (b >> 8) & 255;
      const bb = b & 255;
      return Math.hypot(ar - br, ag - bg, ab - bb);
    };
    const squads = sim.squads.map((squad: any) => {
      const leader = sim.getAntById(squad.leaderId);
      const members = squad.memberIds.map((id: number) => sim.getAntById(id)).filter(Boolean);
      return {
        id: squad.id,
        colorHex: squad.colorHex,
        leaderColorHex: leader?.squadColorHex ?? null,
        memberCount: members.length,
        memberColors: members.map((ant: any) => ant.squadColorHex),
        allMembersShareColor: members.every((ant: any) => ant.squadColorHex === squad.colorHex),
      };
    });
    const ringColors = [...new Set((sim.squadRingSystem?.lastColors ?? []).map((color: number) => color))];
    const captainColors = captains.map((ant: any) => ant.squadColorHex);
    const captainColorDistances = [];
    for (let i = 0; i < captainColors.length; i += 1) {
      for (let j = i + 1; j < captainColors.length; j += 1) {
        captainColorDistances.push(colorDistance(captainColors[i], captainColors[j]));
      }
    }

    return {
      sortieStarted,
      squadCount: sim.squads.length,
      squads,
      captainColors,
      minCaptainColorDistance: Math.min(...captainColorDistances),
      distinctCaptainColors: new Set(captainColors).size,
      distinctSquadColors: new Set(squads.map((squad: any) => squad.colorHex)).size,
      ringVisibleCount: sim.squadRingSystem?.lastVisibleCount ?? 0,
      ringColors,
      ringOpacity: sim.squadRingSystem?.material?.opacity ?? 0,
      ringDepthTest: sim.squadRingSystem?.material?.depthTest ?? true,
      ringInnerRadius: sim.squadRingSystem?.geometry?.parameters?.innerRadius ?? 0,
      ringOuterRadius: sim.squadRingSystem?.geometry?.parameters?.outerRadius ?? 0,
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.squadCount).toBe(2);
  expect(result.distinctCaptainColors).toBe(2);
  expect(result.distinctSquadColors).toBe(2);
  expect(result.minCaptainColorDistance).toBeGreaterThan(180);
  expect(result.squads.every((squad: any) => squad.leaderColorHex === squad.colorHex)).toBe(true);
  expect(result.squads.every((squad: any) => squad.allMembersShareColor)).toBe(true);
  expect(result.squads.every((squad: any) => squad.memberCount > 0)).toBe(true);
  expect(result.ringVisibleCount).toBeGreaterThanOrEqual(
    result.squads.reduce((sum: number, squad: any) => sum + squad.memberCount + 1, 0),
  );
  expect(result.ringOpacity).toBeGreaterThan(0.9);
  expect(result.ringDepthTest).toBe(false);
  expect(result.ringInnerRadius).toBeCloseTo(0.86);
  expect(result.ringOuterRadius).toBe(1);
  expect(result.ringOuterRadius - result.ringInnerRadius).toBeCloseTo(0.14);
  expect(new Set(result.ringColors).size).toBe(2);
  expect(result.captainColors.every((color: number) => result.ringColors.includes(color))).toBe(true);
  expect(result.squads.every((squad: any) => result.ringColors.includes(squad.colorHex))).toBe(true);
});

test("captain squads balance roles and avoid dogpiling one rival", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 80;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 36;
    sim.colony.heavySoldierAnts = 3;
    sim.colony.shieldHeadAnts = 3;
    sim.colony.acidShooterAnts = 3;
    sim.colony.scoutAnts = 3;
    sim.colony.captainAnts = 3;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 3;
    sim.colony.upgrades.heavySoldierBrood = 3;
    sim.colony.upgrades.shieldHeadBrood = 3;
    sim.colony.upgrades.acidShooterBrood = 3;
    sim.colony.upgrades.scoutBrood = 3;
    sim.colony.upgrades.captainBrood = 3;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 4,
      activeCount: 3,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.beginRaid();
    const rivals = sim.raidRivals();
    for (const [index, rival] of rivals.entries()) {
      rival.x = 78;
      rival.z = (index - 1) * 26;
      rival.prevX = rival.x;
      rival.prevZ = rival.z;
      rival.retreat = 0;
      rival.clash = null;
      rival.scoutMarkTimer = 0;
      rival.scoutMarkStrength = 0;
    }
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const captains = sim.deployedSoldiers().filter((ant: any) => ant.variant === "captain");
    for (const [index, captain] of captains.entries()) {
      captain.x = 0;
      captain.z = (index - 1) * 9;
      captain.prevX = captain.x;
      captain.prevZ = captain.z;
      captain.state = "explore";
      captain.sortieTimer = 30;
    }
    sim.updateSquads(1 / 60);

    const squads = sim.squads.map((squad: any) => {
      const members = squad.memberIds.map((id: number) => sim.getAntById(id)).filter(Boolean);
      const counts = members.reduce((memo: Record<string, number>, ant: any) => {
        memo[ant.variant] = (memo[ant.variant] ?? 0) + 1;
        return memo;
      }, {});
      return {
        id: squad.id,
        laneOffset: squad.laneOffset,
        targetRivalId: squad.targetRivalId,
        rallyX: squad.rallyX,
        rallyZ: squad.rallyZ,
        memberCount: members.length,
        counts,
      };
    });
    const targetIds = squads.map((squad: any) => squad.targetRivalId).filter((id: number | null) => id != null);
    const rallyZs = squads.map((squad: any) => squad.rallyZ);

    return {
      sortieStarted,
      squadCount: sim.squads.length,
      rivalCount: rivals.length,
      squads,
      distinctTargets: new Set(targetIds).size,
      targetIds,
      rallySpread: Math.max(...rallyZs) - Math.min(...rallyZs),
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.squadCount).toBe(3);
  expect(result.rivalCount).toBe(3);
  expect(result.squads.every((squad: any) => squad.memberCount === 5)).toBe(true);
  for (const variant of ["shieldHead", "heavySoldier", "acidShooter", "scout", "soldier"]) {
    expect(result.squads.every((squad: any) => squad.counts[variant] === 1)).toBe(true);
  }
  expect(result.targetIds).toHaveLength(3);
  expect(result.distinctTargets).toBe(3);
  expect(result.rallySpread).toBeGreaterThan(20);
});

test("captain ants stay inside the squad instead of rushing ahead", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 52;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 9;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.shieldHeadAnts = 1;
    sim.colony.acidShooterAnts = 1;
    sim.colony.scoutAnts = 0;
    sim.colony.captainAnts = 1;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 2;
    sim.colony.upgrades.shieldHeadBrood = 1;
    sim.colony.upgrades.acidShooterBrood = 1;
    sim.colony.upgrades.captainBrood = 1;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 2,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const captain = sim.deployedSoldiers().find((ant: any) => ant.variant === "captain");
    if (!captain || !rival) return { sortieStarted, captainFound: Boolean(captain), rivalFound: Boolean(rival) };

    captain.x = 0;
    captain.z = 0;
    captain.prevX = captain.x;
    captain.prevZ = captain.z;
    captain.state = "explore";
    captain.sortieTimer = 30;
    rival.x = 70;
    rival.z = 0;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;

    const squad = sim.squadForLeader(captain);
    const members = (squad?.memberIds ?? []).map((id: number) => sim.getAntById(id)).filter(Boolean);
    for (const [index, ant] of members.entries()) {
      ant.x = -28 - index * 1.6;
      ant.z = (index % 2 === 0 ? -1 : 1) * (5 + index);
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.state = "explore";
      ant.sortieTimer = 30;
    }

    sim.updateSquads(1 / 60);
    const updatedSquad = sim.squadForLeader(captain);
    const targetDx = (updatedSquad?.rallyX ?? rival.x) - captain.x;
    const targetDz = (updatedSquad?.rallyZ ?? rival.z) - captain.z;
    const targetLength = Math.hypot(targetDx, targetDz) || 1;
    const forwardX = targetDx / targetLength;
    const forwardZ = targetDz / targetLength;
    const memberForwardOffsets = members.map((ant: any) => ((ant.squadAnchorX - captain.x) * forwardX) + ((ant.squadAnchorZ - captain.z) * forwardZ));
    const steering = { x: 0, z: 0 };
    const handled = captain.updateCaptain(1 / 60, sim, steering);

    return {
      sortieStarted,
      captainFound: true,
      rivalFound: true,
      memberCount: members.length,
      handled,
      captainAction: captain.lastTacticalAction,
      captainAdvanceMagnitude: Math.hypot(steering.x, steering.z),
      squadCohesion: updatedSquad?.cohesion ?? 0,
      frontMemberCount: memberForwardOffsets.filter((offset: number) => offset > 2).length,
      rearMemberCount: memberForwardOffsets.filter((offset: number) => offset < -2).length,
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.captainFound).toBe(true);
  expect(result.rivalFound).toBe(true);
  expect(result.memberCount).toBeGreaterThanOrEqual(3);
  expect(result.frontMemberCount).toBeGreaterThan(0);
  expect(result.rearMemberCount).toBeGreaterThan(0);
  expect(result.squadCohesion).toBeLessThan(0.5);
  expect(result.handled).toBe(true);
  expect(result.captainAction).toBe("captainWaitSquad");
  expect(result.captainAdvanceMagnitude).toBeLessThan(0.7);
});

test("captain squads keep scouts near the frontline", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 50;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 8;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.shieldHeadAnts = 0;
    sim.colony.acidShooterAnts = 0;
    sim.colony.scoutAnts = 1;
    sim.colony.captainAnts = 1;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 2;
    sim.colony.upgrades.scoutBrood = 1;
    sim.colony.upgrades.captainBrood = 1;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 2,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const captain = sim.deployedSoldiers().find((ant: any) => ant.variant === "captain");
    const scout = sim.deployedSoldiers().find((ant: any) => ant.variant === "scout");
    if (!captain || !scout || !rival) {
      return { sortieStarted, captainFound: Boolean(captain), scoutFound: Boolean(scout), rivalFound: Boolean(rival) };
    }

    captain.x = 10;
    captain.z = 0;
    captain.prevX = captain.x;
    captain.prevZ = captain.z;
    captain.state = "explore";
    captain.sortieTimer = 30;
    scout.x = -18;
    scout.z = -8;
    scout.prevX = scout.x;
    scout.prevZ = scout.z;
    scout.state = "explore";
    scout.sortieTimer = 30;
    scout.scoutMarkCooldown = 0;
    rival.x = 40;
    rival.z = 0;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;

    sim.updateSquads(1 / 60);
    const steering = { x: 0, z: 0 };
    const squadPull = sim.applySquadSteering(scout, steering);
    const leaderDistanceToRival = Math.hypot(captain.x - rival.x, captain.z - rival.z);
    const scoutAnchorDistanceToRival = Math.hypot(scout.squadAnchorX - rival.x, scout.squadAnchorZ - rival.z);
    const anchorDistance = Math.hypot(scout.x - scout.squadAnchorX, scout.z - scout.squadAnchorZ);
    const pullTowardAnchor =
      ((scout.squadAnchorX - scout.x) * steering.x + (scout.squadAnchorZ - scout.z) * steering.z) > 0;

    return {
      sortieStarted,
      captainFound: true,
      scoutFound: true,
      rivalFound: true,
      squadCount: sim.squads.length,
      scoutSquadId: scout.squadId,
      captainSquadId: captain.squadId,
      anchorAheadOfCaptain: scout.squadAnchorX > captain.x,
      leaderDistanceToRival,
      scoutAnchorDistanceToRival,
      anchorDistance,
      squadPull,
      pullMagnitude: Math.hypot(steering.x, steering.z),
      pullTowardAnchor,
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.captainFound).toBe(true);
  expect(result.scoutFound).toBe(true);
  expect(result.rivalFound).toBe(true);
  expect(result.squadCount).toBe(1);
  expect(result.scoutSquadId).toBe(result.captainSquadId);
  expect(result.anchorAheadOfCaptain).toBe(true);
  expect(result.scoutAnchorDistanceToRival).toBeLessThan(result.leaderDistanceToRival);
  expect(result.anchorDistance).toBeGreaterThan(10);
  expect(result.squadPull).toBe(true);
  expect(result.pullMagnitude).toBeGreaterThan(1.2);
  expect(result.pullTowardAnchor).toBe(true);
});

test("shield head ants advance to the front line and tank for allies", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.paused = true;
    sim.clearRaidRivals();
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 40;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 4;
    sim.colony.heavySoldierAnts = 0;
    sim.colony.shieldHeadAnts = 1;
    sim.colony.acidShooterAnts = 0;
    sim.colony.nestLevel = 3;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.shieldHeadBrood = 1;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: sim.raidApproachAngle(),
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const shield = sim.deployedSoldiers().find((ant: any) => ant.variant === "shieldHead");
    if (!shield || !rival) return { sortieStarted, shieldFound: Boolean(shield), rivalFound: Boolean(rival) };

    const block = sim.shieldHeadBlockPoint(shield);
    const initialTarget = sim.currentSortieTarget(shield.x, shield.z) ?? sim.raidSignalPoint(sim.ensureRaidState(), 0.78);
    const initialRivalDistance = Math.hypot(rival.x - sim.nest.x, rival.z - sim.nest.z);
    const frontlineDistance = Math.hypot(block.x - sim.nest.x, block.z - sim.nest.z);
    const blockDistanceToInitialTarget = Math.hypot(block.x - initialTarget.x, block.z - initialTarget.z);
    const forward = { x: Math.sin(block.angle), z: Math.cos(block.angle) };
    shield.x = block.x;
    shield.z = block.z;
    shield.prevX = shield.x;
    shield.prevZ = shield.z;
    shield.state = "explore";
    shield.sortieTimer = 30;
    shield.braceIntent = 0;
    shield.lastTacticalAction = "idle";
    for (const ant of sim.ants) {
      if (ant === shield) continue;
      ant.x = block.x + 60 + ant.id * 0.1;
      ant.z = block.z + 60;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    rival.x = block.x + forward.x * 8.4;
    rival.z = block.z + forward.z * 8.4;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.defeated = false;
    rival.leftRaid = false;
    const before = { x: shield.x, z: shield.z };

    const handled = shield.updateShieldHead(1 / 60, sim, { x: 0, z: 0 });
    const renderState = shield.renderState(sim, 1);
    const slowAtBlock = sim.rivalSpeedAt(block.x + forward.x * 2, block.z + forward.z * 2);
    const farSpeed = sim.rivalSpeedAt(block.x + 80, block.z + 80);
    const braceBonus = sim.braceBonusAt(block.x + forward.x * 2, block.z + forward.z * 2);
    const pressureWithoutShield = 1;
    const pressureWithShield = Math.max(0.28, 1 - sim.shieldBlockStrengthAt(rival.x, rival.z) * 0.42);
    const blockAction = shield.lastTacticalAction;
    rival.x = block.x + forward.x * 3;
    rival.z = block.z + forward.z * 3;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    const rivalDistanceBeforePush = Math.hypot(rival.x - sim.nest.x, rival.z - sim.nest.z);
    const contactResolved = rival.resolveAntContacts(sim);
    const rivalDistanceAfterPush = Math.hypot(rival.x - sim.nest.x, rival.z - sim.nest.z);
    const pushAction = shield.lastTacticalAction;
    const noClashAfterPush = shield.state !== "clash" && !rival.clash;
    const coverStrength = sim.shieldCoverStrengthAt(block.x - forward.x * 4, block.z - forward.z * 4);
    rival.x = block.x + forward.x * 80;
    rival.z = block.z + forward.z * 80;
    const followSteering = { x: 0, z: 0 };
    const followHandled = shield.updateShieldHead(1 / 60, sim, followSteering);
    const followIntent = Math.hypot(followSteering.x, followSteering.z);
    const followAction = shield.lastTacticalAction;
    sim.renderGame(1);

    return {
      sortieStarted,
      shieldFound: true,
      rivalFound: true,
      handled,
      action: blockAction,
      contactResolved,
      pushAction,
      noClashAfterPush,
      pushedOutward: rivalDistanceAfterPush > rivalDistanceBeforePush,
      fightCooldownAfterPush: rival.fightCooldown,
      coverStrength,
      initialRivalDistance,
      frontlineDistance,
      frontlineRatio: frontlineDistance / Math.max(1, initialRivalDistance),
      blockDistanceToInitialTarget,
      followHandled,
      followIntent,
      followAction,
      shieldPose: renderState.shieldPose,
      slowAtBlock,
      farSpeed,
      braceBonus,
      pressureWithoutShield,
      pressureWithShield,
      plateMeshCount: sim.antRenderer.shieldPlateMesh.count,
      shieldRoleLabel: sim.roleLabelSystem.textures.has("shieldHead"),
      shieldConfig: sim.getAntVariantConfig("shieldHead"),
      heavyConfig: sim.getAntVariantConfig("heavySoldier"),
    };
  });

  expect(result.sortieStarted).toBe(true);
  expect(result.shieldFound).toBe(true);
  expect(result.rivalFound).toBe(true);
  expect(result.handled).toBe(true);
  expect(["shieldBlock", "shieldMove"]).toContain(result.action);
  expect(result.contactResolved).toBe(true);
  expect(result.pushAction).toBe("shieldPush");
  expect(result.noClashAfterPush).toBe(true);
  expect(result.pushedOutward).toBe(true);
  expect(result.fightCooldownAfterPush).toBeGreaterThan(0);
  expect(result.coverStrength).toBeGreaterThan(0);
  expect(result.frontlineDistance).toBeGreaterThan(56);
  expect(result.frontlineDistance).toBeLessThan(result.initialRivalDistance);
  expect(result.frontlineRatio).toBeGreaterThan(0.34);
  expect(result.blockDistanceToInitialTarget).toBeLessThan(result.initialRivalDistance * 0.34);
  expect(result.followHandled).toBe(true);
  expect(["shieldBlock", "shieldMove"]).toContain(result.followAction);
  if (result.followAction === "shieldMove") {
    expect(result.followIntent).toBeGreaterThan(0);
  }
  expect(result.shieldPose).toBeGreaterThan(0.3);
  expect(result.slowAtBlock).toBeLessThan(result.farSpeed);
  expect(result.braceBonus).toBeGreaterThan(0);
  expect(result.pressureWithShield).toBeLessThan(result.pressureWithoutShield);
  expect(result.plateMeshCount).toBeGreaterThan(0);
  expect(result.shieldRoleLabel).toBe(true);
  expect(result.shieldConfig.headScale).toBeGreaterThan(result.heavyConfig.headScale);
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
    sim.colony.builderAnts = 4;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 4;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.chamberExcavation = 1;
    sim.colony.upgrades.builderTraining = 2;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.setPanelCompact(false, false);
    sim.setActiveTab("construction");
    sim.updateStats();
  });

  await page.locator("#constructionTrailBtn").click();
  await page.locator("#constructionBarricadeBtn").click();
  const pendingBarricade = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const point = { x: sim.nest.x + 18, z: sim.nest.z - 12 };
    sim.updateConstructionPlacementPreview(point);
    sim.updateStats();
    const previewChildren = sim.wallPlacementPreview?.children ?? [];
    return {
      pendingKind: sim.pendingConstructionKind,
      taskKinds: sim.buildTasks.map((task: any) => task.kind).sort(),
      barricadeButtonText: (document.querySelector("#constructionBarricadeBtn") as HTMLButtonElement).textContent,
      activeToolLabel: (document.querySelector("#activeToolLabel") as HTMLElement).textContent,
      hasPlacementPreview: Boolean(sim.wallPlacementPreview),
      hasPlacementGuide: Boolean(sim.wallPlacementGuide),
      previewChildNames: previewChildren.map((child: any) => child.name).sort(),
      target: sim.constructionTarget("lowBarricade", point),
      expectedTarget: point,
    };
  });
  expect(pendingBarricade.pendingKind).toBe("lowBarricade");
  expect(pendingBarricade.taskKinds).toEqual(["trailReinforce"]);
  expect(pendingBarricade.barricadeButtonText).toContain("場所指定中");
  expect(pendingBarricade.activeToolLabel).toContain("場所指定中");
  expect(pendingBarricade.hasPlacementPreview).toBe(true);
  expect(pendingBarricade.hasPlacementGuide).toBe(false);
  expect(pendingBarricade.previewChildNames).toContain("lowBarricade-placement-footprint");
  expect(pendingBarricade.previewChildNames).toContain("lowBarricade-placement-point");
  expect(pendingBarricade.target.x).toBeCloseTo(pendingBarricade.expectedTarget.x, 5);
  expect(pendingBarricade.target.z).toBeCloseTo(pendingBarricade.expectedTarget.z, 5);
  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.confirmConstructionPlacement({ x: sim.nest.x + 18, z: sim.nest.z - 12 }, null, "lowBarricade");
  });

  await page.locator("#constructionSentryBtn").click();
  const pendingSentry = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const point = { x: sim.nest.x - 16, z: sim.nest.z + 28 };
    sim.updateConstructionPlacementPreview(point);
    sim.updateStats();
    const previewChildren = sim.wallPlacementPreview?.children ?? [];
    return {
      pendingKind: sim.pendingConstructionKind,
      taskKinds: sim.buildTasks.map((task: any) => task.kind).sort(),
      sentryButtonText: (document.querySelector("#constructionSentryBtn") as HTMLButtonElement).textContent,
      activeToolLabel: (document.querySelector("#activeToolLabel") as HTMLElement).textContent,
      hasPlacementPreview: Boolean(sim.wallPlacementPreview),
      previewChildNames: previewChildren.map((child: any) => child.name).sort(),
      target: sim.constructionTarget("sentryMound", point),
      expectedTarget: point,
    };
  });
  expect(pendingSentry.pendingKind).toBe("sentryMound");
  expect(pendingSentry.taskKinds).toEqual(["lowBarricade", "trailReinforce"]);
  expect(pendingSentry.sentryButtonText).toContain("場所指定中");
  expect(pendingSentry.activeToolLabel).toContain("場所指定中");
  expect(pendingSentry.hasPlacementPreview).toBe(true);
  expect(pendingSentry.previewChildNames).toContain("sentryMound-placement-footprint");
  expect(pendingSentry.previewChildNames).toContain("sentryMound-placement-point");
  expect(pendingSentry.target.x).toBeCloseTo(pendingSentry.expectedTarget.x, 5);
  expect(pendingSentry.target.z).toBeCloseTo(pendingSentry.expectedTarget.z, 5);
  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.confirmConstructionPlacement({ x: sim.nest.x - 16, z: sim.nest.z + 28 }, null, "sentryMound");
  });

  await page.locator("#constructionWallBtn").click();
  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.addWallPlacementVertex({ x: sim.nest.x + 15, z: sim.nest.z - 18 });
    sim.addWallPlacementVertex({ x: sim.nest.x + 43, z: sim.nest.z - 10 });
    sim.wallPlacementDraft.hover = sim.snapWallPlacementPoint({ x: sim.nest.x + 34, z: sim.nest.z + 14 });
    sim.updateWallPlacementPreview();
  });

  const pendingWall = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.updateStats();
    const guideChildren = sim.wallPlacementGuide?.children ?? [];
    const guideLines = guideChildren.filter((child: any) => child.name === "earth-wall-placement-line");
    const confirmButton = document.querySelector("#constructionWallConfirmBtn") as HTMLButtonElement;
    return {
      pendingKind: sim.pendingConstructionKind,
      taskKinds: sim.buildTasks.map((task: any) => task.kind).sort(),
      wallButtonText: (document.querySelector("#constructionWallBtn") as HTMLButtonElement).textContent,
      confirmButtonHidden: confirmButton.hidden,
      confirmButtonDisabled: confirmButton.disabled,
      confirmButtonText: confirmButton.textContent,
      activeToolLabel: (document.querySelector("#activeToolLabel") as HTMLElement).textContent,
      hasWallPlacementPreview: Boolean(sim.wallPlacementPreview),
      hasWallPlacementGuide: Boolean(sim.wallPlacementGuide),
      guideChildNames: guideChildren.map((child: any) => child.name).sort(),
      guideLineCount: guideLines.length,
      firstGuideLineRelativeX: guideLines[0] ? guideLines[0].position.x - sim.nest.x : undefined,
      firstGuideLineRelativeZ: guideLines[0] ? guideLines[0].position.z - sim.nest.z : undefined,
      firstGuideLineRotation: guideLines[0]?.rotation.y,
      firstGuideLineLength: guideLines[0]?.scale.x,
      fixedTargetCount: sim.wallPlacementTargetsFromDraft(false).length,
      previewTargetCount: sim.wallPlacementTargetsFromDraft(true).length,
      fixedMetrics: sim.wallPlacementMetrics(sim.wallPlacementTargetsFromDraft(false), sim.wallPlacementPoints(false)),
      previewMetrics: sim.wallPlacementMetrics(sim.wallPlacementTargetsFromDraft(true), sim.wallPlacementPoints(true)),
    };
  });

  expect(pendingWall.pendingKind).toBe("earthWall");
  expect(pendingWall.taskKinds).toEqual(["lowBarricade", "sentryMound", "trailReinforce"]);
  expect(pendingWall.wallButtonText).toContain("一筆線指定中");
  expect(pendingWall.confirmButtonHidden).toBe(false);
  expect(pendingWall.confirmButtonDisabled).toBe(false);
  expect(pendingWall.confirmButtonText).toContain("土壁の一筆線を決定");
  expect(pendingWall.activeToolLabel).toContain("一筆線指定中");
  expect(pendingWall.hasWallPlacementPreview).toBe(true);
  expect(pendingWall.hasWallPlacementGuide).toBe(true);
  expect(pendingWall.guideChildNames.filter((name: string) => name === "earth-wall-placement-line")).toHaveLength(2);
  expect(pendingWall.guideChildNames).toContain("earth-wall-placement-start");
  expect(pendingWall.guideChildNames).toContain("earth-wall-placement-vertex");
  expect(pendingWall.guideChildNames).toContain("earth-wall-placement-end");
  expect(pendingWall.guideLineCount).toBe(2);
  expect(pendingWall.fixedTargetCount).toBe(1);
  expect(pendingWall.previewTargetCount).toBe(2);
  expect(pendingWall.fixedMetrics.vertexCount).toBe(2);
  expect(pendingWall.previewMetrics.vertexCount).toBe(3);
  expect(pendingWall.previewMetrics.totalLength).toBeCloseTo(Math.hypot(28, 8) + Math.hypot(9, 24), 5);
  expect(pendingWall.firstGuideLineRelativeX).toBeCloseTo(29, 5);
  expect(pendingWall.firstGuideLineRelativeZ).toBeCloseTo(-14, 5);
  expect(pendingWall.firstGuideLineRotation).toBeCloseTo(-Math.atan2(8, 28), 5);
  expect(pendingWall.firstGuideLineLength).toBeCloseTo(Math.hypot(28, 8), 5);

  await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.addWallPlacementVertex({ x: sim.nest.x + 34, z: sim.nest.z + 14 });
    sim.updateStats();
  });
  await page.locator("#constructionWallConfirmBtn").click();

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.updateStats();
    const wallTasks = sim.buildTasks.filter((task: any) => task.kind === "earthWall");
    const firstLineLength = Math.hypot(28, 8);
    const secondLineLength = Math.hypot(9, 24);
    const expectedLineCost = sim.earthWallBuildCostForLength(firstLineLength) + sim.earthWallBuildCostForLength(secondLineLength);
    const confirmButton = document.querySelector("#constructionWallConfirmBtn") as HTMLButtonElement;
    return {
      activeTab: sim.activeTab,
      tabText: document.querySelector(".panel-tabs")?.textContent ?? "",
      growthActive: document.querySelector("#growthTab")?.classList.contains("active") ?? false,
      constructionActive: document.querySelector("#constructionTab")?.classList.contains("active") ?? false,
      pendingKind: sim.pendingConstructionKind,
      taskKinds: sim.buildTasks.map((task: any) => task.kind).sort(),
      earthworkKinds: sim.earthworks.map((earthwork: any) => earthwork.kind).sort(),
      wallTaskCount: wallTasks.length,
      wallTaskX: wallTasks[0]?.x,
      wallTaskZ: wallTasks[0]?.z,
      wallTaskRotation: wallTasks[0]?.rotation,
      wallTaskRadius: wallTasks[0]?.radius,
      wallTaskCost: wallTasks.reduce((sum: number, task: any) => sum + task.maxProgress, 0),
      expectedWallTaskX: sim.nest.x + (15 + 43) / 2,
      expectedWallTaskZ: sim.nest.z + (-18 - 10) / 2,
      wallExpectedRotation: Math.atan2(8, 28),
      expectedLineCost,
      confirmButtonHidden: confirmButton.hidden,
      builderCountText: (document.querySelector("#constructionBuilders") as HTMLElement).textContent,
      activeCountText: (document.querySelector("#constructionActive") as HTMLElement).textContent,
      statusText: (document.querySelector("#constructionStatus") as HTMLElement).textContent,
      crewText: (document.querySelector("#constructionCrew") as HTMLElement).textContent,
      progressText: (document.querySelector("#constructionProgressList") as HTMLElement).textContent,
      progressRows: document.querySelectorAll("#constructionProgressList .construction-task").length,
      taskAssigneeCounts: sim.buildTasks.map((task: any) => sim.constructionAssignees(task).length).sort(),
      taskAssigneeTargets: sim.buildTasks.map((task: any) => task.assigneeTarget).sort(),
      taskAssigneeTotal: sim.buildTasks.reduce((sum: number, task: any) => sum + sim.constructionAssignees(task).length, 0),
      taskAssigneeLimit: sim.buildTaskAssigneeLimit(),
      crewControlCount: document.querySelectorAll("#constructionProgressList .construction-crew-controls button").length,
      trailButtonText: (document.querySelector("#constructionTrailBtn") as HTMLButtonElement).textContent,
      barricadeButtonText: (document.querySelector("#constructionBarricadeBtn") as HTMLButtonElement).textContent,
      wallButtonText: (document.querySelector("#constructionWallBtn") as HTMLButtonElement).textContent,
      sentryButtonText: (document.querySelector("#constructionSentryBtn") as HTMLButtonElement).textContent,
      trailButtonTitle: (document.querySelector("#constructionTrailBtn") as HTMLButtonElement).title,
      barricadeButtonTitle: (document.querySelector("#constructionBarricadeBtn") as HTMLButtonElement).title,
      wallButtonTitle: (document.querySelector("#constructionWallBtn") as HTMLButtonElement).title,
      sentryButtonTitle: (document.querySelector("#constructionSentryBtn") as HTMLButtonElement).title,
      trailDisabledAfterCommand: (document.querySelector("#constructionTrailBtn") as HTMLButtonElement).disabled,
      savedEarthworks: sim.colony.earthworks.length,
      hasWallPlacementPreview: Boolean(sim.wallPlacementPreview),
      hasWallPlacementGuide: Boolean(sim.wallPlacementGuide),
    };
  });

  expect(result.activeTab).toBe("construction");
  expect(result.tabText).toContain("土木");
  expect(result.growthActive).toBe(false);
  expect(result.constructionActive).toBe(true);
  expect(result.pendingKind).toBeNull();
  expect(result.taskKinds).toEqual(["earthWall", "earthWall", "lowBarricade", "sentryMound", "trailReinforce"]);
  expect(result.earthworkKinds).toEqual(["earthWall", "earthWall", "lowBarricade", "sentryMound", "trailReinforce"]);
  expect(result.wallTaskCount).toBe(2);
  expect(result.wallTaskX).toBeCloseTo(result.expectedWallTaskX, 5);
  expect(result.wallTaskZ).toBeCloseTo(result.expectedWallTaskZ, 5);
  expect(Math.abs(result.wallTaskRotation - result.wallExpectedRotation)).toBeLessThan(0.001);
  expect(result.wallTaskRadius).toBeGreaterThan(12);
  expect(result.wallTaskCost).toBeCloseTo(result.expectedLineCost, 5);
  expect(result.wallTaskCost).not.toBe(7.2);
  expect(result.confirmButtonHidden).toBe(true);
  expect(result.hasWallPlacementPreview).toBe(false);
  expect(result.hasWallPlacementGuide).toBe(false);
  expect(result.builderCountText).toBe("4");
  expect(result.activeCountText).toBe("5");
  expect(result.statusText).toContain("作業中");
  expect(result.statusText).toContain("平均");
  expect(result.crewText).toContain("待機");
  expect(result.progressText).toContain("採餌道");
  expect(result.progressText).toContain("低い土塁");
  expect(result.progressText).toContain("大きな土壁");
  expect(result.progressText).toContain("見張り塚");
  expect(result.progressText).toContain("工数");
  expect(result.progressText).toContain("目安");
  expect(result.progressText).toContain("目標 1/4");
  expect(result.trailButtonText).toContain("工数2.8");
  expect(result.trailButtonText).toContain("運搬");
  expect(result.barricadeButtonText).toContain("工数3.6");
  expect(result.barricadeButtonText).toContain("敵減速");
  expect(result.wallButtonText).toContain("工数7.2");
  expect(result.wallButtonText).toContain("壁上攻撃");
  expect(result.sentryButtonText).toContain("工数4.4");
  expect(result.sentryButtonText).toContain("敵襲方角");
  expect(result.trailButtonTitle).toContain("距離・担当数で変動");
  expect(result.trailButtonTitle).toContain("工数 2.8");
  expect(result.trailButtonTitle).toContain("味方の移動");
  expect(result.barricadeButtonTitle).toContain("距離・担当数で変動");
  expect(result.barricadeButtonTitle).toContain("重兵装");
  expect(result.wallButtonTitle).toContain("工数 7.2");
  expect(result.wallButtonTitle).toContain("長め");
  expect(result.wallButtonTitle).toContain("敵の侵入");
  expect(result.sentryButtonTitle).toContain("工数 4.4");
  expect(result.sentryButtonTitle).toContain("敵襲の方角");
  expect(result.taskAssigneeCounts.every((count: number) => count <= result.taskAssigneeLimit)).toBe(true);
  expect(result.taskAssigneeTargets).toEqual([1, 1, 1, 1, 1]);
  expect(result.taskAssigneeTotal).toBeGreaterThanOrEqual(3);
  expect(result.taskAssigneeTotal).toBeLessThanOrEqual(4);
  expect(result.taskAssigneeLimit).toBe(4);
  expect(result.progressRows).toBe(5);
  expect(result.crewControlCount).toBe(10);
  expect(result.trailDisabledAfterCommand).toBe(true);
  expect(result.savedEarthworks).toBe(5);
});

test("multiple builders can share one construction task", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 54;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 6;
    sim.colony.heavySoldierAnts = 1;
    sim.colony.builderAnts = 10;
    sim.colony.nestLevel = 3;
    sim.colony.territory = 4;
    sim.colony.upgrades.soldierTraining = 1;
    sim.colony.upgrades.heavySoldierBrood = 1;
    sim.colony.upgrades.chamberExcavation = 1;
    sim.colony.upgrades.builderTraining = 5;
    sim.computeDerived();
    sim.syncAntPopulation();
    sim.setPanelCompact(false, false);
    sim.setActiveTab("construction");
    sim.buildTasks = [];
    for (const item of [...sim.earthworks]) sim.disposeDynamicItem(item);
    sim.earthworks = [];

    const task = sim.createBuildTask("trailReinforce", sim.nest.x + 16, sim.nest.z + 4, { radius: 13, maxProgress: 4 });
    const increased = sim.adjustBuildTaskAssigneeTarget(task.id, 2);
    const targetAfterIncrease = task.assigneeTarget;
    const claimsAfterIncrease = task.claimedByIds.length;
    const decreased = sim.adjustBuildTaskAssigneeTarget(task.id, -1);
    const targetAfterDecrease = task.assigneeTarget;
    const claimsAfterDecrease = task.claimedByIds.length;
    const reincreased = sim.adjustBuildTaskAssigneeTarget(task.id, 1);
    const builders = sim.ants.filter((ant: any) => ant.variant === "builder").slice(0, 3);
    const claimedTaskIds = builders.map((builder: any) => sim.claimBuildTask(builder)?.id ?? null);
    const before = task.progress;
    for (const builder of builders) sim.progressBuildTask(task, builder, 0.4);
    sim.updateStats();

    return {
      increased,
      targetAfterIncrease,
      claimsAfterIncrease,
      decreased,
      targetAfterDecrease,
      claimsAfterDecrease,
      reincreased,
      limit: sim.buildTaskAssigneeLimit(),
      claimedTaskIds,
      assigneeTarget: task.assigneeTarget,
      claimedByIds: task.claimedByIds,
      progressGain: task.progress - before,
      progressText: (document.querySelector("#constructionProgressList") as HTMLElement).textContent,
      crewText: (document.querySelector("#constructionCrew") as HTMLElement).textContent,
    };
  });

  expect(result.increased).toBe(true);
  expect(result.targetAfterIncrease).toBe(3);
  expect(result.claimsAfterIncrease).toBe(3);
  expect(result.decreased).toBe(true);
  expect(result.targetAfterDecrease).toBe(2);
  expect(result.claimsAfterDecrease).toBe(2);
  expect(result.reincreased).toBe(true);
  expect(result.limit).toBe(10);
  expect(result.claimedTaskIds).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
  expect(new Set(result.claimedTaskIds).size).toBe(1);
  expect(result.assigneeTarget).toBe(3);
  expect(result.claimedByIds).toHaveLength(3);
  expect(result.progressGain).toBeCloseTo(1.2, 5);
  expect(result.progressText).toContain("担当 3/3");
  expect(result.progressText).toContain("目標 3/10");
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
      trailTarget: trail.assigneeTarget,
      barricadeTarget: barricade.assigneeTarget,
      surfaceBuildersAfter: sim.renderAntBuffer.filter((ant: any) => ant.variant === "builder").length,
      visibleBuilderLabels: sim.roleLabelSystem.sprites.filter((sprite: any) => sprite.visible && sprite.material.map === sim.roleLabelSystem.textures.get("builder")).length,
    };
  });

  expect(result.builderTarget).toBeGreaterThan(result.builderCount);
  expect(result.builderCount).toBe(4);
  expect(result.surfaceBuildersBefore).toBe(0);
  expect(result.idleBuildersInNest).toBe(true);
  expect(result.claimedTaskIds.filter((id: number | null) => id != null)).toHaveLength(2);
  expect(new Set(result.claimedTaskIds.filter((id: number | null) => id != null)).size).toBe(2);
  expect(result.trailClaims).toBe(1);
  expect(result.barricadeClaims).toBe(1);
  expect(result.trailTarget).toBe(1);
  expect(result.barricadeTarget).toBe(1);
  expect(result.surfaceBuildersAfter).toBe(2);
  expect(result.visibleBuilderLabels).toBe(2);
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

    const wallTask = sim.createBuildTask("earthWall", sim.nest.x + 18, sim.nest.z - 8, { radius: 14, maxProgress: 1, rotation: Math.PI / 2 });
    sim.progressBuildTask(wallTask, builder, 1);
    sim.updateEarthworks();
    const wall = sim.earthworks.find((item: any) => item.kind === "earthWall");
    const wallTop = sim.earthWallWorldPoint(wall, 0, 0);
    heavy.x = wallTop.x;
    heavy.z = wallTop.z;
    heavy.prevX = wallTop.x;
    heavy.prevZ = wallTop.z;
    heavy.braceIntent = 1;
    const wallRivalSpeed = sim.rivalSpeedAt(wallTop.x, wallTop.z);
    const wallBraceBonus = sim.braceBonusAt(wallTop.x, wallTop.z);
    const wallAttackBonus = sim.wallAttackBonusAt(wallTop.x, wallTop.z);
    const wallElevation = heavy.renderState(sim, 1).y;

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
      wallRivalSpeed,
      wallBraceBonus,
      wallAttackBonus,
      wallElevation,
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
  expect(result.wallRivalSpeed).toBeLessThan(result.rivalSpeed);
  expect(result.wallBraceBonus).toBeGreaterThan(result.braceBonus);
  expect(result.wallAttackBonus).toBeGreaterThan(1);
  expect(result.wallElevation).toBeGreaterThan(0.7);
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
    const branches = [...document.querySelectorAll(".upgrade-branch strong")].map((node) => node.textContent);
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
      shieldHeadBrood: 4,
      acidShooterBrood: 4,
      scoutBrood: 4,
      medicBrood: 4,
      captainBrood: 3,
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
      carryRatio: maxed.forageCarryMultiplier / base.forageCarryMultiplier,
      speedRatio: maxed.forageSpeedMultiplier / base.forageSpeedMultiplier,
      growthRatio: maxed.growthPerSecond / base.growthPerSecond,
      capacityRatio: maxed.capacity / base.capacity,
      defensePower: maxed.defensePower,
      attackPower: maxed.attackPower,
      threatGrowthMultiplier: maxed.threatGrowthMultiplier,
    };
  });

  expect(tree.buttonCount).toBeGreaterThanOrEqual(15);
  expect(tree.branches).toEqual(["採餌", "育房", "巣構造", "防衛"]);
  expect(tree.lockedBefore).toBe(true);
  expect(tree.unlockedAfterPrereq).toBe(true);
  expect(tree.foodRateRatio).toBeGreaterThan(3);
  expect(tree.foodRateRatio).toBeLessThan(4.2);
  expect(tree.carryRatio).toBeGreaterThan(2.3);
  expect(tree.speedRatio).toBeGreaterThan(1.45);
  expect(tree.growthRatio).toBeGreaterThan(5);
  expect(tree.growthRatio).toBeLessThan(7.6);
  expect(tree.capacityRatio).toBeGreaterThan(2.6);
  expect(tree.capacityRatio).toBeLessThan(3.7);
  expect(tree.attackPower).toBeLessThan(2.2);
  expect(tree.defensePower).toBeLessThan(2.8);
  expect(tree.threatGrowthMultiplier).toBeGreaterThanOrEqual(0.55);
});

test("rival raids warn first and enter from the hidden enemy nest", async ({ page }) => {
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
      rivals: sim.raidRivals().length,
      activeCount: sim.colony.raidState.activeCount,
      log: sim.colony.battleLog.join("\n"),
    };

    sim.colony.raidState.timer = 0.01;
    sim.updateRaid(0.02);
    const activePhase = sim.colony.raidState.phase;
    sim.updateStats();
    const rivals = sim.raidRivals();
    const minNestDistance = Math.min(...rivals.map((rival: any) => Math.hypot(rival.x - sim.nest.x, rival.z - sim.nest.z)));
    const spawnRadii = rivals.map((rival: any) => Math.hypot(rival.x - sim.rivalNest.x, rival.z - sim.rivalNest.z));
    const approachAngle = sim.colony.raidState.approachAngle ?? 0;
    const flankX = -Math.sin(approachAngle);
    const flankZ = Math.cos(approachAngle);
    const spawnLateral = rivals.map((rival: any) => rival.x * flankX + rival.z * flankZ);
    const targetLateral = rivals.map((rival: any) => rival.raidTargetX * flankX + rival.raidTargetZ * flankZ);
    const exitRadii = rivals.map((rival: any) => Math.hypot(rival.homeX - sim.rivalNest.x, rival.homeZ - sim.rivalNest.z));
    const minRivalNestDistance = Math.min(...spawnRadii);
    const maxRivalNestDistance = Math.max(...spawnRadii);
    const spawnDepthSpread = Math.max(...spawnRadii) - Math.min(...spawnRadii);
    const spawnLateralSpread = Math.max(...spawnLateral) - Math.min(...spawnLateral);
    const targetLateralSpread = Math.max(...targetLateral) - Math.min(...targetLateral);
    const maxExitDistance = Math.max(...exitRadii);
    const nestAttackers = rivals.filter((rival: any) => rival.raidTargetKind === "nest");
    const maxNestAttackTargetDistance = Math.max(
      ...nestAttackers.map((rival: any) => Math.hypot(rival.raidTargetX - sim.nest.x, rival.raidTargetZ - sim.nest.z)),
    );
    return {
      warning,
      largeNestRaidCount,
      activePhase,
      phaseAfterStats: sim.colony.raidState.phase,
      activeCount: sim.colony.raidState.activeCount,
      rivalCount: rivals.length,
      minNestDistance,
      minRivalNestDistance,
      maxRivalNestDistance,
      spawnDepthSpread,
      spawnLateralSpread,
      targetLateralSpread,
      maxExitDistance,
      nestAttackerCount: nestAttackers.length,
      expectedNestAttackerCount: Math.max(1, Math.ceil(rivals.length / 8)),
      maxNestAttackTargetDistance,
      nestRadius: sim.nest.radius,
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
  expect(raid.minRivalNestDistance).toBeGreaterThan(8);
  expect(raid.maxRivalNestDistance).toBeLessThan(52);
  expect(raid.spawnDepthSpread).toBeGreaterThan(2);
  expect(raid.spawnLateralSpread).toBeGreaterThan(12);
  expect(raid.targetLateralSpread).toBeGreaterThan(6);
  expect(raid.maxExitDistance).toBeLessThan(8);
  expect(raid.nestAttackerCount).toBe(raid.expectedNestAttackerCount);
  expect(raid.maxNestAttackTargetDistance).toBeLessThanOrEqual(raid.nestRadius);
  expect(raid.log).toContain("敵巣方面");
  expect(raid.log).toContain("敵襲開始");
});

test("sentry mounds reveal raid direction and set warning formation", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const clearTrails = () => {
      for (const trail of [...sim.trails]) sim.disposeDynamicItem(trail);
      sim.trails = [];
    };
    const resetWarning = () => {
      sim.clearRaidRivals();
      clearTrails();
      sim.colony.raidState = {
        phase: "calm",
        timer: 0.01,
        wave: 0,
        activeCount: 0,
        approachAngle: 0,
        signalTimer: 0,
        breachTimer: 0,
        casualties: 0,
        enemyCasualties: 0,
        lastOutcome: "none",
      };
      sim.updateRaid(0.02);
    };

    sim.colony.food = 100000;
    sim.colony.lifetimeFood = 100000;
    sim.colony.antPopulation = 54;
    sim.colony.woundedAnts = 0;
    sim.colony.soldierAnts = 10;
    sim.colony.heavySoldierAnts = 2;
    sim.colony.nestLevel = 4;
    sim.colony.territory = 5;
    sim.colony.enemyThreat = 3;
    sim.colony.upgrades.soldierTraining = 2;
    sim.colony.upgrades.heavySoldierBrood = 2;
    sim.computeDerived();
    sim.syncAntPopulation();

    resetWarning();
    const noSentry = {
      phase: sim.colony.raidState.phase,
      timer: sim.colony.raidState.timer,
      hasIntel: sim.hasRaidDirectionIntel(),
      target: sim.currentSortieTarget(),
      alarmTrails: sim.trails.filter((trail: any) => trail.kind === "alarm").length,
      notice: sim.raidNotice.message,
      log: sim.colony.battleLog.join("\n"),
    };

    sim.addEarthwork({
      id: sim.colony.nextEarthworkId++,
      kind: "sentryMound",
      x: sim.nest.x + 18,
      z: sim.nest.z - 4,
      radius: 8,
      progress: 4.4,
      maxProgress: 4.4,
      strength: 1,
      rotation: 0,
      owner: "colony",
    });
    sim.updateEarthworks();
    const sentryWarningSeconds = sim.raidWarningSeconds();
    resetWarning();
    const sentryTarget = sim.currentSortieTarget();
    sim.soldierSortieCooldown = 0;
    const sortieStarted = sim.startSoldierSortie();
    const deployed = sim.deployedSoldiers();
    const raid = sim.ensureRaidState();
    for (const ant of deployed) {
      const steering = { x: 0, z: 0 };
      if (ant.variant === "heavySoldier") ant.updateHeavySoldier(1 / 60, sim, steering);
      else ant.updateSortiePatrol(1 / 60, sim, steering);
    }
    const formationTargets = deployed.map((ant: any) => sim.raidFormationPointForAnt(ant, raid));
    const angle = raid.approachAngle ?? 0;
    const forwardX = Math.cos(angle);
    const forwardZ = Math.sin(angle);
    const flankX = -forwardZ;
    const flankZ = forwardX;
    const forwardDistances = formationTargets.map((point: any) => (point.x - sim.nest.x) * forwardX + (point.z - sim.nest.z) * forwardZ);
    const flankOffsets = formationTargets.map((point: any) => (point.x - sim.nest.x) * flankX + (point.z - sim.nest.z) * flankZ);
    const sentry = {
      phase: sim.colony.raidState.phase,
      timer: sim.colony.raidState.timer,
      warningSeconds: sentryWarningSeconds,
      hasIntel: sim.hasRaidDirectionIntel(),
      targetKind: sentryTarget?.kind,
      alarmTrails: sim.trails.filter((trail: any) => trail.kind === "alarm").length,
      sortieStarted,
      deployedCount: deployed.length,
      formationKinds: formationTargets.map((point: any) => point.kind),
      assignedFormationTargets: deployed.filter((ant: any) => ant.sortieTargetX != null && ant.sortieTargetZ != null).length,
      minForwardDistance: Math.min(...forwardDistances),
      flankSpread: Math.max(...flankOffsets) - Math.min(...flankOffsets),
      notice: sim.raidNotice.message,
      log: sim.colony.battleLog.join("\n"),
    };

    return { noSentry, sentry };
  });

  expect(result.noSentry.phase).toBe("warning");
  expect(result.noSentry.hasIntel).toBe(false);
  expect(result.noSentry.target).toBeNull();
  expect(result.noSentry.alarmTrails).toBe(0);
  expect(result.noSentry.notice).toContain("方角不明");
  expect(result.noSentry.log).toContain("方角不明");

  expect(result.sentry.phase).toBe("warning");
  expect(result.sentry.hasIntel).toBe(true);
  expect(result.sentry.warningSeconds).toBeGreaterThan(result.noSentry.timer);
  expect(result.sentry.timer).toBeGreaterThan(result.noSentry.timer);
  expect(result.sentry.targetKind).toBe("raid-signal");
  expect(result.sentry.alarmTrails).toBeGreaterThan(0);
  expect(result.sentry.sortieStarted).toBe(true);
  expect(result.sentry.deployedCount).toBeGreaterThan(1);
  expect(result.sentry.formationKinds.every((kind: string) => kind === "raid-formation")).toBe(true);
  expect(result.sentry.assignedFormationTargets).toBe(result.sentry.deployedCount);
  expect(result.sentry.minForwardDistance).toBeGreaterThan(18);
  expect(result.sentry.flankSpread).toBeGreaterThan(3);
  expect(result.sentry.notice).toContain("見張り塚");
  expect(result.sentry.log).toContain("見張り塚");
  expect(result.sentry.log).toContain("布陣");
});

test("rival nest workers scale up and start contact fights", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    const baseTarget = sim.rivalNestWorkerTargetCount();
    const baseWorkers = sim.rivalNestWorkers().length;

    sim.colony.enemyThreat = 42;
    sim.colony.nestLevel = 7;
    sim.colony.territory = 16;
    sim.colony.antPopulation = 180;
    sim.computeDerived();
    const scaledTarget = sim.rivalNestWorkerTargetCount();
    sim.spawnRivalNestWorkers();
    const enemyWorkers = sim.rivalNestWorkers();

    const setupAnt = (ant: any, variant: string, x: number, z: number, sortie = false) => {
      ant.setVariant?.(variant);
      ant.role = sortie ? "guard" : "worker";
      ant.isSortieSoldier = sortie;
      ant.sortieTimer = sortie ? 30 : 0;
      ant.currentTask = sortie ? "sortie" : "explore";
      ant.state = "explore";
      ant.inNest = false;
      ant.nestStayTimer = 0;
      ant.fleeTimer = 0;
      ant.stun = 0;
      ant.clashTimer = 0;
      ant.clashRival = null;
      ant.carrying = 0;
      ant.x = x;
      ant.z = z;
      ant.prevX = x;
      ant.prevZ = z;
      ant.angle = 0;
      ant.prevAngle = 0;
    };
    const setupEnemy = (rival: any, x: number, z: number) => {
      rival.x = x;
      rival.z = z;
      rival.prevX = x;
      rival.prevZ = z;
      rival.retreat = 0;
      rival.leftRaid = false;
      rival.defeated = false;
      rival.clash = null;
      rival.fightCooldown = 0;
      rival.combatDamage = 0;
      rival.state = "rival";
      rival.aggression = 0.14;
      rival.stubbornness = 0.24;
      rival.scale = 0.9;
    };

    const workerEnemy = enemyWorkers[0];
    const workerAnt = sim.ants[0];
    const workerX = sim.rivalNest.x - 12;
    const workerZ = sim.rivalNest.z;
    setupEnemy(workerEnemy, workerX, workerZ);
    setupAnt(workerAnt, "worker", workerX + 0.45, workerZ, false);
    const workerCombatPower = workerEnemy.combatPowers(workerAnt, sim).rivalPower;
    const workerContactStarted = workerEnemy.resolveAntContacts(sim);
    const workerContactState = workerAnt.state;
    const workerEnemyGrapplers = workerEnemy.clash?.ants?.length ?? 0;

    const attackerEnemy = enemyWorkers.find((rival: any) => rival !== workerEnemy);
    const attackerAnt = sim.ants.find((ant: any) => ant !== workerAnt);
    const attackerX = sim.rivalNest.x + 12;
    const attackerZ = sim.rivalNest.z;
    setupEnemy(attackerEnemy, attackerX, attackerZ);
    setupAnt(attackerAnt, "soldier", attackerX + 0.45, attackerZ, true);
    const attackerContactStarted = attackerEnemy.resolveAntContacts(sim);
    const attackerContactState = attackerAnt.state;
    const attackerEnemyGrapplers = attackerEnemy.clash?.ants?.length ?? 0;

    const duelEnemy = enemyWorkers.find((rival: any) => rival !== workerEnemy && rival !== attackerEnemy);
    const soloAnt = sim.ants.find((ant: any) => ant !== workerAnt && ant !== attackerAnt);
    const partnerAnt = sim.ants.find((ant: any) => ant !== workerAnt && ant !== attackerAnt && ant !== soloAnt);
    for (const ant of sim.ants) {
      if (ant === soloAnt || ant === partnerAnt) continue;
      ant.x = sim.rivalNest.x + 90;
      ant.z = sim.rivalNest.z + 30;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.stun = 30;
    }
    const duelX = sim.rivalNest.x;
    const duelZ = sim.rivalNest.z + 6;
    setupEnemy(duelEnemy, duelX, duelZ);
    setupAnt(soloAnt, "soldier", duelX + 0.45, duelZ, true);
    soloAnt.traits.persistence = 0.84;
    soloAnt.traits.caution = 0.84;
    partnerAnt.stun = 30;
    partnerAnt.x = duelX + 30;
    partnerAnt.z = duelZ;
    const soloClashStarted = duelEnemy.startClash(soloAnt, duelX + 0.2, duelZ, sim);
    if (duelEnemy.clash) {
      duelEnemy.clash.elapsed = duelEnemy.clash.duration;
      duelEnemy.finishClash(sim);
    }
    const soloEnemySurvived = sim.rivalAnts.includes(duelEnemy);
    const soloWinner = duelEnemy.lastFightWinner;
    const soloDamage = duelEnemy.combatDamage;

    const pairEnemy = enemyWorkers.find((rival: any) =>
      rival !== workerEnemy && rival !== attackerEnemy && rival !== duelEnemy
    );
    setupEnemy(pairEnemy, duelX, duelZ);
    setupAnt(soloAnt, "soldier", duelX + 0.45, duelZ, true);
    setupAnt(partnerAnt, "soldier", duelX + 0.9, duelZ + 0.3, true);
    for (const ant of [soloAnt, partnerAnt]) {
      ant.traits.persistence = 0.84;
      ant.traits.caution = 0.84;
    }
    const pairClashStarted = pairEnemy.startClash(soloAnt, duelX + 0.2, duelZ, sim);
    const pairGrapplers = pairEnemy.clash?.ants?.length ?? 0;
    if (pairEnemy.clash) {
      pairEnemy.clash.elapsed = pairEnemy.clash.duration;
      pairEnemy.finishClash(sim);
    }
    const pairDefeatedEnemy = !sim.rivalAnts.includes(pairEnemy);

    return {
      baseTarget,
      baseWorkers,
      scaledTarget,
      scaledWorkers: enemyWorkers.length,
      workerCombatPower,
      workerContactStarted,
      workerContactState,
      workerEnemyGrapplers,
      attackerContactStarted,
      attackerContactState,
      attackerEnemyGrapplers,
      soloClashStarted,
      soloEnemySurvived,
      soloWinner,
      soloDamage,
      pairClashStarted,
      pairGrapplers,
      pairDefeatedEnemy,
    };
  });

  expect(result.baseTarget).toBe(9);
  expect(result.baseWorkers).toBe(9);
  expect(result.scaledTarget).toBeGreaterThan(result.baseTarget);
  expect(result.scaledWorkers).toBe(result.scaledTarget);
  expect(result.workerCombatPower).toBeGreaterThan(1.4);
  expect(result.workerCombatPower).toBeLessThan(1.43);
  expect(result.workerContactStarted).toBe(true);
  expect(result.workerContactState).toBe("clash");
  expect(result.workerEnemyGrapplers).toBeGreaterThanOrEqual(1);
  expect(result.attackerContactStarted).toBe(true);
  expect(result.attackerContactState).toBe("clash");
  expect(result.attackerEnemyGrapplers).toBeGreaterThanOrEqual(1);
  expect(result.soloClashStarted).toBe(true);
  expect(result.soloWinner).toBe("colony");
  expect(result.soloEnemySurvived).toBe(true);
  expect(result.soloDamage).toBeGreaterThan(0.2);
  expect(result.soloDamage).toBeLessThan(0.5);
  expect(result.pairClashStarted).toBe(true);
  expect(result.pairGrapplers).toBe(2);
  expect(result.pairDefeatedEnemy).toBe(true);
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

test("nearby rival peels a crowd into separate one-on-one clashes", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.clearRivalNestDefenders();
    const [source, entrant, ...otherRivals] = sim.rivalNestWorkers();
    const [primary, extra, spare] = sim.ants;
    for (const ant of sim.ants) {
      ant.setVariant?.("soldier");
      ant.role = "guard";
      ant.isSortieSoldier = true;
      ant.sortieMode = "defense";
      ant.state = "explore";
      ant.fleeTimer = 0;
      ant.stun = 0;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      ant.clashRival = null;
      ant.x = -90;
      ant.z = -90;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    for (const rival of otherRivals) {
      rival.x = 80;
      rival.z = 80;
      rival.prevX = rival.x;
      rival.prevZ = rival.z;
      rival.clash = null;
      rival.retreat = 0;
      rival.fightCooldown = 8;
    }

    source.isRaidRival = true;
    entrant.isRaidRival = true;
    source.x = 0;
    source.z = 0;
    source.prevX = source.x;
    source.prevZ = source.z;
    source.clash = null;
    source.retreat = 0;
    source.fightCooldown = 0;
    entrant.x = 42;
    entrant.z = 0;
    entrant.prevX = entrant.x;
    entrant.prevZ = entrant.z;
    entrant.clash = null;
    entrant.retreat = 0;
    entrant.fightCooldown = 0;

    const setupAnt = (ant: any, x: number, z: number) => {
      ant.x = x;
      ant.z = z;
      ant.prevX = x;
      ant.prevZ = z;
      ant.state = "explore";
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      ant.clashRival = null;
    };
    setupAnt(primary, 0.45, 0);
    setupAnt(extra, 0.9, 0.35);
    setupAnt(spare, 1.15, -0.45);
    const crowdStarted = source.startClash(primary, 0.2, 0, sim);
    const crowdCount = source.clash?.ants?.length ?? 0;

    entrant.x = 8;
    entrant.z = 0;
    entrant.prevX = entrant.x;
    entrant.prevZ = entrant.z;
    const entrantApproach = entrant.findCrowdedClashApproach(sim)?.rival === source;
    source.updateClash(1 / 60, sim);
    const splitState = {
      sourceIds: source.clash?.ants?.map((ant: any) => ant.id) ?? [],
      entrantIds: entrant.clash?.ants?.map((ant: any) => ant.id) ?? [],
      spareDetached: spare.clashRival == null && spare.state !== "clash",
    };

    for (let i = 0; i < 48; i += 1) {
      source.updateClash(1 / 60, sim);
      entrant.updateClash(1 / 60, sim);
    }

    return {
      crowdStarted,
      crowdCount,
      entrantApproach,
      sourceIds: source.clash?.ants?.map((ant: any) => ant.id) ?? [],
      entrantIds: entrant.clash?.ants?.map((ant: any) => ant.id) ?? [],
      splitState,
      primaryId: primary.id,
      extraId: extra.id,
      spareId: spare.id,
      sourcePrimaryReference: primary.clashRival === source,
      entrantExtraReference: extra.clashRival === entrant,
      spareDetached: spare.clashRival == null && spare.state !== "clash",
    };
  });

  expect(result.crowdStarted).toBe(true);
  expect(result.crowdCount).toBe(3);
  expect(result.entrantApproach).toBe(true);
  expect(result.splitState.sourceIds).toEqual([result.primaryId]);
  expect(result.splitState.entrantIds).toEqual([result.extraId]);
  expect(result.splitState.spareDetached).toBe(true);
  expect(result.sourceIds).toEqual([result.primaryId]);
  expect(result.entrantIds).toEqual([result.extraId]);
  expect(result.sourcePrimaryReference).toBe(true);
  expect(result.entrantExtraReference).toBe(true);
  expect(result.spareDetached).toBe(true);
});

test("a nearby rival already fighting still peels excess grapplers apart", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.clearRivalNestDefenders();
    const [source, occupied, ...otherRivals] = sim.rivalNestWorkers();
    const [primary, extra, spare, occupiedOpponent] = sim.ants;
    for (const ant of sim.ants) {
      ant.setVariant?.("soldier");
      ant.role = "guard";
      ant.isSortieSoldier = true;
      ant.sortieMode = "defense";
      ant.state = "stunned";
      ant.stun = 30;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      ant.clashRival = null;
      ant.x = -90;
      ant.z = -90;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    for (const rival of otherRivals) {
      rival.x = 80;
      rival.z = 80;
      rival.prevX = rival.x;
      rival.prevZ = rival.z;
      rival.clash = null;
      rival.retreat = 0;
      rival.fightCooldown = 8;
    }

    const setupRival = (rival: any, x: number, z: number) => {
      rival.isRaidRival = true;
      rival.x = x;
      rival.z = z;
      rival.prevX = x;
      rival.prevZ = z;
      rival.clash = null;
      rival.retreat = 0;
      rival.fightCooldown = 0;
      rival.defeated = false;
      rival.leftRaid = false;
      rival.peelTargetRivalId = null;
    };
    const setupAnt = (ant: any, x: number, z: number) => {
      ant.state = "explore";
      ant.stun = 0;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      ant.clashRival = null;
      ant.x = x;
      ant.z = z;
      ant.prevX = x;
      ant.prevZ = z;
    };

    setupRival(source, 0, 0);
    setupRival(occupied, 42, 0);
    setupAnt(primary, 0.45, 0);
    setupAnt(extra, 0.9, 0.35);
    setupAnt(spare, 1.15, -0.45);
    setupAnt(occupiedOpponent, 42.45, 0);
    const crowdStarted = source.startClash(primary, 0.2, 0, sim);
    const crowdCount = source.clash?.ants?.length ?? 0;

    occupied.x = 8;
    occupied.z = 0;
    occupied.prevX = occupied.x;
    occupied.prevZ = occupied.z;
    setupAnt(occupiedOpponent, 8.45, 0);
    const occupiedClashStarted = occupied.startClash(occupiedOpponent, 8.2, 0, sim);
    source.updateClash(1 / 60, sim);

    return {
      crowdStarted,
      crowdCount,
      occupiedClashStarted,
      sourceIds: source.clash?.ants?.map((ant: any) => ant.id) ?? [],
      occupiedIds: occupied.clash?.ants?.map((ant: any) => ant.id) ?? [],
      primaryId: primary.id,
      occupiedOpponentId: occupiedOpponent.id,
      extrasReleased: [extra, spare].every((ant: any) => ant.clashRival == null && ant.state !== "clash"),
    };
  });

  expect(result.crowdStarted).toBe(true);
  expect(result.crowdCount).toBe(3);
  expect(result.occupiedClashStarted).toBe(true);
  expect(result.sourceIds).toEqual([result.primaryId]);
  expect(result.occupiedIds).toEqual([result.occupiedOpponentId]);
  expect(result.extrasReleased).toBe(true);
});

test("raid rivals keep cumulative damage across repeated one-on-one clashes", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.antPopulation = 18;
    sim.colony.woundedAnts = 0;
    sim.colony.enemyThreat = 0;
    sim.colony.fallenAnts = 0;
    sim.syncAntPopulation();
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 0,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    const fighters = sim.ants.slice(0, 5);

    for (const ant of sim.ants) {
      ant.setVariant?.("worker");
      ant.role = "worker";
      ant.isSortieSoldier = false;
      ant.state = "stunned";
      ant.stun = 30;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashRival = null;
      ant.x = 80 + ant.id * 0.8;
      ant.z = 80;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }

    rival.x = 0.5;
    rival.z = 0;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.aggression = 0.88;
    rival.stubbornness = 0.85;
    rival.scale = 1.35;
    rival.combatDamage = 0;
    rival.combatDamageFlash = 0;
    rival.acidDebuff = 0;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    rival.defeated = false;
    rival.leftRaid = false;

    const prepareFighter = (ant: any) => {
      ant.setVariant?.("soldier");
      ant.role = "guard";
      ant.isSortieSoldier = true;
      ant.traits.persistence = 0.75;
      ant.traits.caution = 0.72;
      ant.state = "explore";
      ant.stun = 0;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashRival = null;
      ant.carrying = 0;
      ant.energy = 1;
      ant.x = 0;
      ant.z = 0;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
      ant.angle = Math.PI / 2;
    };

    const runSingleClash = (ant: any) => {
      prepareFighter(ant);
      rival.x = 0.5;
      rival.z = 0;
      rival.prevX = rival.x;
      rival.prevZ = rival.z;
      rival.retreat = 0;
      rival.clash = null;
      rival.fightCooldown = 0;
      rival.leftRaid = false;
      const powerBefore = rival.combatPowers(ant, sim).rivalPower;
      const started = rival.startClash(ant, 0.25, 0, sim);
      if (!started || !rival.clash) return { started, winner: rival.lastFightWinner, damage: rival.combatDamage, defeated: rival.defeated, antAlive: sim.ants.includes(ant), powerBefore, powerAfter: powerBefore };
      rival.clash.elapsed = rival.clash.duration;
      rival.finishClash(sim);
      const antAlive = sim.ants.includes(ant);
      const powerAfter = rival.defeated ? 0 : rival.combatPowers(antAlive ? ant : fighters.find((item: any) => sim.ants.includes(item)) ?? ant, sim).rivalPower;
      return {
        started,
        winner: rival.lastFightWinner,
        damage: rival.combatDamage,
        defeated: rival.defeated,
        antAlive,
        powerBefore,
        powerAfter,
      };
    };

    prepareFighter(fighters[0]);
    const initialPower = rival.combatPowers(fighters[0], sim).rivalPower;
    const outcomes = [];
    for (const fighter of fighters) {
      outcomes.push(runSingleClash(fighter));
      if (rival.defeated) break;
    }

    return {
      initialPower,
      outcomes,
      finalDamage: rival.combatDamage,
      defeated: rival.defeated,
      enemyCasualties: sim.colony.raidState.enemyCasualties,
      casualties: sim.colony.raidState.casualties,
    };
  });

  expect(result.outcomes[0].started).toBe(true);
  expect(result.outcomes[0].winner).toBe("rival");
  expect(result.outcomes[0].damage).toBeGreaterThan(0);
  expect(result.outcomes[0].antAlive).toBe(true);
  expect(result.outcomes[1].damage).toBeGreaterThan(result.outcomes[0].damage);
  expect(result.outcomes[1].powerAfter).toBeLessThan(result.initialPower);
  expect(result.outcomes.some((outcome: any) => outcome.winner === "colony" || outcome.defeated)).toBe(true);
  expect(result.defeated).toBe(true);
  expect(result.finalDamage).toBeGreaterThanOrEqual(1);
  expect(result.enemyCasualties).toBe(1);
  expect(result.casualties).toBeGreaterThanOrEqual(0);
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
    rival.raidTargetKind = "food";
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

test("raid food pressure does not damage stored food or kill ants inside the nest", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.food = 1000;
    sim.colony.lifetimeFood = 1000;
    sim.colony.antPopulation = 12;
    sim.colony.woundedAnts = 0;
    sim.colony.enemyThreat = 50;
    sim.colony.fallenAnts = 3;
    sim.colony.nestDurability = 100;
    sim.colony.gameStatus = "playing";
    sim.syncAntPopulation();
    for (const ant of sim.ants) {
      ant.inNest = true;
      ant.nestStayTimer = 30;
      ant.state = "stunned";
      ant.stun = 30;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashRival = null;
      ant.x = sim.nest.x;
      ant.z = sim.nest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 3,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const food = sim.food.find((item: any) =>
      Math.hypot(item.x - sim.nest.x, item.z - sim.nest.z) > sim.nest.radius + 30,
    ) ?? sim.food[0];
    const rival = sim.raidRivals()[0];
    rival.x = food.x;
    rival.z = food.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;
    rival.defeated = false;
    rival.leftRaid = false;
    sim.colony.raidState.breachTimer = 0;
    sim.raidFoodPressureTimer = 7.19;
    const before = {
      food: sim.colony.food,
      population: sim.colony.antPopulation,
      fallen: sim.colony.fallenAnts,
      ants: sim.ants.length,
      nestDurability: sim.colony.nestDurability,
    };
    const oldRandom = Math.random;
    Math.random = () => 0;
    try {
      sim.updateRaidBreachDamage(0.2);
    } finally {
      Math.random = oldRandom;
    }
    return {
      before,
      after: {
        food: sim.colony.food,
        population: sim.colony.antPopulation,
        fallen: sim.colony.fallenAnts,
        ants: sim.ants.length,
        nestDurability: sim.colony.nestDurability,
        gameStatus: sim.colony.gameStatus,
        breachEvents: sim.raidNestBreachEvents,
        casualties: sim.colony.raidState.casualties,
        log: sim.colony.battleLog.join("\n"),
      },
    };
  });

  expect(result.after.food).toBe(result.before.food);
  expect(result.after.population).toBe(result.before.population);
  expect(result.after.fallen).toBe(result.before.fallen);
  expect(result.after.ants).toBe(result.before.ants);
  expect(result.after.nestDurability).toBe(result.before.nestDurability);
  expect(result.after.gameStatus).toBe("playing");
  expect(result.after.breachEvents).toBe(0);
  expect(result.after.casualties).toBe(0);
  expect(result.after.log).toContain("餌場");
  expect(result.after.log).toContain("貯蔵食料への被害なし");
  expect(result.after.log).not.toContain("死亡1");
});

test("raid held at food resolves without hidden nest casualties", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.food = 1000;
    sim.colony.lifetimeFood = 1000;
    sim.colony.antPopulation = 12;
    sim.colony.woundedAnts = 0;
    sim.colony.enemyThreat = 50;
    sim.colony.fallenAnts = 2;
    sim.syncAntPopulation();
    for (const ant of sim.ants) {
      ant.inNest = true;
      ant.nestStayTimer = 30;
      ant.state = "explore";
      ant.stun = 0;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashRival = null;
      ant.x = sim.nest.x;
      ant.z = sim.nest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: 2,
      lastOutcome: "warning",
    };
    sim.raidNestBreachEvents = 0;
    sim.updateRaid(0.01);
    const food = sim.food.find((item: any) =>
      Math.hypot(item.x - sim.nest.x, item.z - sim.nest.z) > sim.nest.radius + 30,
    ) ?? sim.food[0];
    const rival = sim.raidRivals()[0];
    rival.x = food.x;
    rival.z = food.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    const before = {
      food: sim.colony.food,
      population: sim.colony.antPopulation,
      wounded: sim.colony.woundedAnts,
      fallen: sim.colony.fallenAnts,
      ants: sim.ants.length,
    };
    sim.resolveRaid("held");
    return {
      before,
      after: {
        food: sim.colony.food,
        population: sim.colony.antPopulation,
        wounded: sim.colony.woundedAnts,
        fallen: sim.colony.fallenAnts,
        ants: sim.ants.length,
        casualties: sim.colony.raidState.casualties,
        log: sim.colony.battleLog.join("\n"),
      },
    };
  });

  expect(result.after.food).toBe(result.before.food);
  expect(result.after.population).toBe(result.before.population);
  expect(result.after.wounded).toBe(result.before.wounded);
  expect(result.after.fallen).toBe(result.before.fallen);
  expect(result.after.ants).toBe(result.before.ants);
  expect(result.after.casualties).toBe(0);
  expect(result.after.log).toContain("餌場被害");
  expect(result.after.log).toContain("貯蔵食料への被害なし");
  expect(result.after.log).not.toContain("死亡1");
});

test("raid rivals ignore ants that are still inside the nest", async ({ page }) => {
  await waitForSimulation(page);

  const result = await page.evaluate(() => {
    const sim = window.__ANT_SIM as any;
    sim.clearRaidRivals();
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 1,
      activeCount: 1,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      startFallenAnts: sim.colony.fallenAnts,
      lastOutcome: "warning",
    };
    sim.updateRaid(0.01);
    const rival = sim.raidRivals()[0];
    for (const ant of sim.ants) {
      ant.inNest = true;
      ant.nestStayTimer = 30;
      ant.state = "explore";
      ant.stun = 0;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashRival = null;
      ant.x = sim.nest.x;
      ant.z = sim.nest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }
    rival.x = sim.nest.x;
    rival.z = sim.nest.z;
    rival.prevX = rival.x;
    rival.prevZ = rival.z;
    rival.retreat = 0;
    rival.clash = null;
    rival.fightCooldown = 0;
    rival.defeated = false;
    rival.leftRaid = false;
    const before = {
      population: sim.colony.antPopulation,
      fallen: sim.colony.fallenAnts,
      ants: sim.ants.length,
    };
    const resolved = rival.resolveAntContacts(sim);
    return {
      resolved,
      rivalHasClash: Boolean(rival.clash),
      anyAntInClash: sim.ants.some((ant: any) => ant.clashRival === rival || ant.state === "clash"),
      before,
      after: {
        population: sim.colony.antPopulation,
        fallen: sim.colony.fallenAnts,
        ants: sim.ants.length,
        casualties: sim.colony.raidState.casualties,
      },
    };
  });

  expect(result.resolved).toBe(false);
  expect(result.rivalHasClash).toBe(false);
  expect(result.anyAntInClash).toBe(false);
  expect(result.after.population).toBe(result.before.population);
  expect(result.after.fallen).toBe(result.before.fallen);
  expect(result.after.ants).toBe(result.before.ants);
  expect(result.after.casualties).toBe(0);
});
