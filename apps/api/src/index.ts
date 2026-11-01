import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createDb } from "./db/client";
import { loadEnv } from "./env";

const env = loadEnv();
const { pool } = createDb(env.DATABASE_URL);
const app = createApp({ pool, corsOrigins: env.CORS_ORIGIN, version: env.RAILWAY_GIT_COMMIT_SHA ?? "dev" });

serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, ({ port }) => {
  console.log(`API listening on :${port}`);
});
