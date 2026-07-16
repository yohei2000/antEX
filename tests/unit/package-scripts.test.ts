import packageJson from "../../package.json";
import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("keeps the local default lightweight and reserves full Playwright suites for CI", () => {
    expect(packageJson.scripts.dev).toBe("vite");
    expect(packageJson.scripts.build).toBe("vite build");
    expect(packageJson.scripts["build:test"]).toBe("vite build --mode test");
    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts.lint).toContain("node --check");
    expect(packageJson.scripts.check).toBe("npm run typecheck && npm run lint");
    expect(packageJson.scripts.test).toBe("vitest run");
    expect(packageJson.scripts["test:local"]).toBe("npm run check && npm run test && npm run eval:smoke");
    expect(packageJson.scripts["eval:smoke"]).toBe(
      "npm run build:test && playwright test tests/playwright/quick.spec.ts --project=desktop-chromium --workers=1",
    );
    expect(packageJson.scripts["eval:smoke:ci"]).toBe(
      "npm run build:test && playwright test tests/playwright/quick.spec.ts",
    );
    expect(packageJson.scripts["eval:e2e"]).toContain("tests/playwright/smoke.spec.ts");
    expect(packageJson.scripts["eval:save"]).toContain("tests/playwright/save-load.spec.ts");
    expect(packageJson.scripts["eval:regression"]).toContain("tests/playwright/save-load.spec.ts");
    expect(packageJson.scripts).not.toHaveProperty("preeval:smoke");
    expect(packageJson.scripts).not.toHaveProperty("posteval:smoke");
  });
});
