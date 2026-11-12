import { ADMIN_DAILY_EVENTS, type AdminStats } from "@storystitch/shared";
import type { Hono } from "hono";
import type pg from "pg";
import { z } from "zod";
import type { Auth } from "./auth";
import { fromOurApps } from "./savedLayouts";
import { day, loadUsage, type UsageRow } from "./usageReport";

const DaysSchema = z.coerce.number().int().min(1).max(90);
const TOP_LAYOUTS = 10;

const sum = (rows: UsageRow[]) => rows.reduce((total, r) => total + r.count, 0);

/** The dashboard's numbers from one period's counters and the layout export totals. */
export function adminStats(rows: UsageRow[], days: number, layoutExports: { layout: string; exports: number }[], today = new Date()): AdminStats {
  const totals = rows.filter((r) => r.propKey === "");
  const daily = Array.from({ length: days }, (_, i) => {
    const date = day(new Date(today.getTime() - i * 86_400_000));
    const counts = Object.fromEntries(
      ADMIN_DAILY_EVENTS.map((event) => [event, sum(totals.filter((r) => r.day === date && r.event === event))]),
    ) as AdminStats["daily"][number]["counts"];
    return { day: date, counts };
  });

  const errors = new Map<string, number>();
  for (const r of rows) if (r.event === "error_shown" && r.propKey === "code") errors.set(r.propValue, (errors.get(r.propValue) ?? 0) + r.count);

  return {
    days,
    daily,
    funnel: {
      picked: sum(totals.filter((r) => r.event === "photos_picked")),
      exported: sum(rows.filter((r) => r.event === "collage_exported" && r.propKey === "first" && r.propValue === "true")),
      // Collages can't be saved yet (only layouts can), so there's nothing to count.
      saved: 0,
    },
    topLayouts: [...layoutExports].sort((a, b) => b.exports - a.exports || a.layout.localeCompare(b.layout)).slice(0, TOP_LAYOUTS),
    errors: [...errors].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}

/**
 * The admin dashboard's data. Registered only when ADMIN_ENABLED is on. Needs an account marked `is_admin` (by hand in
 * SQL; no API sets it) that has two-factor on. Better Auth hands a two-factor account a session only after its
 * authenticator code is verified, so a session here means the code was entered.
 */
export function adminRoutes(app: Hono, { pool, auth, corsOrigins }: { pool: pg.Pool; auth: Auth; corsOrigins: string[] }) {
  app.get("/admin/stats", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!fromOurApps(c, corsOrigins)) return c.json({ error: "FORBIDDEN" }, 403);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "SIGNED_OUT" }, 401);
    const { rows: users } = await pool.query<{ is_admin: boolean; two_factor_enabled: boolean | null }>(
      'select is_admin, two_factor_enabled from "user" where id = $1',
      [session.user.id],
    );
    if (!users[0]?.is_admin) return c.json({ error: "FORBIDDEN" }, 403);
    // Still a 403, but it tells the signed-in admin's own dashboard to offer setting up the authenticator.
    if (!users[0].two_factor_enabled) return c.json({ error: "TWO_FACTOR_REQUIRED" }, 403);

    const days = DaysSchema.safeParse(c.req.query("days") ?? "30");
    if (!days.success) return c.json({ error: "INVALID_DAYS" }, 400);
    const today = new Date();
    const [usage, exports] = await Promise.all([
      loadUsage(pool, days.data, today),
      pool.query<{ layout: string; exports: number }>("select layout_id as layout, count as exports from layout_exports"),
    ]);
    return c.json(adminStats(usage, days.data, exports.rows, today));
  });
}
