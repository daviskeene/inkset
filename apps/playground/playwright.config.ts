import { defineConfig, devices } from "@playwright/test";
import type { SurfaceOptions } from "./e2e/surface-baseline.spec";

const browsers = { chromium: devices["Desktop Chrome"], webkit: devices["Desktop Safari"] };

export default defineConfig<SurfaceOptions>({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3333", trace: "retain-on-failure" },
  reporter: [["list"], ["json", { outputFile: "test-results/surface-results.json" }]],
  // Every invariant runs against the hand-built baseline and against InksetParts.
  projects: (["baseline", "parts"] as const).flatMap((mode) =>
    Object.entries(browsers).map(([browser, device]) => ({
      name: `${browser}-${mode}`,
      use: { ...device, mode },
    })),
  ),
  webServer: {
    command: "corepack pnpm exec next dev --hostname 127.0.0.1 --port 3333",
    url: "http://127.0.0.1:3333/surface-baseline",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
