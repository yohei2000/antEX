import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { createStaticServer } from "./serve.mjs";

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

const npmCommand = process.platform === "win32" ? process.execPath : "npm";
const npmArgs =
  process.platform === "win32"
    ? [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), "run", "build"]
    : ["run", "build"];
await run(npmCommand, npmArgs);

const port = Number(process.env.PORT || 4173);
const server = await createStaticServer({ root: resolve("dist"), port });
const address = server.address();
console.log(`http://127.0.0.1:${address.port}/`);

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);
process.on("disconnect", shutdown);
process.stdin.on("end", shutdown);
process.stdin.on("close", shutdown);
