import type pg from "pg";
import { DROPPED, VISITORS } from "./usage";

export interface UsageRow {
  day: string;
  event: string;
  platform: string;
  appVersion: string;
  propKey: string;
  propValue: string;
  count: number;
}

export const day = (date: Date) => date.toISOString().slice(0, 10);

/** The first day of the `days` days ending on `today`. */
const firstDay = (days: number, today: Date) => day(new Date(today.getTime() - (days - 1) * 86_400_000));

/** Every counter from the `days` UTC days ending on `today`. */
export async function loadUsage(pool: pg.Pool, days: number, today = new Date()): Promise<UsageRow[]> {
  const { rows } = await pool.query<Omit<UsageRow, "count"> & { count: string }>(
    `select day::text as day, event, platform, app_version as "appVersion", prop_key as "propKey", prop_value as "propValue", count
     from usage_daily where day between $1::date and $2::date`,
    [firstDay(days, today), day(today)],
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

const sum = (rows: UsageRow[]) => rows.reduce((total, r) => total + r.count, 0);
const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "-");

function table(headers: string[], rows: (string | number)[][]) {
  if (!rows.length) return "None in this period.";
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

/** Markdown tables of one period's counters, for reading in a terminal. */
export function formatUsageReport(rows: UsageRow[], days: number, today = new Date()) {
  const totals = rows.filter((r) => r.propKey === "");
  const total = (event: string, from = totals) => sum(from.filter((r) => r.event === event));
  const platforms = [...new Set(rows.map((r) => r.platform))].sort();

  /** How many times each value of a property was sent, most first. */
  const byValue = (event: string, propKey: string) => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.event === event && r.propKey === propKey) counts.set(r.propValue, (counts.get(r.propValue) ?? 0) + r.count);
    }
    return [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  };
  const firstOf = (event: string, platform: string) =>
    sum(rows.filter((r) => r.event === event && r.platform === platform && r.propKey === "first" && r.propValue === "true"));

  const daily = [...new Set(totals.map((r) => `${r.day} ${r.platform}`))]
    .sort()
    .reverse()
    .map((key) => {
      const [date, platform] = key.split(" ");
      const those = totals.filter((r) => r.day === date && r.platform === platform);
      return [date!, platform!, ...[VISITORS, "visit_started", "photos_picked", "collage_shared"].map((event) => total(event, those))];
    });

  const funnel = platforms.map((platform) => {
    const picked = total("photos_picked", totals.filter((r) => r.platform === platform));
    const exported = firstOf("collage_exported", platform);
    const shared = firstOf("collage_shared", platform);
    return [platform, picked, exported, percent(exported, picked), shared, percent(shared, picked)];
  });

  const chosen = new Map(byValue("layout_chosen", "layout"));
  const sharedLayouts = new Map(byValue("collage_shared", "layout"));
  const topLayouts = [...new Set([...chosen.keys(), ...sharedLayouts.keys()])]
    .map((layout) => [layout, chosen.get(layout) ?? 0, sharedLayouts.get(layout) ?? 0] as const)
    .sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0].localeCompare(b[0]));

  const versions = new Map<string, number>();
  for (const r of totals) {
    if (r.event === "visit_started" && r.platform !== "web") {
      const key = `${r.platform} ${r.appVersion}`;
      versions.set(key, (versions.get(key) ?? 0) + r.count);
    }
  }

  return [
    `# Usage, ${firstDay(days, today)} to ${day(today)} (UTC)`,
    "## Daily totals",
    "Visitors are estimates. Each day is counted separately, so adding days gives visitor-days, not unique people.",
    table(["Day", "Platform", "Visitors", "Visits", "Photo picks", "Shares"], daily),
    "## Funnel",
    "Each set of photos counts once. Don't compare platforms: on iOS a cancelled share sheet counts as a share.",
    table(["Platform", "Photos picked", "Exported", "Exported %", "Shared", "Shared %"], funnel),
    "## Top layouts",
    table(["Layout", "Chosen", "Shared"], topLayouts.map((row) => [...row])),
    "## Screens",
    table(["Screen", "Views"], byValue("screen_viewed", "screen")),
    "## Controls",
    table(["Control", "Presses"], byValue("control_pressed", "control")),
    "## Errors",
    table(["Code", "Shown"], byValue("error_shown", "code")),
    `Events the API dropped: ${total(DROPPED)}. A rise means an app is sending something broken.`,
    "## App versions",
    table(
      ["Platform", "Version", "Visits"],
      [...versions]
        .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
        .map(([key, visits]) => [...key.split(" "), visits]),
    ),
  ].join("\n\n");
}
