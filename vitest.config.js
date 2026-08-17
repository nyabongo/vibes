import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.js"],
    /* .claude/worktrees holds full duplicate checkouts of this repo; without
       the exclude their test files would run alongside the real ones. */
    exclude: ["node_modules/**", "tests/e2e/**", ".claude/**"],
    environment: "node"
  }
});
