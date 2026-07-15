import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createStaticServer } from "./serve.mjs";

const OUTPUT_DIR = resolve("verification", "terrain-graphics");
const SUMMARY_PATH = join(OUTPUT_DIR, "summary.json");
const RANDOM_SEED = 0x41_4e_54_45;

const CAPTURES = [
  {
    id: "desktop-normal-fog-panel-hidden",
    viewport: { width: 1366, height: 768 },
    target: "nest",
    fog: "normal",
    camera: { yaw: -0.62, pitch: 1.12, distance: 280, fov: 48 },
  },
  {
    id: "desktop-no-fog-overview",
    viewport: { width: 1366, height: 768 },
    target: "world",
    fog: "hidden",
    camera: { yaw: 0, pitch: 1.48, distance: 520, fov: 62 },
  },
  {
    id: "desktop-no-fog-water-closeup",
    viewport: { width: 1366, height: 768 },
    target: "largest-water",
    fog: "hidden",
    camera: { yaw: 0, pitch: 0.78, distance: 138, fov: 48 },
  },
  {
    id: "mobile-normal-fog-panel-hidden",
    viewport: { width: 390, height: 844 },
    target: "nest",
    fog: "normal",
    camera: { yaw: -0.62, pitch: 1.12, distance: 300, fov: 48 },
  },
];

async function launchBrowser() {
  const args = ["--disable-gpu", "--disable-background-networking"];
  try {
    return await chromium.launch({ channel: "chrome", headless: true, args });
  } catch {
    return chromium.launch({ headless: true, args });
  }
}

async function waitForSimulation(page) {
  await page.waitForFunction(
    () => window.__ANT_SIM_READY === true && Boolean(document.querySelector("#world3d canvas")),
    null,
    { timeout: 20_000 },
  );
}

function screenshotInfo(path) {
  const size = statSync(path).size;
  if (size < 12_000) throw new Error(`Screenshot looks too small or blank: ${path} (${size} bytes)`);
  return {
    path: relative(process.cwd(), path).replaceAll("\\", "/"),
    size,
  };
}

async function captureTerrain(browser, targetUrl, capture) {
  const consoleErrors = [];
  const context = await browser.newContext({
    viewport: capture.viewport,
    deviceScaleFactor: 1,
    isMobile: capture.viewport.width < 600,
  });
  const page = await context.newPage();
  let setup = null;
  let terrainCounts = null;
  let screenshot = null;

  page.on("console", (message) => {
    const messageText = message.text();
    if (message.type() === "error" || /Shader Error|WebGLProgram|program not valid/i.test(messageText)) {
      consoleErrors.push(`${message.type()}: ${messageText}`);
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  try {
    await page.addInitScript((initialSeed) => {
      let seed = initialSeed >>> 0;
      Math.random = () => {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        return seed / 0x1_0000_0000;
      };
    }, RANDOM_SEED);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await waitForSimulation(page);

    setup = await page.evaluate((spec) => {
      const sim = window.__ANT_SIM;
      if (!sim) throw new Error("window.__ANT_SIM is unavailable.");

      sim.paused = true;
      sim.frameAccumulator = 0;
      sim.cameraPanKeys?.clear?.();
      sim.pointerMap?.clear?.();
      sim.setPanelHidden(true, false);

      const pauseButton = document.querySelector("#pauseBtn");
      pauseButton?.classList.add("is-paused");
      pauseButton?.setAttribute("aria-label", "Paused for terrain capture");
      if (pauseButton) pauseButton.title = "Paused for terrain capture";

      let targetX = 0;
      let targetZ = 0;
      let targetDetail = { kind: spec.target };
      if (spec.target === "nest") {
        targetX = sim.nest.x;
        targetZ = sim.nest.z;
      } else if (spec.target === "largest-water") {
        const pool = [...(sim.water ?? [])]
          .filter((water) => water.permanent)
          .sort((a, b) => (b.rx ?? b.radius ?? 0) * (b.rz ?? b.radius ?? 0) - (a.rx ?? a.radius ?? 0) * (a.rz ?? a.radius ?? 0))[0]
          ?? sim.water?.[0];
        if (!pool) throw new Error("No water pool is available for the close-up capture.");
        targetX = pool.x;
        targetZ = pool.z;
        targetDetail = {
          kind: spec.target,
          x: pool.x,
          z: pool.z,
          rx: pool.rx ?? pool.radius ?? null,
          rz: pool.rz ?? pool.radius ?? null,
          permanent: Boolean(pool.permanent),
        };
      }

      sim.setCameraTarget(targetX, targetZ, true);
      sim.cameraYaw = spec.camera.yaw;
      sim.targetCameraYaw = spec.camera.yaw;
      sim.cameraPitch = spec.camera.pitch;
      sim.targetCameraPitch = spec.camera.pitch;
      sim.cameraDistance = spec.camera.distance;
      sim.targetCameraDistance = spec.camera.distance;
      sim.camera.fov = spec.camera.fov;
      sim.camera.updateProjectionMatrix();

      const fogHidden = spec.fog === "hidden";
      if (sim.fogOfWar) sim.fogOfWar.visible = !fogHidden;
      if (sim.visionEdge?.material) sim.visionEdge.material.visible = !fogHidden;
      if (fogHidden) sim.scene.fog = null;

      sim.renderGame(1);
      return {
        paused: sim.paused,
        panelHidden: sim.panelHidden,
        target: targetDetail,
        camera: {
          targetX: sim.cameraTarget.x,
          targetZ: sim.cameraTarget.z,
          yaw: sim.cameraYaw,
          pitch: sim.cameraPitch,
          distance: sim.cameraDistance,
          fov: sim.camera.fov,
        },
        fog: {
          mode: spec.fog,
          fogOfWarVisible: Boolean(sim.fogOfWar?.visible),
          visionEdgeMaterialVisible: Boolean(sim.visionEdge?.material?.visible),
          sceneFogEnabled: Boolean(sim.scene.fog),
        },
      };
    }, capture);

    await delay(300);

    terrainCounts = await page.evaluate(() => {
      const sim = window.__ANT_SIM;
      const byKind = {};
      for (const patch of sim.terrain ?? []) byKind[patch.kind] = (byKind[patch.kind] ?? 0) + 1;
      return {
        patches: sim.terrain?.length ?? 0,
        patchesByKind: byKind,
        bumps: sim.terrainBumps?.length ?? 0,
        waterPools: sim.water?.length ?? 0,
        permanentWaterPools: sim.water?.filter((water) => water.permanent).length ?? 0,
        stones: sim.stones?.length ?? 0,
        naturalDetailGroups: sim.naturalDetails?.length ?? 0,
        naturalDetailInstances: { ...(sim.naturalDetailStats ?? {}) },
      };
    });

    const screenshotPath = join(OUTPUT_DIR, `${capture.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    screenshot = screenshotInfo(screenshotPath);

    if (!setup.paused || !setup.panelHidden) throw new Error("Capture did not remain paused with the management panel hidden.");
    if (capture.fog === "normal" && !setup.fog.fogOfWarVisible) throw new Error("Normal-fog capture unexpectedly hid fog of war.");
    if (capture.fog === "hidden" && setup.fog.fogOfWarVisible) throw new Error("No-fog capture unexpectedly showed fog of war.");
    if (terrainCounts.patches <= 0 || terrainCounts.waterPools <= 0) throw new Error("Terrain scene counts are unexpectedly empty.");
    if (terrainCounts.bumps !== 0) throw new Error(`Removed leaf-like terrain bumps returned: ${terrainCounts.bumps}`);
    if (consoleErrors.length > 0) throw new Error(`Browser console errors: ${JSON.stringify(consoleErrors)}`);

    return {
      id: capture.id,
      passed: true,
      url: page.url(),
      viewport: capture.viewport,
      ...setup,
      terrainCounts,
      consoleErrors,
      screenshot,
    };
  } catch (error) {
    return {
      id: capture.id,
      passed: false,
      url: page.url() || targetUrl,
      viewport: capture.viewport,
      ...(setup ?? {}),
      terrainCounts,
      consoleErrors,
      screenshot,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const server = await createStaticServer({ root: resolve("dist"), port: 0 });
let browser = null;
let summary = null;
try {
  const address = server.address();
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  browser = await launchBrowser();
  const captures = [];
  for (const capture of CAPTURES) captures.push(await captureTerrain(browser, targetUrl, capture));
  summary = {
    generatedAt: new Date().toISOString(),
    targetUrl,
    buildRoot: "dist",
    captureCount: captures.length,
    captures,
    consoleErrors: captures.flatMap((capture) => capture.consoleErrors.map((error) => ({ capture: capture.id, error }))),
    failures: captures.filter((capture) => !capture.passed).map((capture) => ({ capture: capture.id, error: capture.error })),
  };
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (browser) await browser.close();
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}

if (summary?.failures.length) {
  throw new Error(`Terrain verification failed: ${JSON.stringify(summary.failures)}`);
}
