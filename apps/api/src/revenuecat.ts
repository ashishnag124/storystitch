import { PLUS_ENTITLEMENT } from "@storystitch/shared";
import { z } from "zod";

/** What the API asks RevenueCat. A fake stands in for it in tests. */
export interface RevenueCat {
  /** Whether RevenueCat says this App User ID (an account's ID, or a device's anonymous ID) has Plus now. */
  hasPlus(appUserId: string): Promise<boolean>;
}

const API = "https://api.revenuecat.com/v2";

const EntitlementListSchema = z.object({ items: z.array(z.object({ id: z.string(), lookup_key: z.string() })) });
const CustomerSchema = z.object({
  active_entitlements: z.object({ items: z.array(z.object({ entitlement_id: z.string(), expires_at: z.number().nullable() })) }),
});

/**
 * RevenueCat's REST API (v2), with a secret key that can read customers and entitlements. Customers name
 * entitlements by RevenueCat's internal ID, so the "plus" entitlement's ID is looked up once and kept.
 */
export function revenueCatApi({ secretKey, projectId, fetch: send = fetch }: { secretKey: string; projectId: string; fetch?: typeof fetch }): RevenueCat {
  /** The response body, or null for a 404. Anything else that isn't a success throws, so a webhook is retried. */
  async function get(path: string): Promise<unknown> {
    const res = await send(`${API}/projects/${encodeURIComponent(projectId)}${path}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`RevenueCat ${path.split("?")[0]} answered ${res.status}`);
    return res.json();
  }

  let plusId: Promise<string> | null = null;
  function plusEntitlementId() {
    plusId ??= get("/entitlements?limit=100").then((body) => {
      const found = EntitlementListSchema.parse(body).items.find((e) => e.lookup_key === PLUS_ENTITLEMENT);
      if (!found) throw new Error(`RevenueCat has no "${PLUS_ENTITLEMENT}" entitlement`);
      return found.id;
    });
    // A failed lookup is tried again next time rather than remembered.
    plusId.catch(() => (plusId = null));
    return plusId;
  }

  return {
    async hasPlus(appUserId) {
      const id = await plusEntitlementId();
      const body = await get(`/customers/${encodeURIComponent(appUserId)}`);
      if (body === null) return false;
      const now = Date.now();
      return CustomerSchema.parse(body).active_entitlements.items.some((e) => e.entitlement_id === id && (e.expires_at === null || e.expires_at > now));
    },
  };
}
