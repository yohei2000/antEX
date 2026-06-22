import packageJson from "../../package.json";
import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("uses the Vite, Vitest, and Playwright command surface", () => {
    expect(packageJson.scripts.dev).toBe("vite");
    expect(packageJson.scripts.build).toBe("vite build");
    expect(packageJson.scripts.test).toBe("vitest run");
    expect(packageJson.scripts["eval:smoke"]).toBe("playwright test tests/playwright/smoke.spec.ts");
    expect(packageJson.scripts["eval:save"]).toBe("playwright test tests/playwright/save-load.spec.ts");
  });
});
