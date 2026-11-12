import { AdminStatsSchema } from "@storystitch/shared";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { adminStats } from "./admin";
import { CAPTCHA, testApi, totpCode, verifiedUser } from "./test-helpers";
import type { UsageRow } from "./usageReport";

// Real Postgres: `docker compose up` locally, a service container in CI.
const api = testApi({ adminEnabled: true });
afterAll(() => api.close());

type Client = ReturnType<typeof api.client>;
const stats = (c: Client, days = 30) => c.call(`/admin/stats?days=${days}`);
const makeAdmin = (email: string) => api.pool.query('update "user" set is_admin = true where email = $1', [email]);

/** Turns on the authenticator for the signed-in account and returns its base32 secret. */
async function enroll(c: Client, password: string) {
  const res = await c.call("/api/auth/two-factor/enable", { body: { password } });
  expect(res.status).toBe(200);
  const { totpURI } = (await res.json()) as { totpURI: string };
  expect(totpURI).toMatch(/^otpauth:\/\/totp\/StoryStitch:/);
  const secret = new URL(totpURI).searchParams.get("secret")!;
  expect((await c.call("/api/auth/two-factor/verify-totp", { body: { code: totpCode(secret) } })).status).toBe(200);
  return secret;
}

/** Signs in as a two-factor account: with just the password there is no session; the code completes it. */
async function signIn(email: string, password: string, secret: string) {
  const c = api.client();
  const res = await c.call("/api/auth/sign-in/email", { body: { email, password }, headers: CAPTCHA });
  expect(await res.json()).toMatchObject({ twoFactorRedirect: true });
  return { c, finish: () => c.call("/api/auth/two-factor/verify-totp", { body: { code: totpCode(secret) } }) };
}

describe("AC-ADMIN-03 admin access", () => {
  it("is refused to everyone but an admin who signed in with an authenticator code", async () => {
    expect((await stats(api.client())).status).toBe(401);

    const ordinary = await verifiedUser(api);
    expect((await stats(ordinary.c)).status).toBe(403);

    // Admin, but password only.
    const admin = await verifiedUser(api);
    await makeAdmin(admin.email);
    expect((await stats(admin.c)).status).toBe(403);

    // Started enrolling but never entered a code: still refused.
    expect((await admin.c.call("/api/auth/two-factor/enable", { body: { password: admin.password } })).status).toBe(200);
    expect((await stats(admin.c)).status).toBe(403);
  });

  it("opens for an admin whose authenticator code was verified, and only once the code is entered at sign-in", async () => {
    const admin = await verifiedUser(api);
    await makeAdmin(admin.email);
    const secret = await enroll(admin.c, admin.password);
    const res = await stats(admin.c);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    AdminStatsSchema.parse(await res.json());

    const next = await signIn(admin.email, admin.password, secret);
    expect((await stats(next.c)).status).toBe(401);
    expect((await next.c.call("/api/auth/two-factor/verify-totp", { body: { code: "000000" } })).status).toBe(401);
    expect((await stats(next.c)).status).toBe(401);
    expect((await next.finish()).status).toBe(200);
    expect((await stats(next.c)).status).toBe(200);
  });

  it("is refused to a non-admin who turned on an authenticator", async () => {
    const user = await verifiedUser(api);
    await enroll(user.c, user.password);
    expect((await stats(user.c)).status).toBe(403);
  });

  it("doesn't take requests from other sites", async () => {
    const admin = await verifiedUser(api);
    await makeAdmin(admin.email);
    await enroll(admin.c, admin.password);
    expect((await admin.c.call("/admin/stats", { headers: { Origin: "https://evil.example" } })).status).toBe(403);
  });

  it("can't be given admin rights through sign-up or update-user", async () => {
    const email = api.email();
    const c = api.client();
    const body = { email, password: "correct horse battery", name: "Sneaky", isAdmin: true, is_admin: true, twoFactorEnabled: true };
    await c.call("/api/auth/sign-up/email", { body, headers: CAPTCHA });
    await c.call(api.lastEmail(email).link);
    const read = async () => (await api.pool.query('select is_admin, two_factor_enabled from "user" where email = $1', [email])).rows[0];
    expect(await read()).toEqual({ is_admin: false, two_factor_enabled: false });

    await c.call("/api/auth/update-user", { body: { name: "Still sneaky", isAdmin: true, is_admin: true, twoFactorEnabled: true } });
    expect(await read()).toEqual({ is_admin: false, two_factor_enabled: false });
    expect((await stats(c)).status).toBe(403);
  });

  it("doesn't exist, and adds no second step, when ADMIN_ENABLED is off", async () => {
    const off = testApi();
    try {
      expect((await off.client().call("/admin/stats")).status).toBe(404);
      const { c, password } = await verifiedUser(off);
      expect((await c.call("/api/auth/two-factor/enable", { body: { password } })).status).toBe(404);
    } finally {
      await off.close();
    }
  });

  it("leaves sign-in for accounts without an authenticator as it was", async () => {
    const { email, password } = await verifiedUser(api);
    const c = api.client();
    const res = await c.call("/api/auth/sign-in/email", { body: { email, password }, headers: CAPTCHA });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("twoFactorRedirect");
  });
});

describe("AC-ADMIN-04 admin stats", () => {
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
  const today = new Date("2031-06-15T12:00:00Z");

  it("adds up daily totals, the funnel, top layouts and errors", () => {
    const ios = { platform: "ios", appVersion: "1.0.0" };
    const result = adminStats(
      [
        row("photos_picked", 4),
        row("photos_picked", 2, ios),
        row("photos_picked", 5, { day: "2031-06-14" }),
        row("visitors", 3),
        row("collage_exported", 3),
        row("collage_exported", 2, { propKey: "first", propValue: "true" }),
        row("collage_exported", 1, { propKey: "first", propValue: "false" }),
        row("collage_exported", 1, { ...ios, propKey: "first", propValue: "true" }),
        row("error_shown", 5),
        row("error_shown", 3, { propKey: "code", propValue: "export_failed" }),
        row("error_shown", 2, { propKey: "code", propValue: "photo_unreadable" }),
        row("error_shown", 1, { day: "2031-06-14", propKey: "code", propValue: "export_failed" }),
      ],
      3,
      [
        { layout: "b", exports: 5 },
        { layout: "a", exports: 5 },
        ...Array.from({ length: 12 }, (_, i) => ({ layout: `l${i}`, exports: 1 })),
      ],
      today,
    );
    AdminStatsSchema.parse(result);
    expect(result.daily.map((d) => d.day)).toEqual(["2031-06-15", "2031-06-14", "2031-06-13"]);
    expect(result.daily[0]!.counts).toMatchObject({ photos_picked: 6, visitors: 3, collage_exported: 3, error_shown: 5, signed_up: 0 });
    expect(result.daily[1]!.counts.photos_picked).toBe(5);
    expect(result.daily[2]!.counts.photos_picked).toBe(0);
    expect(result.funnel).toEqual({ picked: 11, exported: 3, saved: 0 });
    expect(result.topLayouts).toHaveLength(10);
    expect(result.topLayouts.slice(0, 2)).toEqual([
      { layout: "a", exports: 5 },
      { layout: "b", exports: 5 },
    ]);
    expect(result.errors).toEqual([
      { code: "export_failed", count: 4 },
      { code: "photo_unreadable", count: 2 },
    ]);
  });

  it("serves the stored counts for the chosen number of days and refuses other numbers", async () => {
    const admin = await verifiedUser(api);
    await makeAdmin(admin.email);
    await enroll(admin.c, admin.password);
    const get = async (days = 30) => AdminStatsSchema.parse(await (await stats(admin.c, days)).json());
    const before = await get();
    expect(before.daily).toHaveLength(30);
    expect((await get(7)).daily).toHaveLength(7);

    const platform = `admin-test-${randomUUID()}`;
    const layout = `zz-test-${randomUUID()}`;
    const insert = (event: string, propKey: string, propValue: string, count: number) =>
      api.pool.query("insert into usage_daily (day, event, platform, prop_key, prop_value, count) values (current_date, $1, $2, $3, $4, $5)", [
        event,
        platform,
        propKey,
        propValue,
        count,
      ]);
    try {
      await insert("photos_picked", "", "", 3);
      await insert("collage_exported", "first", "true", 2);
      await insert("error_shown", "code", "export_failed", 4);
      await api.pool.query("insert into layout_exports (layout_id, count) values ($1, 2000000000)", [layout]);

      const after = await get();
      const errors = (s: typeof after) => s.errors.find((e) => e.code === "export_failed")?.count ?? 0;
      expect(after.daily[0]!.counts.photos_picked - before.daily[0]!.counts.photos_picked).toBe(3);
      expect(after.funnel.picked - before.funnel.picked).toBe(3);
      expect(after.funnel.exported - before.funnel.exported).toBe(2);
      expect(errors(after) - errors(before)).toBe(4);
      expect(after.topLayouts[0]).toEqual({ layout, exports: 2_000_000_000 });
    } finally {
      await api.pool.query("delete from usage_daily where platform = $1", [platform]);
      await api.pool.query("delete from layout_exports where layout_id = $1", [layout]);
    }

    for (const days of ["0", "91", "x", "1.5"]) expect((await admin.c.call(`/admin/stats?days=${days}`)).status).toBe(400);
  });
});
