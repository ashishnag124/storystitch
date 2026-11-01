import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";

/**
 * Applies pending migrations from apps/api/drizzle. The API runs this at startup, before it accepts requests, so
 * a deploy can never serve code against an older schema. Migrations must stay backward compatible with the
 * previous API version (add first, remove in a later release): during a deploy the old version is still serving.
 */
export async function applyMigrations(db: Db["db"]) {
  // From src/db (tsx) or dist (built, where this file is bundled into its entry), find apps/api/drizzle.
  const here = new URL(".", import.meta.url).pathname;
  const folder = here.endsWith("/src/db/") ? "../../drizzle" : "../drizzle";
  await migrate(db, { migrationsFolder: fileURLToPath(new URL(folder, import.meta.url)) });
}
