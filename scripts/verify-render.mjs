import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";
import { createStaticServer } from "./serve.mjs";

function decodePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Invalid PNG signature.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    current.set(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous[x] ?? 0;
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      if (filter === 1) current[x] = (current[x] + left) & 255;
      else if (filter === 2) current[x] = (current[x] + up) & 255;
      else if (filter === 3) current[x] = (current[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upperLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
        current[x] = (current[x] + predictor) & 255;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const target = (y * width + x) * 4;
      pixels[target] = current[source];
      pixels[target + 1] = current[source + 1];
      pixels[target + 2] = current[source + 2];
      pixels[target + 3] = colorType === 6 ? current[source + 3] : 255;
    }
    previous.set(current);
  }

  return { width, height, pixels };
}

function measurePngRegion(png, region) {
  let min = 255;
  let max = 0;
  let nonDark = 0;
  let alpha = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const index = (y * png.width + x) * 4;
      const luminance = png.pixels[index] * 0.2126 + png.pixels[index + 1] * 0.7152 + png.pixels[index + 2] * 0.0722;
      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
      if (luminance > 24) nonDark += 1;
      if (png.pixels[index + 3] > 0) alpha += 1;
    }
  }
  return { nonDark, alpha, contrast: max - min };
}

async function verifyViewport({ label, width, height }, targetUrl, outputDir) {
  let browser;
  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--disable-gpu", "--disable-background-networking"],
    });
  } catch {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--disable-background-networking"],
    });
  }

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: width < 600,
    });
    const page = await context.newPage();
    await page.goto(targetUrl);

    const ready = await page.evaluate(`
      (() => new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          if (window.__ANT_SIM_READY && document.querySelector("#world3d canvas")) resolve(true);
          else if (Date.now() - started > 15000) resolve(false);
          else setTimeout(tick, 120);
        };
        tick();
      }))()
    `);
    if (!ready) throw new Error(`${label}: Three.js scene did not become ready.`);
    await delay(900);

    const hoverProbe = await page.evaluate(`(() => {
        const sim = window.__ANT_SIM;
        const canvas = document.querySelector("#world3d canvas");
        const before = sim.targetCameraYaw;
        const first = new PointerEvent("pointermove", {
          pointerId: 9981,
          pointerType: "mouse",
          clientX: 80,
          clientY: 80,
          bubbles: true,
          cancelable: true,
        });
        const second = new PointerEvent("pointermove", {
          pointerId: 9981,
          pointerType: "mouse",
          clientX: 220,
          clientY: 150,
          bubbles: true,
          cancelable: true,
        });
        canvas.dispatchEvent(first);
        canvas.dispatchEvent(second);
        const after = sim.targetCameraYaw;
        sim.pointerMap.delete(9981);
        return { before, after, delta: Math.abs(after - before) };
      })()`);
    if (hoverProbe.delta > 0.000001) {
      throw new Error(`${label}: camera yaw changed on hover without pointerdown: ${JSON.stringify(hoverProbe)}`);
    }

    const wheelProbe = { skipped: width < 600, before: null, zoomIn: null, zoomOut: null };
    if (width >= 600) {
      wheelProbe.before = await page.evaluate(`(() => {
          const sim = window.__ANT_SIM;
          sim.targetCameraDistance = 240;
          sim.cameraDistance = 240;
          return sim.targetCameraDistance;
        })()`);
      await page.mouse.move(width * 0.5, height * 0.5);
      await page.mouse.wheel(0, -360);
      wheelProbe.zoomIn = await page.evaluate(`window.__ANT_SIM.targetCameraDistance`);
      await page.mouse.wheel(0, 720);
      wheelProbe.zoomOut = await page.evaluate(`window.__ANT_SIM.targetCameraDistance`);
    }

    const pinchProbe = await page.evaluate(`(() => {
        const sim = window.__ANT_SIM;
        const canvas = document.querySelector("#world3d canvas");
        const dispatchPointer = (type, pointerId, clientX, clientY) => {
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
        dispatchPointer("pointerdown", 5101, 120, 180);
        dispatchPointer("pointerdown", 5102, 200, 180);
        dispatchPointer("pointermove", 5102, 280, 180);
        const pinchSpread = sim.targetCameraDistance;
        dispatchPointer("pointermove", 5102, 132, 180);
        const pinchClose = sim.targetCameraDistance;
        dispatchPointer("pointerup", 5101, 120, 180);
        dispatchPointer("pointerup", 5102, 132, 180);
        return { before: pinchBefore, spread: pinchSpread, close: pinchClose };
      })()`);
    if (
      (!wheelProbe.skipped && (wheelProbe.zoomIn >= wheelProbe.before || wheelProbe.zoomOut <= wheelProbe.zoomIn)) ||
      pinchProbe.spread >= pinchProbe.before ||
      pinchProbe.close <= pinchProbe.before
    ) {
      throw new Error(`${label}: camera zoom check failed: ${JSON.stringify({ wheelProbe, pinchProbe })}`);
    }

    const canvasProbe = await page.evaluate(({ hoverYawDelta, wheelProbe, pinchProbe }) => {
        const canvas = document.querySelector("#world3d canvas");
        const rect = canvas.getBoundingClientRect();
        const sim = window.__ANT_SIM;
        const info = sim?.renderer?.info;
        return {
          width: canvas.width,
          height: canvas.height,
          cssWidth: Math.round(rect.width),
          cssHeight: Math.round(rect.height),
          pixelRatio: sim?.currentPixelRatio ?? null,
          quality: sim?.quality?.label ?? null,
          antCount: sim?.ants?.length ?? null,
          colonyAnts: sim?.colony?.antPopulation ?? null,
          colonyFood: sim?.colony?.food ?? null,
          nestLevel: sim?.colony?.nestLevel ?? null,
          territory: sim?.colony?.territory ?? null,
          foodRate: sim?.computeDerived?.().foodRate ?? null,
          capacity: sim?.computeDerived?.().capacity ?? null,
          worldRadius: sim?.worldRadius ?? null,
          foodSources: sim?.food?.length ?? null,
          predatorCount: sim?.predators?.length ?? null,
          rivalCount: sim?.rivalAnts?.length ?? null,
          rivalScaleMin: sim?.rivalAnts?.length ? Math.min(...sim.rivalAnts.map((ant) => ant.scale)) : null,
          rivalScaleMax: sim?.rivalAnts?.length ? Math.max(...sim.rivalAnts.map((ant) => ant.scale)) : null,
          raidPhase: sim?.colony?.raidState?.phase ?? null,
          raidTimer: sim?.colony?.raidState?.timer ?? null,
          rivalColor: sim?.materials?.antRival?.color?.getHexString?.() ?? null,
          terrainPatches: sim?.terrain?.length ?? null,
          terrainBumps: sim?.terrainBumps?.length ?? null,
          nestEntranceCount: sim?.nestEntrances?.length ?? sim?.nestHoles?.length ?? null,
          nestSpoilCount: sim?.nestSpoils?.length ?? null,
          stoneCount: sim?.stones?.length ?? null,
          branchCount: sim?.branches?.length ?? null,
          toolButtons: document.querySelectorAll("[data-tool]").length,
          upgradeButtons: document.querySelectorAll("[data-upgrade]").length,
          calls: info?.render?.calls ?? null,
          triangles: info?.render?.triangles ?? null,
          geometries: info?.memory?.geometries ?? null,
          textures: info?.memory?.textures ?? null,
          hoverYawDelta,
          wheelZoomIn: wheelProbe.zoomIn,
          pinchSpread: pinchProbe.spread,
        };
      }, { hoverYawDelta: hoverProbe.delta, wheelProbe, pinchProbe });

    const screenshotPath = join(outputDir, `${label}.png`);
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    writeFileSync(screenshotPath, screenshotBuffer);
    const png = decodePng(screenshotBuffer);
    const regionSize = Math.min(120, Math.floor(Math.min(png.width, png.height) * 0.28));
    const metrics = {
      ...canvasProbe,
      ...measurePngRegion(png, {
        x: Math.floor((png.width - regionSize) / 2),
        y: Math.floor((png.height - regionSize) / 2),
        width: regionSize,
        height: regionSize,
      }),
    };
    if (
      metrics.cssWidth < width ||
      metrics.cssHeight < height ||
      metrics.width < width * 0.5 ||
      metrics.height < height * 0.5 ||
      metrics.nonDark < regionSize * regionSize * 0.25 ||
      metrics.contrast < 14
    ) {
      throw new Error(`${label}: screenshot pixel check failed: ${JSON.stringify(metrics)}`);
    }
    if (
      metrics.colonyAnts !== 12 ||
      metrics.antCount !== 12 ||
      metrics.worldRadius < 120 ||
      metrics.foodSources < 4 ||
      metrics.predatorCount !== 0 ||
      metrics.rivalCount !== 0 ||
      metrics.raidPhase !== "calm" ||
      metrics.raidTimer <= 0 ||
      metrics.rivalColor !== "8a4a2f" ||
      metrics.terrainPatches < 6 ||
      metrics.terrainBumps < 8 ||
      metrics.nestEntranceCount < 4 ||
      metrics.nestSpoilCount < 24 ||
      metrics.stoneCount < 6 ||
      metrics.branchCount < 5 ||
      metrics.toolButtons !== 0 ||
      metrics.upgradeButtons < 13 ||
      metrics.foodRate <= 0
    ) {
      throw new Error(`${label}: idle colony state check failed: ${JSON.stringify(metrics)}`);
    }

    const upgradeTree = await page.evaluate(`(() => {
        const sim = window.__ANT_SIM;
        const restore = {
          food: sim.colony.food,
          lifetimeFood: sim.colony.lifetimeFood,
          antPopulation: sim.colony.antPopulation,
          soldierAnts: sim.colony.soldierAnts,
          woundedAnts: sim.colony.woundedAnts,
          nestLevel: sim.colony.nestLevel,
          territory: sim.colony.territory,
          upgrades: { ...sim.colony.upgrades },
        };
        sim.colony.food = 1000000;
        sim.colony.lifetimeFood = 1000000;
        sim.colony.antPopulation = 60;
        sim.colony.soldierAnts = 5;
        sim.colony.woundedAnts = 0;
        sim.colony.nestLevel = 4;
        sim.colony.territory = 5;
        for (const key of Object.keys(sim.colony.upgrades)) sim.colony.upgrades[key] = 0;
        sim.renderUpgrades();
        const lockedBefore = document.querySelector('[data-upgrade="broodClimate"]').disabled;
        const base = sim.computeDerived();
        sim.colony.upgrades.broodNursery = 2;
        sim.renderUpgrades();
        const unlockedAfterPrereq = !document.querySelector('[data-upgrade="broodClimate"]').disabled;
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
        const result = {
          branches: [...document.querySelectorAll(".upgrade-branch")].map((node) => node.textContent),
          lockedBefore,
          unlockedAfterPrereq,
          foodRateRatio: maxed.foodRate / base.foodRate,
          growthRatio: maxed.growthPerSecond / base.growthPerSecond,
          capacityRatio: maxed.capacity / base.capacity,
          attackPower: maxed.attackPower,
          defensePower: maxed.defensePower,
          threatGrowthMultiplier: maxed.threatGrowthMultiplier,
        };
        Object.assign(sim.colony, restore);
        sim.colony.upgrades = restore.upgrades;
        sim.computeDerived();
        sim.renderUpgrades();
        return result;
      })()`);
    if (
      upgradeTree.branches.join("|") !== "採餌網|育房|巣構造|防衛" ||
      !upgradeTree.lockedBefore ||
      !upgradeTree.unlockedAfterPrereq ||
      upgradeTree.foodRateRatio <= 3 ||
      upgradeTree.foodRateRatio >= 4.6 ||
      upgradeTree.growthRatio <= 5 ||
      upgradeTree.growthRatio >= 7.6 ||
      upgradeTree.capacityRatio <= 2.6 ||
      upgradeTree.capacityRatio >= 3.7 ||
      upgradeTree.attackPower >= 2.2 ||
      upgradeTree.defensePower >= 2.8 ||
      upgradeTree.threatGrowthMultiplier < 0.55
    ) {
      throw new Error(`${label}: upgrade tree balance check failed: ${JSON.stringify(upgradeTree)}`);
    }

    const idle = await page.evaluate(`(() => {
        const sim = window.__ANT_SIM;
        const before = {
          food: sim.colony.food,
          ants: sim.colony.antPopulation,
          capacity: sim.computeDerived().capacity,
          foodRate: sim.computeDerived().foodRate,
          territory: sim.colony.territory,
          wounded: sim.colony.woundedAnts,
          threat: sim.colony.enemyThreat,
        };
        const noDeliveryRestore = {
          ants: sim.colony.antPopulation,
          soldiers: sim.colony.soldierAnts,
          hatchProgress: sim.colony.hatchProgress,
          food: sim.colony.food,
        };
        sim.colony.antPopulation = sim.computeDerived().capacity;
        sim.colony.hatchProgress = 0;
        sim.colony.soldierAnts = sim.computeDerived().soldierTarget;
        const noDeliveryFoodBefore = sim.colony.food;
        sim.updateColony(25);
        const noDeliveryFoodAfter = sim.colony.food;
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
        const returnFoodBefore = sim.colony.food;
        carrier.updateReturn(1 / 60, sim, { x: 0, z: 0 });
        const returnFoodAfter = sim.colony.food;
        sim.colony.food = 10000;
        sim.colony.lifetimeFood = Math.max(sim.colony.lifetimeFood, 10000);
        sim.colony.antPopulation = 24;
        const capacityBeforeUpgrade = sim.computeDerived().capacity;
        const boughtUpgrade = sim.buyUpgrade("storageChambers");
        const capacityAfterUpgrade = sim.computeDerived().capacity;
        sim.colony.soldierAnts = 8;
        sim.colony.woundedAnts = 0;
        sim.colony.battleCooldownUntil = 0;
        sim.startExpedition();
        sim.updateExpeditionReplay(1 / 60);
        sim.renderExpeditionReplay();
        sim.saveColony();
        const saved = JSON.parse(localStorage.getItem("ant3d.colonyState"));
        const battle = sim.lastExpeditionBattle;
        return {
          before,
          noDeliveryFoodBefore,
          noDeliveryFoodAfter,
          returnFoodBefore,
          returnFoodAfter,
          capacityBeforeUpgrade,
          capacityAfterUpgrade,
          boughtUpgrade,
          territoryAfterBattle: sim.colony.territory,
          foodAfterBattle: sim.colony.food,
          battleReason: battle?.reason,
          battleWinner: battle?.winner,
          expeditionEngine: sim.expeditionEngine,
          battleFrameLogs: battle?.frameLogs?.length ?? 0,
          battleForwardMotionRatio: battle?.metrics?.forwardMotionRatio ?? 0,
          battleContactFacingRatio: battle?.metrics?.contactFacingRatio ?? 0,
          replayAgents: sim.expeditionReplay ? sim.expeditionReplay.participants.size + sim.expeditionReplay.enemyVisuals.length : 0,
          participantIds: sim.expeditionReplay ? [...sim.expeditionReplay.participants.keys()] : [],
          criticalInspectorDiagnostics: (sim.lastExpeditionDiagnostics ?? []).filter((item) =>
            item.severity === "critical" &&
            ["duplicate_identity", "duplicate_visual", "teleport", "invalid_state"].includes(item.code),
          ).length,
          battleLog: sim.colony.battleLog.join("\\n"),
          cooldownActive: sim.colony.battleCooldownUntil > Date.now(),
          savedAnts: saved.antPopulation,
          savedFood: saved.food,
        };
      })()`);
    if (
      Math.abs(idle.noDeliveryFoodAfter - idle.noDeliveryFoodBefore) > 0.0001 ||
      idle.returnFoodAfter <= idle.returnFoodBefore ||
      !idle.boughtUpgrade ||
      idle.capacityAfterUpgrade <= idle.capacityBeforeUpgrade ||
      idle.expeditionEngine !== "agent" ||
      !["enemy_all_retreat", "player_all_retreat", "objective_held", "timeout_draw"].includes(idle.battleReason) ||
      !["player", "enemy", "draw"].includes(idle.battleWinner) ||
      idle.battleFrameLogs <= 0 ||
      idle.battleForwardMotionRatio <= 0.8 ||
      idle.battleContactFacingRatio <= 0.4 ||
      idle.replayAgents <= 0 ||
      idle.participantIds.length <= 0 ||
      idle.criticalInspectorDiagnostics !== 0 ||
      !idle.battleLog.includes("reason:") ||
      !idle.cooldownActive ||
      idle.savedAnts !== 24 ||
      idle.savedFood <= 0
    ) {
      throw new Error(`${label}: idle growth check failed: ${JSON.stringify(idle)}`);
    }

    const raid = await page.evaluate(`(() => {
        const sim = window.__ANT_SIM;
        if (sim.expeditionReplay) sim.finishExpeditionReplay();
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
          rivals: sim.rivalAnts.length,
          activeCount: sim.colony.raidState.activeCount,
          log: sim.colony.battleLog.join("\\n"),
        };
        sim.colony.raidState.timer = 0.01;
        sim.updateRaid(0.02);
        const activePhase = sim.colony.raidState.phase;
        sim.updateStats();
        const rivals = sim.raidRivals();
        const spawnRadii = rivals.map((rival) => Math.hypot(rival.x, rival.z));
        const approachAngle = sim.colony.raidState.approachAngle ?? 0;
        const flankX = -Math.sin(approachAngle);
        const flankZ = Math.cos(approachAngle);
        const spawnLateral = rivals.map((rival) => rival.x * flankX + rival.z * flankZ);
        const targetLateral = rivals.map((rival) => rival.raidTargetX * flankX + rival.raidTargetZ * flankZ);
        const exitRadii = rivals.map((rival) => Math.hypot(rival.homeX, rival.homeZ));
        return {
          warning,
          activePhase,
          phaseAfterStats: sim.colony.raidState.phase,
          rivalCount: rivals.length,
          activeCount: sim.colony.raidState.activeCount,
          minNestDistance: Math.min(...rivals.map((rival) => Math.hypot(rival.x - sim.nest.x, rival.z - sim.nest.z))),
          minWorldRadius: Math.min(...spawnRadii),
          spawnDepthSpread: Math.max(...spawnRadii) - Math.min(...spawnRadii),
          spawnLateralSpread: Math.max(...spawnLateral) - Math.min(...spawnLateral),
          targetLateralSpread: Math.max(...targetLateral) - Math.min(...targetLateral),
          minExitRadius: Math.min(...exitRadii),
          worldRadius: sim.worldRadius,
          log: sim.colony.battleLog.join("\\n"),
        };
      })()`);
    if (
      raid.warning.phase !== "warning" ||
      raid.warning.rivals !== 0 ||
      raid.warning.activeCount < 4 ||
      !raid.warning.log.includes("敵アリの気配") ||
      raid.activePhase !== "active" ||
      raid.phaseAfterStats !== "active" ||
      raid.rivalCount !== raid.activeCount ||
      raid.minNestDistance <= 50 ||
      raid.minWorldRadius <= raid.worldRadius * 0.88 ||
      raid.spawnDepthSpread <= 2 ||
      raid.spawnLateralSpread <= 12 ||
      raid.targetLateralSpread <= 6 ||
      raid.minExitRadius <= raid.worldRadius + 16 ||
      !raid.log.includes("敵襲開始")
    ) {
      throw new Error(`${label}: raid warning and spawn check failed: ${JSON.stringify(raid)}`);
    }

    const fight = await page.evaluate(`(() => {
        const sim = window.__ANT_SIM;
        const ant = sim.ants[0];
        const guard = sim.ants[1];
        const supportA = sim.ants[2];
        const supportB = sim.ants[3];
        const rival = sim.raidRivals()[0];
        sim.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };
        const antPopulationBefore = sim.colony.antPopulation;
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
        rival.angle = -Math.PI / 2;
        rival.aggression = 1;
        rival.stubbornness = 1;
        rival.scale = 1.35;
        rival.retreat = 0;
        rival.clash = null;
        rival.fightCooldown = 0;
        const beforeDistance = Math.hypot(ant.x - rival.x, ant.z - rival.z);
        const resolved = rival.resolveAntContacts(sim);
        const afterDistance = Math.hypot(ant.x - rival.x, ant.z - rival.z);
        const stateAtStart = ant.state;
        const nestDistanceBefore = Math.hypot(ant.x - sim.nest.x, ant.z - sim.nest.z);
        const anchorX = rival.clash.anchorX;
        const anchorZ = rival.clash.anchorZ;
        const lineX = rival.clash.lineX;
        const lineZ = rival.clash.lineZ;
        let workerPreviousGait = ant.gaitPhase;
        let workerGaitAdvance = 0;
        let maxCenterDrift = 0;
        let maxAxisDrift = 0;
        for (let i = 0; i < 220; i += 1) {
          ant.update(1 / 60, sim);
          rival.update(1 / 60, sim);
          const gaitDelta = Math.atan2(Math.sin(ant.gaitPhase - workerPreviousGait), Math.cos(ant.gaitPhase - workerPreviousGait));
          workerGaitAdvance += Math.abs(gaitDelta);
          workerPreviousGait = ant.gaitPhase;
          if (i < 100 && rival.clash) {
            const centerX = (ant.x + rival.x) * 0.5;
            const centerZ = (ant.z + rival.z) * 0.5;
            maxCenterDrift = Math.max(maxCenterDrift, Math.hypot(centerX - anchorX, centerZ - anchorZ));
            const pairX = ant.x - rival.x;
            const pairZ = ant.z - rival.z;
            const pairLength = Math.hypot(pairX, pairZ) || 1;
            const axisDrift = Math.abs((pairX * lineZ - pairZ * lineX) / pairLength);
            maxAxisDrift = Math.max(maxAxisDrift, axisDrift);
          }
        }
        const stateAfterClash = ant.state;
        const fleeTimer = ant.fleeTimer;
        const workerAlive = sim.ants.includes(ant);
        const workerCasualties = sim.colony.raidState.casualties;
        const antPopulationAfterWorker = sim.colony.antPopulation;
        const workerCombatEffects = sim.combatEffects?.length ?? 0;
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
        const repelled = rival.resolveAntContacts(sim);
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
        return {
          resolved,
          repelled,
          beforeDistance,
          afterDistance,
          maxCenterDrift,
          maxAxisDrift,
          stateAtStart,
          stateAfterClash,
          fleeTimer,
          workerAlive,
          workerCasualties,
          workerGaitAdvance,
          workerCombatEffects,
          antPopulationBefore,
          antPopulationAfterWorker,
          nestDistanceBefore,
          guardStateAtStart,
          guardGrapplersAtStart,
          guardGaitAdvance,
          winner: rival.lastFightWinner,
          antEnergy: ant.energy,
          rivalRetreat: rival.retreat,
          enemyDefeated: rival.defeated,
          enemyMarkedGone: rival.leftRaid,
          enemyStillLive: sim.rivalAnts.includes(rival),
          enemyCorpseCount: sim.rivalCorpses?.length ?? 0,
          corpseCountBeforeGuard,
          fightStats: sim.rivalFightStats,
          fightCooldown: rival.fightCooldown,
          alarmTrails: sim.trails.filter((trail) => trail.kind === "alarm").length,
          combatEffects: sim.combatEffects?.length ?? 0,
        };
      })()`);
    if (
      !fight.resolved ||
      !fight.repelled ||
      Math.abs(fight.afterDistance - fight.beforeDistance) >= 0.25 ||
      fight.maxCenterDrift >= 0.55 ||
      fight.maxAxisDrift >= 0.34 ||
      fight.stateAtStart !== "clash" ||
      fight.workerAlive ||
      fight.workerCasualties < 1 ||
      fight.workerGaitAdvance <= 0.5 ||
      fight.workerCombatEffects < 3 ||
      fight.antPopulationAfterWorker !== fight.antPopulationBefore - 1 ||
      fight.guardStateAtStart !== "clash" ||
      fight.guardGrapplersAtStart < 2 ||
      fight.guardGaitAdvance <= 0.5 ||
      fight.antEnergy >= 1 ||
      fight.winner !== "colony" ||
      !fight.enemyDefeated ||
      !fight.enemyMarkedGone ||
      fight.enemyStillLive ||
      fight.enemyCorpseCount <= fight.corpseCountBeforeGuard ||
      fight.fightStats.rivalWins < 1 ||
      fight.fightStats.colonyWins < 1 ||
      fight.fightCooldown <= 0 ||
      fight.alarmTrails < 1 ||
      fight.combatEffects <= fight.workerCombatEffects
    ) {
      throw new Error(`${label}: rival ant contact check failed: ${JSON.stringify(fight)}`);
    }

    await context.close();
    return { label, screenshotPath, metrics };
  } finally {
    await browser.close();
  }
}

const outputDir = resolve("verification");
mkdirSync(outputDir, { recursive: true });

const server = await createStaticServer({ root: resolve("dist"), port: 0 });
try {
  const address = server.address();
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  const results = [];
  results.push(await verifyViewport({ label: "mobile-390x844", width: 390, height: 844 }, targetUrl, outputDir));
  results.push(await verifyViewport({ label: "desktop-1366x768", width: 1366, height: 768 }, targetUrl, outputDir));
  console.log(JSON.stringify({ targetUrl, results }, null, 2));
} finally {
  server.close();
}
