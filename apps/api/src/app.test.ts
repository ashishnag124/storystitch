import { HealthSchema } from "@storystitch/shared";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createDb } from "./db/client";
import { loadEnv } from "./env";

// Real Postgres: `docker compose up` locally, a service container in CI.
const { pool } = createDb(process.env.DATABASE_URL!);
const WEB = "https://storystitch.ashishnag.com";
const app = createApp({ pool, corsOrigins: [WEB], version: "test-sha" });
afterAll(() => pool.end());

describe("AC-API-04 health", () => {
  it("reports the API and database as up", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(HealthSchema.parse(await res.json())).toEqual({ ok: true, version: "test-sha", database: "up" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const down = createDb("postgres://app:app@127.0.0.1:1/app");
    const res = await createApp({ pool: down.pool, corsOrigins: [WEB], version: "x" }).request("/health");
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
  const base = { DATABASE_URL: "postgres://a:b@localhost:5432/db", CORS_ORIGIN: "https://a.example, https://b.example" };

  it("splits the allowed origins and defaults the port", () => {
    expect(loadEnv(base)).toMatchObject({ PORT: 3000, CORS_ORIGIN: ["https://a.example", "https://b.example"] });
  });

  it("refuses to start with missing or malformed values", () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: undefined })).toThrow();
    expect(() => loadEnv({ ...base, CORS_ORIGIN: "not a url" })).toThrow();
  });
});
