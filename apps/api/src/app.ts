import type { Health } from "@storystitch/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type pg from "pg";
import type { Auth } from "./auth";
import type { Email } from "./email";

interface AppOptions {
  pool: pg.Pool;
  auth: Auth;
  corsOrigins: string[];
  version: string;
  /** Emails captured by the memory mailer, readable at /test/emails. Only passed outside staging and production. */
  testEmails?: Email[];
}

/** The HTTP API, separate from the server so tests can call it directly with `app.request()`. */
export function createApp({ pool, auth, corsOrigins, version, testEmails }: AppOptions) {
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
