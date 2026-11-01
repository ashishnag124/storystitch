import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Locally, read DATABASE_URL etc. from the root .env; CI sets them on the job instead.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({ test: { environment: "node" } });
