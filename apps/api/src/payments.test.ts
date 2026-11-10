import { EntitlementsSchema, NATIVE_APP_HEADER } from "@storystitch/shared";
import { afterAll, describe, expect, it } from "vitest";
import type { RevenueCat } from "./revenuecat";
import { testApi, verifiedUser } from "./test-helpers";

// Real Postgres, with a fake RevenueCat: `owners` is who RevenueCat says has Plus.
const owners = new Set<string>();
const asked: string[] = [];
const revenueCat: RevenueCat = {
  hasPlus: async (id) => {
    asked.push(id);
    return owners.has(id);
  },
};
const SECRET = "test-webhook-secret-test-webhook-secret";
const api = testApi({ payments: { revenueCat, webhookSecret: SECRET } });
const off = testApi();
afterAll(() => Promise.all([api.close(), off.close()]));

const anonymous = () => `$RCAnonymousID:${crypto.randomUUID().replaceAll("-", "")}`;
const fromApp = { native: true, headers: { [NATIVE_APP_HEADER]: "1" } };

/** A signed-in user and their account's ID. */
async function user() {
  const { c, password } = await verifiedUser(api);
  const session = (await (await c.call("/api/auth/get-session")).json()) as { user: { id: string } };
  return { c, password, id: session.user.id };
}
const plus = async (c: ReturnType<typeof api.client>) => EntitlementsSchema.parse(await (await c.call("/me/entitlements")).json()).plus;
/** RevenueCat calling the webhook, as a server would: no Origin. */
const webhook = (event: Record<string, unknown>, secret = SECRET) =>
  api.client().call("/payments/revenuecat", {
    native: true,
    headers: { Authorization: secret },
    body: { api_version: "1.0", event: { id: crypto.randomUUID(), ...event } },
  });

describe("AC-PLUS-03 the API decides who has Plus", () => {
  it("has no payment routes with PAYMENTS_ENABLED off", async () => {
    const c = off.client();
    expect((await c.call("/me/entitlements")).status).toBe(404);
    expect((await c.call("/me/entitlements/refresh", { method: "POST" })).status).toBe(404);
    expect((await c.call("/entitlements/check", { body: { appUserId: anonymous() } })).status).toBe(404);
    expect((await c.call("/payments/revenuecat", { body: {} })).status).toBe(404);
  });

  it("says signed-out and free accounts don't have Plus", async () => {
    expect(await plus(api.client())).toBe(false);
    expect(await plus((await user()).c)).toBe(false);
  });

  it("refuses webhooks without the shared secret, and changes nothing", async () => {
    const { c, id } = await user();
    owners.add(id);
    expect((await webhook({ type: "NON_RENEWING_PURCHASE", app_user_id: id }, "wrong")).status).toBe(401);
    const unsigned = await api.client().call("/payments/revenuecat", { native: true, body: { event: { type: "NON_RENEWING_PURCHASE", app_user_id: id } } });
    expect(unsigned.status).toBe(401);
    expect(await plus(c)).toBe(false);
  });

  it("grants Plus when RevenueCat confirms the purchase, and a repeated event changes nothing", async () => {
    const { c, id } = await user();
    owners.add(id);
    const event = { type: "NON_RENEWING_PURCHASE", app_user_id: id, store: "APP_STORE" };
    expect((await webhook(event)).status).toBe(200);
    expect(await plus(c)).toBe(true);
    expect((await webhook(event)).status).toBe(200);
    expect(await plus(c)).toBe(true);
  });

  it("believes RevenueCat's API, not what the event claims", async () => {
    const { c, id } = await user();
    expect((await webhook({ type: "NON_RENEWING_PURCHASE", app_user_id: id })).status).toBe(200);
    expect(asked).toContain(id);
    expect(await plus(c)).toBe(false);
  });

  it("ignores IDs that aren't accounts, such as RevenueCat's test events", async () => {
    const before = asked.length;
    expect((await webhook({ type: "TEST", app_user_id: anonymous() })).status).toBe(200);
    expect(asked.length).toBe(before);
  });

  it("refuses malformed events", async () => {
    const res = await api.client().call("/payments/revenuecat", { native: true, headers: { Authorization: SECRET }, body: { nope: 1 } });
    expect(res.status).toBe(400);
  });

  it("refresh re-reads RevenueCat for the signed-in user only, from StoryStitch's own apps", async () => {
    expect((await api.client().call("/me/entitlements/refresh", { method: "POST" })).status).toBe(401);
    const { c, id } = await user();
    owners.add(id);
    expect((await c.call("/me/entitlements/refresh", { method: "POST", headers: { Origin: "https://evil.example" } })).status).toBe(403);
    const res = await c.call("/me/entitlements/refresh", { method: "POST" });
    expect(EntitlementsSchema.parse(await res.json())).toEqual({ plus: true });
    expect(await plus(c)).toBe(true);
  });

  it("limits how often refresh asks RevenueCat", async () => {
    const { c } = await user();
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await c.call("/me/entitlements/refresh", { method: "POST" })).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });
});

describe("AC-PLUS-04 refunds", () => {
  it("takes Plus away when RevenueCat no longer reports it", async () => {
    const { c, id } = await user();
    owners.add(id);
    await webhook({ type: "NON_RENEWING_PURCHASE", app_user_id: id });
    expect(await plus(c)).toBe(true);
    owners.delete(id);
    await webhook({ type: "CANCELLATION", app_user_id: id, cancel_reason: "CUSTOMER_SUPPORT" });
    expect(await plus(c)).toBe(false);
  });
});

describe("AC-PLUS-06 buying signed out on iOS", () => {
  it("answers for a device's anonymous ID without storing anything, and accepts no account IDs", async () => {
    const device = anonymous();
    owners.add(device);
    const c = api.client();
    const check = async (appUserId: string) => c.call("/entitlements/check", { ...fromApp, body: { appUserId } });
    expect(EntitlementsSchema.parse(await (await check(device)).json())).toEqual({ plus: true });
    expect(EntitlementsSchema.parse(await (await check(anonymous())).json())).toEqual({ plus: false });
    const { id } = await user();
    owners.add(id);
    expect((await check(id)).status).toBe(400);
    expect((await c.call("/entitlements/check", { native: true, body: { appUserId: device } })).status).toBe(403);
    const { rowCount } = await api.pool.query("select 1 from entitlement where user_id = $1", [device]);
    expect(rowCount).toBe(0);
  });

  it("stores Plus on the account when RevenueCat moves the purchase to it at sign-in", async () => {
    const { c, id } = await user();
    owners.add(id);
    await webhook({ type: "TRANSFER", transferred_from: [anonymous()], transferred_to: [id] });
    expect(await plus(c)).toBe(true);
  });
});

describe("AC-PLUS-08 deleting the account", () => {
  it("deletes its Plus record", async () => {
    const { c, id, password } = await user();
    owners.add(id);
    await webhook({ type: "NON_RENEWING_PURCHASE", app_user_id: id });
    expect((await c.call("/api/auth/delete-user", { body: { password } })).status).toBe(200);
    const { rowCount } = await api.pool.query("select 1 from entitlement where user_id = $1", [id]);
    expect(rowCount).toBe(0);
  });
});
