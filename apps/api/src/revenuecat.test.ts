import { describe, expect, it } from "vitest";
import { revenueCatApi } from "./revenuecat";

type Active = { entitlement_id: string; expires_at: number | null };

/** A stand-in for RevenueCat's API: the entitlements list, and customers by ID. */
function fakeFetch(customers: Record<string, Active[]>, status = 200) {
  const requests: { url: string; auth: string | null }[] = [];
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    requests.push({ url, auth: new Headers(init?.headers).get("Authorization") });
    if (status !== 200) return new Response("{}", { status });
    if (url.includes("/entitlements?")) {
      const items = [
        { id: "entl_other", lookup_key: "other" },
        { id: "entl_plus", lookup_key: "plus" },
      ];
      return Response.json({ object: "list", items, next_page: null });
    }
    const id = decodeURIComponent(url.split("/customers/")[1]!);
    const items = customers[id];
    if (!items) return Response.json({ type: "resource_missing" }, { status: 404 });
    return Response.json({ id, active_entitlements: { object: "list", items, next_page: null } });
  }) as typeof fetch;
  return { send, requests };
}

describe("AC-PLUS-03 reading RevenueCat", () => {
  it("finds Plus by its identifier, with a secret key, and looks the identifier up once", async () => {
    const { send, requests } = fakeFetch({
      alice: [{ entitlement_id: "entl_plus", expires_at: null }],
      bob: [{ entitlement_id: "entl_other", expires_at: null }],
    });
    const rc = revenueCatApi({ secretKey: "sk_test", projectId: "proj1", fetch: send });
    expect(await rc.hasPlus("alice")).toBe(true);
    expect(await rc.hasPlus("bob")).toBe(false);
    expect(requests.filter((r) => r.url.includes("/entitlements?"))).toHaveLength(1);
    expect(requests.every((r) => r.auth === "Bearer sk_test" && r.url.startsWith("https://api.revenuecat.com/v2/projects/proj1/"))).toBe(true);
  });

  it("treats an expired entitlement and an unknown customer as no Plus", async () => {
    const { send } = fakeFetch({ carol: [{ entitlement_id: "entl_plus", expires_at: Date.now() - 1000 }] });
    const rc = revenueCatApi({ secretKey: "sk", projectId: "p", fetch: send });
    expect(await rc.hasPlus("carol")).toBe(false);
    expect(await rc.hasPlus("$RCAnonymousID:0123456789abcdef0123456789abcdef")).toBe(false);
  });

  it("throws when RevenueCat fails, so the webhook is retried instead of revoking", async () => {
    const { send } = fakeFetch({}, 500);
    await expect(revenueCatApi({ secretKey: "sk", projectId: "p", fetch: send }).hasPlus("alice")).rejects.toThrow(/500/);
  });
});
