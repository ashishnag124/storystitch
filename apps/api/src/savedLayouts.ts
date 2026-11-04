import {
  LayoutSchema,
  NATIVE_APP_HEADER,
  SAVED_LAYOUT_LIMIT,
  SaveLayoutSchema,
  layoutProblems,
  type SavedLayout,
  type SavedLayouts,
} from "@storystitch/shared";
import { randomUUID } from "node:crypto";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type pg from "pg";
import type { Auth } from "./auth";

/** A layout is a few hundred bytes; anything much bigger isn't one. */
const MAX_BODY_BYTES = 16 * 1024;

interface Row {
  id: string;
  name: string;
  layout: unknown;
  updated_at: Date;
}

const toSaved = (r: Row): SavedLayout => ({
  id: r.id,
  name: r.name,
  layout: LayoutSchema.parse({ ...(r.layout as object), id: r.id, name: r.name }),
  updatedAt: r.updated_at.toISOString(),
});

/**
 * Saved layouts: the signed-in user's own layouts, made or edited in the layout editor. Every route needs a session
 * and only ever touches that user's rows. Layouts are checked like the built-in ones before they're stored.
 */
export function savedLayoutRoutes(app: Hono, { pool, auth, corsOrigins }: { pool: pg.Pool; auth: Auth; corsOrigins: string[] }) {
  async function userId(c: Context): Promise<string | null> {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session?.user.id ?? null;
  }

  /** The body as a valid layout to save, or a 400 response. */
  async function parse(c: Context) {
    const parsed = SaveLayoutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return { error: c.json({ error: "INVALID_LAYOUT", problems: ["Not a layout"] }, 400) };
    const { name, layout } = parsed.data;
    const problems = layoutProblems({ ...layout, id: "saved", name });
    if (problems.length) return { error: c.json({ error: "INVALID_LAYOUT", problems }, 400) };
    return { name, layout };
  }

  // Cookies carry the session, so changes must come from our own web origins (CORS alone doesn't stop a form post),
  // or from the native app. The app sends no Origin, so it sends NATIVE_APP_HEADER, which counts only when Origin is
  // absent: browsers always send Origin on these methods, and can't add this header cross-site without passing CORS.
  const fromOurApps = (c: Context) => {
    const origin = c.req.header("Origin");
    return origin === undefined ? !!c.req.header(NATIVE_APP_HEADER) : corsOrigins.includes(origin);
  };

  app.use("/layouts/mine/*", bodyLimit({ maxSize: MAX_BODY_BYTES }));
  app.use("/layouts/mine", bodyLimit({ maxSize: MAX_BODY_BYTES }));

  app.get("/layouts/mine", async (c) => {
    const user = await userId(c);
    if (!user) return c.json({ error: "SIGNED_OUT" }, 401);
    const { rows } = await pool.query<Row>(
      "select id, name, layout, updated_at from saved_layout where user_id = $1 order by updated_at desc",
      [user],
    );
    const body: SavedLayouts = { layouts: rows.map(toSaved), limit: SAVED_LAYOUT_LIMIT };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  app.post("/layouts/mine", async (c) => {
    if (!fromOurApps(c)) return c.json({ error: "FORBIDDEN" }, 403);
    const user = await userId(c);
    if (!user) return c.json({ error: "SIGNED_OUT" }, 401);
    const input = await parse(c);
    if ("error" in input) return input.error;
    // One statement, so two saves at once can't both slip under the limit.
    const { rows } = await pool.query<Row>(
      `insert into saved_layout (id, user_id, name, layout)
       select $1, $2, $3, $4 where (select count(*) from saved_layout where user_id = $2) < $5
       returning id, name, layout, updated_at`,
      [`custom-${randomUUID()}`, user, input.name, input.layout, SAVED_LAYOUT_LIMIT],
    );
    if (!rows[0]) return c.json({ error: "LIMIT_REACHED", limit: SAVED_LAYOUT_LIMIT }, 409);
    return c.json(toSaved(rows[0]), 201);
  });

  app.put("/layouts/mine/:id", async (c) => {
    if (!fromOurApps(c)) return c.json({ error: "FORBIDDEN" }, 403);
    const user = await userId(c);
    if (!user) return c.json({ error: "SIGNED_OUT" }, 401);
    const input = await parse(c);
    if ("error" in input) return input.error;
    const { rows } = await pool.query<Row>(
      `update saved_layout set name = $3, layout = $4, updated_at = now() where id = $1 and user_id = $2
       returning id, name, layout, updated_at`,
      [c.req.param("id"), user, input.name, input.layout],
    );
    return rows[0] ? c.json(toSaved(rows[0])) : c.notFound();
  });

  app.delete("/layouts/mine/:id", async (c) => {
    if (!fromOurApps(c)) return c.json({ error: "FORBIDDEN" }, 403);
    const user = await userId(c);
    if (!user) return c.json({ error: "SIGNED_OUT" }, 401);
    const { rowCount } = await pool.query("delete from saved_layout where id = $1 and user_id = $2", [c.req.param("id"), user]);
    return rowCount ? c.body(null, 204) : c.notFound();
  });
}
