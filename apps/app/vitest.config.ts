import { defineConfig } from "vitest/config";

// Unit tests live next to the code. The Playwright tests in e2e/ run with `pnpm e2e`, not here.
export default defineConfig({
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
