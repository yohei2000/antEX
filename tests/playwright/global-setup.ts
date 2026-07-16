import type { FullConfig } from "@playwright/test";
import { createStaticServer } from "../../scripts/serve.mjs";

async function inspectServer(baseURL: string) {
  try {
    const response = await fetch(baseURL, { signal: AbortSignal.timeout(1_500) });
    const html = await response.text();
    return { available: response.ok, isAntEx: response.ok && html.includes('id="world3d"') };
  } catch {
    return { available: false, isAntEx: false };
  }
}

export default async function globalSetup(config: FullConfig) {
  if (process.env.ANTEX_SKIP_WEBSERVER === "1") return;

  const baseURL = String(config.projects[0]?.use.baseURL ?? "http://127.0.0.1:4173/");
  const existing = await inspectServer(baseURL);
  if (existing.available) {
    if (process.env.ANTEX_REUSE_WEBSERVER === "1" && existing.isAntEx) return;
    const detail = existing.isAntEx ? "an antEX server" : "another server";
    throw new Error(`${baseURL} is already used by ${detail}. Set PORT to a free port, or explicitly set ANTEX_REUSE_WEBSERVER=1 for this antEX server.`);
  }

  const url = new URL(baseURL);
  const server = await createStaticServer({ root: "dist", port: Number(url.port || 80) });
  console.log(`Playwright server: ${baseURL}`);

  return async () => {
    if (!server.listening) return;
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  };
}
