import { UsageBatchSchema, parseUsageEvent } from "@storystitch/shared";
import { createHash, randomBytes } from "node:crypto";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type pg from "pg";
import { fromOurApps } from "./savedLayouts";

/** 50 events are about 3 KB. */
const MAX_BODY_BYTES = 16 * 1024;
/** One device sends about two batches a minute, so this leaves room for a household or an office on one address. */
const BATCHES_PER_MINUTE = 60;
/** Keeps what's held in memory bounded, however many addresses or browsers a request claims to be. */
const MAX_REMEMBERED = 100_000;
/** Rows the API adds itself. Neither is in the registry, so no app can send them. */
const VISITORS = "visitors";
const DROPPED = "usage_dropped";

const utcDay = () => new Date().toISOString().slice(0, 10);
const hash = (salt: Buffer, ...parts: string[]) => createHash("sha256").update(salt).update(JSON.stringify(parts)).digest("hex");

/**
 * Usage counts: adds a batch of events to daily counters. It stores no event log and nothing about who sent it, so
 * there's nothing to roll up, expire or delete. Everything per person stays in memory for the day: the salt is never
 * written anywhere, so once it's gone the hashes can't be recomputed and only the counts remain.
 */
export function usageRoutes(app: Hono, { pool, corsOrigins, enabled }: { pool: pg.Pool; corsOrigins: string[]; enabled: boolean }) {
  if (!enabled) {
    app.post("/usage/events", (c) => c.body(null, 204));
    return;
  }

  let day = "";
  let salt = randomBytes(32);
  let visitors = new Set<string>();
  const batches = new Map<string, number>();

  const startNewDay = () => {
    if (day === utcDay()) return;
    day = utcDay();
    salt = randomBytes(32);
    visitors = new Set();
  };
  startNewDay();
  // Also runs with no requests, so a quiet night can't keep yesterday's salt.
  setInterval(() => {
    startNewDay();
    batches.clear();
  }, 60_000).unref();

  app.post("/usage/events", bodyLimit({ maxSize: MAX_BODY_BYTES }), async (c) => {
    // text/plain skips CORS, so this is what stops another site's page posting here.
    if (!fromOurApps(c, corsOrigins)) return c.json({ error: "FORBIDDEN" }, 403);
    startNewDay();

    const ip = c.req.header("x-real-ip") ?? "";
    // By address alone: a request chooses its own user agent, so counting by visitor would let it dodge the limit.
    const sender = hash(salt, ip);
    const sent = (batches.get(sender) ?? 0) + 1;
    if (sent > BATCHES_PER_MINUTE) return c.json({ error: "TOO_MANY" }, 429);
    if (batches.size < MAX_REMEMBERED) batches.set(sender, sent);

    const batch = UsageBatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!batch.success) return c.json({ error: "INVALID_BATCH" }, 400);
    const { platform, events } = batch.data;
    const appVersion = platform === "web" ? "" : (batch.data.appVersion ?? "");

    const counts = new Map<string, number>();
    const add = (...row: [event: string, propKey?: string, propValue?: string]) => {
      const key = JSON.stringify([row[0], row[1] ?? "", row[2] ?? ""]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    let visited = false;
    for (const raw of events) {
      const event = parseUsageEvent(raw);
      if (!event) {
        add(DROPPED);
        continue;
      }
      add(event.name);
      for (const [key, value] of Object.entries(event.props)) add(event.name, key, String(value));
      visited ||= event.name === "visit_started";
    }

    const visitor = hash(salt, platform, ip, c.req.header("User-Agent") ?? "");
    const newVisitor = visited && !visitors.has(visitor) && visitors.size < MAX_REMEMBERED;
    if (newVisitor) add(VISITORS);
    if (!counts.size) return c.body(null, 204);

    // In a fixed order, so two batches updating the same rows can't deadlock.
    const rows = [...counts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, count]) => [...(JSON.parse(key) as string[]), count]);
    try {
      await pool.query(
        `insert into usage_daily (day, event, platform, app_version, prop_key, prop_value, count)
         select $1::date, event, $2, $3, prop_key, prop_value, count
         from unnest($4::text[], $5::text[], $6::text[], $7::bigint[]) as t(event, prop_key, prop_value, count)
         on conflict (day, event, platform, app_version, prop_key, prop_value)
         do update set count = usage_daily.count + excluded.count`,
        [day, platform, appVersion, rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2]), rows.map((r) => r[3])],
      );
    } catch {
      // The app keeps the batch and tries again.
      return c.body(null, 503);
    }
    // Only now: a failed write is retried, and the retry still has to count this visitor.
    if (newVisitor) visitors.add(visitor);
    return c.body(null, 204);
  });
}
