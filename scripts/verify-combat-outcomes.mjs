import { mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createStaticServer } from "./serve.mjs";

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

function assertScreenshot(path) {
  const size = statSync(path).size;
  if (size < 12000) throw new Error(`Screenshot looks too small or blank: ${path} (${size} bytes)`);
  return { path, size };
}

async function verifyCombatPeelScenario(page, outputDir) {
  const peel = await page.evaluate(`(() => {
    const sim = window.__ANT_SIM;
    sim.paused = true;
    sim.frameAccumulator = 0;
    for (const rival of [...sim.rivalAnts]) sim.removeRivalAnt(rival);
    for (const corpse of [...(sim.rivalCorpses ?? [])]) sim.disposeDynamicItem(corpse);
    for (const corpse of [...(sim.colonyCorpses ?? [])]) sim.disposeDynamicItem(corpse);
    for (const effect of [...(sim.combatEffects ?? [])]) sim.disposeDynamicItem(effect);
    sim.rivalCorpses = [];
    sim.colonyCorpses = [];
    sim.combatEffects = [];
    sim.colony.enemyThreat = 0;
    sim.colony.raidState = {
      phase: "warning",
      timer: 0,
      wave: 9003,
      activeCount: 2,
      approachAngle: 0,
      signalTimer: 0,
      breachTimer: 0,
      casualties: 0,
      enemyCasualties: 0,
      lastOutcome: "warning",
    };
    sim.beginRaid();
    const [host, entrant] = sim.raidRivals();
    if (!host || !entrant) throw new Error("Peel verification could not create two raid rivals.");

    const baseX = sim.nest.x + 16;
    const baseZ = sim.nest.z + 6;
    for (const ant of sim.ants) {
      ant.state = "stunned";
      ant.stun = 30;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      ant.clashRival = null;
      ant.inNest = false;
      ant.nestStayTimer = 0;
      ant.x = sim.nest.x;
      ant.z = sim.nest.z;
      ant.prevX = ant.x;
      ant.prevZ = ant.z;
    }

    const fighters = sim.ants.slice(0, 3);
    const configureFighter = (ant, x, z) => {
      ant.setVariant("soldier");
      ant.role = "guard";
      ant.isSortieSoldier = false;
      ant.sortieMode = null;
      ant.state = "explore";
      ant.stun = 0;
      ant.fleeTimer = 0;
      ant.clashTimer = 0;
      ant.clashDuration = 0;
      ant.clashRival = null;
      ant.carrying = 0;
      ant.energy = 1;
      ant.traits.persistence = 0.84;
      ant.traits.caution = 0.84;
      ant.x = x;
      ant.z = z;
      ant.prevX = x;
      ant.prevZ = z;
      ant.angle = 0;
    };
    configureFighter(fighters[0], baseX + 0.45, baseZ);
    configureFighter(fighters[1], baseX + 0.9, baseZ + 0.58);
    configureFighter(fighters[2], baseX + 1.1, baseZ - 0.62);

    const configureRival = (rival, x, z) => {
      rival.x = x;
      rival.z = z;
      rival.prevX = x;
      rival.prevZ = z;
      rival.angle = Math.PI / 2;
      rival.baseSpeed = 8;
      rival.aggression = 0.16;
      rival.stubbornness = 0.16;
      rival.scale = 1.16;
      rival.retreat = 0;
      rival.clash = null;
      rival.fightCooldown = 0;
      rival.disrupt = 0;
      rival.defeated = false;
      rival.leftRaid = false;
    };
    configureRival(host, baseX, baseZ);
    configureRival(entrant, baseX - 42, baseZ);

    const started = host.startClash(fighters[0], baseX + 0.22, baseZ, sim);
    const initialIds = host.clash?.ants?.map((ant) => ant.id) ?? [];

    // Start the first clash while the second rival is out of the peel radius, then move it in.
    entrant.x = baseX - 8;
    entrant.z = baseZ;
    entrant.prevX = entrant.x;
    entrant.prevZ = entrant.z;
    const approach = entrant.findCrowdedClashApproach(sim);
    const entrantMarkedHost = approach?.rival === host && entrant.peelTargetRivalId === host.id;
    host.updateClash(1 / 60, sim);
    entrant.updateClash(1 / 60, sim);
    for (let i = 0; i < 36; i += 1) {
      host.updateClash(1 / 60, sim);
      entrant.updateClash(1 / 60, sim);
      sim.updateCombatEffects(1 / 60);
    }

    const hostIds = host.clash?.ants?.map((ant) => ant.id) ?? [];
    const entrantIds = entrant.clash?.ants?.map((ant) => ant.id) ?? [];
    const pairedIds = new Set([...hostIds, ...entrantIds]);
    const released = fighters.filter((ant) => !pairedIds.has(ant.id));
    const primary = fighters[0];
    const result = {
      started,
      initialIds,
      entrantMarkedHost,
      hostIds,
      entrantIds,
      releasedIds: released.map((ant) => ant.id),
      hostPrimaryKept: hostIds.length === 1 && hostIds[0] === primary.id && primary.clashRival === host,
      entrantOwnsDistinctAnt: entrantIds.length === 1 && entrantIds[0] !== primary.id && entrant.clash?.ants?.[0]?.clashRival === entrant,
      releasedCleared: released.length === 1 && released.every((ant) => ant.clashRival == null && ant.clashTimer === 0 && ant.state !== "clash"),
      remainsTwoDuels: hostIds.length === 1 && entrantIds.length === 1,
      hostClashElapsed: host.clash?.elapsed ?? null,
      entrantClashElapsed: entrant.clash?.elapsed ?? null,
      hostState: host.state,
      entrantState: entrant.state,
    };

    for (const selector of ["#empirePanel", ".topbar", ".stats-strip", "#panelToggleBtn"]) {
      const element = document.querySelector(selector);
      if (element) element.style.display = "none";
    }
    if (sim.roleLabelSystem) {
      for (const sprite of sim.roleLabelSystem.sprites ?? []) sprite.visible = false;
      sim.roleLabelSystem.render = () => {};
    }
    sim.setCameraTarget(baseX + 1, baseZ, true);
    sim.cameraYaw = -0.42;
    sim.targetCameraYaw = -0.42;
    sim.cameraPitch = 1.18;
    sim.targetCameraPitch = 1.18;
    sim.cameraDistance = 22;
    sim.targetCameraDistance = 22;
    sim.renderGame(1);
    return result;
  })()`);

  if (
    !peel.started ||
    peel.initialIds.length !== 3 ||
    !peel.entrantMarkedHost ||
    !peel.hostPrimaryKept ||
    !peel.entrantOwnsDistinctAnt ||
    !peel.releasedCleared ||
    !peel.remainsTwoDuels ||
    peel.hostClashElapsed == null ||
    peel.entrantClashElapsed == null ||
    peel.hostState !== "clash" ||
    peel.entrantState !== "clash"
  ) {
    throw new Error(`Combat peel did not produce two one-on-one clashes: ${JSON.stringify(peel)}`);
  }

  const screenshotPath = join(outputDir, "combat-peel-two-duels.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return { ...peel, screenshot: assertScreenshot(screenshotPath) };
}

async function verifyCombatScenario(targetUrl, outputDir) {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 820 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(targetUrl);
    await waitForSimulation(page);
    await delay(900);

    const setup = await page.evaluate(`(() => {
      const sim = window.__ANT_SIM;
      sim.paused = true;
      sim.frameAccumulator = 0;
      for (const corpse of [...(sim.rivalCorpses ?? [])]) sim.disposeDynamicItem(corpse);
      for (const corpse of [...(sim.colonyCorpses ?? [])]) sim.disposeDynamicItem(corpse);
      sim.rivalCorpses = [];
      sim.colonyCorpses = [];
      sim.clearRaidRivals();
      sim.colony.enemyThreat = 0;
      sim.colony.raidState = {
        phase: "warning",
        timer: 0,
        wave: 9001,
        activeCount: 1,
        approachAngle: 0,
        signalTimer: 0,
        breachTimer: 0,
        casualties: 0,
        enemyCasualties: 0,
        lastOutcome: "warning",
      };
      sim.beginRaid();
      sim.rivalFightStats = { clashes: 0, colonyWins: 0, rivalWins: 0 };

      const worker = sim.ants[0];
      const guardA = sim.ants[1];
      const guardB = sim.ants[2];
      const support = sim.ants[3];
      const rival = sim.raidRivals()[0];
      const baseX = 12;
      const baseZ = 4;

      const configureAnt = (ant, role, x, z, persistence, caution) => {
        ant.role = role;
        ant.x = x;
        ant.z = z;
        ant.prevX = x;
        ant.prevZ = z;
        ant.angle = 0;
        ant.state = "explore";
        ant.carrying = role === "worker" ? 0.8 : 0;
        ant.foodSourceId = null;
        ant.energy = 1;
        ant.stun = 0;
        ant.fleeTimer = 0;
        ant.clashTimer = 0;
        ant.clashDuration = 0;
        ant.clashRival = null;
        ant.traits.persistence = persistence;
        ant.traits.caution = caution;
      };

      for (const ant of sim.ants) {
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

      configureAnt(worker, "worker", baseX, baseZ, 0.6, 0.45);
      configureAnt(guardA, "guard", baseX + 3.2, baseZ + 6.0, 1, 1);
      configureAnt(guardB, "guard", baseX + 3.2, baseZ - 6.0, 1, 1);
      configureAnt(support, "guard", baseX + 8.2, baseZ, 0.9, 0.8);

      rival.x = baseX - 50;
      rival.z = baseZ;
      rival.prevX = rival.x;
      rival.prevZ = rival.z;
      rival.angle = Math.PI / 2;
      rival.baseSpeed = 17;
      rival.aggression = 0.08;
      rival.stubbornness = 0.08;
      rival.scale = 1.18;
      rival.retreat = 0;
      rival.clash = null;
      rival.fightCooldown = 0;
      rival.disrupt = 0;
      rival.defeated = false;
      rival.leftRaid = false;
      rival.raidTargetX = worker.x;
      rival.raidTargetZ = worker.z;

      sim.cameraTarget.set(baseX - 12, 0, baseZ);
      sim.cameraRenderTarget.copy(sim.cameraTarget);
      sim.cameraYaw = 0;
      sim.targetCameraYaw = 0;
      sim.cameraPitch = 0.92;
      sim.targetCameraPitch = 0.92;
      sim.cameraDistance = 150;
      sim.targetCameraDistance = 150;

      const target = rival.findHarassmentTarget(sim);
      window.__COMBAT_VERIFY = {
        sim,
        rival,
        worker,
        initialCorpseCount: sim.rivalCorpses.length,
        initialColonyCorpseCount: sim.colonyCorpses.length,
        frames: 0,
        runFrame(dt = 1 / 60) {
          if (this.sim.rivalAnts.includes(this.rival)) this.rival.update(dt, this.sim);
          this.sim.updateCombatEffects(dt);
          this.sim.updateCorpses(dt);
          this.frames += 1;
        },
        snapshot() {
          const latestCorpse = this.sim.rivalCorpses[this.sim.rivalCorpses.length - 1] ?? null;
          return {
            frames: this.frames,
            initialCorpseCount: this.initialCorpseCount,
            initialColonyCorpseCount: this.initialColonyCorpseCount,
            targetRole: target?.role ?? null,
            targetId: target?.id ?? null,
            workerId: this.worker.id,
            workerState: this.worker.state,
            workerInClash: this.rival.clash?.ants?.includes(this.worker) ?? false,
            workerAlive: this.sim.ants.includes(this.worker),
            workerCarrying: this.worker.carrying,
            rivalInLiveList: this.sim.rivalAnts.includes(this.rival),
            rivalDefeated: this.rival.defeated,
            rivalLeftRaid: this.rival.leftRaid,
            rivalClashElapsed: this.rival.clash?.elapsed ?? null,
            rivalClashGrapplers: this.rival.clash?.ants?.length ?? 0,
            rivalClashAntIds: this.rival.clash?.ants?.map((ant) => ant.id) ?? [],
            corpseCount: this.sim.rivalCorpses.length,
            corpseDistance: latestCorpse ? Math.hypot(latestCorpse.x - this.rival.x, latestCorpse.z - this.rival.z) : null,
            corpseScale: latestCorpse?.scale ?? null,
            expectedCorpseScale: this.rival.scale * 0.46,
            colonyCorpseCount: this.sim.colonyCorpses.length,
            fightStats: { ...this.sim.rivalFightStats },
          };
        },
        advanceUntilClash() {
          for (let i = 0; i < 520; i += 1) {
            this.runFrame();
            if (this.rival.clash && this.rival.clash.elapsed > 1.05) break;
          }
          this.sim.renderGame(1);
          return this.snapshot();
        },
        advanceUntilOutcome() {
          for (let i = 0; i < 520; i += 1) {
            this.runFrame();
            if (!this.sim.rivalAnts.includes(this.rival) && this.sim.rivalCorpses.length > this.initialCorpseCount) break;
          }
          this.sim.renderGame(1);
          return this.snapshot();
        },
        advanceFrames(count) {
          for (let i = 0; i < count; i += 1) this.runFrame();
          this.sim.renderGame(1);
          return this.snapshot();
        },
      };
      sim.renderGame(1);
      return window.__COMBAT_VERIFY.snapshot();
    })()`);

    if (setup.targetRole !== "worker" || setup.targetId !== setup.workerId) {
      throw new Error(`Raid rival did not target the worker: ${JSON.stringify(setup)}`);
    }

    const during = await page.evaluate(`window.__COMBAT_VERIFY.advanceUntilClash()`);
    if (during.rivalClashElapsed == null || during.rivalClashGrapplers < 2 || !during.workerInClash) {
      throw new Error(`Combat did not visibly enter a worker clash: ${JSON.stringify(during)}`);
    }
    const duringPath = join(outputDir, "combat-during-worker-clash.png");
    await page.screenshot({ path: duringPath, fullPage: false });

    const after = await page.evaluate(`window.__COMBAT_VERIFY.advanceUntilOutcome()`);
    if (
      after.rivalInLiveList ||
      !after.rivalDefeated ||
      !after.rivalLeftRaid ||
      after.corpseCount <= setup.corpseCount ||
      after.corpseDistance == null ||
      after.corpseDistance > 2.5 ||
      Math.abs(after.corpseScale - after.expectedCorpseScale) > 0.001 ||
      after.fightStats.colonyWins < 1
    ) {
      throw new Error(`Combat outcome did not leave a corpse at the fight site: ${JSON.stringify(after)}`);
    }
    const afterPath = join(outputDir, "combat-after-corpse.png");
    await page.screenshot({ path: afterPath, fullPage: false });

    const persistent = await page.evaluate(`window.__COMBAT_VERIFY.advanceFrames(240)`);
    if (persistent.corpseCount !== after.corpseCount || persistent.rivalInLiveList) {
      throw new Error(`Corpse did not persist after combat: ${JSON.stringify(persistent)}`);
    }
    const persistentPath = join(outputDir, "combat-corpse-persistent.png");
    await page.screenshot({ path: persistentPath, fullPage: false });

    const expired = await page.evaluate(`window.__COMBAT_VERIFY.advanceFrames(420)`);
    if (expired.corpseCount !== setup.initialCorpseCount || expired.colonyCorpseCount !== setup.initialColonyCorpseCount) {
      throw new Error(`Corpse did not expire after ten seconds: ${JSON.stringify(expired)}`);
    }
    const expiredPath = join(outputDir, "combat-corpse-expired.png");
    await page.screenshot({ path: expiredPath, fullPage: false });

    const friendly = await page.evaluate(`(() => {
      const sim = window.__ANT_SIM;
      sim.clearRaidRivals();
      sim.colony.raidState = {
        phase: "warning",
        timer: 0,
        wave: 9002,
        activeCount: 1,
        approachAngle: 0,
        signalTimer: 0,
        breachTimer: 0,
        casualties: 0,
        enemyCasualties: 0,
        lastOutcome: "warning",
      };
      sim.beginRaid();
      const rival = sim.raidRivals()[0];
      const victim = sim.ants[0];
      for (const ant of sim.ants) {
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
      const baseX = 12;
      const baseZ = 4;
      victim.role = "worker";
      victim.traits.persistence = 0.05;
      victim.traits.caution = 0.05;
      victim.state = "explore";
      victim.stun = 0;
      victim.energy = 1;
      victim.carrying = 0;
      victim.x = baseX;
      victim.z = baseZ;
      victim.prevX = baseX;
      victim.prevZ = baseZ;
      rival.x = baseX + 0.6;
      rival.z = baseZ;
      rival.prevX = rival.x;
      rival.prevZ = rival.z;
      rival.aggression = 1;
      rival.stubbornness = 1;
      rival.scale = 1.2;
      rival.retreat = 0;
      rival.clash = null;
      rival.fightCooldown = 0;
      const before = sim.colonyCorpses.length;
      rival.resolveAntContacts(sim);
      for (let i = 0; i < 240; i += 1) {
        if (sim.ants.includes(victim)) victim.update(1 / 60, sim);
        rival.update(1 / 60, sim);
        sim.updateCombatEffects(1 / 60);
        sim.updateCorpses(1 / 60);
        if (!sim.ants.includes(victim) && sim.colonyCorpses.length > before) break;
      }
      sim.cameraTarget.set(baseX - 8, 0, baseZ);
      sim.cameraRenderTarget.copy(sim.cameraTarget);
      sim.renderGame(1);
      const corpse = sim.colonyCorpses[sim.colonyCorpses.length - 1] ?? null;
      const after = {
        before,
        corpseCount: sim.colonyCorpses.length,
        victimAlive: sim.ants.includes(victim),
        casualties: sim.colony.raidState.casualties,
        corpseDistance: corpse ? Math.hypot(corpse.x - victim.x, corpse.z - victim.z) : null,
        corpseScale: corpse?.scale ?? null,
        expectedCorpseScale: victim.bodyScale * 0.46,
      };
      window.__FRIENDLY_CORPSE_VERIFY = { before };
      return after;
    })()`);
    if (
      friendly.victimAlive ||
      friendly.corpseCount <= friendly.before ||
      friendly.casualties < 1 ||
      friendly.corpseDistance == null ||
      friendly.corpseDistance > 2.5 ||
      Math.abs(friendly.corpseScale - friendly.expectedCorpseScale) > 0.001
    ) {
      throw new Error(`Friendly corpse check failed: ${JSON.stringify(friendly)}`);
    }
    const friendlyPath = join(outputDir, "combat-friendly-corpse.png");
    await page.screenshot({ path: friendlyPath, fullPage: false });
    const friendlyExpired = await page.evaluate(`(() => {
      const sim = window.__ANT_SIM;
      for (let i = 0; i < 620; i += 1) sim.updateCorpses(1 / 60);
      return {
        before: window.__FRIENDLY_CORPSE_VERIFY.before,
        corpseCountAfterExpiry: sim.colonyCorpses.length,
      };
    })()`);
    if (friendlyExpired.corpseCountAfterExpiry !== friendlyExpired.before) {
      throw new Error(`Friendly corpse did not expire after ten seconds: ${JSON.stringify(friendlyExpired)}`);
    }

    const peel = await verifyCombatPeelScenario(page, outputDir);

    await context.close();
    return {
      setup,
      during,
      after,
      persistent,
      expired,
      friendly,
      friendlyExpired,
      peel,
      screenshots: [duringPath, afterPath, persistentPath, expiredPath, friendlyPath].map(assertScreenshot).concat(peel.screenshot),
    };
  } finally {
    await browser.close();
  }
}

const outputDir = resolve("verification", "combat");
mkdirSync(outputDir, { recursive: true });

const server = await createStaticServer({ root: resolve("dist"), port: 0 });
try {
  const address = server.address();
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  const result = await verifyCombatScenario(targetUrl, outputDir);
  console.log(JSON.stringify({ targetUrl, ...result }, null, 2));
} finally {
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}
