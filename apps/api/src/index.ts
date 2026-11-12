import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { createDb } from "./db/client";
import { applyMigrations } from "./db/migrate";
import { consoleMailer, memoryMailer, resendMailer, type Mailer } from "./email";
import { loadEnv } from "./env";
import { revenueCatApi } from "./revenuecat";

const env = loadEnv();
const { pool, db } = createDb(env.DATABASE_URL);
await applyMigrations(db);
console.log("Migrations applied");
const memory = memoryMailer();
const mailer: Mailer =
  env.EMAIL_TRANSPORT === "resend"
    ? resendMailer(env.RESEND_API_KEY!, env.EMAIL_FROM)
    : env.EMAIL_TRANSPORT === "memory"
      ? memory
      : consoleMailer();
const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  webOrigins: env.CORS_ORIGIN,
  appScheme: env.APP_SCHEME,
  mailer,
  turnstileSecret: env.TURNSTILE_SECRET_KEY,
  rateLimit: !env.DISABLE_RATE_LIMIT,
  adminEnabled: env.ADMIN_ENABLED,
});
const app = createApp({
  pool,
  auth,
  corsOrigins: env.CORS_ORIGIN,
  version: env.RAILWAY_GIT_COMMIT_SHA ?? "dev",
  minimumIosVersion: env.MIN_IOS_APP_VERSION,
  usageIngestEnabled: env.USAGE_INGEST_ENABLED,
  adminEnabled: env.ADMIN_ENABLED,
  payments: env.PAYMENTS_ENABLED
    ? {
        revenueCat: revenueCatApi({ secretKey: env.REVENUECAT_SECRET_KEY!, projectId: env.REVENUECAT_PROJECT_ID! }),
        webhookSecret: env.REVENUECAT_WEBHOOK_SECRET!,
      }
    : undefined,
  testEmails: env.ENABLE_TEST_ROUTES ? memory.sent : undefined,
});

serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, ({ port }) => {
  console.log(`API listening on :${port}`);
});
