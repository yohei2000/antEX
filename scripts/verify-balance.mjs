import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createStaticServer } from "./serve.mjs";

const SEEDS = [1101, 2203, 3307, 4409, 5519];
const OUTPUT_DIR = resolve("verification", "balance");
const SUMMARY_PATH = join(OUTPUT_DIR, "summary.json");
const STEP_DT = 1 / 60;
const MAX_SECONDS = 126;
const SCENARIO_FILTER = process.env.ANTEX_BALANCE_SCENARIO?.trim() || null;
if (SCENARIO_FILTER && SCENARIO_FILTER !== "mid_reinforced_normal") {
  throw new Error(`Unsupported filtered balance scenario: ${SCENARIO_FILTER}`);
}

const BASE_UPGRADES = {
  foragerTrails: 0,
  trailPheromones: 0,
  storageChambers: 0,
  chamberExcavation: 0,
  builderTraining: 0,
  ventilationShafts: 0,
  wasteGallery: 0,
  broodNursery: 0,
  broodClimate: 0,
  foodDistribution: 0,
  queenCare: 0,
  soldierTraining: 0,
  heavySoldierBrood: 0,
  shieldHeadBrood: 0,
  acidShooterBrood: 0,
  scoutBrood: 0,
  medicBrood: 0,
  captainBrood: 0,
  nestGuard: 0,
  sentinelPosts: 0,
};

const EARLY_BASE = {
  antPopulation: 24,
  nestLevel: 2,
  territory: 1,
  enemyThreat: 3,
  food: 140,
  soldierAnts: 6,
  upgrades: { soldierTraining: 1 },
};

const MID_BASE = {
  antPopulation: 48,
  nestLevel: 3,
  territory: 3,
  enemyThreat: 7,
  food: 280,
  soldierAnts: 24,
  upgrades: { soldierTraining: 3, nestGuard: 2, sentinelPosts: 1 },
};

const MID_REINFORCED_NORMAL_BASE = {
  ...MID_BASE,
  soldierAnts: 20,
};

const LATE_BASE = {
  antPopulation: 90,
  nestLevel: 5,
  territory: 6,
  enemyThreat: 14,
  food: 520,
  soldierAnts: 34,
  upgrades: {
    soldierTraining: 6,
    heavySoldierBrood: 4,
    shieldHeadBrood: 4,
    acidShooterBrood: 4,
    scoutBrood: 4,
    medicBrood: 4,
    captainBrood: 3,
    nestGuard: 5,
    sentinelPosts: 3,
    ventilationShafts: 3,
    wasteGallery: 2,
  },
  variants: { heavySoldierAnts: 4, shieldHeadAnts: 4, acidShooterAnts: 4, scoutAnts: 4, medicAnts: 4, captainAnts: 3 },
};

const SCENARIOS = [
  {
    id: "early_sortie",
    suite: "early",
    config: { ...EARLY_BASE, sortie: true, variants: {} },
  },
  {
    id: "early_no_sortie",
    suite: "early",
    config: { ...EARLY_BASE, sortie: false, variants: {} },
  },
  {
    id: "mid_mixed",
    suite: "mid",
    config: {
      ...MID_BASE,
      sortie: true,
      upgrades: {
        ...MID_BASE.upgrades,
        heavySoldierBrood: 1,
        shieldHeadBrood: 1,
        acidShooterBrood: 1,
        scoutBrood: 1,
        medicBrood: 1,
        captainBrood: 1,
      },
      variants: { heavySoldierAnts: 1, shieldHeadAnts: 1, acidShooterAnts: 1, scoutAnts: 1, medicAnts: 1, captainAnts: 1 },
    },
  },
  {
    id: "mid_reinforced_normal",
    suite: "mid_reinforcement",
    config: {
      ...MID_REINFORCED_NORMAL_BASE,
      sortie: true,
      sortieWaves: 2,
      fixedEnemyCount: 8,
      variants: {},
    },
  },
  ...["heavySoldier", "shieldHead", "acidShooter", "scout", "medic", "captain", "soldier"].map((variant) => ({
    id: `mid_single_${variant}`,
    suite: "mid_single_variant",
    config: singleVariantScenario(variant),
  })),
  {
    id: "late_pressure",
    suite: "late",
    config: { ...LATE_BASE, sortie: true },
  },
];

function singleVariantScenario(variant) {
  const variants = {};
  const upgrades = { ...MID_BASE.upgrades };
  if (variant !== "soldier") {
    const countKey = `${variant}Ants`;
    const upgradeKey =
      variant === "heavySoldier" ? "heavySoldierBrood" :
      variant === "shieldHead" ? "shieldHeadBrood" :
      variant === "acidShooter" ? "acidShooterBrood" :
      variant === "scout" ? "scoutBrood" :
      variant === "medic" ? "medicBrood" :
      "captainBrood";
    variants[countKey] = MID_BASE.soldierAnts;
    upgrades[upgradeKey] = MID_BASE.soldierAnts;
  }
  return {
    ...MID_BASE,
    sortie: true,
    upgrades,
    variants,
  };
}

async function launchBrowser() {
  const preferBundled = process.env.ANTEX_VERIFY_BROWSER === "bundled";
  if (preferBundled) {
    return await chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--disable-background-networking"],
    });
  }
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

function aggregate(runs) {
  const count = runs.length || 1;
  const sum = (key) => runs.reduce((total, run) => total + (Number(run[key]) || 0), 0);
  const successCount = runs.filter((run) => run.success).length;
  const perfectCount = runs.filter((run) => run.raidOutcome === "repelled" && run.harmScore <= 0.001).length;
  const defeatCount = runs.filter((run) => run.defeated).length;
  return {
    runs: runs.length,
    successCount,
    perfectCount,
    defeatCount,
    minActiveCount: Math.min(...runs.map((run) => run.activeCount)),
    maxActiveCount: Math.max(...runs.map((run) => run.activeCount)),
    avgDeaths: sum("deaths") / count,
    avgSortieDeaths: sum("sortieDeaths") / count,
    avgEnemyCasualties: sum("enemyCasualties") / count,
    avgFoodLoss: sum("foodLoss") / count,
    avgWoundedDelta: sum("woundedDelta") / count,
    avgBreachEvents: sum("breachEvents") / count,
    avgNestDurabilityLoss: sum("nestDurabilityLoss") / count,
    avgHarmScore: sum("harmScore") / count,
    avgClearSeconds: sum("clearSeconds") / count,
    maxDeaths: Math.max(...runs.map((run) => run.deaths)),
    maxSortieDeaths: Math.max(...runs.map((run) => run.sortieDeaths)),
    minEnemyCasualties: Math.min(...runs.map((run) => run.enemyCasualties)),
    minPeakDeployedSoldiers: Math.min(...runs.map((run) => run.peakDeployedSoldiers)),
  };
}

function assertMidReinforcedNormal(entry) {
  const failures = [];
  if (!entry) return ["mid_reinforced_normal result missing"];
  const aggregate = entry.aggregate;
  if (aggregate.minActiveCount !== 8 || aggregate.maxActiveCount !== 8) {
    failures.push(`mid_reinforced_normal activeCount range ${aggregate.minActiveCount}-${aggregate.maxActiveCount} !== 8`);
  }
  if (aggregate.minPeakDeployedSoldiers < 20) {
    failures.push(`mid_reinforced_normal minPeakDeployedSoldiers ${aggregate.minPeakDeployedSoldiers} < 20`);
  }
  if (aggregate.avgSortieDeaths > 3) {
    failures.push(`mid_reinforced_normal avgSortieDeaths ${aggregate.avgSortieDeaths.toFixed(2)} > 3`);
  }
  if (aggregate.maxSortieDeaths > 6) {
    failures.push(`mid_reinforced_normal maxSortieDeaths ${aggregate.maxSortieDeaths} > 6`);
  }
  if (aggregate.avgEnemyCasualties < 7) {
    failures.push(`mid_reinforced_normal avgEnemyCasualties ${aggregate.avgEnemyCasualties.toFixed(2)} < 7`);
  }
  if (aggregate.minEnemyCasualties < 6) {
    failures.push(`mid_reinforced_normal minEnemyCasualties ${aggregate.minEnemyCasualties} < 6`);
  }
  if (aggregate.defeatCount > 0) failures.push(`mid_reinforced_normal defeatCount ${aggregate.defeatCount} > 0`);
  return failures;
}

function assertBalance(summary) {
  const failures = [];
  const earlySortie = summary.scenarios.early_sortie.aggregate;
  const earlyNoSortie = summary.scenarios.early_no_sortie.aggregate;
  const midMixed = summary.scenarios.mid_mixed.aggregate;
  const latePressure = summary.scenarios.late_pressure.aggregate;

  if (earlySortie.successCount < 4) failures.push(`early_sortie successCount ${earlySortie.successCount} < 4`);
  if (earlySortie.defeatCount > 0) failures.push(`early_sortie defeatCount ${earlySortie.defeatCount} > 0`);
  const earlySortieDeathLimit = Math.min(2.6, earlyNoSortie.avgDeaths * 0.72);
  if (earlySortie.avgDeaths > earlySortieDeathLimit) {
    failures.push(`early_sortie avgDeaths ${earlySortie.avgDeaths.toFixed(2)} > ${earlySortieDeathLimit.toFixed(2)}`);
  }

  const noSortieMinimum = Math.max(earlySortie.avgHarmScore * 1.25, earlySortie.avgHarmScore + 0.25);
  if (earlyNoSortie.avgHarmScore <= noSortieMinimum) {
    failures.push(`early_no_sortie avgHarmScore ${earlyNoSortie.avgHarmScore.toFixed(2)} <= ${noSortieMinimum.toFixed(2)}`);
  }
  if (earlyNoSortie.defeatCount > 0) failures.push(`early_no_sortie defeatCount ${earlyNoSortie.defeatCount} > 0`);

  if (midMixed.successCount < 4) failures.push(`mid_mixed successCount ${midMixed.successCount} < 4`);
  if (midMixed.perfectCount > 2) failures.push(`mid_mixed perfectCount ${midMixed.perfectCount} > 2`);

  failures.push(...assertMidReinforcedNormal(summary.scenarios.mid_reinforced_normal));

  for (const [id, entry] of Object.entries(summary.scenarios)) {
    if (!id.startsWith("mid_single_")) continue;
    const single = entry.aggregate;
    const strongerHarm = single.avgHarmScore < midMixed.avgHarmScore * 0.9;
    const strongerKills = single.avgEnemyCasualties > midMixed.avgEnemyCasualties + 0.5;
    if (strongerHarm && strongerKills) {
      failures.push(`${id} outperforms mid_mixed: harm ${single.avgHarmScore.toFixed(2)} vs ${midMixed.avgHarmScore.toFixed(2)}, kills ${single.avgEnemyCasualties.toFixed(2)} vs ${midMixed.avgEnemyCasualties.toFixed(2)}`);
    }
  }

  if (latePressure.minActiveCount < 14) failures.push(`late_pressure minActiveCount ${latePressure.minActiveCount} < 14`);
  if (latePressure.successCount < 3) failures.push(`late_pressure successCount ${latePressure.successCount} < 3`);
  if (latePressure.avgHarmScore < 0.8) failures.push(`late_pressure avgHarmScore ${latePressure.avgHarmScore.toFixed(2)} < 0.8`);

  return failures;
}

async function runScenario(page, scenario, seed) {
  return await page.evaluate(
      ({ scenario, seed, maxSeconds, stepDt }) => {
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
        sim.soldierSortieCooldown = 0;
        sim.sortieRetireQueue = [];
        sim.squads = [];
        sim.nextSquadId = 1;
        sim.clearRaidRivals();
        for (const corpse of [...(sim.rivalCorpses ?? []), ...(sim.colonyCorpses ?? [])]) sim.disposeDynamicItem(corpse);
        sim.rivalCorpses = [];
        sim.colonyCorpses = [];

        const upgrades = { ...scenario.upgrades };
        for (const key of Object.keys(sim.colony.upgrades)) sim.colony.upgrades[key] = 0;
        for (const [key, value] of Object.entries(upgrades)) sim.colony.upgrades[key] = value;

        Object.assign(sim.colony, {
          food: scenario.food,
          lifetimeFood: scenario.food,
          antPopulation: scenario.antPopulation,
          soldierAnts: scenario.soldierAnts,
          heavySoldierAnts: 0,
          shieldHeadAnts: 0,
          acidShooterAnts: 0,
          scoutAnts: 0,
          captainAnts: 0,
          builderAnts: 0,
          woundedAnts: 0,
          nestLevel: scenario.nestLevel,
          territory: scenario.territory,
          enemyThreat: scenario.enemyThreat,
          nestDurability: 100,
          gameStatus: "playing",
          fallenAnts: 0,
          hatchProgress: 0,
          battleCooldownUntil: 0,
          battleLog: [],
          earthworks: [],
          nextEarthworkId: 1,
        });
        Object.assign(sim.colony, scenario.variants ?? {});
        sim.ensureRaidState();
        sim.syncAntPopulation();
        sim.updateColonyVisuals();
        sim.updateStats();

        let breachEvents = 0;
        let loggedFoodLoss = 0;
        const originalPushLog = sim.pushLog.bind(sim);
        sim.pushLog = (message) => {
          const text = String(message ?? "");
          if (text.includes("\u6575\u304c\u5de3\u7a74\u3092\u76f4\u63a5\u653b\u6483\u3057\u305f")) breachEvents += 1;
          const match = text.match(/\u98df\u6599-(\d+(?:\.\d+)?)/u);
          if (match) loggedFoodLoss += Number(match[1]) || 0;
          originalPushLog(message);
        };

        const raid = sim.ensureRaidState();
        Object.assign(raid, {
          phase: "warning",
          timer: 0,
          wave: seed,
          activeCount: scenario.fixedEnemyCount ?? sim.raidEnemyCount(),
          approachAngle: Math.random() * Math.PI * 2,
          signalTimer: 0,
          breachTimer: 0,
          casualties: 0,
          enemyCasualties: 0,
          startFallenAnts: 0,
          lastOutcome: "warning",
        });
        sim.beginRaid();
        const activeCount = raid.activeCount;
        const startFood = sim.colony.food;
        const startWounded = sim.colony.woundedAnts;
        const startFallen = sim.colony.fallenAnts;
        const startNestDurability = sim.colony.nestDurability;
        const startSoldierPool = sim.sortieSoldierPool();
        let sortieWavesStarted = 0;
        if (scenario.sortie && sim.startSoldierSortie("defense")) sortieWavesStarted = 1;
        let peakDeployedSoldiers = sim.deployedSoldierCount();

        let elapsed = 0;
        const maxSteps = Math.ceil(maxSeconds / stepDt);
        for (let step = 0; step < maxSteps; step += 1) {
          if (
            scenario.sortie &&
            sortieWavesStarted < Math.max(1, Math.floor(scenario.sortieWaves ?? 1)) &&
            sim.soldierSortieCooldown <= 0 &&
            sim.startSoldierSortie("defense")
          ) {
            sortieWavesStarted += 1;
          }
          peakDeployedSoldiers = Math.max(peakDeployedSoldiers, sim.deployedSoldierCount());
          sim.updateGame(stepDt);
          elapsed += stepDt;
          if (sim.colony.raidState.phase === "recovering") break;
        }

        const finalRaid = sim.ensureRaidState();
        const deaths = Math.max(0, Math.floor((sim.colony.fallenAnts ?? 0) - startFallen));
        const sortieDeaths = Math.max(0, Math.floor(startSoldierPool - sim.sortieSoldierPool()));
        const woundedDelta = Math.max(0, Math.floor((sim.colony.woundedAnts ?? 0) - startWounded));
        const foodLoss = Math.max(loggedFoodLoss, Math.max(0, startFood - sim.colony.food));
        const enemyCasualties = Math.floor(finalRaid.enemyCasualties ?? 0);
        const raidOutcome = finalRaid.phase === "recovering" ? finalRaid.lastOutcome : finalRaid.phase;
        const nestDurabilityLoss = Math.max(0, startNestDurability - sim.colony.nestDurability);
        const harmScore = deaths + woundedDelta * 0.25 + foodLoss / 15 + breachEvents * 0.75;
        return {
          scenarioId: scenario.id,
          seed,
          sortie: Boolean(scenario.sortie),
          raidOutcome,
          success: raidOutcome === "repelled" || raidOutcome === "held",
          activeCount,
          deaths,
          sortieDeaths,
          enemyCasualties,
          foodLoss,
          woundedDelta,
          clearSeconds: Number(elapsed.toFixed(2)),
          breachEvents,
          nestDurabilityLoss,
          defeated: sim.colony.gameStatus === "defeat",
          harmScore: Number(harmScore.toFixed(3)),
          deployedSoldiers: sim.deployedSoldierCount(),
          peakDeployedSoldiers,
          sortieWavesStarted,
          remainingRivals: sim.raidRivals().length,
        };
      },
    { scenario: { id: scenario.id, ...scenario.config }, seed, maxSeconds: MAX_SECONDS, stepDt: STEP_DT },
  );
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const server = await createStaticServer({ root: resolve("dist"), port: 0 });
let browser;
try {
  const address = server.address();
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(0);
  await page.goto(`${targetUrl}?raidSoon=1`);
  await waitForSimulation(page);
  await delay(160);
  const selectedScenarios = SCENARIO_FILTER
    ? SCENARIOS.filter((scenario) => scenario.id === SCENARIO_FILTER)
    : SCENARIOS;
  if (selectedScenarios.length === 0) throw new Error(`Unknown balance scenario: ${SCENARIO_FILTER}`);
  const results = {};
  for (const scenario of selectedScenarios) {
    const runs = [];
    for (const seed of SEEDS) {
      runs.push(await runScenario(page, scenario, seed));
    }
    results[scenario.id] = { suite: scenario.suite, runs, aggregate: aggregate(runs) };
    console.log(`${scenario.id}: ${JSON.stringify(results[scenario.id].aggregate)}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    targetUrl,
    seeds: SEEDS,
    maxSeconds: MAX_SECONDS,
    harmScoreFormula: "deaths + woundedDelta * 0.25 + foodLoss / 15 + breachEvents * 0.75",
    scenarios: results,
  };
  const failures = SCENARIO_FILTER === "mid_reinforced_normal"
    ? assertMidReinforcedNormal(summary.scenarios.mid_reinforced_normal)
    : assertBalance(summary);
  summary.failures = failures;
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ summaryPath: SUMMARY_PATH, failures, scenarios: Object.fromEntries(Object.entries(results).map(([id, entry]) => [id, entry.aggregate])) }, null, 2));
  if (failures.length > 0) throw new Error(`Balance verification failed: ${failures.join("; ")}`);
} finally {
  await browser?.close();
  server.close();
}
