import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createStaticServer } from "./serve.mjs";

const PORT = Number(process.env.PORT || 4173);
const PID_FILE = resolve(".eval-server.json");
const SELF = fileURLToPath(import.meta.url);

function npmBuildCommand() {
  if (process.platform !== "win32") return { command: "npm", args: ["run", "build"] };
  return {
    command: process.execPath,
    args: [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), "run", "build"],
  };
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForServer(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/`);
      if (response.ok) return true;
    } catch {
      await delay(200);
    }
    await delay(200);
  }
  return false;
}

async function start() {
  const build = npmBuildCommand();
  await run(build.command, build.args);
  if (await waitForServer(800)) return;
  const child = spawn(process.execPath, [SELF, "serve"], {
    detached: true,
    stdio: "ignore",
    shell: false,
    env: { ...process.env, ANTEX_EVAL_SERVER_TTL: process.env.ANTEX_EVAL_SERVER_TTL || "300000" },
  });
  child.unref();
  writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, port: PORT, startedAt: Date.now() }, null, 2));
  if (!(await waitForServer())) throw new Error(`Eval server did not start on http://127.0.0.1:${PORT}/`);
}

async function serve() {
  const server = await createStaticServer({ root: resolve("dist"), port: PORT });
  const shutdown = () => {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  const ttl = Number(process.env.ANTEX_EVAL_SERVER_TTL || 300000);
  setTimeout(shutdown, ttl).unref();
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

function stop() {
  if (!existsSync(PID_FILE)) return;
  try {
    const { pid } = JSON.parse(readFileSync(PID_FILE, "utf8"));
    if (pid) process.kill(pid);
  } catch {
    // The TTL fallback will clean up any server that was already exiting.
  } finally {
    rmSync(PID_FILE, { force: true });
  }
}

const command = process.argv[2] || "start";
if (command === "start") await start();
else if (command === "serve") await serve();
else if (command === "stop") stop();
else throw new Error(`Unknown eval-server command: ${command}`);
