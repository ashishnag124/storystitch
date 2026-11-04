import {
  LayoutPopularitySchema,
  SaveLayoutSchema,
  SavedLayoutSchema,
  SavedLayoutsEnvelopeSchema,
  type Layout,
  type SaveLayout,
  type SavedLayout,
} from "@storystitch/shared";

/** How long to wait for the counts before ranking by fit alone. */
const FETCH_TIMEOUT_MS = 2000;

/** Why a save didn't go through, in words for the user. */
export class SaveError extends Error {}

export interface ApiOptions {
  /** The API's origin, e.g. https://api.storystitch.ashishnag.com. */
  apiUrl: string;
  /** Popularity lives in the API, so it's on wherever the API is; elsewhere ranking is by fit alone. */
  popularity: boolean;
}

/** The calls the app makes to the API. */
export function createApi({ apiUrl, popularity }: ApiOptions) {
  return {
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
      const res = await fetch(`${apiUrl}/layouts/mine`, { credentials: "include" });
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res) throw new SaveError("Couldn't reach StoryStitch. Check your connection and try again.");
      if (res.ok) return SavedLayoutSchema.parse(await res.json());
      if (res.status === 401) throw new SaveError("You've been signed out. Sign in again to save.");
      if (res.status === 409) throw new SaveError("Your account already has 20 saved layouts, the most it can hold. Delete one from the Layouts tool to save this one.");
      if (res.status === 400) throw new SaveError("This layout has a problem we couldn't fix. Try moving the photos apart.");
      throw new SaveError("Couldn't save. Please try again.");
    },

    async deleteSaved(id: string): Promise<void> {
      const res = await fetch(`${apiUrl}/layouts/mine/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 404) throw new Error(`DELETE /layouts/mine: ${res.status}`);
    },
  };
}
