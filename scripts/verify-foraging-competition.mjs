import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createStaticServer } from "./serve.mjs";

const SEEDS = [17011, 28103, 39217, 50329, 61441];
const OUTPUT_DIR = resolve("verification", "foraging-competition");
const SUMMARY_PATH = join(OUTPUT_DIR, "summary.json");

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function round(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--disable-gpu", "--disable-background-networking"],
    });
  } catch {
    return chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--disable-background-networking"],
    });
  }
}

async function waitForSimulation(page) {
  const ready = await page.evaluate(`(() => new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (window.__ANT_SIM_READY && document.querySelector("#world3d canvas")) resolve(true);
      else if (Date.now() - started > 15000) resolve(false);
      else setTimeout(tick, 120);
    };
    tick();
  }))()`);
  if (!ready) throw new Error("Three.js scene did not become ready.");
}

async function runScenario(browser, targetUrl, seed, mature) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(0);
  try {
    await page.goto(targetUrl);
    await waitForSimulation(page);
    return await page.evaluate(({ matureScenario, runSeed }) => {
      const sim = window.__ANT_SIM;
      let randomState = runSeed >>> 0;
      Math.random = () => {
        randomState = (randomState * 1664525 + 1013904223) >>> 0;
        return randomState / 4294967296;
      };
      sim.reset(true);
      sim.paused = true;
      sim.frameAccumulator = 0;
      const stepDt = 1 / 60;
      const durationSeconds = matureScenario ? 75 : 45;
      sim.clearRaidRivals();
      sim.clearRivalNestDefenders();
      sim.clearManualMapVisionRadius({ persist: false, refresh: false });
      sim.colony.gameStatus = "playing";
      sim.colony.food = matureScenario ? 1200 : 180;
      sim.colony.lifetimeFood = matureScenario ? 5000 : 120;
      sim.colony.nestLevel = matureScenario ? 7 : 1;
      sim.colony.territory = matureScenario ? 16 : 0;
      sim.colony.antPopulation = matureScenario ? 180 : 12;
      sim.colony.enemyThreat = 0;
      sim.computeDerived();
      sim.updateMapIntel();
      sim.syncAntPopulation();
      sim.spawnRivalNestWorkers();
      const raid = sim.ensureRaidState();
      raid.phase = "calm";
      raid.timer = 9999;
      sim.collectedFood = 0;

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

      const sharedSitePadding = 12;
      const sharedSites = sim.foodSpawnSites
        .filter((site) => site.rivalForage)
        .map((site) => ({
          id: site.id,
          x: site.homeX,
          z: site.homeZ,
          radius: Number(site.radius) || 0,
        }));
      const sharedSitesById = new Map(sharedSites.map((site) => [site.id, site]));
      const playerWorkerSiteFrames = Object.fromEntries(sharedSites.map((site) => [site.id, 0]));
      const playerWorkerTargetFrames = Object.fromEntries(sharedSites.map((site) => [site.id, 0]));
      const rivalWorkerSiteFrames = Object.fromEntries(sharedSites.map((site) => [site.id, 0]));
      const rivalWorkerTargetFrames = Object.fromEntries(sharedSites.map((site) => [site.id, 0]));
      const sharedSitePresenceFrames = Object.fromEntries(sharedSites.map((site) => [site.id, 0]));
      const workerPairs = new Set();
      const sharedSiteWorkerPairs = new Set();
      const sharedSiteIdsWithBothSides = new Set();
      const sharedSiteIdsWithClashes = new Set();
      const seenWorkerClashes = new Set();
      let workerWorkerClashEvents = 0;
      let firstWorkerContactSeconds = null;
      let sharedSiteWorkerClashEvents = 0;
      let firstSharedSiteContactSeconds = null;
      let workerWorkerClashSeconds = 0;
      let sharedSitePresenceSeconds = 0;
      let playerWorkerNearSharedSiteSeconds = 0;
      let rivalWorkerNearSharedSiteSeconds = 0;
      let playerWorkerTargetSharedSiteSeconds = 0;
      let rivalWorkerTargetSharedSiteSeconds = 0;
      const siteForPosition = (entity, padding = sharedSitePadding) => {
        if (!entity) return null;
        let best = null;
        let bestDistance = Infinity;
        for (const site of sharedSites) {
          const distance = Math.hypot(entity.x - site.x, entity.z - site.z);
          if (distance > site.radius + padding || distance >= bestDistance) continue;
          best = site;
          bestDistance = distance;
        }
        return best;
      };
      const siteForFoodId = (foodId) => {
        if (foodId == null) return null;
        const food = sim.food.find((item) => item.id === foodId);
        return sharedSitesById.get(food?.spawnSiteId) ?? null;
      };
      for (let frame = 0; frame < durationSeconds / stepDt; frame += 1) {
        sim.updateGame(stepDt);

        const playerWorkersBySite = new Map(sharedSites.map((site) => [site.id, new Set()]));
        const rivalWorkersBySite = new Map(sharedSites.map((site) => [site.id, new Set()]));
        for (const ant of sim.ants) {
          if (ant.role !== "worker" || ant.variant !== "worker" || ant.isSortieSoldier) continue;
          const nearSite = siteForPosition(ant);
          const targetSite = siteForFoodId(ant.foodSourceId);
          if (nearSite) {
            playerWorkerSiteFrames[nearSite.id] += 1;
            playerWorkerNearSharedSiteSeconds += stepDt;
            playerWorkersBySite.get(nearSite.id)?.add(ant.id);
          }
          if (targetSite) {
            playerWorkerTargetFrames[targetSite.id] += 1;
            playerWorkerTargetSharedSiteSeconds += stepDt;
          }
        }
        for (const rival of sim.rivalNestWorkers()) {
          const nearSite = siteForPosition(rival);
          const targetSite = siteForFoodId(rival.workerTargetFoodId);
          if (nearSite) {
            rivalWorkerSiteFrames[nearSite.id] += 1;
            rivalWorkerNearSharedSiteSeconds += stepDt;
            rivalWorkersBySite.get(nearSite.id)?.add(rival.id);
          }
          if (targetSite) {
            rivalWorkerTargetFrames[targetSite.id] += 1;
            rivalWorkerTargetSharedSiteSeconds += stepDt;
          }
        }
        for (const site of sharedSites) {
          const playerWorkers = playerWorkersBySite.get(site.id);
          const rivalWorkers = rivalWorkersBySite.get(site.id);
          if (!playerWorkers?.size || !rivalWorkers?.size) continue;
          sharedSitePresenceFrames[site.id] += 1;
          sharedSitePresenceSeconds += stepDt;
          sharedSiteIdsWithBothSides.add(site.id);
        }
        for (const rival of sim.rivalNestWorkers()) {
          const worker = rival.clash?.ants?.find((ant) => ant.role === "worker" && ant.variant === "worker");
          if (!worker) continue;
          workerWorkerClashSeconds += stepDt;
          const pairKey = `${rival.id}:${worker.id}`;
          if (!seenWorkerClashes.has(pairKey)) {
            seenWorkerClashes.add(pairKey);
            workerWorkerClashEvents += 1;
            if (firstWorkerContactSeconds == null) firstWorkerContactSeconds = frame * stepDt;
          }
          workerPairs.add(pairKey);

          const clashSite = siteForPosition({ x: rival.clash.anchorX, z: rival.clash.anchorZ }, sharedSitePadding + 2);
          const workerSite = siteForPosition(worker);
          const rivalSite = siteForPosition(rival);
          if (!clashSite || workerSite?.id !== clashSite.id || rivalSite?.id !== clashSite.id) continue;
          const sharedPairKey = `${pairKey}:${clashSite.id}`;
          if (sharedSiteWorkerPairs.has(sharedPairKey)) continue;
          sharedSiteWorkerPairs.add(sharedPairKey);
          sharedSiteWorkerClashEvents += 1;
          sharedSiteIdsWithClashes.add(clashSite.id);
          if (firstSharedSiteContactSeconds == null) firstSharedSiteContactSeconds = frame * stepDt;
        }
      }
      return {
        seed: runSeed,
        mature: matureScenario,
        durationSeconds,
        workerWorkerClashEvents,
        uniqueWorkerPairs: workerPairs.size,
        firstWorkerContactSeconds,
        sharedSiteWorkerClashEvents,
        uniqueSharedSiteWorkerPairs: sharedSiteWorkerPairs.size,
        firstSharedSiteContactSeconds,
        workerWorkerClashSeconds: Number(workerWorkerClashSeconds.toFixed(6)),
        sharedSitePresenceSeconds: Number(sharedSitePresenceSeconds.toFixed(6)),
        playerWorkerNearSharedSiteSeconds: Number(playerWorkerNearSharedSiteSeconds.toFixed(6)),
        rivalWorkerNearSharedSiteSeconds: Number(rivalWorkerNearSharedSiteSeconds.toFixed(6)),
        playerWorkerTargetSharedSiteSeconds: Number(playerWorkerTargetSharedSiteSeconds.toFixed(6)),
        rivalWorkerTargetSharedSiteSeconds: Number(rivalWorkerTargetSharedSiteSeconds.toFixed(6)),
        playerWorkerSiteFrames,
        playerWorkerTargetFrames,
        rivalWorkerSiteFrames,
        rivalWorkerTargetFrames,
        sharedSitePresenceFrames,
        sharedSiteIdsWithBothSides: [...sharedSiteIdsWithBothSides],
        sharedSiteIdsWithClashes: [...sharedSiteIdsWithClashes],
        collectedFood: Number(sim.collectedFood.toFixed(6)),
        activityRadius: Number(sim.workerActivityRadius().toFixed(6)),
        rivalForageRadius: Number(sim.rivalWorkerForageRadius().toFixed(6)),
      };
    }, { matureScenario: mature, runSeed: seed });
  } finally {
    await context.close();
  }
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const server = await createStaticServer({ root: resolve("dist"), port: 0 });
let browser;
try {
  const address = server.address();
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  browser = await launchBrowser();
  const early = [];
  const mature = [];
  for (const seed of SEEDS) {
    early.push(await runScenario(browser, targetUrl, seed, false));
    mature.push(await runScenario(browser, targetUrl, seed, true));
  }

  const matureContactRuns = mature.filter((run) => run.workerWorkerClashEvents > 0).length;
  const earlyContactRuns = early.filter((run) => run.workerWorkerClashEvents > 0).length;
  const matureSharedSiteContactRuns = mature.filter((run) => run.sharedSiteWorkerClashEvents > 0).length;
  const earlySharedSiteContactRuns = early.filter((run) => run.sharedSiteWorkerClashEvents > 0).length;
  const matureSharedSitePresenceRuns = mature.filter((run) => run.sharedSitePresenceSeconds > 0).length;
  const earlySharedSitePresenceRuns = early.filter((run) => run.sharedSitePresenceSeconds > 0).length;
  const firstSharedSiteContactRuns = mature.filter((run) => run.firstSharedSiteContactSeconds != null);
  const summary = {
    generatedAt: new Date().toISOString(),
    targetUrl,
    seeds: SEEDS,
    scenarios: {
      early: {
        description: "Initial activity radius; shared forage remains out of reach",
        runs: early,
        avgWorkerWorkerClashEvents: round(mean(early.map((run) => run.workerWorkerClashEvents))),
        sharedSiteContactRuns: earlySharedSiteContactRuns,
        sharedSitePresenceRuns: earlySharedSitePresenceRuns,
        avgSharedSiteWorkerClashEvents: round(mean(early.map((run) => run.sharedSiteWorkerClashEvents))),
        avgSharedSitePresenceSeconds: round(mean(early.map((run) => run.sharedSitePresenceSeconds))),
        avgPlayerWorkerNearSharedSiteSeconds: round(mean(early.map((run) => run.playerWorkerNearSharedSiteSeconds))),
        avgRivalWorkerNearSharedSiteSeconds: round(mean(early.map((run) => run.rivalWorkerNearSharedSiteSeconds))),
        avgCollectedFood: round(mean(early.map((run) => run.collectedFood))),
      },
      mature: {
        description: "Expanded territory; workers and rival workers converge on shared forage",
        runs: mature,
        workerContactRuns: matureContactRuns,
        sharedSiteContactRuns: matureSharedSiteContactRuns,
        sharedSitePresenceRuns: matureSharedSitePresenceRuns,
        avgWorkerWorkerClashEvents: round(mean(mature.map((run) => run.workerWorkerClashEvents))),
        avgSharedSiteWorkerClashEvents: round(mean(mature.map((run) => run.sharedSiteWorkerClashEvents))),
        avgSharedSitePresenceSeconds: round(mean(mature.map((run) => run.sharedSitePresenceSeconds))),
        avgFirstWorkerContactSeconds: round(mean(mature.filter((run) => run.firstWorkerContactSeconds != null).map((run) => run.firstWorkerContactSeconds))),
        avgFirstSharedSiteContactSeconds: round(mean(firstSharedSiteContactRuns.map((run) => run.firstSharedSiteContactSeconds))),
        avgPlayerWorkerNearSharedSiteSeconds: round(mean(mature.map((run) => run.playerWorkerNearSharedSiteSeconds))),
        avgRivalWorkerNearSharedSiteSeconds: round(mean(mature.map((run) => run.rivalWorkerNearSharedSiteSeconds))),
        avgPlayerWorkerTargetSharedSiteSeconds: round(mean(mature.map((run) => run.playerWorkerTargetSharedSiteSeconds))),
        avgRivalWorkerTargetSharedSiteSeconds: round(mean(mature.map((run) => run.rivalWorkerTargetSharedSiteSeconds))),
        avgCollectedFood: round(mean(mature.map((run) => run.collectedFood))),
        sharedSiteIdsWithBothSides: [...new Set(mature.flatMap((run) => run.sharedSiteIdsWithBothSides))],
        sharedSiteIdsWithClashes: [...new Set(mature.flatMap((run) => run.sharedSiteIdsWithClashes))],
      },
    },
    failures: [],
  };
  if (earlyContactRuns > 0) summary.failures.push(`initial colony contacted rival workers in ${earlyContactRuns}/${SEEDS.length} runs`);
  if (earlySharedSiteContactRuns > 0) summary.failures.push(`initial colony clashed at shared forage in ${earlySharedSiteContactRuns}/${SEEDS.length} runs`);
  if (matureContactRuns < 4) summary.failures.push(`mature colony worker contact only in ${matureContactRuns}/${SEEDS.length} runs`);
  if (matureSharedSiteContactRuns < 4) summary.failures.push(`mature colony shared-site worker contact only in ${matureSharedSiteContactRuns}/${SEEDS.length} runs`);
  if (matureSharedSitePresenceRuns < 4) summary.failures.push(`mature colony shared-site co-presence only in ${matureSharedSitePresenceRuns}/${SEEDS.length} runs`);
  if (summary.scenarios.mature.avgSharedSitePresenceSeconds <= 0) summary.failures.push("mature workers and rival workers never co-occupied a shared forage site");
  if (summary.scenarios.mature.avgRivalWorkerTargetSharedSiteSeconds <= 0) summary.failures.push("rival workers never targeted a shared forage site");
  if (summary.scenarios.mature.avgCollectedFood <= 0) summary.failures.push("mature foraging collected no food");
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ summaryPath: SUMMARY_PATH, failures: summary.failures, scenarios: summary.scenarios }, null, 2));
  if (summary.failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close();
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}
