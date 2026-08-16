import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:4173"
  },
  webServer: {
    command: "node tests/serve.js",
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
});
