import { layouts, type Health, type LayoutPopularity, type MinimumVersion } from "@storystitch/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type pg from "pg";
import type { Auth } from "./auth";
import type { Email } from "./email";
import { savedLayoutRoutes } from "./savedLayouts";
import { usageRoutes } from "./usage";

interface AppOptions {
  pool: pg.Pool;
  auth: Auth;
  corsOrigins: string[];
  version: string;
  /** The oldest iOS app version still supported. */
  minimumIosVersion: string;
  /** Whether usage events are counted. When off, they're accepted and ignored. */
  usageIngestEnabled?: boolean;
  /** Emails captured by the memory mailer, readable at /test/emails. Only passed outside staging and production. */
  testEmails?: Email[];
}

/** The HTTP API, separate from the server so tests can call it directly with `app.request()`. */
export function createApp({ pool, auth, corsOrigins, version, minimumIosVersion, usageIngestEnabled = false, testEmails }: AppOptions) {
  const app = new Hono();
  app.use(secureHeaders());
  // Only StoryStitch's own web origins may call the API, with cookies (the sign-in session).
  app.use(cors({ origin: corsOrigins, credentials: true, allowHeaders: ["Content-Type", "x-captcha-response"] }));

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

  // Public, because an app has to ask this before it knows whether it can talk to the rest of the API.
  app.get("/app/minimum-version", (c) => c.json<MinimumVersion>({ ios: minimumIosVersion }));

  // Popular layouts: the web app reports each export's layout (nothing else) and reads the totals to break ranking ties.
  const layoutIds = new Set(layouts.map((l) => l.id));
  app.post("/layouts/:id/exports", async (c) => {
    const id = c.req.param("id");
    if (!layoutIds.has(id)) return c.notFound();
    await pool.query(
      `insert into layout_exports (layout_id, count) values ($1, 1)
       on conflict (layout_id) do update set count = layout_exports.count + 1, updated_at = now()`,
      [id],
    );
    return c.body(null, 204);
  });
  app.get("/layouts/popularity", async (c) => {
    const { rows } = await pool.query<{ layout_id: string; count: number }>("select layout_id, count from layout_exports");
    const body: LayoutPopularity = { exports: Object.fromEntries(rows.map((r) => [r.layout_id, r.count])) };
    // The ranking only needs rough totals, so browsers and CDNs may reuse them for a few minutes.
    c.header("Cache-Control", "public, max-age=300");
    return c.json(body);
  });

  savedLayoutRoutes(app, { pool, auth, corsOrigins });
  usageRoutes(app, { pool, corsOrigins, enabled: usageIngestEnabled });

  // Accounts: sign-up, email verification, sign-in, password reset, sessions, deletion.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  if (testEmails) {
    // Latest email sent to an address, so end-to-end tests can follow emailed links.
    app.get("/test/emails/latest", (c) => {
      const to = c.req.query("to");
      const email = testEmails.findLast((e) => e.to === to);
      return email ? c.json(email) : c.notFound();
    });
  }

  return app;
}
