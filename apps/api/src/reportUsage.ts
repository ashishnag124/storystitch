// `pnpm usage:report [--days 30]`: prints usage counts as Markdown tables. Only reads, then exits.
import { parseArgs } from "node:util";
import { createDb } from "./db/client";
import { formatUsageReport, loadUsage } from "./usageReport";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const days = Number(parseArgs({ options: { days: { type: "string", default: "30" } } }).values.days);
if (!Number.isInteger(days) || days < 1) throw new Error("--days must be a whole number of at least 1");

const { pool } = createDb(url);
const today = new Date();
console.log(formatUsageReport(await loadUsage(pool, days, today), days, today));
await pool.end();
