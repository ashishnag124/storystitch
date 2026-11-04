import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Production builds made by `pnpm build:e2e` (the e2e script runs it): accounts off, as in production, and on.
// E2E_TARGET=app tests those builds of apps/app, the Expo app that's replacing this one, with the same suite.
const builds = process.env.E2E_TARGET === "app" ? "../app/" : "";
export const PORT = 4173;
export const ACCOUNTS_PORT = 4174;
/** The API the accounts build talks to: real code, local Postgres, emails kept in memory for the tests. */
export const API_PORT = 3010;

// Locally, DATABASE_URL comes from the root .env; CI sets it on the job.
const rootEnv = new URL("../../.env", import.meta.url);
if (!process.env.CI && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const preview = (dir: string, port: number) => ({
  command: `pnpm exec vite preview --outDir ${dir} --port ${port} --strictPort`,
  url: `http://localhost:${port}`,
  reuseExistingServer: !process.env.CI,
});

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "android-chrome", use: { ...devices["Pixel 7"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 15"] } },
  ],
  webServer: [
    preview(`${builds}dist-e2e`, PORT),
    preview(`${builds}dist-e2e-accounts`, ACCOUNTS_PORT),
    {
      command: "pnpm --dir ../api exec tsx src/index.ts",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app",
        PORT: String(API_PORT),
        CORS_ORIGIN: `http://localhost:${ACCOUNTS_PORT}`,
        BETTER_AUTH_URL: `http://localhost:${API_PORT}`,
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0000",
        EMAIL_TRANSPORT: "memory",
        ENABLE_TEST_ROUTES: "true",
        // Every e2e request comes from 127.0.0.1; the limits themselves are covered by the API's tests.
        DISABLE_RATE_LIMIT: "true",
        // Cloudflare's always-pass Turnstile test secret.
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      },
    },
  ],
});
