import { HealthSchema, LayoutPopularitySchema, MinimumVersionSchema, NATIVE_APP_HEADER } from "@storystitch/shared";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createDb } from "./db/client";
import { loadEnv } from "./env";
import { MINIMUM_IOS_VERSION, WEB, testApi } from "./test-helpers";

// Real Postgres: `docker compose up` locally, a service container in CI.
const api = testApi();
const app = api.app;
afterAll(() => api.close());

describe("AC-API-04 health", () => {
  it("reports the API and database as up", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(HealthSchema.parse(await res.json())).toEqual({ ok: true, version: "test-sha", database: "up" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const down = createDb("postgres://app:app@127.0.0.1:1/app");
    const res = await createApp({ pool: down.pool, auth: api.auth, corsOrigins: [WEB], version: "x", minimumIosVersion: "1.0.0" }).request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, database: "down" });
    await down.pool.end();
  });
});

describe("AC-API-06 minimum app version", () => {
  it("tells anyone which iOS app version is the oldest still supported", async () => {
    const res = await app.request("/app/minimum-version");
    expect(res.status).toBe(200);
    expect(MinimumVersionSchema.parse(await res.json())).toEqual({ ios: MINIMUM_IOS_VERSION });
  });
});

describe("AC-AUTH-13 links from emails", () => {
  it("tells iOS that confirmation and reset links open both apps", async () => {
    const res = await app.request("/.well-known/apple-app-site-association");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const { details } = ((await res.json()) as { applinks: { details: { appIDs: string[]; components: { "/": string }[] }[] } }).applinks;
    expect(details[0]!.appIDs).toEqual(["R4Y4AMD49G.com.ashishnag.storystitch", "R4Y4AMD49G.com.ashishnag.storystitch.staging"]);
    expect(details[0]!.components.map((c) => c["/"])).toEqual(["/api/auth/verify-email", "/api/auth/reset-password/*"]);
  });
});

describe("AC-API-01 CORS", () => {
  const preflight = (origin: string) =>
    app.request("/health", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });

  it("lets StoryStitch's own web origin call the API with credentials", async () => {
    const res = await preflight(WEB);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(WEB);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("gives any other origin no access", async () => {
    for (const origin of ["https://evil.example", "https://storystitch.ashishnag.com.evil.example"]) {
      expect((await preflight(origin)).headers.get("Access-Control-Allow-Origin")).toBeNull();
      const res = await app.request("/health", { headers: { Origin: origin } });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("never lets a browser send the native app's header, so a web page can't use it", async () => {
    for (const origin of ["https://evil.example", WEB]) {
      const res = await app.request("/layouts/mine", {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": NATIVE_APP_HEADER },
      });
      expect(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase() ?? "").not.toContain(NATIVE_APP_HEADER);
    }
  });
});

describe("env", () => {
  const base = {
    DATABASE_URL: "postgres://a:b@localhost:5432/db",
    CORS_ORIGIN: "https://a.example, https://b.example",
    BETTER_AUTH_URL: "https://api.example",
    BETTER_AUTH_SECRET: "x".repeat(32),
    TURNSTILE_SECRET_KEY: "secret",
  };

  it("splits the allowed origins and defaults the port", () => {
    expect(loadEnv(base)).toMatchObject({ PORT: 3000, CORS_ORIGIN: ["https://a.example", "https://b.example"] });
  });

  it("defaults the app's scheme and minimum version, so a deploy doesn't depend on setting them", () => {
    expect(loadEnv(base)).toMatchObject({ APP_SCHEME: "storystitch://", MIN_IOS_APP_VERSION: "1.0.0" });
  });

  it("refuses to start with missing or malformed values", () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: undefined })).toThrow();
    expect(() => loadEnv({ ...base, CORS_ORIGIN: "not a url" })).toThrow();
    expect(() => loadEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow();
    expect(() => loadEnv({ ...base, EMAIL_TRANSPORT: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() => loadEnv({ ...base, DISABLE_RATE_LIMIT: "true" })).toThrow(/tests only/);
    expect(() => loadEnv({ ...base, APP_SCHEME: "storystitch" })).toThrow();
    expect(() => loadEnv({ ...base, APP_SCHEME: "storystitch://*" })).toThrow();
    expect(() => loadEnv({ ...base, MIN_IOS_APP_VERSION: "1.2" })).toThrow();
  });
});

describe("AC-RANK-05 layout exports", () => {
  const exportsOf = async (id: string) => {
    const res = await app.request("/layouts/popularity");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    return LayoutPopularitySchema.parse(await res.json()).exports[id] ?? 0;
  };

  it("counts each export of a layout and serves the totals", async () => {
    const before = await exportsOf("two-wave");
    for (let i = 0; i < 2; i++) expect((await app.request("/layouts/two-wave/exports", { method: "POST" })).status).toBe(204);
    expect(await exportsOf("two-wave")).toBe(before + 2);
  });

  it("ignores layouts that don't exist", async () => {
    expect((await app.request("/layouts/not-a-layout/exports", { method: "POST" })).status).toBe(404);
    expect(await exportsOf("not-a-layout")).toBe(0);
  });

  it("stores only a count per layout: nothing about who exported or from where", async () => {
    const { rows } = await api.pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'layout_exports' order by ordinal_position",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["layout_id", "count", "updated_at"]);
  });
});
