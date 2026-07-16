import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createStaticServer } from "./serve.mjs";

const SEEDS = [4103, 5209, 6311];
const STEP_DT = 1 / 60;
const INTEGRATED_SECONDS = 60;
const ISOLATED_SECONDS = 50;
const SOLDIER_ASSAULT_RATE = 0.00645312;
const OUTPUT_DIR = resolve("verification", "expedition-defense");
const SUMMARY_PATH = join(OUTPUT_DIR, "summary.json");

async function launchBrowser() {
  try {
    return await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--disable-gpu", "--disable-background-networking"],
    });
  } catch {
    return await chromium.launch({
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

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
}

function round(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

function aggregateRuns(runs) {
  return {
    runs: runs.length,
    avgIntegrityDamage: round(mean(runs.map((run) => run.integrityDamage))),
    medianIntegrityDamage: round(median(runs.map((run) => run.integrityDamage))),
    minIntegrityDamage: round(Math.min(...runs.map((run) => run.integrityDamage))),
    avgAssaultAntSeconds: round(mean(runs.map((run) => run.assaultAntSeconds))),
    avgAttackerClashAntSeconds: round(mean(runs.map((run) => run.attackerClashAntSeconds))),
    avgDefenderClashSeconds: round(mean(runs.map((run) => run.defenderClashSeconds))),
    avgWorkerClashSeconds: round(mean(runs.map((run) => run.workerClashSeconds))),
    avgTimeTo50: round(mean(runs.map((run) => run.timeTo50 ?? run.elapsedSeconds))),
    avgTimeToVictory: round(mean(runs.map((run) => run.timeToVictory ?? run.elapsedSeconds))),
    victories: runs.filter((run) => run.victory).length,
    avgDefenderWins: round(mean(runs.map((run) => run.defenderWins))),
    avgColonyWinsAgainstDefenders: round(mean(runs.map((run) => run.colonyWinsAgainstDefenders))),
    avgUniqueWorkers: round(mean(runs.map((run) => run.uniqueWorkers))),
  };
}

async function newSimulationPage(context, targetUrl) {
  const page = await context.newPage();
  page.setDefaultTimeout(0);
  await page.goto(targetUrl);
  await waitForSimulation(page);
  await delay(80);
  return page;
}

async function runExpeditionScenario(context, targetUrl, options) {
  const page = await newSimulationPage(context, targetUrl);
  try {
    return await page.evaluate(
      ({ seed, defendersEnabled, workersEnabled, maxSeconds, stepDt, expectedAssaultRate }) => {
        function seededRandom(seedValue) {
          let state = seedValue >>> 0;
          return () => {
            state = (state + 0x6d2b79f5) >>> 0;
            let next = state;
            next = Math.imul(next ^ (next >>> 15), next | 1);
            next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
            return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
          };
        }

        Math.random = seededRandom(seed);
        localStorage.clear();
        const sim = window.__ANT_SIM;
        sim.paused = true;
        sim.frameAccumulator = 0;
        sim.reset(true);
        sim.paused = true;
        sim.frameAccumulator = 0;
        sim.timeScale = 1;
        sim.clearRaidRivals();
        sim.clearRivalNestDefenders();
        sim.soldierSortieCooldown = 0;
        sim.sortieRetireQueue = [];
        sim.squads = [];
        sim.nextSquadId = 1;

        for (const key of Object.keys(sim.colony.upgrades)) sim.colony.upgrades[key] = 0;
        Object.assign(sim.colony, {
          food: 1000,
          lifetimeFood: 1000,
          antPopulation: 48,
          soldierAnts: 12,
          heavySoldierAnts: 0,
          shieldHeadAnts: 0,
          acidShooterAnts: 0,
          scoutAnts: 0,
          medicAnts: 0,
          captainAnts: 0,
          builderAnts: 0,
          woundedAnts: 0,
          nestLevel: 3,
          territory: 3,
          enemyThreat: 7,
          fallenAnts: 0,
          gameStatus: "playing",
          battleLog: [],
        });
        sim.colony.upgrades.soldierTraining = 3;
        Object.assign(sim.ensureRaidState(), {
          phase: "calm",
          timer: 9999,
          activeCount: 0,
          signalTimer: 0,
          breachTimer: 0,
          casualties: 0,
          enemyCasualties: 0,
          lastOutcome: "none",
        });
        sim.rivalNest.discovered = true;
        sim.rivalNest.defeated = false;
        sim.rivalNest.integrity = 1;
        sim.rivalNest.underAttackTimer = 0;
        sim.rivalNest.attackPulseTimer = 0;
        sim.rivalNest.defenseWaveArmed = true;
        sim.rivalNest.defenseClearTimer = 0;
        sim.computeDerived();
        sim.syncAntPopulation();

        if (!workersEnabled) {
          sim.spawnRivalNestWorkers = () => {};
          sim.clearRivalNestWorkers();
        } else {
          sim.spawnRivalNestWorkers();
        }

        let defenseSortieEvents = 0;
        const originalPushLog = sim.pushLog.bind(sim);
        sim.pushLog = (message) => {
          if (String(message ?? "").includes("敵巣防衛出動")) defenseSortieEvents += 1;
          originalPushLog(message);
        };

        const started = sim.startSoldierSortie("expedition");
        const attackers = sim.deployedSoldiers();
        if (!started || attackers.length !== 6) {
          throw new Error(`Expected six expedition soldiers, got started=${started} count=${attackers.length}`);
        }
        let forwardX = sim.nest.x - sim.rivalNest.x;
        let forwardZ = sim.nest.z - sim.rivalNest.z;
        const forwardDistance = Math.hypot(forwardX, forwardZ) || 1;
        forwardX /= forwardDistance;
        forwardZ /= forwardDistance;
        const flankX = -forwardZ;
        const flankZ = forwardX;
        attackers.forEach((ant, index) => {
          const lane = index - (attackers.length - 1) * 0.5;
          ant.setVariant("soldier");
          ant.role = "guard";
          ant.isSortieSoldier = true;
          ant.sortieMode = "expedition";
          ant.sortieTimer = Math.max(82, maxSeconds + 10);
          ant.state = "explore";
          ant.inNest = false;
          ant.nestStayTimer = 0;
          ant.stun = 0;
          ant.fleeTimer = 0;
          ant.clashTimer = 0;
          ant.clashRival = null;
          ant.energy = 1;
          ant.traits.persistence = 0.84;
          ant.traits.caution = 0.84;
          ant.squadId = null;
          ant.squadLeaderId = null;
          ant.x = sim.rivalNest.x + forwardX * (45 + (index % 2) * 1.2) + flankX * lane * 2.2;
          ant.z = sim.rivalNest.z + forwardZ * (45 + (index % 2) * 1.2) + flankZ * lane * 2.2;
          ant.prevX = ant.x;
          ant.prevZ = ant.z;
        });

        const defenderTargetCount = sim.rivalNestDefenderTargetCount(attackers);
        sim.updateRivalNestDefense(0.1);
        const initialDefenders = sim.rivalNestDefenders();
        const defenderIds = initialDefenders.map((rival) => rival.id);
        if (!defendersEnabled) sim.clearRivalNestDefenders();
        sim.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };

        let defenderWins = 0;
        let colonyWinsAgainstDefenders = 0;
        let workerWins = 0;
        let colonyWinsAgainstWorkers = 0;
        const originalRegisterFight = sim.registerRivalFight.bind(sim);
        sim.registerRivalFight = (winner, ant, rival, details = {}) => {
          if (rival?.isRivalNestDefender) {
            if (winner === "rival") defenderWins += 1;
            else if (winner === "colony") colonyWinsAgainstDefenders += 1;
          }
          if (rival?.isRivalWorker) {
            if (winner === "rival") workerWins += 1;
            else if (winner === "colony") colonyWinsAgainstWorkers += 1;
          }
          originalRegisterFight(winner, ant, rival, details);
        };

        let assaultAntSeconds = 0;
        const originalAssault = sim.updateRivalNestAssault.bind(sim);
        sim.updateRivalNestAssault = (dt) => {
          const eligible = sim.deployedSoldiers().filter((ant) =>
            sim.shouldRenderAnt(ant) &&
            ant.state !== "return" &&
            ant.state !== "flee" &&
            ant.state !== "clash" &&
            !ant.clashRival &&
            ant.stun <= 0 &&
            Math.hypot(ant.x - sim.rivalNest.x, ant.z - sim.rivalNest.z) <= sim.rivalNest.radius + 13.5
          );
          assaultAntSeconds += eligible.length * dt;
          originalAssault(dt);
        };

        const uniqueWorkers = new Set(sim.rivalNestWorkers().map((rival) => rival.id));
        const fleeingAttackers = new Set();
        let attackerClashAntSeconds = 0;
        let defenderClashSeconds = 0;
        let workerClashSeconds = 0;
        let timeTo50 = null;
        let timeToVictory = null;
        let elapsed = 0;
        const maxSteps = Math.ceil(maxSeconds / stepDt);
        for (let step = 0; step < maxSteps; step += 1) {
          for (const rival of sim.rivalNestWorkers()) uniqueWorkers.add(rival.id);
          for (const ant of attackers) {
            if (ant.state === "flee") fleeingAttackers.add(ant.id);
            if (ant.state === "clash" || ant.clashRival) attackerClashAntSeconds += stepDt;
          }
          defenderClashSeconds += sim.rivalNestDefenders().filter((rival) => rival.clash).length * stepDt;
          workerClashSeconds += sim.rivalNestWorkers().filter((rival) => rival.clash).length * stepDt;
          sim.updateGame(stepDt);
          elapsed += stepDt;
          if (timeTo50 == null && sim.rivalNest.integrity <= 0.5) timeTo50 = elapsed;
          if (sim.rivalNest.defeated || sim.colony.gameStatus === "victory") {
            timeToVictory = elapsed;
            break;
          }
        }

        const integrityDamage = Math.max(0, 1 - sim.rivalNest.integrity);
        const observedAssaultRate = assaultAntSeconds > 0 ? integrityDamage / assaultAntSeconds : 0;
        return {
          seed,
          defendersEnabled,
          workersEnabled,
          started,
          attackerCount: attackers.length,
          defenderTargetCount,
          initialDefenderCount: defenderIds.length,
          defenseSortieEvents,
          elapsedSeconds: Number(elapsed.toFixed(3)),
          integrityDamage: Number(integrityDamage.toFixed(6)),
          finalIntegrity: Number(sim.rivalNest.integrity.toFixed(6)),
          assaultAntSeconds: Number(assaultAntSeconds.toFixed(6)),
          attackerClashAntSeconds: Number(attackerClashAntSeconds.toFixed(6)),
          defenderClashSeconds: Number(defenderClashSeconds.toFixed(6)),
          workerClashSeconds: Number(workerClashSeconds.toFixed(6)),
          observedAssaultRate: Number(observedAssaultRate.toFixed(8)),
          expectedAssaultRate,
          timeTo50: timeTo50 == null ? null : Number(timeTo50.toFixed(3)),
          timeToVictory: timeToVictory == null ? null : Number(timeToVictory.toFixed(3)),
          victory: timeToVictory != null,
          defenderWins,
          colonyWinsAgainstDefenders,
          workerWins,
          colonyWinsAgainstWorkers,
          uniqueWorkers: uniqueWorkers.size,
          fleeingAttackers: fleeingAttackers.size,
        };
      },
      { ...options, stepDt: STEP_DT, expectedAssaultRate: SOLDIER_ASSAULT_RATE },
    );
  } finally {
    await page.close();
  }
}

async function measureWorkerCombat(context, targetUrl) {
  const page = await newSimulationPage(context, targetUrl);
  try {
    return await page.evaluate(() => {
      const sim = window.__ANT_SIM;
      localStorage.clear();
      sim.reset(true);
      sim.paused = true;
      sim.clearRaidRivals();
      sim.rivalNest.discovered = true;
      sim.rivalNest.defeated = false;
      sim.rivalNest.integrity = 1;
      sim.spawnRivalNestWorkers();
      const workers = sim.rivalNestWorkers();
      const soloWorker = workers[0];
      const pairWorker = workers[1];
      const soloAnt = sim.ants[0];
      const pairA = sim.ants[1];
      const pairB = sim.ants[2];

      const configureWorker = (rival, x, z) => {
        rival.x = x;
        rival.z = z;
        rival.prevX = x;
        rival.prevZ = z;
        rival.aggression = 0.14;
        rival.stubbornness = 0.24;
        rival.scale = 0.9;
        rival.combatDamage = 0;
        rival.retreat = 0;
        rival.clash = null;
        rival.fightCooldown = 0;
        rival.defeated = false;
        rival.leftRaid = false;
      };
      const configureSoldier = (ant, x, z) => {
        ant.setVariant("soldier");
        ant.role = "guard";
        ant.isSortieSoldier = true;
        ant.sortieMode = "expedition";
        ant.state = "explore";
        ant.inNest = false;
        ant.nestStayTimer = 0;
        ant.stun = 0;
        ant.fleeTimer = 0;
        ant.clashTimer = 0;
        ant.clashRival = null;
        ant.energy = 1;
        ant.carrying = 0;
        ant.traits.persistence = 0.84;
        ant.traits.caution = 0.84;
        ant.squadId = null;
        ant.squadLeaderId = null;
        ant.x = x;
        ant.z = z;
        ant.prevX = x;
        ant.prevZ = z;
      };

      for (const ant of sim.ants) {
        ant.state = "stunned";
        ant.stun = 30;
        ant.x = sim.nest.x;
        ant.z = sim.nest.z;
      }

      const x = sim.rivalNest.x;
      const z = sim.rivalNest.z;
      configureWorker(soloWorker, x, z);
      configureSoldier(soloAnt, x + 0.45, z);
      const previewPower = soloWorker.combatPowers(soloAnt, sim).rivalPower;
      const soloStarted = soloWorker.startClash(soloAnt, x + 0.2, z, sim);
      const soloGrapplers = soloWorker.clash?.ants?.length ?? 0;
      if (soloWorker.clash) {
        soloWorker.clash.elapsed = soloWorker.clash.duration;
        soloWorker.finishClash(sim);
      }
      const soloSurvived = sim.rivalAnts.includes(soloWorker);
      const soloDamage = soloWorker.combatDamage;

      configureWorker(pairWorker, x, z + 8);
      configureSoldier(pairA, x + 0.45, z + 8);
      configureSoldier(pairB, x + 0.9, z + 8.3);
      const pairStarted = pairWorker.startClash(pairA, x + 0.2, z + 8, sim);
      const pairGrapplers = pairWorker.clash?.ants?.length ?? 0;
      if (pairWorker.clash) {
        pairWorker.clash.elapsed = pairWorker.clash.duration;
        pairWorker.finishClash(sim);
      }
      return {
        previewPower: Number(previewPower.toFixed(6)),
        soloStarted,
        soloGrapplers,
        soloWinner: soloWorker.lastFightWinner,
        soloSurvived,
        soloDamage: Number(soloDamage.toFixed(6)),
        pairStarted,
        pairGrapplers,
        pairWinner: pairWorker.lastFightWinner,
        pairDefeated: !sim.rivalAnts.includes(pairWorker),
        pairDamage: Number(pairWorker.combatDamage.toFixed(6)),
      };
    });
  } finally {
    await page.close();
  }
}

async function measureDefenseLifecycle(context, targetUrl) {
  const page = await newSimulationPage(context, targetUrl);
  try {
    return await page.evaluate(() => {
      const sim = window.__ANT_SIM;
      localStorage.clear();
      sim.reset(true);
      sim.paused = true;
      sim.clearRaidRivals();
      sim.clearRivalNestDefenders();
      Object.assign(sim.colony, {
        antPopulation: 48,
        soldierAnts: 12,
        woundedAnts: 0,
        gameStatus: "playing",
      });
      sim.rivalNest.discovered = true;
      sim.rivalNest.defeated = false;
      sim.rivalNest.integrity = 1;
      sim.rivalNest.defenseWaveArmed = true;
      sim.rivalNest.defenseClearTimer = 0;
      sim.soldierSortieCooldown = 0;
      sim.computeDerived();
      sim.syncAntPopulation();
      const started = sim.startSoldierSortie("expedition");
      const attackers = sim.deployedSoldiers();
      attackers.forEach((ant, index) => {
        ant.sortieMode = "expedition";
        ant.state = "explore";
        ant.inNest = false;
        ant.nestStayTimer = 0;
        ant.x = sim.rivalNest.x - 36 - index;
        ant.z = sim.rivalNest.z;
        ant.prevX = ant.x;
        ant.prevZ = ant.z;
      });
      let defenseSortieEvents = 0;
      const originalPushLog = sim.pushLog.bind(sim);
      sim.pushLog = (message) => {
        if (String(message ?? "").includes("敵巣防衛出動")) defenseSortieEvents += 1;
        originalPushLog(message);
      };
      sim.updateRivalNestDefense(0.1);
      const initialCount = sim.rivalNestDefenders().length;
      const defeated = sim.rivalNestDefenders()[0];
      sim.defeatRivalAnt(defeated, attackers[0]);
      sim.updateRivalNestDefense(0.1);
      const countAfterDefeat = sim.rivalNestDefenders().length;
      const eventsAfterDefeat = defenseSortieEvents;

      for (const ant of attackers) ant.state = "flee";
      sim.updateRivalNestDefense(6.1);
      const countDuringFlee = sim.rivalNestDefenders().length;
      const armedDuringFlee = sim.rivalNest.defenseWaveArmed;

      for (const ant of attackers) ant.state = "return";
      const remaining = sim.rivalNestDefenders();
      if (remaining[0]) {
        remaining[0].x = sim.rivalNest.x + 80;
        remaining[0].z = sim.rivalNest.z;
      }
      sim.updateRivalNestDefense(6.1);
      const countBeforeForceReturn = sim.rivalNestDefenders().length;
      sim.updateRivalNestDefense(16.1);
      const countAfterForceReturn = sim.rivalNestDefenders().length;
      return {
        started,
        attackerCount: attackers.length,
        countBoundaries: [1, 2, 4, 5, 6, 18, 19, 30].map((count) => ({
          attackers: count,
          defenders: sim.rivalNestDefenderTargetCount(Array.from({ length: count }, () => ({}))),
        })),
        initialCount,
        defenseSortieEvents,
        countAfterDefeat,
        eventsAfterDefeat,
        countDuringFlee,
        armedDuringFlee,
        countBeforeForceReturn,
        countAfterForceReturn,
        armedAfterReturn: sim.rivalNest.defenseWaveArmed,
      };
    });
  } finally {
    await page.close();
  }
}

function buildFailures(summary) {
  const failures = [];
  const integrated = summary.integrated;
  const isolated = summary.isolated;
  const worker = summary.workerCombat;
  const lifecycle = summary.lifecycle;

  if (integrated.avgAssaultReductionRatio < 0.08) {
    failures.push(`integrated assault reduction ${(integrated.avgAssaultReductionRatio * 100).toFixed(2)}% < 8%`);
  }
  if (integrated.medianPairedAssaultDelta <= 0) {
    failures.push(`integrated median paired assault delta ${integrated.medianPairedAssaultDelta.toFixed(3)} <= 0`);
  }
  if (integrated.on.minIntegrityDamage < 0.1 || integrated.on.avgIntegrityDamage < 0.2) {
    failures.push(`integrated expedition progress too low: min ${integrated.on.minIntegrityDamage}, avg ${integrated.on.avgIntegrityDamage}`);
  }
  if (isolated.timeTo50DelaySeconds < 2 || isolated.timeTo50DelayRatio < 0.1) {
    failures.push(`isolated timeTo50 delay ${isolated.timeTo50DelaySeconds}s / ${(isolated.timeTo50DelayRatio * 100).toFixed(2)}%`);
  }
  if (isolated.victoryDelaySeconds < 2 || isolated.victoryDelayRatio < 0.1) {
    failures.push(`isolated victory delay ${isolated.victoryDelaySeconds}s / ${(isolated.victoryDelayRatio * 100).toFixed(2)}%`);
  }
  if (isolated.on.victories !== SEEDS.length) failures.push(`isolated victories ${isolated.on.victories}/${SEEDS.length}`);

  const rateError = Math.abs(integrated.on.avgObservedAssaultRate - SOLDIER_ASSAULT_RATE) / SOLDIER_ASSAULT_RATE;
  if (rateError > 0.02) failures.push(`assault rate error ${(rateError * 100).toFixed(2)}% > 2%`);

  if (!worker.soloSurvived || worker.soloWinner !== "colony" || worker.soloDamage <= 0.2) {
    failures.push(`worker solo outcome invalid: ${JSON.stringify(worker)}`);
  }
  if (!worker.pairDefeated || worker.pairWinner !== "colony" || worker.pairGrapplers !== 2) {
    failures.push(`worker pair outcome invalid: ${JSON.stringify(worker)}`);
  }

  const expectedBoundaries = [2, 2, 2, 3, 3, 9, 10, 10];
  if (lifecycle.countBoundaries.some((entry, index) => entry.defenders !== expectedBoundaries[index])) {
    failures.push(`defender count boundaries invalid: ${JSON.stringify(lifecycle.countBoundaries)}`);
  }
  if (lifecycle.initialCount !== 3 || lifecycle.defenseSortieEvents !== 1 || lifecycle.eventsAfterDefeat !== 1) {
    failures.push(`defense wave invalid: ${JSON.stringify(lifecycle)}`);
  }
  if (lifecycle.countAfterDefeat !== 2 || lifecycle.countDuringFlee !== 2 || lifecycle.armedDuringFlee) {
    failures.push(`defense refill/flee lifecycle invalid: ${JSON.stringify(lifecycle)}`);
  }
  if (lifecycle.countBeforeForceReturn !== 2 || lifecycle.countAfterForceReturn !== 0 || !lifecycle.armedAfterReturn) {
    failures.push(`defense return lifecycle invalid: ${JSON.stringify(lifecycle)}`);
  }
  return failures;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const server = await createStaticServer({ root: resolve("dist"), port: 0 });
let browser;
try {
  const address = server.address();
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });

  const integratedOff = [];
  const integratedOn = [];
  const isolatedOff = [];
  const isolatedOn = [];
  for (const seed of SEEDS) {
    integratedOff.push(await runExpeditionScenario(context, targetUrl, {
      seed,
      defendersEnabled: false,
      workersEnabled: true,
      maxSeconds: INTEGRATED_SECONDS,
    }));
    integratedOn.push(await runExpeditionScenario(context, targetUrl, {
      seed,
      defendersEnabled: true,
      workersEnabled: true,
      maxSeconds: INTEGRATED_SECONDS,
    }));
    isolatedOff.push(await runExpeditionScenario(context, targetUrl, {
      seed,
      defendersEnabled: false,
      workersEnabled: false,
      maxSeconds: ISOLATED_SECONDS,
    }));
    isolatedOn.push(await runExpeditionScenario(context, targetUrl, {
      seed,
      defendersEnabled: true,
      workersEnabled: false,
      maxSeconds: ISOLATED_SECONDS,
    }));
  }

  const integratedOffAggregate = aggregateRuns(integratedOff);
  const integratedOnAggregate = aggregateRuns(integratedOn);
  const isolatedOffAggregate = aggregateRuns(isolatedOff);
  const isolatedOnAggregate = aggregateRuns(isolatedOn);
  integratedOnAggregate.avgObservedAssaultRate = round(mean(integratedOn.map((run) => run.observedAssaultRate)), 8);

  const summary = {
    generatedAt: new Date().toISOString(),
    targetUrl,
    seeds: SEEDS,
    stepDt: STEP_DT,
    integrated: {
      description: "Six normal soldiers, live rival-worker replenishment, 60 simulated seconds",
      off: integratedOffAggregate,
      on: integratedOnAggregate,
      avgAssaultReductionRatio: round(1 - integratedOnAggregate.avgAssaultAntSeconds / integratedOffAggregate.avgAssaultAntSeconds),
      medianPairedAssaultDelta: round(median(integratedOff.map((run, index) => run.assaultAntSeconds - integratedOn[index].assaultAntSeconds))),
      pairedRuns: integratedOff.map((off, index) => ({ seed: off.seed, off, on: integratedOn[index] })),
    },
    isolated: {
      description: "Six normal soldiers, rival workers disabled, run until victory or 50 seconds",
      off: isolatedOffAggregate,
      on: isolatedOnAggregate,
      timeTo50DelaySeconds: round(isolatedOnAggregate.avgTimeTo50 - isolatedOffAggregate.avgTimeTo50, 3),
      timeTo50DelayRatio: round(isolatedOnAggregate.avgTimeTo50 / isolatedOffAggregate.avgTimeTo50 - 1),
      victoryDelaySeconds: round(isolatedOnAggregate.avgTimeToVictory - isolatedOffAggregate.avgTimeToVictory, 3),
      victoryDelayRatio: round(isolatedOnAggregate.avgTimeToVictory / isolatedOffAggregate.avgTimeToVictory - 1),
      pairedRuns: isolatedOff.map((off, index) => ({ seed: off.seed, off, on: isolatedOn[index] })),
    },
    workerCombat: await measureWorkerCombat(context, targetUrl),
    lifecycle: await measureDefenseLifecycle(context, targetUrl),
  };
  summary.failures = buildFailures(summary);
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    summaryPath: SUMMARY_PATH,
    failures: summary.failures,
    integrated: {
      off: summary.integrated.off,
      on: summary.integrated.on,
      avgAssaultReductionRatio: summary.integrated.avgAssaultReductionRatio,
      medianPairedAssaultDelta: summary.integrated.medianPairedAssaultDelta,
    },
    isolated: summary.isolated,
    workerCombat: summary.workerCombat,
    lifecycle: summary.lifecycle,
  }, null, 2));
  await context.close();
  if (summary.failures.length > 0) throw new Error(`Expedition defense verification failed: ${summary.failures.join("; ")}`);
} finally {
  await browser?.close();
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}
