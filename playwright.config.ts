import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  retries: 0,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    actionTimeout: 15000,
    viewport: { width: 1440, height: 1050 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:3100/api/health",
    timeout: 60000,
    reuseExistingServer: false,
  },
});
