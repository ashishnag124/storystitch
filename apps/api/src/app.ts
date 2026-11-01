import type { Health } from "@storystitch/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type pg from "pg";

interface AppOptions {
  pool: pg.Pool;
  corsOrigins: string[];
  version: string;
}

/** The HTTP API, separate from the server so tests can call it directly with `app.request()`. */
export function createApp({ pool, corsOrigins, version }: AppOptions) {
  const app = new Hono();
  app.use(secureHeaders());
  // Only StoryStitch's own web origins may call the API, with cookies (for sign-in, from B2).
  app.use(cors({ origin: corsOrigins, credentials: true }));

  app.get("/health", async (c) => {
    let database: Health["database"] = "up";
    try {
      await pool.query("select 1");
    } catch {
      database = "down";
    }
    const body: Health = { ok: database === "up", version, database };
    return c.json(body, database === "up" ? 200 : 503);
  });

  return app;
}
