// Applies pending migrations from ./drizzle, then exits. Railway runs it before each deploy starts the new API.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDb } from "./db/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const { db, pool } = createDb(url);
// From src/ (tsx) or dist/ (built), the migrations folder is one level up.
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
await pool.end();
console.log("Migrations applied");
