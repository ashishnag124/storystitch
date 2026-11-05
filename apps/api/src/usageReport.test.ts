import { NATIVE_APP_HEADER } from "@storystitch/shared";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { testApi } from "./test-helpers";
import { formatUsageReport, loadUsage, type UsageRow } from "./usageReport";

const today = new Date("2031-06-15T12:00:00Z");

const row = (event: string, count: number, extra: Partial<UsageRow> = {}): UsageRow => ({
  day: "2031-06-15",
  event,
  platform: "web",
  appVersion: "",
  propKey: "",
  propValue: "",
  count,
  ...extra,
});
const prop = (event: string, propKey: string, propValue: string, count: number, extra: Partial<UsageRow> = {}) =>
  row(event, count, { propKey, propValue, ...extra });

/** The table under a heading, without the heading or the table's header lines. */
const tableIn = (report: string, heading: string) =>
  report
    .split(`## ${heading}\n`)[1]!
    .split("\n## ")[0]!
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2);

describe("usage report", () => {
  it("adds up daily totals per platform, newest first", () => {
    const ios = { platform: "ios", appVersion: "1.0.0" };
    const report = formatUsageReport(
      [
        row("visitors", 2, { day: "2031-06-14" }),
        row("visit_started", 3, { day: "2031-06-14" }),
        row("visitors", 5),
        row("visit_started", 7),
        row("photos_picked", 4),
        row("collage_shared", 1),
        row("visitors", 1, ios),
        row("visitors", 1, { ...ios, appVersion: "1.1.0" }),
      ],
      7,
      today,
    );
    expect(report).toContain("# Usage, 2031-06-09 to 2031-06-15 (UTC)");
    expect(report).toContain("visitor-days, not unique people");
    expect(tableIn(report, "Daily totals")).toEqual([
      "| 2031-06-15 | web | 5 | 7 | 4 | 1 |",
      "| 2031-06-15 | ios | 2 | 0 | 0 | 0 |",
      "| 2031-06-14 | web | 2 | 3 | 0 | 0 |",
    ]);
  });

  it("builds the funnel from the first export and share of each set of photos, split by platform", () => {
    const ios = { platform: "ios", appVersion: "1.0.0" };
    const report = formatUsageReport(
      [
        row("photos_picked", 10),
        row("collage_exported", 9),
        prop("collage_exported", "first", "true", 5),
        prop("collage_exported", "first", "false", 4),
        row("collage_shared", 8),
        prop("collage_shared", "first", "true", 4),
        prop("collage_shared", "first", "false", 4),
        row("photos_picked", 4, ios),
        prop("collage_exported", "first", "true", 1, ios),
      ],
      30,
      today,
    );
    expect(report).toContain("on iOS a cancelled share sheet counts as a share");
    expect(tableIn(report, "Funnel")).toEqual(["| ios | 4 | 1 | 25% | 0 | 0% |", "| web | 10 | 5 | 50% | 4 | 40% |"]);
  });

  it("ranks layouts, screens, controls and errors, and shows dropped events", () => {
    const report = formatUsageReport(
      [
        prop("layout_chosen", "layout", "two-wave", 3),
        prop("layout_chosen", "layout", "two-wave", 2, { day: "2031-06-14" }),
        prop("layout_chosen", "layout", "custom", 9),
        prop("collage_shared", "layout", "two-wave", 1),
        prop("collage_shared", "layout", "other", 4),
        prop("screen_viewed", "screen", "pick", 2),
        prop("screen_viewed", "screen", "editor", 6),
        prop("control_pressed", "control", "share", 1),
        prop("error_shown", "code", "export_failed", 2),
        row("usage_dropped", 3),
      ],
      30,
      today,
    );
    expect(tableIn(report, "Top layouts")).toEqual(["| custom | 9 | 0 |", "| two-wave | 5 | 1 |", "| other | 0 | 4 |"]);
    expect(tableIn(report, "Screens")).toEqual(["| editor | 6 |", "| pick | 2 |"]);
    expect(tableIn(report, "Controls")).toEqual(["| share | 1 |"]);
    expect(tableIn(report, "Errors")).toEqual(["| export_failed | 2 |"]);
    expect(report).toContain("Events the API dropped: 3.");
  });

  it("lists app versions newest first, reading them as numbers, and leaves out web", () => {
    const report = formatUsageReport(
      [
        row("visit_started", 1),
        row("visit_started", 2, { platform: "ios", appVersion: "1.9.0" }),
        row("visit_started", 3, { platform: "ios", appVersion: "1.10.0" }),
        row("visit_started", 4, { platform: "android", appVersion: "1.0.0" }),
      ],
      30,
      today,
    );
    expect(tableIn(report, "App versions")).toEqual(["| ios | 1.10.0 | 3 |", "| ios | 1.9.0 | 2 |", "| android | 1.0.0 | 4 |"]);
  });

  it("says when there's nothing to show", () => {
    const report = formatUsageReport([], 30, today);
    expect(report).toContain("None in this period.");
    expect(report).toContain("Events the API dropped: 0.");
  });
});

describe("usage report from the database", () => {
  const api = testApi({ usageIngestEnabled: true });
  // Far ahead, on a day of its own, so this sees only its own rows however many times it runs.
  const year = 2200 + Math.floor(Math.random() * 7000);
  const sendDay = new Date(`${year}-03-10T12:00:00Z`);

  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await api.pool.query("delete from usage_daily where extract(year from day) = $1", [year]);
    await api.close();
  });

  it("reports events sent through the API, for the days asked for", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const send = (date: string, events: unknown[]) => {
      vi.setSystemTime(`${year}-03-${date}T12:00:00Z`);
      return api.client().call("/usage/events", {
        body: { platform: "ios", appVersion: "1.2.0", events },
        native: true,
        headers: { "Content-Type": "text/plain", [NATIVE_APP_HEADER]: "1" },
      });
    };
    await send("08", [{ name: "layout_saved" }]);
    await send("09", [{ name: "visit_started" }]);
    await send("10", [
      { name: "visit_started" },
      { name: "photos_picked", props: { count: 2 } },
      { name: "collage_exported", props: { layout: "custom", format: "jpeg", first: true } },
      { name: "collage_shared", props: { layout: "custom", method: "share", first: true } },
    ]);

    const report = formatUsageReport(await loadUsage(api.pool, 2, sendDay), 2, sendDay);
    expect(report).toContain(`# Usage, ${year}-03-09 to ${year}-03-10 (UTC)`);
    expect(tableIn(report, "Daily totals")).toEqual([`| ${year}-03-10 | ios | 1 | 1 | 1 | 1 |`, `| ${year}-03-09 | ios | 1 | 1 | 0 | 0 |`]);
    expect(tableIn(report, "Funnel")).toEqual(["| ios | 1 | 1 | 100% | 1 | 100% |"]);
    expect(tableIn(report, "App versions")).toEqual(["| ios | 1.2.0 | 2 |"]);
  });
});
