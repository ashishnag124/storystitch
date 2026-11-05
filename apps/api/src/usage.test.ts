import { NATIVE_APP_HEADER } from "@storystitch/shared";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { createDb } from "./db/client";
import { API, WEB, testApi } from "./test-helpers";

// Real Postgres, so it's the stored rows being checked. Each test uses its own made-up app version, so tests can't see
// each other's rows and repeat runs start clean.
const api = testApi({ usageIngestEnabled: true });
const off = testApi();
afterAll(() => Promise.all([api.close(), off.close()]));
afterEach(() => vi.useRealTimers());

const newVersion = () => `9.${Math.floor(Math.random() * 1e9)}.0`;
const plain = { "Content-Type": "text/plain" };
const asApp = { ...plain, [NATIVE_APP_HEADER]: "1" };

/** Sends a batch as the iOS app does: text/plain, no Origin, the app's header. */
function sendFromApp(client: ReturnType<typeof api.client>, appVersion: string, events: unknown[], headers: Record<string, string> = {}) {
  return client.call("/usage/events", { body: { platform: "ios", appVersion, events }, native: true, headers: { ...asApp, ...headers } });
}

async function rows(appVersion: string) {
  const { rows } = await api.pool.query<{ event: string; prop_key: string; prop_value: string; count: string }>(
    "select event, prop_key, prop_value, count from usage_daily where app_version = $1 order by event collate \"C\", prop_key collate \"C\", prop_value collate \"C\"",
    [appVersion],
  );
  return rows.map((r) => [r.event, r.prop_key, r.prop_value, Number(r.count)]);
}

const webTotal = async () => {
  const { rows } = await api.pool.query<{ count: string }>(
    "select coalesce(sum(count), 0) as count from usage_daily where event = 'layout_saved' and platform = 'web'",
  );
  return Number(rows[0]!.count);
};

describe("AC-USAGE-05 counting events", () => {
  it("adds each event to its total and to a row per property, for today", async () => {
    const version = newVersion();
    const res = await sendFromApp(api.client(), version, [
      { name: "photos_picked", props: { count: 3 } },
      { name: "collage_shared", props: { layout: "custom", method: "share", first: true } },
      { name: "collage_shared", props: { layout: "custom", method: "share", first: false } },
    ]);
    expect(res.status).toBe(204);
    expect(await rows(version)).toEqual([
      ["collage_shared", "", "", 2],
      ["collage_shared", "first", "false", 1],
      ["collage_shared", "first", "true", 1],
      ["collage_shared", "layout", "custom", 2],
      ["collage_shared", "method", "share", 2],
      ["photos_picked", "", "", 1],
      ["photos_picked", "count", "3", 1],
    ]);
    const { rows: days } = await api.pool.query<{ day: string }>("select day::text as day from usage_daily where app_version = $1 limit 1", [version]);
    expect(days[0]!.day).toBe(new Date().toISOString().slice(0, 10));
  });

  it("adds to the same rows across batches", async () => {
    const version = newVersion();
    const client = api.client();
    await sendFromApp(client, version, [{ name: "layout_saved" }]);
    await sendFromApp(client, version, [{ name: "layout_saved" }]);
    expect(await rows(version)).toEqual([["layout_saved", "", "", 2]]);
  });

  it("skips unknown and bad events, keeps the rest of the batch, and counts what it skipped", async () => {
    const version = newVersion();
    const res = await sendFromApp(api.client(), version, [
      { name: "from_a_newer_app" },
      { name: "photos_picked", props: { count: 99 } },
      "not an event",
      { name: "layout_saved" },
    ]);
    expect(res.status).toBe(204);
    expect(await rows(version)).toEqual([
      ["layout_saved", "", "", 1],
      ["usage_dropped", "", "", 3],
    ]);
  });

  it("doesn't let an app send the rows the API keeps for itself", async () => {
    const version = newVersion();
    await sendFromApp(api.client(), version, [{ name: "visitors" }, { name: "usage_dropped" }]);
    expect(await rows(version)).toEqual([["usage_dropped", "", "", 2]]);
  });

  it("keeps a value a newer app added, as other", async () => {
    const version = newVersion();
    await sendFromApp(api.client(), version, [{ name: "control_pressed", props: { control: "from_a_newer_app" } }]);
    expect(await rows(version)).toEqual([
      ["control_pressed", "", "", 1],
      ["control_pressed", "control", "other", 1],
    ]);
  });

  it("accepts a batch from a web page, whose body is text/plain", async () => {
    const before = await webTotal();
    const res = await api.client().call("/usage/events", { body: { platform: "web", events: [{ name: "layout_saved" }] }, headers: plain });
    expect(res.status).toBe(204);
    expect(await webTotal()).toBe(before + 1);
  });

  it("stores no app version on web, whatever a request claims", async () => {
    const version = newVersion();
    await api.client().call("/usage/events", { body: { platform: "web", appVersion: version, events: [{ name: "layout_saved" }] }, headers: plain });
    expect(await rows(version)).toEqual([]);
  });

  it("does nothing for an empty batch", async () => {
    expect((await sendFromApp(api.client(), newVersion(), [])).status).toBe(204);
  });

  it("refuses a body that isn't a batch", async () => {
    const client = api.client();
    expect((await client.call("/usage/events", { body: { platform: "desktop", events: [] }, headers: plain })).status).toBe(400);
    expect((await client.call("/usage/events", { body: { platform: "ios", appVersion: "soon", events: [] }, headers: plain })).status).toBe(400);
    expect((await client.call("/usage/events", { body: { platform: "web", events: Array(51).fill({}) }, headers: plain })).status).toBe(400);
    const res = await api.app.request(new URL("/usage/events", API).toString(), { method: "POST", headers: { Origin: WEB, ...plain }, body: "not json" });
    expect(res.status).toBe(400);
  });

  it("answers 503 when the database is down, so the app tries again", async () => {
    const down = createDb("postgres://app:app@127.0.0.1:1/app");
    const app = createApp({ pool: down.pool, auth: api.auth, corsOrigins: [WEB], version: "x", minimumIosVersion: "1.0.0", usageIngestEnabled: true });
    const res = await app.request(new URL("/usage/events", API).toString(), {
      method: "POST",
      headers: { Origin: WEB, ...plain },
      body: JSON.stringify({ platform: "web", events: [{ name: "layout_saved" }] }),
    });
    expect(res.status).toBe(503);
    await down.pool.end();
  });
});

describe("AC-USAGE-06 limits", () => {
  it("writes nothing while switched off, and still answers so apps carry on", async () => {
    const version = newVersion();
    const res = await sendFromApp(off.client(), version, [{ name: "layout_saved" }]);
    expect(res.status).toBe(204);
    expect(await rows(version)).toEqual([]);
  });

  it("refuses other web origins, and requests with neither an Origin nor the app's header", async () => {
    const version = newVersion();
    const body = { platform: "ios", appVersion: version, events: [{ name: "layout_saved" }] };
    const client = api.client();
    expect((await client.call("/usage/events", { body, headers: { ...plain, Origin: "https://evil.example" } })).status).toBe(403);
    expect((await client.call("/usage/events", { body, headers: { ...asApp, Origin: "https://evil.example" } })).status).toBe(403);
    expect((await client.call("/usage/events", { body, native: true, headers: plain })).status).toBe(403);
    expect(await rows(version)).toEqual([]);
  });

  it("refuses a body over 16 KB", async () => {
    const res = await api.client().call("/usage/events", { body: { platform: "web", events: [], padding: "x".repeat(17 * 1024) }, headers: plain });
    expect(res.status).toBe(413);
  });

  it("limits batches from one address, even with a new user agent each time", async () => {
    const version = newVersion();
    const client = api.client();
    const statuses = [];
    for (let i = 0; i < 61; i++) statuses.push((await sendFromApp(client, version, [{ name: "layout_saved" }], { "User-Agent": `ua-${i}` })).status);
    expect(statuses.slice(0, 60).every((s) => s === 204)).toBe(true);
    expect(statuses[60]).toBe(429);
    expect(await rows(version)).toEqual([["layout_saved", "", "", 60]]);
    expect((await sendFromApp(api.client(), version, [{ name: "layout_saved" }])).status).toBe(204);
  });
});

describe("AC-ADMIN-02 nothing about a person is stored", () => {
  const visit = [{ name: "visit_started" }];
  const visitors = async (version: string) => (await rows(version)).find(([event]) => event === "visitors")?.[3] ?? 0;

  it("stores only the day, the event, the platform, the version and counts", async () => {
    const { rows } = await api.pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'usage_daily' order by ordinal_position",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["day", "event", "platform", "app_version", "prop_key", "prop_value", "count"]);
  });

  it("counts a visitor once a day, however many times they come back", async () => {
    const version = newVersion();
    const client = api.client();
    await sendFromApp(client, version, visit, { "User-Agent": "same phone" });
    await sendFromApp(client, version, visit, { "User-Agent": "same phone" });
    expect(await rows(version)).toEqual([
      ["visit_started", "", "", 2],
      ["visitors", "", "", 1],
    ]);
  });

  it("counts different addresses and devices as different visitors", async () => {
    const version = newVersion();
    const client = api.client();
    await sendFromApp(client, version, visit, { "User-Agent": "phone" });
    await sendFromApp(client, version, visit, { "User-Agent": "tablet" });
    await sendFromApp(api.client(), version, visit, { "User-Agent": "phone" });
    expect(await visitors(version)).toBe(3);
  });

  it("starts again with a new salt each UTC day, so visitors can't be matched across days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2031-03-04T23:59:00Z");
    const version = newVersion();
    const client = api.client();
    await sendFromApp(client, version, visit);
    await sendFromApp(client, version, visit);
    vi.setSystemTime("2031-03-05T00:01:00Z");
    await sendFromApp(client, version, visit);
    const { rows: days } = await api.pool.query<{ day: string; count: string }>(
      "select day::text as day, count from usage_daily where app_version = $1 and event = 'visitors' order by day",
      [version],
    );
    expect(days.map((d) => [d.day, Number(d.count)])).toEqual([
      ["2031-03-04", 1],
      ["2031-03-05", 1],
    ]);
  });

  it("counts a visitor again when the write failed, because the app will retry it", async () => {
    const version = newVersion();
    const client = api.client();
    const query = vi.spyOn(api.pool, "query").mockRejectedValueOnce(new Error("down") as never);
    expect((await sendFromApp(client, version, visit)).status).toBe(503);
    query.mockRestore();
    await sendFromApp(client, version, visit);
    expect(await visitors(version)).toBe(1);
  });

  it("keeps the address, the user agent and the hash out of the database", async () => {
    const version = newVersion();
    const ua = `browser-${randomUUID()}`;
    const ip = "203.0.113.77";
    await sendFromApp(api.client(), version, visit, { "User-Agent": ua, "x-real-ip": ip });
    const { rows: stored } = await api.pool.query("select * from usage_daily where app_version = $1", [version]);
    expect(stored.length).toBeGreaterThan(0);
    const text = JSON.stringify(stored);
    expect(text).not.toContain(ua);
    expect(text).not.toContain(ip);
    expect(text).not.toMatch(/[0-9a-f]{32}/);
  });
});
