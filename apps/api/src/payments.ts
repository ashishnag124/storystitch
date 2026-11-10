import { EntitlementCheckSchema, PLUS_ENTITLEMENT, type Entitlements } from "@storystitch/shared";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type pg from "pg";
import { z } from "zod";
import type { Auth } from "./auth";
import type { RevenueCat } from "./revenuecat";
import { fromOurApps } from "./savedLayouts";

export interface PaymentsOptions {
  revenueCat: RevenueCat;
  /** The Authorization header value set on RevenueCat's webhook. */
  webhookSecret: string;
}

/** RevenueCat's events run to a few kilobytes. */
const MAX_WEBHOOK_BYTES = 64 * 1024;
/** Calls to RevenueCat a user (refresh) or an address (check) may cause per minute. */
const CHECKS_PER_MINUTE = 10;
const MAX_REMEMBERED = 100_000;

/**
 * Only the IDs are read from an event. Whatever it says happened, the account's state is read back from RevenueCat's
 * API, so a forged, repeated or out-of-order event can't change the outcome.
 */
const WebhookSchema = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).nullish(),
    transferred_from: z.array(z.string()).nullish(),
    transferred_to: z.array(z.string()).nullish(),
  }),
});

const digest = (s: string) => createHash("sha256").update(s).digest();
const sameSecret = (given: string, expected: string) => timingSafeEqual(digest(given), digest(expected));

/**
 * StoryStitch Plus. RevenueCat joins Apple's in-app purchase and Paddle into one "plus" entitlement; the apps read
 * whether an account has it here, and nothing they send can grant it. Registered only when PAYMENTS_ENABLED is on.
 */
export function paymentRoutes(
  app: Hono,
  { pool, auth, corsOrigins, revenueCat, webhookSecret }: PaymentsOptions & { pool: pg.Pool; auth: Auth; corsOrigins: string[] },
) {
  async function userId(c: Context): Promise<string | null> {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session?.user.id ?? null;
  }

  /** Makes the stored row match what RevenueCat says about this account now. */
  async function sync(user: string): Promise<boolean> {
    const plus = await revenueCat.hasPlus(user);
    await pool.query(
      plus
        ? "insert into entitlement (user_id, key) values ($1, $2) on conflict do nothing"
        : "delete from entitlement where user_id = $1 and key = $2",
      [user, PLUS_ENTITLEMENT],
    );
    return plus;
  }

  const calls = new Map<string, number>();
  setInterval(() => calls.clear(), 60_000).unref();
  /** Whether this key may cause another call to RevenueCat this minute. */
  function allowed(key: string) {
    const n = (calls.get(key) ?? 0) + 1;
    if (calls.size < MAX_REMEMBERED || calls.has(key)) calls.set(key, n);
    return n <= CHECKS_PER_MINUTE;
  }

  app.post("/payments/revenuecat", bodyLimit({ maxSize: MAX_WEBHOOK_BYTES }), async (c) => {
    if (!sameSecret(c.req.header("Authorization") ?? "", webhookSecret)) return c.json({ error: "UNAUTHORIZED" }, 401);
    const parsed = WebhookSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_EVENT" }, 400);
    const e = parsed.data.event;
    const ids = [...new Set([e.app_user_id, e.original_app_user_id, ...(e.aliases ?? []), ...(e.transferred_from ?? []), ...(e.transferred_to ?? [])])];
    // Anonymous IDs belong to no account: a signed-out buyer's purchase is stored once it moves to their account.
    const { rows } = await pool.query<{ id: string }>('select id from "user" where id = any($1)', [ids.filter(Boolean)]);
    for (const { id } of rows) await sync(id);
    return c.json({ ok: true });
  });

  app.get("/me/entitlements", async (c) => {
    const user = await userId(c);
    c.header("Cache-Control", "no-store");
    if (!user) return c.json<Entitlements>({ plus: false });
    const { rowCount } = await pool.query("select 1 from entitlement where user_id = $1 and key = $2", [user, PLUS_ENTITLEMENT]);
    return c.json<Entitlements>({ plus: !!rowCount });
  });

  // Right after a purchase or restore, so the switch unlocks without waiting for the webhook.
  app.post("/me/entitlements/refresh", async (c) => {
    if (!fromOurApps(c, corsOrigins)) return c.json({ error: "FORBIDDEN" }, 403);
    const user = await userId(c);
    if (!user) return c.json({ error: "SIGNED_OUT" }, 401);
    if (!allowed(`user:${user}`)) return c.json({ error: "TOO_MANY" }, 429);
    return c.json<Entitlements>({ plus: await sync(user) });
  });

  // A signed-out iOS buyer: RevenueCat is asked about the device's anonymous ID, and nothing is stored.
  app.post("/entitlements/check", async (c) => {
    if (!fromOurApps(c, corsOrigins)) return c.json({ error: "FORBIDDEN" }, 403);
    if (!allowed(`ip:${c.req.header("x-real-ip") ?? ""}`)) return c.json({ error: "TOO_MANY" }, 429);
    const parsed = EntitlementCheckSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_ID" }, 400);
    return c.json<Entitlements>({ plus: await revenueCat.hasPlus(parsed.data.appUserId) });
  });
}
