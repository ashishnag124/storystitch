// `pnpm db:migrate`: applies pending migrations, then exits. (The API also applies them itself at startup.)
import { createDb } from "./db/client";
import { applyMigrations } from "./db/migrate";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const { db, pool } = createDb(url);
await applyMigrations(db);
await pool.end();
console.log("Migrations applied");
