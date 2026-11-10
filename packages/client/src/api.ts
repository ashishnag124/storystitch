import {
  EntitlementsSchema,
  LayoutPopularitySchema,
  MinimumVersionSchema,
  SaveLayoutSchema,
  SavedLayoutSchema,
  SavedLayoutsEnvelopeSchema,
  type EntitlementCheck,
  type Layout,
  type MinimumVersion,
  type SaveLayout,
  type SavedLayout,
} from "@storystitch/shared";

/** How long to wait for an answer the app can do without: the counts for ranking, or the minimum version. */
const FETCH_TIMEOUT_MS = 2000;

/** How long an account request can take before it counts as lost. */
const AUTH_TIMEOUT_MS = 20_000;

/**
 * `fetch` for the auth client. A lost connection, or no answer at all, comes back as a 503, so every account form gets
 * an error it can show rather than waiting forever.
 */
export async function authFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), AUTH_TIMEOUT_MS);
  try {
    return await fetch(input as Parameters<typeof fetch>[0], { ...init, signal: timeout.signal });
  } catch {
    return new Response(null, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

/** Why a save didn't go through, in words for the user. */
export class SaveError extends Error {}

export interface ApiOptions {
  /** The API's origin, e.g. https://api.storystitch.ashishnag.com. */
  apiUrl: string;
  /** Popularity lives in the API, so it's on wherever the API is; elsewhere ranking is by fit alone. */
  popularity: boolean;
  /** What proves the session on a platform without browser cookies: the native app's stored cookie. */
  sessionHeaders?: () => Promise<Record<string, string>>;
}

/** The calls the app makes to the API. */
export function createApi({ apiUrl, popularity, sessionHeaders }: ApiOptions) {
  // The app sends its stored session itself, so the platform's cookie store stays out of the request.
  const credentials = sessionHeaders ? "omit" : "include";
  return {
    /** The oldest app version the API still supports, or null when it doesn't answer in time: the app then carries on. */
    async fetchMinimumVersion(): Promise<MinimumVersion | null> {
      try {
        const res = await fetch(`${apiUrl}/app/minimum-version`, { credentials: "omit", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        return res.ok ? MinimumVersionSchema.parse(await res.json()) : null;
      } catch {
        return null;
      }
    },

    /** Exports per layout id, from the API. Empty when popularity is off or the API doesn't answer in time. */
    async fetchPopularity(): Promise<Record<string, number>> {
      if (!popularity) return {};
      try {
        const res = await fetch(`${apiUrl}/layouts/popularity`, { credentials: "omit", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        return res.ok ? LayoutPopularitySchema.parse(await res.json()).exports : {};
      } catch {
        return {};
      }
    },

    /** Counts one export of a layout. Sends only the layout's id; a failure never reaches the user. */
    recordExport(layoutId: string) {
      if (!popularity) return;
      fetch(`${apiUrl}/layouts/${encodeURIComponent(layoutId)}/exports`, { method: "POST", credentials: "omit", keepalive: true }).catch(
        () => {},
      );
    },

    /**
     * The user's saved layouts, or "signed-out" when there's no session. Throws when the API can't be reached.
     * Leaves out any layout this app version can't read, so one newer layout doesn't lose the user the whole list.
     */
    async listSaved(): Promise<SavedLayout[] | "signed-out"> {
      const res = await fetch(`${apiUrl}/layouts/mine`, { credentials, headers: await sessionHeaders?.() });
      if (res.status === 401) return "signed-out";
      if (!res.ok) throw new Error(`GET /layouts/mine: ${res.status}`);
      const { layouts } = SavedLayoutsEnvelopeSchema.parse(await res.json());
      return layouts.flatMap((layout) => {
        const parsed = SavedLayoutSchema.safeParse(layout);
        return parsed.success ? [parsed.data] : [];
      });
    },

    /** Saves a new layout, or replaces the saved one with id `id`. */
    async saveLayout(name: string, layout: Layout, id?: string): Promise<SavedLayout> {
      // The schema drops the layout's own id and name: the account keeps those.
      const body: SaveLayout = { name, layout: SaveLayoutSchema.shape.layout.parse(layout) };
      const res = await fetch(`${apiUrl}/layouts/mine${id ? `/${encodeURIComponent(id)}` : ""}`, {
        method: id ? "PUT" : "POST",
        credentials,
        headers: { "Content-Type": "application/json", ...(await sessionHeaders?.()) },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res) throw new SaveError("Couldn't reach StoryStitch. Check your connection and try again.");
      if (res.ok) return SavedLayoutSchema.parse(await res.json());
      if (res.status === 401) throw new SaveError("You've been signed out. Sign in again to save.");
      if (res.status === 409) throw new SaveError("Your account already has 20 saved layouts, the most it can hold. Delete one from the Layouts tool to save this one.");
      if (res.status === 400) throw new SaveError("This layout has a problem we couldn't fix. Try moving the photos apart.");
      throw new SaveError("Couldn't save. Please try again.");
    },

    /**
     * Whether the API says this account has StoryStitch Plus. False when signed out, and when the API can't be reached:
     * the export then keeps its mark.
     */
    async fetchPlus(): Promise<boolean> {
      try {
        const res = await fetch(`${apiUrl}/me/entitlements`, { credentials, headers: await sessionHeaders?.(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        return res.ok && EntitlementsSchema.parse(await res.json()).plus;
      } catch {
        return false;
      }
    },

    /** Asks the API to read the account's Plus from RevenueCat again, right after a purchase or restore. */
    async refreshPlus(): Promise<boolean> {
      const res = await fetch(`${apiUrl}/me/entitlements/refresh`, { method: "POST", credentials, headers: await sessionHeaders?.() });
      if (!res.ok) throw new Error(`POST /me/entitlements/refresh: ${res.status}`);
      return EntitlementsSchema.parse(await res.json()).plus;
    },

    /** Whether a signed-out iOS buyer's purchases (by RevenueCat's anonymous ID for the device) include Plus. */
    async checkDevicePlus(appUserId: string): Promise<boolean> {
      const body: EntitlementCheck = { appUserId };
      const res = await fetch(`${apiUrl}/entitlements/check`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json", ...(await sessionHeaders?.()) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`POST /entitlements/check: ${res.status}`);
      return EntitlementsSchema.parse(await res.json()).plus;
    },

    async deleteSaved(id: string): Promise<void> {
      const res = await fetch(`${apiUrl}/layouts/mine/${encodeURIComponent(id)}`, { method: "DELETE", credentials, headers: await sessionHeaders?.() });
      if (!res.ok && res.status !== 404) throw new Error(`DELETE /layouts/mine: ${res.status}`);
    },
  };
}
