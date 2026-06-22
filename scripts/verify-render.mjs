import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { inflateSync } from "node:zlib";
import { createStaticServer } from "./serve.mjs";

const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const browserPath = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
if (!browserPath) {
  throw new Error("Chrome or Edge was not found in the standard install locations.");
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolveCommand, rejectCommand } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) rejectCommand(new Error(message.error.message));
      else resolveCommand(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolveCommand, rejectCommand });
    });
  }

  close() {
    this.socket.close();
  }
}

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

async function waitForProcessExit(processHandle, timeoutMs = 1200) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  await Promise.race([
    new Promise((resolveExit) => processHandle.once("exit", resolveExit)),
    delay(timeoutMs),
  ]);
}

function removeTempDirectory(path) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  } catch (error) {
    console.warn(`Warning: could not remove temporary browser profile: ${error.message}`);
  }
}

async function waitForJson(url, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      await delay(250);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function verifyViewport({ label, width, height }, targetUrl, outputDir, index) {
  const debuggingPort = 9340 + index;
  const userDataDir = join(tmpdir(), `ant-3d-verify-${label}-${Date.now()}`);
  const browser = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    targetUrl,
  ], { stdio: "ignore" });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${debuggingPort}/json/list`);
    const page = targets.find((target) => target.type === "page") ?? targets[0];
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolveSocket, rejectSocket) => {
      socket.addEventListener("open", resolveSocket, { once: true });
      socket.addEventListener("error", rejectSocket, { once: true });
    });

    const cdp = new CdpSession(socket);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await cdp.send("Page.navigate", { url: targetUrl });

    const readyExpression = `
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          if (window.__ANT_SIM_READY && document.querySelector("#world3d canvas")) resolve(true);
          else if (Date.now() - started > 15000) resolve(false);
          else setTimeout(tick, 120);
        };
        tick();
      })
    `;
    const ready = await cdp.send("Runtime.evaluate", {
      expression: readyExpression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (!ready.result.value) throw new Error(`${label}: Three.js scene did not become ready.`);
    await delay(900);

    const hoverProbe = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
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
      })()`,
      returnByValue: true,
    });
    if (hoverProbe.result.value.delta > 0.000001) {
      throw new Error(`${label}: camera yaw changed on hover without pointerdown: ${JSON.stringify(hoverProbe.result.value)}`);
    }

    const canvasProbe = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
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
          rivalColor: sim?.materials?.antRival?.color?.getHexString?.() ?? null,
          terrainPatches: sim?.terrain?.length ?? null,
          branchCount: sim?.branches?.length ?? null,
          toolButtons: document.querySelectorAll("[data-tool]").length,
          upgradeButtons: document.querySelectorAll("[data-upgrade]").length,
          calls: info?.render?.calls ?? null,
          triangles: info?.render?.triangles ?? null,
          geometries: info?.memory?.geometries ?? null,
          textures: info?.memory?.textures ?? null,
          hoverYawDelta: ${hoverProbe.result.value.delta},
        };
      })()`,
      returnByValue: true,
    });

    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshotPath = join(outputDir, `${label}.png`);
    const screenshotBuffer = Buffer.from(screenshot.data, "base64");
    writeFileSync(screenshotPath, screenshotBuffer);
    const png = decodePng(screenshotBuffer);
    const regionSize = Math.min(120, Math.floor(Math.min(png.width, png.height) * 0.28));
    const metrics = {
      ...canvasProbe.result.value,
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
      metrics.rivalCount !== 4 ||
      metrics.rivalScaleMin <= 1.1 ||
      metrics.rivalColor !== "c65318" ||
      metrics.terrainPatches < 6 ||
      metrics.branchCount !== 0 ||
      metrics.toolButtons !== 0 ||
      metrics.upgradeButtons < 6 ||
      metrics.foodRate <= 0
    ) {
      throw new Error(`${label}: idle colony state check failed: ${JSON.stringify(metrics)}`);
    }

    const idleProbe = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
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
        const randomBefore = Math.random;
        Math.random = () => 0;
        sim.startExpedition();
        Math.random = randomBefore;
        sim.saveColony();
        const saved = JSON.parse(localStorage.getItem("ant3d.colonyState"));
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
          cooldownActive: sim.colony.battleCooldownUntil > Date.now(),
          savedAnts: saved.antPopulation,
          savedFood: saved.food,
        };
      })()`,
      returnByValue: true,
    });
    const idle = idleProbe.result.value;
    if (
      Math.abs(idle.noDeliveryFoodAfter - idle.noDeliveryFoodBefore) > 0.0001 ||
      idle.returnFoodAfter <= idle.returnFoodBefore ||
      !idle.boughtUpgrade ||
      idle.capacityAfterUpgrade <= idle.capacityBeforeUpgrade ||
      idle.territoryAfterBattle <= idle.before.territory ||
      !idle.cooldownActive ||
      idle.savedAnts !== 24 ||
      idle.savedFood <= 0
    ) {
      throw new Error(`${label}: idle growth check failed: ${JSON.stringify(idle)}`);
    }

    const fightProbe = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const sim = window.__ANT_SIM;
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
        rival.x = 0.5;
        rival.z = 0;
        rival.prevX = rival.x;
        rival.prevZ = rival.z;
        rival.angle = -Math.PI / 2;
        rival.aggression = 1;
        rival.stubbornness = 1;
        rival.scale = 1.35;
        rival.fightCooldown = 0;
        const beforeDistance = Math.hypot(ant.x - rival.x, ant.z - rival.z);
        const resolved = rival.resolveAntContacts(sim);
        const afterDistance = Math.hypot(ant.x - rival.x, ant.z - rival.z);
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
        rival.x = 4.5;
        rival.z = 0;
        rival.prevX = rival.x;
        rival.prevZ = rival.z;
        rival.aggression = 0.1;
        rival.stubbornness = 0.1;
        rival.scale = 1.2;
        rival.retreat = 0;
        rival.fightCooldown = 0;
        const repelled = rival.resolveAntContacts(sim);
        return {
          resolved,
          repelled,
          beforeDistance,
          afterDistance,
          winner: rival.lastFightWinner,
          antState: ant.state,
          antEnergy: ant.energy,
          rivalRetreat: rival.retreat,
          fightStats: sim.rivalFightStats,
          fightCooldown: rival.fightCooldown,
          alarmTrails: sim.trails.filter((trail) => trail.kind === "alarm").length,
        };
      })()`,
      returnByValue: true,
    });
    const fight = fightProbe.result.value;
    if (
      !fight.resolved ||
      !fight.repelled ||
      fight.afterDistance <= fight.beforeDistance ||
      fight.antState !== "stunned" ||
      fight.antEnergy >= 1 ||
      fight.winner !== "colony" ||
      fight.rivalRetreat <= 0 ||
      fight.fightStats.rivalWins < 1 ||
      fight.fightStats.colonyWins < 1 ||
      fight.fightCooldown <= 0 ||
      fight.alarmTrails < 1
    ) {
      throw new Error(`${label}: rival ant contact check failed: ${JSON.stringify(fight)}`);
    }

    cdp.close();
    return { label, screenshotPath, metrics };
  } finally {
    browser.kill();
    await waitForProcessExit(browser);
    removeTempDirectory(userDataDir);
  }
}

const outputDir = resolve("verification");
mkdirSync(outputDir, { recursive: true });

const server = await createStaticServer({ root: resolve("dist"), port: 0 });
try {
  const address = server.address();
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  const results = [];
  results.push(await verifyViewport({ label: "mobile-390x844", width: 390, height: 844 }, targetUrl, outputDir, 0));
  results.push(await verifyViewport({ label: "desktop-1366x768", width: 1366, height: 768 }, targetUrl, outputDir, 1));
  console.log(JSON.stringify({ targetUrl, results }, null, 2));
} finally {
  server.close();
}
