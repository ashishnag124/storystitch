import { HealthSchema, LayoutPopularitySchema } from "@storystitch/shared";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createDb } from "./db/client";
import { loadEnv } from "./env";
import { WEB, testApi } from "./test-helpers";

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
    const res = await createApp({ pool: down.pool, auth: api.auth, corsOrigins: [WEB], version: "x" }).request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, database: "down" });
    await down.pool.end();
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

  it("refuses to start with missing or malformed values", () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: undefined })).toThrow();
    expect(() => loadEnv({ ...base, CORS_ORIGIN: "not a url" })).toThrow();
    expect(() => loadEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow();
    expect(() => loadEnv({ ...base, EMAIL_TRANSPORT: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() => loadEnv({ ...base, DISABLE_RATE_LIMIT: "true" })).toThrow(/tests only/);
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
